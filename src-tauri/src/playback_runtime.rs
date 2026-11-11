//! Windows-only authenticated playback helper. Credentials originate only in Rust.
//! Hash verification does not prevent same-user concurrent replacement (TOCTOU).
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::os::windows::io::AsRawHandle;
use std::os::windows::{fs::MetadataExt, process::CommandExt};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    time::Duration,
};
use wait_timeout::ChildExt;
#[link(name = "kernel32")]
extern "system" {
    fn GetFileInformationByHandle(handle: *mut std::ffi::c_void, info: *mut u32) -> i32;
}
pub(super) fn single_link(file: &fs::File) -> Result<(), RuntimeError> {
    // BY_HANDLE_FILE_INFORMATION consists of 13 consecutive DWORDs; link count is DWORD 10.
    let mut info = [0u32; 13];
    // SAFETY: live borrowed file handle and correctly sized/aligned writable output buffer.
    let ok = unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) };
    if ok == 0 || info[10] != 1 {
        return Err(RuntimeError::Integrity);
    }
    Ok(())
}

const PIN: &str = "87a57a5186e6e69cfd24661ecf128d5709f7a74e439d73663e222e154de51597";
const SCRIPT: &str = include_str!("playback_runtime.py");
const LIMIT: u64 = 65536;

#[derive(Debug, PartialEq)]
pub(crate) enum RuntimeError {
    Input,
    Integrity,
    Process,
    Timeout,
    Output,
}
#[derive(Deserialize, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct PlaybackResult {
    pub variants: Vec<String>,
    pub url: Option<String>,
}
fn name(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_')
}
pub(super) fn ordinary(path: &Path) -> Result<fs::Metadata, RuntimeError> {
    let m = fs::symlink_metadata(path).map_err(|_| RuntimeError::Integrity)?;
    // FILE_ATTRIBUTE_REPARSE_POINT: never traverse junctions or symbolic links.
    if m.file_attributes() & 0x400 != 0 || m.is_symlink() || (!m.is_dir() && !m.is_file()) {
        return Err(RuntimeError::Integrity);
    }
    Ok(m)
}
fn collect(
    root: &Path,
    dir: &Path,
    records: &mut Vec<(String, String)>,
    total: &mut u64,
) -> Result<(), RuntimeError> {
    ordinary(dir)?;
    if dir
        .strip_prefix(root)
        .map_err(|_| RuntimeError::Integrity)?
        .components()
        .count()
        > 16
    {
        return Err(RuntimeError::Integrity);
    }
    for entry in fs::read_dir(dir).map_err(|_| RuntimeError::Integrity)? {
        let path = entry.map_err(|_| RuntimeError::Integrity)?.path();
        let m = ordinary(&path)?;
        if m.is_dir() {
            let before = records.len();
            collect(root, &path, records, total)?;
            // The pinned distribution has no empty directories; reject extra ones too.
            if before == records.len() {
                return Err(RuntimeError::Integrity);
            }
        } else {
            if records.len() >= 1948 || m.len() > 256 * 1024 * 1024 {
                return Err(RuntimeError::Integrity);
            }
            *total = total.checked_add(m.len()).ok_or(RuntimeError::Integrity)?;
            if *total > 512 * 1024 * 1024 {
                return Err(RuntimeError::Integrity);
            }
            let rel = path
                .strip_prefix(root)
                .map_err(|_| RuntimeError::Integrity)?
                .to_str()
                .ok_or(RuntimeError::Integrity)?
                .replace('\\', "/");
            if !rel.is_ascii() || rel.bytes().any(|b| b < 32) {
                return Err(RuntimeError::Integrity);
            }
            let mut file = fs::File::open(&path).map_err(|_| RuntimeError::Integrity)?;
            let mut hash = Sha256::new();
            single_link(&file)?;
            let mut buffer = [0; 65536];
            let mut size = 0u64;
            loop {
                let n = file
                    .read(&mut buffer)
                    .map_err(|_| RuntimeError::Integrity)?;
                if n == 0 {
                    break;
                }
                size += n as u64;
                if size > 256 * 1024 * 1024 {
                    return Err(RuntimeError::Integrity);
                }
                hash.update(&buffer[..n]);
            }
            if size != m.len() {
                return Err(RuntimeError::Integrity);
            }
            let record = format!("{rel}\0{size}\0{:x}\n", hash.finalize());
            records.push((rel, record));
        }
    }
    Ok(())
}
pub(super) fn verify(root: &Path) -> Result<(), RuntimeError> {
    // Also reject reparses in the fixed runtime/streamlink ancestry.
    for ancestor in root.ancestors() {
        if !ancestor.as_os_str().is_empty() {
            ordinary(ancestor)?;
        }
    }
    let mut records = Vec::new();
    collect(root, root, &mut records, &mut 0)?;
    records.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hash = Sha256::new();
    for (_, record) in &records {
        hash.update(record.as_bytes());
    }
    let digest = format!("{:x}", hash.finalize());
    if records.len() != 1948 || digest != PIN {
        return Err(RuntimeError::Integrity);
    }
    Ok(())
}
fn parse(bytes: &[u8], token: &str, quality: Option<&str>) -> Result<PlaybackResult, RuntimeError> {
    if token.is_empty()
        || bytes.len() > LIMIT as usize
        || bytes.windows(token.len()).any(|w| w == token.as_bytes())
    {
        return Err(RuntimeError::Output);
    }
    let result: PlaybackResult = serde_json::from_slice(bytes).map_err(|_| RuntimeError::Output)?;
    if result.variants.is_empty()
        || result.variants.len() > 128
        || result.variants.iter().any(|q| !name(q, 32))
        || result
            .variants
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != result.variants.len()
        || quality.is_some() != result.url.is_some()
        || quality.is_some_and(|q| !result.variants.iter().any(|v| v == q))
    {
        return Err(RuntimeError::Output);
    }
    if let Some(value) = &result.url {
        let url = reqwest::Url::parse(value).map_err(|_| RuntimeError::Output)?;
        let host = url.host_str().ok_or(RuntimeError::Output)?;
        if value.len() > 16384
            || value.chars().any(char::is_control)
            || url.scheme() != "https"
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some_and(|p| p != 443)
            || url.fragment().is_some()
            || !(host.ends_with(".ttvnw.net") || host.ends_with(".twitch.tv"))
        {
            return Err(RuntimeError::Output);
        }
    }
    Ok(result)
}
pub(super) fn pipe(
    mut cmd: Command,
    input: Vec<u8>,
    timeout: Duration,
) -> Result<Vec<u8>, RuntimeError> {
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| RuntimeError::Process)?;
    let mut stdin = child.stdin.take().ok_or(RuntimeError::Process)?;
    let stdout = child.stdout.take().ok_or(RuntimeError::Process)?;
    let writer = std::thread::spawn(move || stdin.write_all(&input));
    let reader = std::thread::spawn(move || {
        let mut output = Vec::new();
        stdout
            .take(LIMIT + 1)
            .read_to_end(&mut output)
            .map(|_| output)
    });
    let waited = child.wait_timeout(timeout);
    let outcome = match waited {
        Ok(Some(status)) if status.success() => Ok(()),
        Ok(Some(_)) => Err(RuntimeError::Process),
        Ok(None) => Err(RuntimeError::Timeout),
        Err(_) => Err(RuntimeError::Process),
    };
    // Always kill/reap before joining pipe threads, including wait failures.
    if outcome.is_err() {
        let _ = child.kill();
    }
    let _ = child.wait();
    let written = writer.join().map_err(|_| RuntimeError::Process)?;
    let output = reader
        .join()
        .map_err(|_| RuntimeError::Process)?
        .map_err(|_| RuntimeError::Process)?;
    outcome?;
    written.map_err(|_| RuntimeError::Process)?;
    if output.len() > LIMIT as usize {
        return Err(RuntimeError::Output);
    }
    Ok(output)
}
pub(super) fn query_at(
    root: &Path,
    token: &str,
    login: &str,
    quality: Option<&str>,
    canary: bool,
) -> Result<PlaybackResult, RuntimeError> {
    if !name(login, 25)
        || quality.is_some_and(|q| !name(q, 32))
        || token.is_empty()
        || token.len() > 512
        || !token.bytes().all(|b| b.is_ascii_alphanumeric())
    {
        return Err(RuntimeError::Input);
    }
    let input = serde_json::to_vec(
        &serde_json::json!({"token":token,"login":login,"quality":quality,"canary":canary}),
    )
    .map_err(|_| RuntimeError::Input)?;
    if input.len() > 4096 {
        return Err(RuntimeError::Input);
    }
    verify(root)?;
    let mut cmd = Command::new(root.join("Python/python.exe"));
    cmd.args(["-I", "-B", "-c", SCRIPT])
        .current_dir(root)
        .env_clear()
        .env("PATH", root.join("Python"))
        .env(
            "SystemRoot",
            std::env::var_os("SystemRoot").ok_or(RuntimeError::Process)?,
        )
        .creation_flags(0x08000000);
    let output = pipe(cmd, input, Duration::from_secs(20))?;
    verify(root)?;
    parse(&output, token, quality)
}
/// Blocking query. Credentials must originate in Rust; never pass from a webview.
/// Only the verified app-local runtime is accepted, with no global fallback.
pub(crate) fn query(
    root: &Path,
    token: &str,
    login: &str,
    quality: Option<&str>,
) -> Result<PlaybackResult, RuntimeError> {
    query_at(root, token, login, quality, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    #[test]
    fn input_and_output_contract() {
        assert!(!name("a/b", 25));
        assert!(!name("á", 25));
        assert!(!name("", 25));
        let good = br#"{"variants":["720p"],"url":"https://video-edge.ttvnw.net/test.m3u8"}"#;
        assert!(parse(good, "FAKE", Some("720p")).is_ok());
        assert_eq!(parse(good, "FAKE", None), Err(RuntimeError::Output));
        assert_eq!(parse(good, "test", Some("720p")), Err(RuntimeError::Output));
        assert!(parse(br#"{"variants":["720p","720p"],"url":null}"#, "FAKE", None).is_err());
        assert!(parse(br#"{"variants":[],"url":null}"#, "FAKE", None).is_err());
        assert!(parse(
            br#"{"variants":["720p"],"url":"https://evil.example/a"}"#,
            "FAKE",
            Some("720p")
        )
        .is_err());
    }
    #[test]
    fn rejects_missing_runtime_without_spawning() {
        assert_eq!(
            query_at(Path::new("missing-runtime"), "FAKE", "canary", None, false),
            Err(RuntimeError::Integrity)
        );
        assert_eq!(
            query_at(
                Path::new("missing-runtime"),
                "bad\nsecret",
                "canary",
                None,
                false
            ),
            Err(RuntimeError::Input)
        );
    }
    #[test]
    fn rejects_changed_tree_and_hard_links() {
        let dir =
            std::env::temp_dir().join(format!("blinkstream-runtime-test-{}", std::process::id()));
        fs::create_dir(&dir).unwrap();
        struct Cleanup(PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.0);
            }
        }
        let _cleanup = Cleanup(dir.clone());
        let file = dir.join("extra");
        fs::write(&file, b"fake").unwrap();
        assert_eq!(verify(&dir), Err(RuntimeError::Integrity));
        fs::hard_link(&file, dir.join("link")).unwrap();
        assert_eq!(
            single_link(&fs::File::open(&file).unwrap()),
            Err(RuntimeError::Integrity)
        );
        fs::create_dir(dir.join("empty-extra")).unwrap();
        assert_eq!(verify(&dir), Err(RuntimeError::Integrity));
    }
    #[test]
    #[ignore = "requires the explicitly selected offline fixture runtime"]
    fn offline_pipe_limits_and_timeout() {
        let root =
            PathBuf::from(std::env::var_os("BLINKSTREAM_TEST_RUNTIME").expect("fixture path"));
        verify(&root).unwrap();
        let command = |code: &str| {
            let mut cmd = Command::new(root.join("Python/python.exe"));
            cmd.args(["-I", "-B", "-c", code])
                .env_clear()
                .env("SystemRoot", std::env::var_os("SystemRoot").unwrap())
                .creation_flags(0x08000000);
            cmd
        };
        assert_eq!(
            pipe(
                command("import time; time.sleep(30)"),
                vec![],
                Duration::from_millis(100)
            ),
            Err(RuntimeError::Timeout)
        );
        assert!(pipe(
            command("import os; os.write(1,b'x'*70000)"),
            vec![],
            Duration::from_secs(5)
        )
        .is_err());
        let code = "import sys; value=sys.stdin.buffer.read(); sys.stderr.buffer.write(value); sys.stdout.buffer.write(b'{}')";
        assert_eq!(
            pipe(
                command(code),
                b"FAKECANARYONLY".to_vec(),
                Duration::from_secs(5)
            )
            .unwrap(),
            b"{}"
        );
        assert_eq!(
            parse(&vec![b'x'; 65537], "FAKE", None),
            Err(RuntimeError::Output)
        );
        assert_eq!(
            query_at(&root, &"x".repeat(513), "canary", None, true),
            Err(RuntimeError::Input)
        );
    }
    #[test]
    #[ignore = "requires the explicitly selected offline fixture runtime"]
    fn offline_pinned_runtime_canary() {
        let root =
            PathBuf::from(std::env::var_os("BLINKSTREAM_TEST_RUNTIME").expect("fixture path"));
        let result = query_at(&root, "FAKECANARYONLY", "canary", None, true).unwrap();
        assert_eq!(result.variants, vec!["720p"]);
        assert!(result.url.is_none());
    }
}
