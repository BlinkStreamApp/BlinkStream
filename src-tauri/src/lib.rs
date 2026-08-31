use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::time::Instant;
use tauri::AppHandle;
use tauri::Manager;
use wait_timeout::ChildExt;

mod recorder;
pub use recorder::{start_recording, stop_recording};
pub mod companion;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

use keyring::Entry;
use std::fs::OpenOptions;
use std::io::{Read, Write};

const TWITCH_APP_CLIENT_ID: &str = match option_env!("TWITCH_CLIENT_ID") {
    Some(id) if !id.is_empty() => id,
    _ => LEGACY_FALLBACK_CLIENT_ID,
};
const TWITCH_WEB_CLIENT_ID: &str = "kimne78kx3ncx6brgo4mv6wki5h1ko"; // ALLOWED-REGRESSION: Twitch GQL exige este Client ID para tokens de reproducción y VODs

static LEGACY_CLIENT_ID_WARN: std::sync::Once = std::sync::Once::new();

fn warn_legacy_client_id_once() {
    if TWITCH_APP_CLIENT_ID != LEGACY_FALLBACK_CLIENT_ID {
        return;
    }
    LEGACY_CLIENT_ID_WARN.call_once(|| {
        log::warn!(
            "[BlinkStream] Twitch Client ID legacy de terceros en uso. Registra tu propia app: https://dev.twitch.tv/console/apps. Docs: docs/TWITCH_APP_SETUP.md",
        );
    });
}

const LEGACY_FALLBACK_CLIENT_ID: &str = "z8bat49d2evj5nkmg5kmkge24sa7z9";

pub fn try_lock_single_instance(name: &str) -> bool {
    let lock_dir = single_instance_lock_dir();
    if std::fs::create_dir_all(&lock_dir).is_err() {
        return true;
    }
    let lock_path = lock_dir.join(format!("{name}.lock"));

    if lock_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&lock_path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if !is_pid_alive(pid) {
                    let _ = std::fs::remove_file(&lock_path);
                }
            }
        }
    }

    match OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&lock_path)
    {
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

const SLUG_RE: &str = r"^[a-zA-Z0-9_-]{1,100}$";

const VOD_ID_RE: &str = r"^[0-9]{1,20}$";

static CHANNEL_REGEX: std::sync::LazyLock<regex_lite::Regex> =
    std::sync::LazyLock::new(|| regex_lite::Regex::new(CHANNEL_RE).expect("CHANNEL_RE estático"));
static SLUG_REGEX: std::sync::LazyLock<regex_lite::Regex> =
    std::sync::LazyLock::new(|| regex_lite::Regex::new(SLUG_RE).expect("SLUG_RE estático"));
static VOD_ID_REGEX: std::sync::LazyLock<regex_lite::Regex> =
    std::sync::LazyLock::new(|| regex_lite::Regex::new(VOD_ID_RE).expect("VOD_ID_RE estático"));

fn validate_channel(name: &str) -> Result<(), String> {
    if !CHANNEL_REGEX.is_match(name) {
        return Err(
            "Nombre de canal inválido. Solo letras, números y guión bajo (3-25 caracteres).".into(),
        );
    }
    Ok(())
}

fn validate_slug(slug: &str) -> Result<(), String> {
    if !SLUG_REGEX.is_match(slug) {
        return Err(
            "Slug de clip inválido. Solo letras, números, guion y guion bajo (1-100 caracteres)."
                .into(),
        );
    }
    Ok(())
}

fn validate_vod_id(vod_id: &str) -> Result<(), String> {
    if !VOD_ID_REGEX.is_match(vod_id) {
        return Err("VOD ID inválido. Debe ser numérico (1-20 dígitos).".into());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
const INSTALL_CMD: &str = "winget install Streamlink.Streamlink";
#[cfg(target_os = "macos")]
const INSTALL_CMD: &str = "brew install streamlink";
#[cfg(target_os = "linux")]
const INSTALL_CMD: &str = "sudo apt install streamlink  # o pip install streamlink";

#[cfg(all(target_arch = "x86_64", target_os = "windows"))]
const STREAMLINK_TARGET_TRIPLE: &str = "x86_64-pc-windows-msvc";
#[cfg(all(target_arch = "aarch64", target_os = "windows"))]
const STREAMLINK_TARGET_TRIPLE: &str = "aarch64-pc-windows-msvc";
#[cfg(all(target_arch = "x86_64", target_os = "macos"))]
const STREAMLINK_TARGET_TRIPLE: &str = "x86_64-apple-darwin";
#[cfg(all(target_arch = "aarch64", target_os = "macos"))]
const STREAMLINK_TARGET_TRIPLE: &str = "aarch64-apple-darwin";
#[cfg(all(target_arch = "x86_64", target_os = "linux"))]
const STREAMLINK_TARGET_TRIPLE: &str = "x86_64-unknown-linux-gnu";

#[cfg(not(any(
    all(target_arch = "x86_64", target_os = "windows"),
    all(target_arch = "aarch64", target_os = "windows"),
    all(target_arch = "x86_64", target_os = "macos"),
    all(target_arch = "aarch64", target_os = "macos"),
    all(target_arch = "x86_64", target_os = "linux"),
)))]
const STREAMLINK_TARGET_TRIPLE: &str = "unknown";

#[cfg(windows)]
fn new_winget_command() -> std::process::Command {
    let mut candidates = Vec::new();
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local_app_data)
                .join("Microsoft")
                .join("WindowsApps")
                .join("winget.exe"),
        );
    }
    candidates.push(PathBuf::from(r"C:\Windows\System32\winget.exe"));

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map_or_else(
            || std::process::Command::new("winget"),
            std::process::Command::new,
        )
}

