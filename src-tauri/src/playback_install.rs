//! Optional GitHub Windows runtime. No credential or caller-controlled URL enters setup.
use crate::playback_runtime::{ordinary, single_link, verify};
use sha2::{Digest, Sha256};
use std::os::windows::{ffi::OsStrExt, process::CommandExt};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};
use tauri::Manager;
use wait_timeout::ChildExt;

const URL: &str = "https://github.com/streamlink/windows-builds/releases/download/8.6.3-1/streamlink-8.6.3-1-py315-x86_64.zip";
const SIZE: u64 = 84611513;
const SHA: &str = "3b1f1470d4b135080a8107ca2917379ca3ff5acadbcdc215568b79eea1450497";
const ERROR: &str = "No se pudo preparar el runtime 2K verificado";
static INSTALL: std::sync::LazyLock<std::sync::Arc<tokio::sync::Mutex<()>>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Mutex::new(())));

pub(super) fn runtime_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("playback-runtime-8.6.3-1"))
        .map_err(|_| ERROR.into())
}
fn ancestry(path: &Path) -> Result<(), String> {
    for p in path.ancestors().filter(|p| !p.as_os_str().is_empty()) {
        ordinary(p).map_err(|_| ERROR)?;
    }
    Ok(())
}

#[repr(C)]
struct SecurityAttributes {
    length: u32,
    descriptor: *mut std::ffi::c_void,
    inherit: i32,
}
#[link(name = "advapi32")]
extern "system" {
    fn ConvertStringSecurityDescriptorToSecurityDescriptorW(
        s: *const u16,
        revision: u32,
        out: *mut *mut std::ffi::c_void,
        size: *mut u32,
    ) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn CreateDirectoryW(path: *const u16, security: *const SecurityAttributes) -> i32;
    fn LocalFree(ptr: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    fn GetSystemDirectoryW(buffer: *mut u16, size: u32) -> u32;
}
// Atomic creation with a protected DACL: owner and SYSTEM only, inherited by extracted files.
fn private_dir(path: &Path) -> Result<(), String> {
    let sddl: Vec<u16> = "D:P(A;OICI;FA;;;OW)(A;OICI;FA;;;SY)\0"
        .encode_utf16()
        .collect();
    let name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut descriptor = std::ptr::null_mut();
    // SAFETY: NUL-terminated input and live output pointer; descriptor freed after CreateDirectoryW.
    unsafe {
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(ERROR.into());
        }
        let attrs = SecurityAttributes {
            length: std::mem::size_of::<SecurityAttributes>() as u32,
            descriptor,
            inherit: 0,
        };
        let ok = CreateDirectoryW(name.as_ptr(), &attrs);
        LocalFree(descriptor);
        if ok == 0 {
            return Err(ERROR.into());
        }
    }
    ancestry(path)
}
fn system_tar() -> Result<PathBuf, String> {
    let mut buf = [0u16; 32768];
    // SAFETY: writable buffer with its exact capacity.
    let n = unsafe { GetSystemDirectoryW(buf.as_mut_ptr(), buf.len() as u32) } as usize;
    if n == 0 || n >= buf.len() {
        return Err(ERROR.into());
    }
    let path = PathBuf::from(String::from_utf16(&buf[..n]).map_err(|_| ERROR)?).join("tar.exe");
    ancestry(&path)?;
    Ok(path)
}
fn archive_digest(path: &Path) -> Result<(), String> {
    ancestry(path)?;
    let mut file = fs::File::open(path).map_err(|_| ERROR)?;
    single_link(&file).map_err(|_| ERROR)?;
    if file.metadata().map_err(|_| ERROR)?.len() != SIZE {
        return Err(ERROR.into());
    }
    let mut hash = Sha256::new();
    let mut bytes = [0u8; 65536];
    let mut total = 0u64;
    loop {
        let n = file.read(&mut bytes).map_err(|_| ERROR)?;
        if n == 0 {
            break;
        }
        total += n as u64;
        if total > SIZE {
            return Err(ERROR.into());
        }
        hash.update(&bytes[..n]);
    }
    if total != SIZE || format!("{:x}", hash.finalize()) != SHA {
        return Err(ERROR.into());
    }
    Ok(())
}
fn extract(archive: &Path, stage: &Path) -> Result<(), String> {
    archive_digest(archive)?;
    // Entire official archive authenticated before executing the extractor.
    ancestry(stage)?;
    let mut child = Command::new(system_tar()?)
        .arg("--strip-components=1")
        .arg("-xf")
        .arg(archive)
        .arg("-C")
        .arg(stage)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|_| ERROR)?;
    let waited = child.wait_timeout(Duration::from_secs(90));
    let success = matches!(waited, Ok(Some(status)) if status.success());
    if !success {
        let _ = child.kill();
    }
    let _ = child.wait();
    if !success {
        return Err(ERROR.into());
    }
    verify(stage).map_err(|_| ERROR.into())
}
// Cleanup never traverses a reparse or deletes outside the unique staging directory.
fn cleanup(path: &Path) {
    if ancestry(path).is_err() {
        return;
    }
    fn safe_tree(path: &Path) -> bool {
        let Ok(m) = ordinary(path) else {
            return false;
        };
        if m.is_file() {
            return fs::File::open(path).is_ok_and(|f| single_link(&f).is_ok());
        }
        fs::read_dir(path).is_ok_and(|entries| {
            entries
                .into_iter()
                .all(|e| e.is_ok_and(|e| safe_tree(&e.path())))
        })
    }
    if safe_tree(path) {
        let _ = fs::remove_dir_all(path);
    }
}
struct Stage(PathBuf);
impl Drop for Stage {
    fn drop(&mut self) {
        cleanup(&self.0);
    }
}
fn staging(root: &Path) -> Result<Stage, String> {
    let parent = root.parent().ok_or(ERROR)?;
    // App data normally exists; create only this application directory, never a missing ancestry.
    if !parent.exists() {
        ancestry(parent.parent().ok_or(ERROR)?)?;
        private_dir(parent)?;
    }
    ancestry(parent)?;
    let mut random = [0u8; 16];
    getrandom::fill(&mut random).map_err(|_| ERROR)?;
    let suffix: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let dir = parent.join(format!(".playback-stage-{suffix}"));
    private_dir(&dir)?;
    Ok(Stage(dir))
}
fn install_archive(archive: &Path, stage: &Stage, root: &Path) -> Result<(), String> {
    let tree = stage.0.join("tree");
    private_dir(&tree)?;
    extract(archive, &tree)?;
    ancestry(root.parent().ok_or(ERROR)?)?;
    if root.exists() {
        return verify(root).map_err(|_| ERROR.into());
    }
    fs::rename(&tree, root).map_err(|_| ERROR)?;
    verify(root).map_err(|_| ERROR.into())
}

