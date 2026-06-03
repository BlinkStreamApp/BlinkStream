use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;
use wait_timeout::ChildExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use std::fs::OpenOptions;
use std::io::Write;

pub fn try_lock_single_instance(name: &str) -> bool {
    let lock_dir = single_instance_lock_dir();
    if std::fs::create_dir_all(&lock_dir).is_err() {
        return true;
    }
    let lock_path = lock_dir.join(format!("{}.lock", name));

    if lock_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&lock_path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if !is_pid_alive(pid) {
                    let _ = std::fs::remove_file(&lock_path);
                }
            }
        }
    }

    match OpenOptions::new().create_new(true).write(true).open(&lock_path) {
        Ok(mut f) => {
            let _ = writeln!(f, "{}", std::process::id());
            true
        }
        Err(_) => false,
    }
}

fn is_pid_alive(pid: u32) -> bool {
    #[cfg(windows)]
    {
        extern "system" {
            fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> isize;
            fn CloseHandle(handle: isize) -> i32;
            fn GetExitCodeProcess(process: isize, exit_code: *mut u32) -> i32;
        }
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        const STILL_ACTIVE: u32 = 259;
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle == 0 || handle == -1 {
                return false;
            }
            let mut exit_code: u32 = 0;
            let result = GetExitCodeProcess(handle, &mut exit_code);
            CloseHandle(handle);
            result != 0 && exit_code == STILL_ACTIVE
        }
    }
    #[cfg(not(windows))]
    {
        // SAFETY: kill(pid, 0) only checks existence, doesn't send a signal
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
}

fn single_instance_lock_dir() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        std::path::PathBuf::from(std::env::var("TEMP").unwrap_or_else(|_| ".".into()))
    }
    #[cfg(target_os = "macos")]
    {
        std::path::PathBuf::from("/tmp")
    }
    #[cfg(target_os = "linux")]
    {
        std::path::PathBuf::from("/tmp")
    }
}

const CHANNEL_RE: &str = r"^[a-zA-Z0-9][a-zA-Z0-9_]{2,24}$";

fn validate_channel(name: &str) -> Result<(), String> {
    let re = regex_lite::Regex::new(CHANNEL_RE).expect("CHANNEL_RE estático - no debería fallar");
    if !re.is_match(name) {
        return Err(
            "Nombre de canal inválido. Solo letras, números y guión bajo (3-25 caracteres)."
                .into(),
        );
    }
    Ok(())
}

#[cfg(target_os = "windows")]
const INSTALL_CMD: &str = "winget install Streamlink.Streamlink";
#[cfg(target_os = "macos")]
const INSTALL_CMD: &str = "brew install streamlink";
#[cfg(target_os = "linux")]
const INSTALL_CMD: &str = "sudo apt install streamlink  # o pip install streamlink";