#[cfg(windows)]
fn run_winget_install(package_id: &str) -> Result<(), String> {
    let mut command = new_winget_command();
    command.args([
        "install",
        "--id",
        package_id,
        "--exact",
        "--scope",
        "user",
        "--silent",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity",
    ]);
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|e| format!("No se pudo ejecutar winget para {package_id}: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let mut fallback = new_winget_command();
    fallback.args([
        "install",
        "--id",
        package_id,
        "--exact",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ]);

    let fallback_out = fallback
        .output()
        .map_err(|e| format!("Fallback winget falló: {e}"))?;

    if fallback_out.status.success() {
        Ok(())
    } else {
        let details = String::from_utf8_lossy(&fallback_out.stderr)
            .trim()
            .chars()
            .take(240)
            .collect::<String>();
        Err(format!(
            "winget no pudo instalar {} (código {}). {}",
            package_id,
            fallback_out.status.code().unwrap_or(-1),
            details
        ))
    }
}

pub fn ensure_ffmpeg_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let mut where_cmd = std::process::Command::new("where.exe");
        where_cmd
            .arg("ffmpeg.exe")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        where_cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = where_cmd.output() {
            if output.status.success() {
                for line in String::from_utf8_lossy(&output.stdout).lines() {
                    let p = PathBuf::from(line.trim());
                    if p.exists()
                        && p.extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
                    {
                        if let Some(parent) = p.parent() {
                            add_to_process_path(parent);
                        }
                        return Some(p);
                    }
                }
            }
        }

        let mut candidate_paths = Vec::new();
        if let Ok(pf) = std::env::var("ProgramFiles") {
            candidate_paths.push(
                PathBuf::from(&pf)
                    .join("FFmpeg")
                    .join("bin")
                    .join("ffmpeg.exe"),
            );
            candidate_paths.push(
                PathBuf::from(&pf)
                    .join("Gyan")
                    .join("FFmpeg")
                    .join("bin")
                    .join("ffmpeg.exe"),
            );
        }
        if let Ok(pf_x86) = std::env::var("ProgramFiles(x86)") {
            candidate_paths.push(
                PathBuf::from(&pf_x86)
                    .join("FFmpeg")
                    .join("bin")
                    .join("ffmpeg.exe"),
            );
        }
        candidate_paths.push(PathBuf::from(r"C:\Program Files\FFmpeg\bin\ffmpeg.exe"));
        candidate_paths.push(PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"));
        candidate_paths.push(PathBuf::from(r"C:\ProgramData\chocolatey\bin\ffmpeg.exe"));
        if let Ok(up) = std::env::var("USERPROFILE") {
            candidate_paths.push(
                PathBuf::from(&up)
                    .join("scoop")
                    .join("apps")
                    .join("ffmpeg")
                    .join("current")
                    .join("bin")
                    .join("ffmpeg.exe"),
            );
            candidate_paths.push(
                PathBuf::from(&up)
                    .join("AppData")
                    .join("Local")
                    .join("Microsoft")
                    .join("WinGet")
                    .join("Links")
                    .join("ffmpeg.exe"),
            );
        }
        if let Ok(lad) = std::env::var("LOCALAPPDATA") {
            candidate_paths.push(
                PathBuf::from(&lad)
                    .join("Programs")
                    .join("Streamlink")
                    .join("ffmpeg")
                    .join("ffmpeg.exe"),
            );
        }

        if let Ok(lad) = std::env::var("LOCALAPPDATA") {
            let winget_pkgs = PathBuf::from(&lad)
                .join("Microsoft")
                .join("WinGet")
                .join("Packages");
            if let Ok(entries) = std::fs::read_dir(winget_pkgs) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_lowercase();
                    if name.contains("ffmpeg") || name.contains("gyan") {
                        collect_named_executables(
                            &entry.path(),
                            "ffmpeg.exe",
                            5,
                            &mut candidate_paths,
                        );
                    }
                }
            }
        }

        for p in candidate_paths {
            if p.exists() {
                if let Some(parent) = p.parent() {
                    add_to_process_path(parent);
                }
                return Some(p);
            }
        }
    }
    None
}

#[cfg(windows)]
fn collect_named_executables(
    root: &Path,
    file_name: &str,
    max_depth: u8,
    output: &mut Vec<PathBuf>,
) {
    if max_depth == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case(file_name))
        {
            output.push(path);
        } else if path.is_dir() {
            collect_named_executables(&path, file_name, max_depth - 1, output);
        }
    }
}

#[cfg(windows)]
fn add_to_process_path(new_dir: &std::path::Path) {
    if let Ok(current_path) = std::env::var("PATH") {
        let new_dir_str = new_dir.to_string_lossy();
        if !current_path
            .split(';')
            .any(|p| p.eq_ignore_ascii_case(&new_dir_str))
        {
            let updated_path = format!("{new_dir_str};{current_path}");
            std::env::set_var("PATH", updated_path);
        }
    }
}

#[cfg(windows)]
fn check_streamlink_windows_locations() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(pf) = std::env::var("ProgramFiles") {
        candidates.push(
            PathBuf::from(&pf)
                .join("Streamlink")
                .join("bin")
                .join("streamlink.exe"),
        );
        candidates.push(PathBuf::from(&pf).join("Streamlink").join("streamlink.exe"));
    }
    if let Ok(pf_x86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            PathBuf::from(&pf_x86)
                .join("Streamlink")
                .join("bin")
                .join("streamlink.exe"),
        );
        candidates.push(
            PathBuf::from(&pf_x86)
                .join("Streamlink")
                .join("streamlink.exe"),
        );
    }
    candidates.push(PathBuf::from(
        r"C:\Program Files\Streamlink\bin\streamlink.exe",
    ));
    candidates.push(PathBuf::from(
        r"C:\Program Files (x86)\Streamlink\bin\streamlink.exe",
    ));

    if let Ok(lad) = std::env::var("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(&lad)
                .join("Programs")
                .join("Streamlink")
                .join("streamlink.exe"),
        );
        candidates.push(
            PathBuf::from(&lad)
                .join("Programs")
                .join("Streamlink")
                .join("bin")
                .join("streamlink.exe"),
        );
        candidates.push(
            PathBuf::from(&lad)
                .join("Microsoft")
                .join("WinGet")
                .join("Links")
                .join("streamlink.exe"),
        );

        let winget_pkgs = PathBuf::from(&lad)
            .join("Microsoft")
            .join("WinGet")
            .join("Packages");
        if let Ok(entries) = std::fs::read_dir(winget_pkgs) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.contains("streamlink") {
                    collect_named_executables(&entry.path(), "streamlink.exe", 5, &mut candidates);
                }
            }
        }

        let py_progs = PathBuf::from(&lad).join("Programs").join("Python");
        if let Ok(entries) = std::fs::read_dir(py_progs) {
            for entry in entries.flatten() {
                candidates.push(entry.path().join("Scripts").join("streamlink.exe"));
            }
        }
    }

    if let Ok(apd) = std::env::var("APPDATA") {
        let py_roam = PathBuf::from(&apd).join("Python");
        if let Ok(entries) = std::fs::read_dir(py_roam) {
            for entry in entries.flatten() {
                candidates.push(entry.path().join("Scripts").join("streamlink.exe"));
            }
        }
    }

    if let Ok(up) = std::env::var("USERPROFILE") {
        candidates.push(
            PathBuf::from(&up)
                .join("scoop")
                .join("apps")
                .join("streamlink")
                .join("current")
                .join("bin")
                .join("streamlink.exe"),
        );
        candidates.push(
            PathBuf::from(&up)
                .join("scoop")
                .join("apps")
                .join("streamlink")
                .join("current")
                .join("streamlink.exe"),
        );
    }
    candidates.push(PathBuf::from(
        r"C:\ProgramData\chocolatey\bin\streamlink.exe",
    ));

    for p in candidates {
        if p.exists() && is_usable_streamlink(&p) {
            if let Some(parent) = p.parent() {
                add_to_process_path(parent);
            }
            return Some(p);
        }
    }

    let mut where_cmd = std::process::Command::new("where.exe");
    where_cmd
        .arg("streamlink.exe")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    where_cmd.creation_flags(CREATE_NO_WINDOW);
    if let Ok(output) = where_cmd.output() {
        if output.status.success() {
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                let p = PathBuf::from(line.trim());
                if p.exists()
                    && p.extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
                    && is_usable_streamlink(&p)
                {
                    if let Some(parent) = p.parent() {
                        add_to_process_path(parent);
                    }
                    return Some(p);
                }
            }
        }
    }

    None
}