pub(super) async fn setup(root: PathBuf) -> Result<(), String> {
    // Reject concurrent clicks rather than enqueueing further downloads.
    let lock = INSTALL
        .clone()
        .try_lock_owned()
        .map_err(|_| "La preparación del runtime ya está en curso")?;
    if root.exists() {
        return verify(&root).map_err(|_| ERROR.into());
    }
    let stage = staging(&root)?;
    let archive = stage.0.join("runtime.zip");
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            if attempt.previous().len() < 5
                && url.scheme() == "https"
                && url.host_str() == Some("release-assets.githubusercontent.com")
            {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| ERROR)?;
    let mut response = client.get(URL).send().await.map_err(|_| ERROR)?;
    if !response.status().is_success() || response.content_length().is_some_and(|n| n != SIZE) {
        return Err(ERROR.into());
    }
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&archive)
        .map_err(|_| ERROR)?;
    let mut total = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|_| ERROR)? {
        total = total.checked_add(chunk.len() as u64).ok_or(ERROR)?;
        if total > SIZE {
            return Err(ERROR.into());
        }
        file.write_all(&chunk).map_err(|_| ERROR)?;
    }
    file.sync_all().map_err(|_| ERROR)?;
    drop(file);
    if total != SIZE {
        return Err(ERROR.into());
    }
    // Keep the install lock and staging owner alive even if the IPC future is cancelled.
    // Tauri invokes finish independently from the frontend; this blocking job is bounded by tar timeout.
    let installed = tokio::task::spawn_blocking(move || {
        let _lock = lock;
        install_archive(&archive, &stage, &root)
    })
    .await
    .map_err(|_| ERROR)?;
    installed
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn corrupt_archive_and_concurrent_setup_fail_closed() {
        let root =
            std::env::temp_dir().join(format!("blinkstream-install-test-{}", std::process::id()));
        private_dir(&root).unwrap();
        let stage = Stage(root);
        let file = stage.0.join("corrupt.zip");
        fs::write(&file, b"corrupt").unwrap();
        assert!(archive_digest(&file).is_err());
        fs::OpenOptions::new()
            .write(true)
            .open(&file)
            .unwrap()
            .set_len(SIZE)
            .unwrap();
        assert!(archive_digest(&file).is_err()); // Same official length, wrong full SHA.
        let _first = INSTALL.try_lock().unwrap();
        assert!(setup(stage.0.join("concurrent")).await.is_err());
        assert!(system_tar().unwrap().is_absolute());
    }
    #[tokio::test]
    #[ignore = "requires explicitly selected read-only official archive fixture"]
    async fn offline_official_install_and_existing_tree() {
        let fixture =
            PathBuf::from(std::env::var_os("BLINKSTREAM_TEST_ARCHIVE").expect("offline fixture"));
        let parent = std::env::temp_dir().join(format!(
            "blinkstream-offline-install-{}",
            std::process::id()
        ));
        private_dir(&parent).unwrap();
        let _cleanup = Stage(parent.clone());
        let root = parent.join("installed");
        let stage = staging(&root).unwrap();
        install_archive(&fixture, &stage, &root).unwrap();
        verify(&root).unwrap();
        // Existing setup must not touch the network, and hashes all files again.
        setup(root.clone()).await.unwrap();
        let result =
            crate::playback_runtime::query_at(&root, "FAKECANARYONLY", "canary", None, true)
                .unwrap();
        assert_eq!(result.variants, vec!["720p"]);
        assert!(result.url.is_none());
        let mut cmd = Command::new(root.join("Python/python.exe"));
        cmd.args(["-I", "-B", "-c", "import time; time.sleep(30)"])
            .env_clear()
            .env("SystemRoot", std::env::var_os("SystemRoot").unwrap())
            .creation_flags(0x08000000);
        assert_eq!(
            crate::playback_runtime::pipe(cmd, vec![], Duration::from_millis(100)),
            Err(crate::playback_runtime::RuntimeError::Timeout)
        );
        let mut noisy = Command::new(root.join("Python/python.exe"));
        noisy
            .args(["-I", "-B", "-c", "import os; os.write(1,b'x'*70000)"])
            .env_clear()
            .env("SystemRoot", std::env::var_os("SystemRoot").unwrap())
            .creation_flags(0x08000000);
        assert!(crate::playback_runtime::pipe(noisy, vec![], Duration::from_secs(5)).is_err());
        fs::write(root.join("extra"), b"corrupt").unwrap();
        assert!(verify(&root).is_err());
        assert!(setup(root).await.is_err());
    }
}