fn find_streamlink(app: &AppHandle) -> Result<PathBuf, String> {
    let target_triple = format!(
        "{}-{}-{}",
        std::env::consts::ARCH,
        std::env::consts::OS,
        if cfg!(target_os = "windows") { "windows-msvc" }
        else if cfg!(target_os = "macos") { "apple-darwin" }
        else { "linux-gnu" }
    );
    let sidecar_name = format!("streamlink-{}", target_triple);
    let sidecar_exe = if cfg!(windows) { format!("{}.exe", sidecar_name) } else { sidecar_name };

    if let Ok(resource_dir) = app.path().resource_dir() {
        let sidecar_path = resource_dir.join("binaries").join(&sidecar_exe);
        if sidecar_path.exists() {
            return Ok(sidecar_path);
        }
        let sidecar_path2 = resource_dir.join(&sidecar_exe);
        if sidecar_path2.exists() {
            return Ok(sidecar_path2);
        }
    }

    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let winget_path = PathBuf::from(local_app_data)
                .join("Programs")
                .join("Streamlink")
                .join("bin")
                .join("streamlink.exe");
            if winget_path.exists() {
                return Ok(winget_path);
            }
        }

        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let scoop_path = PathBuf::from(user_profile)
                .join("scoop")
                .join("apps")
                .join("streamlink")
                .join("current")
                .join("streamlink.exe");
            if scoop_path.exists() {
                return Ok(scoop_path);
            }
        }

        let choco_path = PathBuf::from(r"C:\ProgramData\chocolatey\bin\streamlink.exe");
        if choco_path.exists() {
            return Ok(choco_path);
        }
    }

    #[cfg(target_os = "macos")]
    {
        let brew_path = PathBuf::from("/usr/local/bin/streamlink");
        if brew_path.exists() {
            return Ok(brew_path);
        }
        let brew_arm_path = PathBuf::from("/opt/homebrew/bin/streamlink");
        if brew_arm_path.exists() {
            return Ok(brew_arm_path);
        }
        let macports_path = PathBuf::from("/opt/local/bin/streamlink");
        if macports_path.exists() {
            return Ok(macports_path);
        }
    }

    #[cfg(target_os = "linux")]
    {
        let linux_paths = [
            "/usr/bin/streamlink",
            "/usr/local/bin/streamlink",
            "/opt/streamlink/bin/streamlink",
        ];
        for p in &linux_paths {
            let path = PathBuf::from(p);
            if path.exists() {
                return Ok(path);
            }
        }
    }

    #[cfg(windows)]
    {
        let mut winget_cmd = std::process::Command::new("winget");
        winget_cmd.args(&["install", "Streamlink.Streamlink", "--silent", "--accept-package-agreements", "--accept-source-agreements"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        { winget_cmd.creation_flags(CREATE_NO_WINDOW); }
        if let Ok(output) = winget_cmd.status()
        {
            if output.success() {
                if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
                    let winget_path = PathBuf::from(local_app_data)
                        .join("Programs")
                        .join("Streamlink")
                        .join("bin")
                        .join("streamlink.exe");
                    if winget_path.exists() {
                        return Ok(winget_path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("brew")
            .args(["install", "streamlink"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        if let Ok(s) = status {
            if s.success() {
                let mac_paths = ["/opt/homebrew/bin/streamlink", "/usr/local/bin/streamlink"];
                for p in &mac_paths {
                    if std::path::PathBuf::from(p).exists() {
                        return Ok(std::path::PathBuf::from(p));
                    }
                }
            }
        }
    }

    Err(format!("Streamlink no está instalado.\n\nInstálalo con: {}", INSTALL_CMD))
}

fn run_streamlink(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let binary = find_streamlink(app)?;

    let mut cmd = Command::new(&binary);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!("Streamlink no está instalado.\n\nInstálalo con: {}", INSTALL_CMD)
            } else {
                format!("Error al ejecutar streamlink: {}", e)
            }
        })?;

    let timeout = Duration::from_secs(10);
    let status = match child
        .wait_timeout(timeout)
        .map_err(|e| format!("Error esperando a streamlink: {}", e))?
    {
        Some(status) => status,
        None => {
            let _ = child.kill();
            child.wait().ok();
            return Err(
                "Streamlink tardó más de 10 segundos. Usando fallback directo.".into(),
            );
        }
    };

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Error leyendo salida: {}", e))?;

    if status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if url.is_empty() {
            Err("Streamlink no devolvió una URL. ¿Está el canal en vivo?".into())
        } else {
            Ok(url)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("Streamlink falló: {}", stderr))
    }
}

static RECORDING: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

#[tauri::command]
fn start_recording(app: AppHandle, channel: String, output_path: String) -> Result<String, String> {
    let binary = find_streamlink(&app)?;
    let url = format!("twitch.tv/{}", channel);

    let mut cmd = Command::new(&binary);
    cmd.args(&[&url, "best", "-o", &output_path])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd.spawn().map_err(|e| format!("No se pudo iniciar grabación: {}", e))?;
    let pid = child.id();
    let mut rec = RECORDING.lock().map_err(|e| e.to_string())?;
    *rec = Some(child);

    Ok(format!("Grabando (PID: {})", pid))
}

#[tauri::command]
fn stop_recording() -> Result<String, String> {
    let mut rec = RECORDING.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = rec.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("Grabación detenida".into())
    } else {
        Err("No hay grabación activa".into())
    }
}

#[tauri::command]
fn get_stream_url(app: AppHandle, channel: String, quality: String) -> Result<String, String> {
    validate_channel(&channel)?;
    run_streamlink(&app, &[&format!("twitch.tv/{}", channel), &quality, "--stream-url"])
}

#[tauri::command]
fn get_available_qualities(app: AppHandle, channel: String) -> Result<Vec<String>, String> {
    validate_channel(&channel)?;
    let output = run_streamlink(&app, &[&format!("twitch.tv/{}", channel), "--stream-url"])?;

    let qualities: Vec<String> = output
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if !line.starts_with("Available streams:") {
                return None;
            }
            let parts = line.strip_prefix("Available streams:")?;
            Some(
                parts
                    .split(',')
                    .filter_map(|s| {
                        let s = s.trim();
                        let name = s.split_whitespace().next()?;
                        if name.is_empty() || name.contains('[') {
                            return None;
                        }
                        Some(name.to_string())
                    })
                    .collect::<Vec<String>>(),
            )
        })
        .flatten()
        .collect();

    if qualities.is_empty() {
        Ok(vec![
            "audio_only".into(),
            "160p30".into(),
            "360p30".into(),
            "480p30".into(),
            "720p60".into(),
            "1080p60".into(),
        ])
    } else {
        Ok(qualities)
    }
}