fn is_usable_streamlink(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(windows)]
    {
        let mut command = std::process::Command::new(path);
        if let Some(parent) = path.parent() {
            command.current_dir(parent);
        }
        command
            .arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);

        let Ok(output) = command.output() else {
            log::error!("is_usable_streamlink: No se pudo ejecutar {path:?}");
            return false;
        };

        let version = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );

        if !output.status.success() {
            log::error!(
                "is_usable_streamlink: {:?} falló con código {:?}. Output: {}",
                path,
                output.status.code(),
                version
            );
            return false;
        }

        let is_valid = version.to_lowercase().contains("streamlink");
        if !is_valid {
            log::error!("is_usable_streamlink: {path:?} devolvió output inválido: {version}");
        }
        is_valid
    }

    #[cfg(not(windows))]
    {
        true
    }
}

pub fn find_bundled_streamlink(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok();
    let exe_dir = app.path().executable_dir().ok();
    let expected_names = [
        format!("streamlink-{STREAMLINK_TARGET_TRIPLE}.exe"),
        format!("streamlinkw-{STREAMLINK_TARGET_TRIPLE}.exe"),
        "streamlink.exe".to_string(),
        "streamlinkw.exe".to_string(),
    ];

    let mut search_dirs = Vec::new();
    if let Some(dir) = resource_dir {
        search_dirs.push(dir.join("binaries"));
        search_dirs.push(dir);
    }
    if let Some(dir) = exe_dir {
        search_dirs.push(dir);
    }

    for dir in &search_dirs {
        for name in &expected_names {
            let path = dir.join(name);
            if path.is_file() && is_usable_streamlink(&path) {
                return Some(path);
            }
        }
    }

    search_dirs.into_iter().find_map(|dir| {
        let entries = std::fs::read_dir(dir).ok()?;
        entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && path.file_name().is_some_and(|name| {
                    let value = name.to_string_lossy().to_lowercase();
                    value.starts_with("streamlink") && value.ends_with(".exe")
                })
                && is_usable_streamlink(path)
        })
    })
}

#[cfg(windows)]
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
static STREAMLINK_INSTALL_ATTEMPTED: AtomicBool = AtomicBool::new(false);
#[cfg(windows)]
static FFMPEG_INSTALL_ATTEMPTED: AtomicBool = AtomicBool::new(false);

pub fn ensure_runtime_dependencies(app: &AppHandle) -> Result<(), String> {
    let bundled_streamlink = find_bundled_streamlink(app);
    let system_streamlink = {
        #[cfg(windows)]
        {
            check_streamlink_windows_locations()
        }
        #[cfg(target_os = "macos")]
        {
            [
                "/opt/homebrew/bin/streamlink",
                "/usr/local/bin/streamlink",
                "/opt/local/bin/streamlink",
            ]
            .iter()
            .map(PathBuf::from)
            .find(|path| path.is_file())
        }
        #[cfg(target_os = "linux")]
        {
            [
                "/usr/bin/streamlink",
                "/usr/local/bin/streamlink",
                "/opt/streamlink/bin/streamlink",
            ]
            .iter()
            .map(PathBuf::from)
            .find(|path| path.is_file())
        }
        #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
        {
            None
        }
    };
    let streamlink_ready = bundled_streamlink.is_some() || system_streamlink.is_some();

    #[cfg(windows)]
    {
        let ffmpeg_ready = ensure_ffmpeg_path().is_some();
        if !streamlink_ready {
            if !STREAMLINK_INSTALL_ATTEMPTED.load(Ordering::SeqCst) {
                log::info!("Streamlink no encontrado; instalando Streamlink.Streamlink con winget");
                STREAMLINK_INSTALL_ATTEMPTED.store(true, Ordering::SeqCst);
                run_winget_install("Streamlink.Streamlink")?;
            } else {
                log::warn!("Instalación de Streamlink ya fue intentada. Saltando winget...");
            }
        }
        if !ffmpeg_ready {
            if !FFMPEG_INSTALL_ATTEMPTED.load(Ordering::SeqCst) {
                log::info!("FFmpeg no encontrado; instalando Gyan.FFmpeg con winget");
                FFMPEG_INSTALL_ATTEMPTED.store(true, Ordering::SeqCst);
                run_winget_install("Gyan.FFmpeg")?;
            } else {
                log::warn!("Instalación de FFmpeg ya fue intentada. Saltando winget...");
            }
        }

        let streamlink_path =
            find_bundled_streamlink(app).or_else(check_streamlink_windows_locations);
        if streamlink_path.is_none() {
            return Err("Streamlink se instaló, pero streamlink.exe no fue localizado. Reinicia la aplicación para actualizar el PATH.".into());
        }
        if let Some(path) = streamlink_path {
            log::info!("runtime: Streamlink listo en {}", path.display());
        }

        let ffmpeg_path = ensure_ffmpeg_path();
        if ffmpeg_path.is_none() {
            return Err("FFmpeg se instaló, pero ffmpeg.exe no fue localizado. Reinicia la aplicación para actualizar el PATH.".into());
        }
        if let Some(path) = ffmpeg_path {
            log::info!("runtime: FFmpeg listo en {}", path.display());
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        if !streamlink_ready {
            return Err(format!(
                "Streamlink no está instalado.\n\nInstálalo con: {INSTALL_CMD}"
            ));
        }
        Ok(())
    }
}

#[tauri::command]
async fn ensure_stream_dependencies(app: AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || ensure_runtime_dependencies(&app))
        .await
        .map_err(|e| format!("Error comprobando dependencias de streaming: {e}"))?
}

pub fn find_streamlink(app: &AppHandle) -> Result<PathBuf, String> {
    ensure_runtime_dependencies(app)?;

    if let Some(path) = find_bundled_streamlink(app) {
        return Ok(path);
    }

    #[cfg(windows)]
    {
        if let Some(path) = check_streamlink_windows_locations() {
            return Ok(path);
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

        let status = std::process::Command::new("brew")
            .args(["install", "streamlink"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        if let Ok(s) = status {
            if s.success() {
                for p in ["/opt/homebrew/bin/streamlink", "/usr/local/bin/streamlink"] {
                    if PathBuf::from(p).exists() {
                        return Ok(PathBuf::from(p));
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for p in [
            "/usr/bin/streamlink",
            "/usr/local/bin/streamlink",
            "/opt/streamlink/bin/streamlink",
        ] {
            if PathBuf::from(p).exists() {
                return Ok(PathBuf::from(p));
            }
        }
    }

    Err(format!(
        "Streamlink no está instalado.\n\nInstálalo con: {INSTALL_CMD}"
    ))
}

fn run_streamlink_with_timeout(
    app: &AppHandle,
    args: &[&str],
    timeout_secs: u64,
) -> Result<(String, String), String> {
    let binary = find_streamlink(app)?;

    let mut cmd = Command::new(&binary);
    let mut full_args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    if let Some(ff_path) = ensure_ffmpeg_path() {
        if !full_args.iter().any(|arg| arg == "--ffmpeg-ffmpeg") {
            full_args.push("--ffmpeg-ffmpeg".to_string());
            full_args.push(ff_path.to_string_lossy().to_string());
        }
    }
    cmd.args(&full_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("Streamlink no está instalado.\n\nInstálalo con: {INSTALL_CMD}")
        } else {
            format!("Error al ejecutar streamlink: {e}")
        }
    })?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let stdout_thread = std::thread::spawn(move || -> String {
        if let Some(mut handle) = stdout_handle {
            let mut buf = String::new();
            let _ = handle.read_to_string(&mut buf);
            buf
        } else {
            String::new()
        }
    });

    let stderr_thread = std::thread::spawn(move || -> String {
        if let Some(mut handle) = stderr_handle {
            let mut buf = String::new();
            let _ = handle.read_to_string(&mut buf);
            buf
        } else {
            String::new()
        }
    });

    let timeout = Duration::from_secs(timeout_secs);
    let _status = match child
        .wait_timeout(timeout)
        .map_err(|e| format!("Error esperando a streamlink: {e}"))?
    {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();

            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(format!("Streamlink tardó más de {timeout_secs} segundos."));
        }
    };

    let stdout = stdout_thread
        .join()
        .map_err(|_| "Error interno leyendo stdout de streamlink".to_string())?;
    let stderr = stderr_thread
        .join()
        .map_err(|_| "Error interno leyendo stderr de streamlink".to_string())?;

    Ok((stdout, stderr))
}

fn run_streamlink(app: &AppHandle, args: &[&str]) -> Result<(String, String), String> {
    run_streamlink_with_timeout(app, args, 60)
}

#[tauri::command]
async fn get_stream_url(
    app: AppHandle,
    channel: String,
    quality: String,
) -> Result<String, String> {
    validate_channel(&channel)?;

    let args: Vec<String> = vec![
        format!("twitch.tv/{}", channel),
        quality.clone(),
        "--stream-url".to_string(),
        "--twitch-low-latency".to_string(),
        "--hls-live-edge".to_string(),
        "1".to_string(),
        "--twitch-supported-codecs".to_string(),
        "h264".to_string(),
    ];

    let mut resolved_token: Option<String> = None;

    if let Ok(token) = get_secret("twitch_token".to_string()).await {
        if !token.is_empty() {
            resolved_token = Some(token);
        }
    }

    if resolved_token.is_none() {
        match get_app_token().await {
            Ok(v) => {
                if let Some(t) = v.get("token").and_then(|x| x.as_str()) {
                    if !t.is_empty() {
                        resolved_token = Some(t.to_string());
                        log::info!("get_stream_url: usando app token (no user token en keychain)");
                    }
                }
            }
            Err(e) => {
                log::warn!("get_stream_url: get_app_token fallo: {e}");
            }
        }
    }

    let mut auth_args = args.clone();
    let mut res_sl = if let Some(token) = resolved_token {
        auth_args.push("--twitch-api-header".to_string());
        auth_args.push(format!("Authorization=Bearer {token}"));
        let arg_refs_auth: Vec<&str> = auth_args.iter().map(String::as_str).collect();
        run_streamlink(&app, &arg_refs_auth)
    } else {
        Err("No hay token disponible".to_string())
    };

    let should_try_clean = match &res_sl {
        Err(_) => true,
        Ok((stdout, _)) => stdout.trim().starts_with("error:") || stdout.trim().is_empty(),
    };

    if should_try_clean {
        if auth_args.len() > args.len() {
            log::info!("get_stream_url: Fallo con token (posiblemente expirado). Reintentando de forma anónima...");
        } else {
            log::info!("get_stream_url: Acceso anónimo (no hay token)...");
        }
        let arg_refs_clean: Vec<&str> = args.iter().map(String::as_str).collect();
        res_sl = run_streamlink(&app, &arg_refs_clean);
    }

    let (stdout, stderr) = res_sl?;
    let url = stdout.trim().to_string();

    if url.starts_with("error:") {
        return Err(format!(
            "Streamlink fallo: {url}. Usa 'worst' o 'best' como quality para evitar este error (las qualities exactas como '480p' o '480p30' dependen del canal)."
        ));
    }
    if url.is_empty() {
        return Err(format!(
            "Streamlink no devolvió URL. stderr: {}",
            stderr.trim()
        ));
    }
    Ok(url)
}

#[tauri::command]
fn get_master_playlist(app: AppHandle, channel: String) -> Result<String, String> {
    validate_channel(&channel)?;

    let (stdout, stderr) = run_streamlink(
        &app,
        &[
            &format!("twitch.tv/{channel}"),
            "best",
            "--stream-url",
            "--twitch-low-latency",
            "--hls-live-edge",
            "1",
        ],
    )?;
    let variant_url = stdout.trim();

    if variant_url.is_empty() {
        return Err(format!(
            "Streamlink no devolvió URL. stderr: {}",
            stderr.trim()
        ));
    }

    if variant_url.contains("/playlist/") {
        if let Some(last_slash) = variant_url.rfind('/') {
            let prefix = &variant_url[..last_slash];
            let suffix = &variant_url[last_slash + 1..];
            if suffix.ends_with(".m3u8") {
                let master = format!("{prefix}.m3u8");
                return Ok(master);
            }
        }
    }

    log::warn!("get_master_playlist: formato inesperado, devolviendo variante: {variant_url}");
    Ok(variant_url.to_string())
}

#[tauri::command]
async fn fetch_m3u8_content(url: String) -> Result<String, String> {
    if !url.starts_with("https://")
        || (!url.contains("ttvnw.net")
            && !url.contains("twitch.tv")
            && !url.contains("cloudfront.net"))
    {
        return Err(format!("URL no permitida por seguridad: {url}"));
    }

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let response = client
        .get(&url)
        .header("Client-ID", TWITCH_WEB_CLIENT_ID)
        .send()
        .await
        .map_err(|e| format!("Error en fetch: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}: {url}"));
    }

    let text = response
        .text()
        .await
        .map_err(|e| format!("Error leyendo respuesta: {e}"))?;

    log::info!("fetch_m3u8_content: OK ({} bytes, {})", text.len(), url);
    Ok(text)
}

#[tauri::command]
async fn fetch_segment(url: String) -> Result<Vec<u8>, String> {
    if !url.starts_with("https://")
        || (!url.contains("ttvnw.net")
            && !url.contains("twitch.tv")
            && !url.contains("cloudfront.net")
            && !url.contains("akamaized.net"))
    {
        return Err(format!("URL no permitida por seguridad: {url}"));
    }

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Error en fetch segment: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}: {url}"));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Error leyendo segmento: {e}"))?;

    Ok(bytes.to_vec())
}