#[tauri::command]
async fn get_twitch_clip_url(slug: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let query = format!(
        "query {{ clip(slug: \"{}\") {{ videoQualities {{ sourceURL quality }} playbackAccessToken(params: {{ platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }}) {{ value signature }} }} }}",
        slug
    );

    let body = serde_json::json!({ "query": query });

    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", "kimne78kx3ncx6brgo4mv6wki5h1ko")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| format!("Read error: {}", e))?;
    
    if !status.is_success() {
        return Err(format!("GQL status {}: {}", status.as_u16(), &text[..200.min(text.len())]));
    }

    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Parse: {}", e))?;
    
    let clip = data.get("data").and_then(|d| d.get("clip"));
    if clip.is_none() {
        return Err(format!("No clip. Raw: {}", &text[..300.min(text.len())]));
    }
    
    let clip = clip.expect("clip debe existir");
    
    let source_url = clip.get("videoQualities")
        .and_then(|q| q.as_array())
        .and_then(|a| a.first())
        .and_then(|q| q.get("sourceURL"))
        .and_then(|u| u.as_str())
        .unwrap_or("");
    
    let token = clip.get("playbackAccessToken")
        .and_then(|t| t.get("value"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    
    let sig = clip.get("playbackAccessToken")
        .and_then(|t| t.get("signature"))
        .and_then(|s| s.as_str())
        .unwrap_or("");

    if source_url.is_empty() || token.is_empty() || sig.is_empty() {
        return Err(format!("Missing data. URL:{}, Token:{}, Sig:{}", 
            if source_url.is_empty() { "MISSING" } else { "OK" },
            if token.is_empty() { "MISSING" } else { "OK" },
            if sig.is_empty() { "MISSING" } else { "OK" }
        ));
    }

    let encoded = urlencoding::encode(token);
    Ok(format!("{}?token={}&sig={}", source_url, encoded, sig))
}

#[tauri::command]
async fn get_vod_manifest_url(vod_id: String) -> Result<String, String> {
    let client = reqwest::Client::new();

    let query = format!(
        "query {{ video(id: \"{}\") {{ playbackAccessToken(params: {{ platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }}) {{ value signature }} }} }}",
        vod_id
    );

    let body = serde_json::json!({ "query": query });

    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-ID", "kimne78kx3ncx6brgo4mv6wki5h1ko")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP: {}", e))?;

    let text = response.text().await.map_err(|e| format!("Read: {}", e))?;
    let json_res: serde_json::Value = serde_json::from_str(&text).map_err(|e| format!("Parse: {} — {}", e, &text[..200.min(text.len())]))?;

    let video = json_res.get("data").and_then(|d| d.get("video"))
        .ok_or(format!("No video. Raw: {}", &text[..300.min(text.len())]))?;

    let token = video.get("playbackAccessToken").and_then(|t| t.get("value")).and_then(|v| v.as_str())
        .ok_or("No token")?;

    let sig = video.get("playbackAccessToken").and_then(|t| t.get("signature")).and_then(|s| s.as_str())
        .ok_or("No sig")?;

    if token.is_empty() || sig.is_empty() {
        return Err("Empty token/sig".into());
    }

    let encoded = urlencoding::encode(token);
    Ok(format!(
        "https://usher.ttvnw.net/vod/{}.m3u8?nauth={}&nauthsig={}&allow_source=true&allow_audio_only=true",
        vod_id, encoded, sig
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_stream_url,
            get_available_qualities,
            get_twitch_clip_url,
            get_vod_manifest_url,
            start_recording,
            stop_recording,
        ])
        .setup(|app| {
            let mut labels_to_close = Vec::new();
            for (label, _) in app.webview_windows().iter() {
                if label != "main" {
                    labels_to_close.push(label.clone());
                }
            }
            for label in &labels_to_close {
                if let Some(w) = app.get_webview_window(label) {
                    let _ = w.close();
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