const DEFAULT_QUALITIES: &[&str] = &[
    "audio_only",
    "160p",
    "360p",
    "480p",
    "720p",
    "720p60",
    "936p60",
    "963p60",
    "1080p60",
    "1440p60",
];

#[tauri::command]
async fn get_available_qualities(app: AppHandle, channel: String) -> Vec<String> {
    let defaults: Vec<String> = DEFAULT_QUALITIES.iter().map(|&s| s.to_string()).collect();

    if let Err(e) = validate_channel(&channel) {
        log::error!("get_available_qualities: validate_channel error: {e}");
        return defaults;
    }

    let channel_for_blocking = channel.clone();
    let join_result = tokio::task::spawn_blocking(move || {
        run_streamlink_with_timeout(
            &app,
            &[&format!("twitch.tv/{channel_for_blocking}"), "--stream-url"],
            15,
        )
    })
    .await;

    let run_result = match join_result {
        Ok(r) => r,
        Err(e) => {
            log::error!("get_available_qualities: spawn_blocking join error: {e}");
            return defaults;
        }
    };

    match run_result {
        Ok((_stdout, stderr)) => {
            let qualities: Vec<String> = stderr
                .lines()
                .filter_map(|line| {
                    let line = line.trim();
                    if !line.contains("Available streams:") {
                        return None;
                    }
                    let parts = line.split("Available streams:").nth(1)?;
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
                log::info!("get_available_qualities: parsing empty, usando defaults");
                defaults
            } else {
                qualities
            }
        }
        Err(e) => {
            log::error!("get_available_qualities: streamlink error: {e}");
            defaults
        }
    }
}

#[tauri::command]
async fn get_twitch_clip_url(slug: String) -> Result<String, String> {
    validate_slug(&slug)?;

    let client = reqwest::Client::builder()
        .use_native_tls()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let body = serde_json::json!({
        "query": "query($slug: ID!) { clip(slug: $slug) { videoQualities { sourceURL quality } playbackAccessToken(params: { platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }) { value signature } } }",
        "variables": { "slug": slug }
    });

    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", TWITCH_WEB_CLIENT_ID)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("Read error: {e}"))?;

    if !status.is_success() {
        log::error!(
            "Twitch clip GQL failed: status={} body_len={} preview={}",
            status.as_u16(),
            text.len(),
            &text[..200.min(text.len())]
        );
        return Err(format!("Twitch API error: HTTP {}", status.as_u16()));
    }

    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        log::error!(
            "Twitch clip JSON parse error: err={} body_len={} preview={}",
            e,
            text.len(),
            &text[..200.min(text.len())]
        );
        "Twitch API: respuesta inválida".to_string()
    })?;

    let Some(clip) = data.get("data").and_then(|d| d.get("clip")) else {
        log::error!(
            "Twitch clip missing in response: body_len={} preview={}",
            text.len(),
            &text[..200.min(text.len())]
        );
        return Err("Twitch API: clip no encontrado".to_string());
    };

    let source_url = clip
        .get("videoQualities")
        .and_then(|q| q.as_array())
        .and_then(|a| a.first())
        .and_then(|q| q.get("sourceURL"))
        .and_then(|u| u.as_str())
        .unwrap_or("");

    let token = clip
        .get("playbackAccessToken")
        .and_then(|t| t.get("value"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let sig = clip
        .get("playbackAccessToken")
        .and_then(|t| t.get("signature"))
        .and_then(|s| s.as_str())
        .unwrap_or("");

    if source_url.is_empty() || token.is_empty() || sig.is_empty() {
        return Err(format!(
            "Missing data. URL:{}, Token:{}, Sig:{}",
            if source_url.is_empty() {
                "MISSING"
            } else {
                "OK"
            },
            if token.is_empty() { "MISSING" } else { "OK" },
            if sig.is_empty() { "MISSING" } else { "OK" }
        ));
    }

    let encoded = urlencoding::encode(token);
    Ok(format!("{source_url}?token={encoded}&sig={sig}"))
}

#[tauri::command]
async fn get_vod_manifest_url(vod_id: String) -> Result<String, String> {
    validate_vod_id(&vod_id)?;

    let client = reqwest::Client::builder()
        .use_native_tls()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let body = serde_json::json!({
        "query": "query($id: ID!) { video(id: $id) { playbackAccessToken(params: { platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }) { value signature } } }",
        "variables": { "id": vod_id }
    });

    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", TWITCH_WEB_CLIENT_ID)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP: {e}"))?;

    let text = response.text().await.map_err(|e| format!("Read: {e}"))?;

    let json_res: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        log::error!(
            "Twitch VOD JSON parse error: err={} body_len={} preview={}",
            e,
            text.len(),
            &text[..200.min(text.len())]
        );
        "Twitch API: respuesta inválida".to_string()
    })?;

    let video = json_res
        .get("data")
        .and_then(|d| d.get("video"))
        .ok_or_else(|| {
            log::error!(
                "Twitch VOD missing in response: body_len={} preview={}",
                text.len(),
                &text[..200.min(text.len())]
            );
            "Twitch API: video no encontrado".to_string()
        })?;

    let token = video
        .get("playbackAccessToken")
        .and_then(|t| t.get("value"))
        .and_then(|v| v.as_str())
        .ok_or("No token")?;

    let sig = video
        .get("playbackAccessToken")
        .and_then(|t| t.get("signature"))
        .and_then(|s| s.as_str())
        .ok_or("No sig")?;

    if token.is_empty() || sig.is_empty() {
        return Err("Empty token/sig".into());
    }

    let encoded = urlencoding::encode(token);
    Ok(format!(
        "https://usher.ttvnw.net/vod/{vod_id}.m3u8?nauth={encoded}&nauthsig={sig}&allow_source=true&allow_audio_only=true"
    ))
}

#[tauri::command]
async fn get_direct_stream_url(channel: String) -> Result<String, String> {
    validate_channel(&channel)?;

    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let gql_body = serde_json::json!({
        "query": "query($channelName: String!) { streamPlaybackAccessToken(channelName: $channelName, params: { platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }) { value signature } }",
        "variables": { "channelName": channel }
    });

    let gql_res = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", TWITCH_WEB_CLIENT_ID)
        .header("Content-Type", "application/json")
        .json(&gql_body)
        .send()
        .await
        .map_err(|e| format!("Error conectando con Twitch GQL: {e}"))?;

    if !gql_res.status().is_success() {
        return Err(format!(
            "Twitch GQL respondió con HTTP {}",
            gql_res.status()
        ));
    }

    let gql_data: serde_json::Value = gql_res
        .json()
        .await
        .map_err(|e| format!("Error parseando respuesta GQL: {e}"))?;

    let token = gql_data["data"]["streamPlaybackAccessToken"]["value"]
        .as_str()
        .ok_or_else(|| "No se pudo obtener token de acceso de Twitch".to_string())?
        .to_string();
    let sig = gql_data["data"]["streamPlaybackAccessToken"]["signature"]
        .as_str()
        .ok_or_else(|| "No se pudo obtener signature de Twitch".to_string())?
        .to_string();

    let p = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let usher_url = format!(
        "https://usher.ttvnw.net/api/channel/hls/{}.m3u8?player=twitchweb&token={}&sig={}&allow_audio_only=true&allow_source=true&type=any&p={}",
        urlencoding::encode(&channel),
        urlencoding::encode(&token),
        urlencoding::encode(&sig),
        p
    );

    let usher_res = client
        .get(&usher_url)
        .header("Client-Id", TWITCH_WEB_CLIENT_ID)
        .send()
        .await
        .map_err(|e| format!("Error conectando con Twitch Usher: {e}"))?;

    if !usher_res.status().is_success() {
        return Err(format!(
            "Twitch Usher respondió con HTTP {}",
            usher_res.status()
        ));
    }

    Ok(usher_res.url().to_string())
}

#[tauri::command]
async fn store_secret(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new("blinkstream", &key)
        .map_err(|e| format!("Error creando entrada keychain: {e}"))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Error guardando en keychain: {e}"))
}

#[tauri::command]
async fn get_secret(key: String) -> Result<String, String> {
    let entry = Entry::new("blinkstream", &key)
        .map_err(|e| format!("Error creando entrada keychain: {e}"))?;
    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(format!("Error leyendo keychain: {e}")),
    }
}

#[tauri::command]
async fn delete_secret(key: String) -> Result<(), String> {
    let entry = Entry::new("blinkstream", &key)
        .map_err(|e| format!("Error creando entrada keychain: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Error eliminando del keychain: {e}")),
    }
}

fn twitch_app_client_secret() -> Option<&'static str> {
    option_env!("TWITCH_APP_CLIENT_SECRET").filter(|secret| !secret.is_empty())
}

// Aviso de una sola vez por sesion del proceso: si no hay secret
// configurado, lo loggeamos para que el operador sepa por que
// /helix/channel_points/* falla.
static APP_TOKEN_MISCONFIG_WARN: std::sync::Once = std::sync::Once::new();

fn warn_missing_app_secret_once() {
    if twitch_app_client_secret().is_some() {
        return;
    }
    APP_TOKEN_MISCONFIG_WARN.call_once(|| {
        log::error!(
            "[BlinkStream] TWITCH_APP_CLIENT_SECRET no definido. Los endpoints de Channel Points NO funcionaran. Configuralo en build-time (.env o variable de entorno del build)."
        );
    });
}

// Cache en proceso: (token, expiresAtInstant). El Mutex protege
// el acceso concurrente desde multiples comandos async.
// `static` lo expone a nivel de crate. `Arc<Mutex<...>>` es la
// forma idiomática de compartir estado mutable entre tasks.
type AppTokenCache = Arc<Mutex<Option<(String, Instant)>>>;
static APP_TOKEN_CACHE: std::sync::OnceLock<AppTokenCache> = std::sync::OnceLock::new();

fn app_token_cache() -> &'static AppTokenCache {
    APP_TOKEN_CACHE.get_or_init(|| Arc::new(Mutex::new(None)))
}

#[tauri::command]
async fn get_app_token() -> Result<serde_json::Value, String> {
    warn_missing_app_secret_once();

    let client_secret = twitch_app_client_secret().ok_or_else(|| {
        "TWITCH_APP_CLIENT_SECRET no configurado. Define la variable de entorno en build-time."
            .to_string()
    })?;

    {
        let cache = app_token_cache()
            .lock()
            .map_err(|e| format!("Lock poisoned: {e}"))?;
        if let Some((token, expires_at)) = cache.as_ref() {
            if *expires_at > Instant::now() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;
                let ttl_ms = expires_at
                    .saturating_duration_since(Instant::now())
                    .as_millis() as u64;
                return Ok(serde_json::json!({
                    "token": token,
                    "expiresAt": now + ttl_ms,
                }));
            }
        }
    }

    let client = reqwest::Client::builder()
        .use_native_tls()
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    let res = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", TWITCH_APP_CLIENT_ID),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|e| format!("Error conectando con Twitch OAuth: {e}"))?;

    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Error leyendo respuesta: {e}"))?;

    if !status.is_success() {
        log::error!(
            "Twitch OAuth client_credentials fallo: status={} body_len={}",
            status.as_u16(),
            text.len()
        );
        return Err(format!("Twitch OAuth: HTTP {}", status.as_u16()));
    }

    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        log::error!(
            "Twitch OAuth JSON parse error: err={} body_len={}",
            e,
            text.len()
        );
        "Twitch OAuth: respuesta invalida".to_string()
    })?;

    let token = json
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("Twitch OAuth: sin access_token")?
        .to_string();
    let expires_in_secs = json
        .get("expires_in")
        .and_then(|v| v.as_u64())
        .ok_or("Twitch OAuth: sin expires_in")?;

    let safe_ttl = expires_in_secs.saturating_sub(60);
    if safe_ttl > 0 {
        let mut cache = app_token_cache()
            .lock()
            .map_err(|e| format!("Lock poisoned: {e}"))?;
        *cache = Some((
            token.clone(),
            Instant::now() + Duration::from_secs(safe_ttl),
        ));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let expires_at_ms = now + (safe_ttl * 1000);

    Ok(serde_json::json!({
        "token": token,
        "expiresAt": expires_at_ms,
    }))
}

#[tauri::command]
async fn download_media_range(
    app: AppHandle,
    url: String,
    start_time: f64,
    end_time: f64,
    output_name: Option<String>,
) -> Result<String, String> {
    if start_time < 0.0 || end_time <= start_time {
        return Err("Rango de tiempo no válido: el tiempo final debe ser mayor al inicial.".into());
    }

    let ffmpeg_path = ensure_ffmpeg_path().ok_or_else(|| {
        "FFmpeg no está instalado o no se encuentra en el sistema.".to_string()
    })?;

    let base_dir = app
        .path()
        .video_dir()
        .or_else(|_| app.path().download_dir())
        .unwrap_or_else(|_| std::env::temp_dir());

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let raw_name = output_name.unwrap_or_else(|| format!("blinkstream_clip_{timestamp}.mp4"));
    let sanitized_name: String = raw_name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();

    let final_name = if sanitized_name.ends_with(".mp4") {
        sanitized_name
    } else {
        format!("{sanitized_name}.mp4")
    };

    let output_file = base_dir.join(final_name);
    let start_str = format!("{:.2}", start_time);
    let duration_str = format!("{:.2}", end_time - start_time);

    let output_file_str = output_file.to_string_lossy().to_string();
    let url_clone = url.clone();
    let ffmpeg_clone = ffmpeg_path.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut cmd = Command::new(&ffmpeg_clone);
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.arg("-y")
            .arg("-ss")
            .arg(&start_str)
            .arg("-i")
            .arg(&url_clone)
            .arg("-t")
            .arg(&duration_str)
            .arg("-c")
            .arg("copy")
            .arg(&output_file_str);

        let status = cmd
            .status()
            .map_err(|e| format!("Fallo al ejecutar FFmpeg: {e}"))?;

        if !status.success() {
            let mut fallback_cmd = Command::new(&ffmpeg_clone);
            #[cfg(windows)]
            fallback_cmd.creation_flags(CREATE_NO_WINDOW);

            fallback_cmd
                .arg("-y")
                .arg("-ss")
                .arg(&start_str)
                .arg("-i")
                .arg(&url_clone)
                .arg("-t")
                .arg(&duration_str)
                .arg("-c:v")
                .arg("libx264")
                .arg("-preset")
                .arg("veryfast")
                .arg("-c:a")
                .arg("aac")
                .arg(&output_file_str);

            let fallback_status = fallback_cmd
                .status()
                .map_err(|e| format!("Fallo re-codificando con FFmpeg: {e}"))?;
            if !fallback_status.success() {
                return Err("FFmpeg devolvió error al cortar el vídeo.".into());
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Error en tarea de recorte: {e}"))??;

    Ok(output_file.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_click_through(app: AppHandle, label: String, ignore: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| format!("Error modificando cursor events: {e}"))?;
        Ok(())
    } else {
        Err(format!("Ventana {label} no encontrada"))
    }
}

#[tauri::command]
async fn close_gamer_overlay(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("gamer_overlay") {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
async fn open_gamer_overlay(app: AppHandle, channel: String) -> Result<(), String> {
    use tauri::Emitter;
    let label = "gamer_overlay";
    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        let _ = existing.emit("overlay_channel_change", &channel);
        return Ok(());
    }

    let url_str = format!("index.html?overlay=true&channel={}", urlencoding::encode(&channel));
    let url = tauri::WebviewUrl::App(url_str.into());

    let _window = tauri::WebviewWindowBuilder::new(&app, label, url)
        .title("BlinkStream Gamer HUD")
        .inner_size(360.0, 560.0)
        .min_inner_size(240.0, 300.0)
        .resizable(true)
        .always_on_top(true)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .build()
        .map_err(|e| format!("Error al crear overlay gamer: {e}"))?;

    Ok(())
}

fn get_twitch_auth_script(token_opt: Option<&str>, username_opt: Option<&str>) -> Option<String> {
    let token = token_opt
        .map(|t| t.trim().strip_prefix("oauth:").unwrap_or(t.trim()).to_string())
        .or_else(|| {
            Entry::new("blinkstream", "twitch_token")
                .ok()
                .and_then(|e| e.get_password().ok())
                .map(|t| t.trim().strip_prefix("oauth:").unwrap_or(t.trim()).to_string())
        })
        .filter(|t| !t.is_empty())?;

    let username = username_opt
        .map(|u| u.trim().to_string())
        .or_else(|| {
            Entry::new("blinkstream", "twitch_username")
                .ok()
                .and_then(|e| e.get_password().ok())
        })
        .unwrap_or_default();

    Some(format!(
        r#"
        (function() {{
            try {{
                var d = new Date();
                d.setTime(d.getTime() + (365*24*60*60*1000));
                var expires = "; expires=" + d.toUTCString();
                document.cookie = "auth-token={token}; domain=.twitch.tv; path=/; SameSite=None; Secure" + expires;
                document.cookie = "twilight-user={user}; domain=.twitch.tv; path=/; SameSite=None; Secure" + expires;
                document.cookie = "login={user}; domain=.twitch.tv; path=/; SameSite=None; Secure" + expires;
                document.cookie = "name={user}; domain=.twitch.tv; path=/; SameSite=None; Secure" + expires;
                document.cookie = "server_session=true; domain=.twitch.tv; path=/; SameSite=None; Secure" + expires;
                try {{
                    localStorage.setItem('auth-token', '{token}');
                    localStorage.setItem('login', '{user}');
                }} catch(e) {{}}
            }} catch(e) {{
                console.error("[BlinkStream] Error inyectando cookies de sesion:", e);
            }}
        }})();
        "#,
        token = token,
        user = username
    ))
}

#[tauri::command]
async fn open_twitch_popout_window(
    app: AppHandle,
    channel: String,
    always_on_top: Option<bool>,
    auth_token: Option<String>,
    username: Option<String>,
) -> Result<(), String> {
    validate_channel(&channel)?;
    let label = "twitch_chat_popout";
    let auth_script = get_twitch_auth_script(auth_token.as_deref(), username.as_deref());

    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.set_focus();
        if let Some(ref script) = auth_script {
            let _ = existing.eval(script);
        }
        let url_str = format!("https://twitch.tv/popout/{}/chat?popout=", urlencoding::encode(&channel));
        if let Ok(target_url) = url_str.parse::<tauri::Url>() {
            let _ = existing.navigate(target_url);
        }
        return Ok(());
    }

    let url_str = format!("https://twitch.tv/popout/{}/chat?popout=", urlencoding::encode(&channel));
    let parsed_url: tauri::Url = url_str
        .parse()
        .map_err(|e| format!("URL inválida para chat popout: {e}"))?;

    let url = tauri::WebviewUrl::External(parsed_url);

    let mut builder = tauri::WebviewWindowBuilder::new(&app, label, url)
        .title(format!("Twitch Chat - {channel}"))
        .inner_size(380.0, 620.0)
        .min_inner_size(260.0, 300.0)
        .resizable(true)
        .always_on_top(always_on_top.unwrap_or(false))
        .decorations(true);

    if let Some(ref script) = auth_script {
        builder = builder.initialization_script(script);
    }

    let _window = builder
        .build()
        .map_err(|e| format!("Error al abrir ventana de chat popout: {e}"))?;

    Ok(())
}

#[tauri::command]
async fn mount_embedded_twitch_chat(
    app: AppHandle,
    channel: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    auth_token: Option<String>,
    username: Option<String>,
) -> Result<(), String> {
    validate_channel(&channel)?;
    let label = "embedded_twitch_chat";
    let auth_script = get_twitch_auth_script(auth_token.as_deref(), username.as_deref());

    let url_str = format!("https://twitch.tv/popout/{}/chat?popout=", urlencoding::encode(&channel));
    let parsed_url: tauri::Url = url_str
        .parse()
        .map_err(|e| format!("URL inválida para chat embebido: {e}"))?;

    if let Some(existing_webview) = app.get_webview(label) {
        let _ = existing_webview.set_position(tauri::LogicalPosition::new(x, y));
        let _ = existing_webview.set_size(tauri::LogicalSize::new(width, height));
        if let Some(ref script) = auth_script {
            let _ = existing_webview.eval(script);
        }
        let _ = existing_webview.navigate(parsed_url);
        let _ = existing_webview.show();
        return Ok(());
    }

    let main_window = app.get_window("main").ok_or("Ventana principal no encontrada")?;

    let mut webview_builder = tauri::WebviewBuilder::new(label, tauri::WebviewUrl::External(parsed_url))
        .auto_resize();

    if let Some(ref script) = auth_script {
        webview_builder = webview_builder.initialization_script(script);
    }

    let _child = main_window
        .add_child(
            webview_builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| format!("Error al crear sub-webview de chat: {e}"))?;

    Ok(())
}

#[tauri::command]
async fn update_embedded_twitch_chat_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = "embedded_twitch_chat";
    if let Some(webview) = app.get_webview(label) {
        let _ = webview.set_position(tauri::LogicalPosition::new(x, y));
        let _ = webview.set_size(tauri::LogicalSize::new(width, height));
    }
    Ok(())
}

#[tauri::command]
async fn unmount_embedded_twitch_chat(app: AppHandle) -> Result<(), String> {
    let label = "embedded_twitch_chat";
    if let Some(webview) = app.get_webview(label) {
        let _ = webview.close();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            store_secret,
            get_secret,
            delete_secret,
            get_stream_url,
            ensure_stream_dependencies,
            get_available_qualities,
            get_direct_stream_url,
            get_master_playlist,
            fetch_m3u8_content,
            fetch_segment,
            get_twitch_clip_url,
            get_vod_manifest_url,
            download_media_range,
            set_click_through,
            close_gamer_overlay,
            open_gamer_overlay,
            open_twitch_popout_window,
            mount_embedded_twitch_chat,
            update_embedded_twitch_chat_bounds,
            unmount_embedded_twitch_chat,
            start_recording,
            stop_recording,
            get_app_token,
            recorder::recorder_set_global_enabled,
            recorder::recorder_get_global_state,
            recorder::recorder_list_active,
            recorder::recorder_get_full_state,
            companion::get_companion_status,
            companion::start_companion_server_cmd,
            companion::stop_companion_server_cmd,
            companion::update_companion_state,
        ])
        .setup(|app| {
            let mut labels_to_close = Vec::new();
            warn_legacy_client_id_once();
            if let Err(error) = companion::init_and_start_companion_server(app.handle().clone()) {
                log::error!("[Companion] No se pudo iniciar el servidor: {error}");
            }

            recorder::init_global_state(app.handle());

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

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Info
                    } else {
                        log::LevelFilter::Warn
                    })
                    .build(),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {

    use super::*;

    #[test]
    fn validate_slug_rejects_injection_payload() {
        assert!(validate_slug(r#""; DROP TABLE--"#).is_err());
    }

    #[test]
    fn validate_slug_rejects_quote() {
        // Una comilla suelta debe ser rechazada.
        assert!(validate_slug(r#"abc"def"#).is_err());
    }

    #[test]
    fn validate_slug_rejects_backslash() {
        assert!(validate_slug(r"ab\cd").is_err());
    }

    #[test]
    fn validate_slug_rejects_empty() {
        assert!(validate_slug("").is_err());
    }

    #[test]
    fn validate_slug_rejects_too_long() {
        let s = "a".repeat(101);
        assert!(validate_slug(&s).is_err());
    }

    #[test]
    fn validate_slug_accepts_valid_slug() {
        assert!(validate_slug("valid_slug-123").is_ok());
    }

    #[test]
    fn validate_slug_accepts_double_dash() {
        assert!(validate_slug("valid--slug--").is_ok());
    }

    #[test]
    fn validate_slug_accepts_all_underscores() {
        assert!(validate_slug("a_b_c").is_ok());
    }

    #[test]
    fn validate_slug_rejects_space() {
        assert!(validate_slug("valid slug").is_err());
    }

    #[test]
    fn validate_slug_rejects_slash() {
        assert!(validate_slug("../etc/passwd").is_err());
    }

    #[test]
    fn validate_vod_id_rejects_non_numeric() {
        assert!(validate_vod_id("123abc").is_err());
    }

    #[test]
    fn validate_vod_id_rejects_empty() {
        assert!(validate_vod_id("").is_err());
    }

    #[test]
    fn validate_vod_id_rejects_negative() {
        assert!(validate_vod_id("-123").is_err());
    }

    #[test]
    fn validate_vod_id_rejects_too_long() {
        let s = "1".repeat(21);
        assert!(validate_vod_id(&s).is_err());
    }

    #[test]
    fn validate_vod_id_accepts_numeric() {
        assert!(validate_vod_id("12345").is_ok());
    }

    #[test]
    fn validate_vod_id_accepts_single_digit() {
        assert!(validate_vod_id("0").is_ok());
    }

    #[test]
    fn validate_channel_rejects_path_traversal() {
        assert!(validate_channel("../etc/passwd").is_err());
    }

    #[test]
    fn validate_channel_rejects_injection_payload() {
        assert!(validate_channel(r#""; DROP TABLE--"#).is_err());
    }

    #[test]
    fn validate_channel_accepts_valid() {
        assert!(validate_channel("ninja").is_ok());
    }

    #[test]
    fn validate_channel_rejects_too_short() {
        // Mínimo 3 chars.
        assert!(validate_channel("ab").is_err());
    }

    // ─── get_app_token: sin secret configurado -> error explicito ───

    #[tokio::test]
    async fn get_app_token_missing_secret_returns_error() {
        // Si TWITCH_APP_CLIENT_SECRET no se definio en build-time,
        // el command debe devolver un error claro (no panic, no
        // token invalido). Solo testeable cuando el secret esta
        // vacio en la build de test (que es lo normal en CI).
        if twitch_app_client_secret().is_none() {
            let res = get_app_token().await;
            assert!(res.is_err(), "get_app_token sin secret debe devolver Err");
            let err = res.unwrap_err();
            assert!(
                err.contains("TWITCH_APP_CLIENT_SECRET"),
                "el error debe mencionar la variable faltante, got: {err}"
            );
        }
    }
}
