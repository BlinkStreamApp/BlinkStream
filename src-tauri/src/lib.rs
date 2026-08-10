use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::time::Instant;
use tauri::AppHandle;
use tauri::Manager;
use wait_timeout::ChildExt;

// G1 / WT-20260628-16: modulo dedicado de grabacion.
// Re-exporta start_recording / stop_recording para que la API publica
// no cambie. Las funciones nuevas (recorder_set_global_enabled, etc.)
// se referencian directamente desde recorder::*.
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

// ============================================================
// Twitch API Client ID (backend Rust)
// ============================================================
// S-1 fix: el Client ID hardcodeado (kimne78...) era de TERCEROS
// (cliente web de Twitch / apps de chat no oficiales), lo cual viola
// los ToS de Twitch. AHORA lo leemos de la variable de entorno
// TWITCH_CLIENT_ID (configurable en .env, sin prefijo VITE_ porque
// es build-time). docs/TWITCH_APP_SETUP.md explica como registrar
// tu propia app Twitch.
//
// AVISO: eliminar el fallback legacy cuando el usuario haya
// migrado a su propia app Twitch registrada.
// ============================================================

// Importante: el bloque const NO usa lazy_static/once_cell. option_env!()
// se evalua en tiempo de compilacion; el fallback legacy tambien es
// una constante. Asi evitamos coste en runtime y garantizamos que el
// binario siempre tiene un Client ID valido (no devuelve Option).
const TWITCH_APP_CLIENT_ID: &str = match option_env!("TWITCH_CLIENT_ID") {
    Some(id) if !id.is_empty() => id,
    _ => LEGACY_FALLBACK_CLIENT_ID,
};
const TWITCH_WEB_CLIENT_ID: &str = "kimne78kx3ncx6brgo4mv6wki5h1ko"; // ALLOWED-REGRESSION: Twitch GQL exige este Client ID para tokens de reproducción y VODs

// El warning se imprime UNA SOLA VEZ por sesion del proceso (no por request).
// Usamos std::sync::Once para no spammear logs en cada clip/VOD resuelto.
// Solo se dispara si el Client ID final coincide con el legacy hardcoded,
// lo que indica que TWITCH_CLIENT_ID no se definio en build-time.
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

// FIX WT-20260628-134: fallback a BlinkStream App Client ID del .env
// (z8bat49d2evj5nkmg5kmkge24sa7z9) en vez de un Client ID first-party
// de terceros que Twitch puede revocar en cualquier momento. Si
// TWITCH_CLIENT_ID esta configurado, este const nunca se usa.
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
// Los slugs de clips de Twitch son tokens opacos: alfanuméricos, guiones y
// guiones bajos, típicamente 10-50 chars pero aceptamos 1-100 por margen.
// NO permitimos comillas, barras, espacios ni caracteres de control — eso
// cierra la inyección GraphQL en el cuerpo de la query.
const SLUG_RE: &str = r"^[a-zA-Z0-9_-]{1,100}$";
// Los VOD IDs de Twitch son enteros sin signo (generalmente < 2^31).
// Solo dígitos, 1-20 caracteres de margen.
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

/// Valida un slug de clip de Twitch. Devuelve Ok solo si cumple
/// `^[a-zA-Z0-9_-]{1,100}$`. Esto blinda contra inyección GraphQL.
fn validate_slug(slug: &str) -> Result<(), String> {
    if !SLUG_REGEX.is_match(slug) {
        return Err(
            "Slug de clip inválido. Solo letras, números, guion y guion bajo (1-100 caracteres)."
                .into(),
        );
    }
    Ok(())
}

/// Valida un VOD ID de Twitch. Debe ser numérico (1-20 dígitos).
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

    // Algunos manifiestos no admiten --scope user (ej: Streamlink). Reintentamos sin esa
    // opción antes de devolver el error al instalador.
    let mut fallback = new_winget_command();
    fallback.args([
        "install",
        "--id",
        package_id,
        "--exact",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ]);
    // Sin CREATE_NO_WINDOW ni --silent para que el usuario pueda ver prompts de origen o UAC
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

/// Localiza ffmpeg y asegura que su directorio esté en el PATH del proceso actual
/// para que streamlink pueda grabar y procesar flujos HLS sin errores.
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

/// Los launchers de Streamlink para Windows dependen de `Python\` y `pkgs\`
/// junto a ellos. El sidecar histórico contiene únicamente el launcher, por
/// lo que en una máquina limpia termina con stdout vacío. Validamos el
/// ejecutable antes de usarlo.
fn is_usable_streamlink(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }

    #[cfg(windows)]
    {
        let mut command = std::process::Command::new(path);
        command
            .arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .creation_flags(CREATE_NO_WINDOW);

        let Ok(output) = command.output() else {
            return false;
        };
        if !output.status.success() {
            return false;
        }

        let version = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        version.to_lowercase().contains("streamlink")
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

    // El bundler NSIS coloca externalBin junto al ejecutable instalado.
    search_dirs.into_iter().find_map(|dir| {
        let entries = std::fs::read_dir(dir).ok()?;
        entries.flatten().map(|entry| entry.path()).find(|path| {
            path.is_file()
                && is_usable_streamlink(path)
                && path.file_name().is_some_and(|name| {
                    let value = name.to_string_lossy().to_lowercase();
                    value.starts_with("streamlink") && value.ends_with(".exe")
                })
        })
    })
}

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
            log::info!("Streamlink no encontrado; instalando Streamlink.Streamlink con winget");
            run_winget_install("Streamlink.Streamlink")?;
        }
        if !ffmpeg_ready {
            log::info!("FFmpeg no encontrado; instalando Gyan.FFmpeg con winget");
            run_winget_install("Gyan.FFmpeg")?;
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
                "Streamlink no está instalado.\n\nInstálalo con: {}",
                INSTALL_CMD
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

/// Ejecuta streamlink con un timeout configurable (en segundos).
/// Es síncrona: usa `Command::spawn` + `wait_timeout`. Para no bloquear
/// el event loop de Tauri, los llamadores async deben envolverla en
/// `tokio::task::spawn_blocking`.
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

    // Leer pipes en hilos paralelos MIENTRAS el hijo se ejecuta
    // Esto evita el deadlock cuando streamlink produce mucha salida
    // y el buffer del pipe (típicamente 64KB) se llena.
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
            // Unir hilos pendientes para evitar thread leak
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(format!("Streamlink tardó más de {timeout_secs} segundos."));
        }
    };

    // Recoger resultados de los hilos
    let stdout = stdout_thread
        .join()
        .map_err(|_| "Error interno leyendo stdout de streamlink".to_string())?;
    let stderr = stderr_thread
        .join()
        .map_err(|_| "Error interno leyendo stderr de streamlink".to_string())?;

    Ok((stdout, stderr))
}

/// Wrapper con el timeout histórico (60s). Mantiene la firma que ya usan
/// `get_stream_url` y `get_master_playlist` sin cambiar su semántica.
fn run_streamlink(app: &AppHandle, args: &[&str]) -> Result<(String, String), String> {
    run_streamlink_with_timeout(app, args, 60)
}

// ── start_recording / stop_recording movidos a recorder.rs (G1 / WT-20260628-16)
// Se re-exportan arriba via `pub use recorder::{start_recording, stop_recording}`.
// El Mutex RECORDING tambien vive ahora en recorder.rs (single source of truth).

#[tauri::command]
async fn get_stream_url(
    app: AppHandle,
    channel: String,
    quality: String,
) -> Result<String, String> {
    validate_channel(&channel)?;
    // FIX WT-20260628-88: Twitch HLS playlists devuelven 403 si la request
    // no lleva un token valido (puede ser de usuario o app). Orden de
    // resolucion:
    //   1) `twitch_token` del keychain (usuario logueado) — mas permisos
    //      (subscriber-only, prime, etc.) y priorizado por el frontend.
    //   2) App Access Token via `get_app_token()` (client_credentials).
    //      Autentica la request al playlist endpoint sin necesitar user.
    //      Es el camino que resuelve el 403 cuando el usuario esta en
    //      modo guest pero el stream no es totalmente publico.
    //   3) Sin token (ultimo recurso): streamlink usara su propio
    //      client_id de terceros; el 403 puede volver, pero no rompemos
    //      el flujo ni lanzamos panic.
    let args: Vec<String> = vec![
        format!("twitch.tv/{}", channel),
        quality.clone(),
        "--stream-url".to_string(),
    ];

    let mut resolved_token: Option<String> = None;

    // 1) Token de usuario (keychain).
    if let Ok(token) = get_secret("twitch_token".to_string()).await {
        if !token.is_empty() {
            resolved_token = Some(token);
        }
    }

    // 2) Fallback a app token si no hay user token. get_app_token ya
    //    cachea en memoria con TTL, asi que esto NO agrega un round-trip
    //    a Twitch en cada preview.
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
                // No es fatal: streamlink probara sin token. Logueamos
                // para que el operador sepa por que volvio el 403 si
                // vuelve.
                log::warn!("get_stream_url: get_app_token fallo: {e}");
            }
        }
    }

    // Intentar primero SIN token de autenticaicón (acceso público limpio) para que Streamlink utilice su cliente web nativo.
    // Esto evita que Twitch Usher restrinja la playlist m3u8 con cabeceras que provocan errores HTTP 403 al cargarse desde WebView2/HLS.
    let mut clean_args = args.clone();
    let arg_refs_clean: Vec<&str> = clean_args.iter().map(String::as_str).collect();
    let mut res_sl = run_streamlink(&app, &arg_refs_clean);

    // Si el acceso público falla (por ejemplo, streams exclusivos para suscriptores), intentamos con el token Bearer
    if let Some(token) = resolved_token {
        let should_try_auth = match &res_sl {
            Err(_) => true,
            Ok((stdout, _)) => stdout.trim().starts_with("error:") || stdout.trim().is_empty(),
        };
        if should_try_auth {
            log::info!("get_stream_url: Acceso público fallido o exclusivo. Reintentando con token de Twitch...");
            clean_args.push("--twitch-api-header".to_string());
            clean_args.push(format!("Authorization=Bearer {token}"));
            let arg_refs_auth: Vec<&str> = clean_args.iter().map(String::as_str).collect();
            res_sl = run_streamlink(&app, &arg_refs_auth);
        }
    }

    let (stdout, stderr) = res_sl?;
    let url = stdout.trim().to_string();

    // FIX WT-20260628-86: si streamlink falla (quality no disponible,
    // canal offline, etc.) stdout arranca con "error: ..." en vez de
    // una URL. Antes el codigo lo trataba como URL valida, se la pasaba
    // a HLS.js y reventaba con un error opaco de CSP. Detectar y
    // retornar un error explicito con sugerencia accionable.
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

/// Devuelve la URL del MASTER PLAYLIST (contiene todas las calidades).
/// hls.js puede cargar esta URL y el usuario cambia calidad via level API,
/// sin recargar el stream. Así evitamos pantallas negras con variantes raras.
#[tauri::command]
fn get_master_playlist(app: AppHandle, channel: String) -> Result<String, String> {
    validate_channel(&channel)?;
    // Primero obtenemos cualquier variante con best
    let (stdout, stderr) = run_streamlink(
        &app,
        &[&format!("twitch.tv/{channel}"), "best", "--stream-url"],
    )?;
    let variant_url = stdout.trim();

    if variant_url.is_empty() {
        return Err(format!(
            "Streamlink no devolvió URL. stderr: {}",
            stderr.trim()
        ));
    }

    // La URL de Twitch tiene formato:
    //   .../playlist/{TOKEN}/{resolucion}.m3u8   (variante)
    //   .../playlist/{TOKEN}.m3u8                (master)
    //
    // Eliminamos el último segmento (/{resolucion}.m3u8) para obtener el master.
    // Solo aplicamos la transformación si la URL contiene el segmento /playlist/.
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

    // Si no podemos extraer el master, devolvemos la URL de la variante
    log::warn!("get_master_playlist: formato inesperado, devolviendo variante: {variant_url}");
    Ok(variant_url.to_string())
}

/// Trae el contenido de un M3U8 desde una URL externa sin restricciones CORS.
/// Lo usa el frontend `StreamPreview.jsx` para evitar el error CORS al cargar
/// el m3u8 directamente desde el webview.
///
/// Patron de Lecs/2026-06-23-fixes-cors-quality-loop.md: el webview del Tauri
/// no puede hacer fetch a `*.ttvnw.net` por CSP, pero el backend Rust SI
/// puede (sin CSP). Devolvemos el contenido del m3u8 al frontend, que lo
/// envuelve en un Blob URL same-origin para que hls.js lo consuma sin CORS.
///
/// Whitelist explicita: solo permitimos hosts de Twitch / CDN de Twitch.
/// Asi evitamos que esta command se use como proxy abierto a Internet.
#[tauri::command]
async fn fetch_m3u8_content(url: String) -> Result<String, String> {
    // Sanity check de seguridad: solo URLs HTTPS hacia hosts conocidos.
    if !url.starts_with("https://")
        || (!url.contains("ttvnw.net")
            && !url.contains("twitch.tv")
            && !url.contains("cloudfront.net"))
    {
        return Err(format!("URL no permitida por seguridad: {url}"));
    }

    let client = reqwest::Client::builder()
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

/// Devuelve las calidades disponibles para un canal.
///
/// Esta función NUNCA debe fallar. Si algo sale mal, devuelve defaults
/// para que el frontend pueda mostrar el selector de calidad siempre.
///
/// Notas de rendimiento (M-3 de la auditoría WT-20260628-01):
/// - Usa `run_streamlink_with_timeout` con 15s (no 60s) para que el
///   selector de calidad no quede colgado si Twitch/streamlink no responden.
/// - Envuelve la llamada síncrona en `tokio::task::spawn_blocking` para
///   no bloquear el event loop de Tauri (la función es `async`).
#[tauri::command]
async fn get_available_qualities(app: AppHandle, channel: String) -> Vec<String> {
    let defaults: Vec<String> = DEFAULT_QUALITIES.iter().map(|&s| s.to_string()).collect();

    if let Err(e) = validate_channel(&channel) {
        log::error!("get_available_qualities: validate_channel error: {e}");
        return defaults;
    }

    // `run_streamlink_with_timeout` es síncrona (usa `Command::spawn` +
    // `wait_timeout`). La movemos a un thread bloqueante para no
    // congelar el runtime de tokio que Tauri usa para los comandos.
    let channel_for_blocking = channel.clone();
    let join_result = tokio::task::spawn_blocking(move || {
        // 15s es suficiente: streamlink responde en <2s en condiciones
        // normales, y 15s cubre redes lentas sin hacer esperar al usuario
        // un minuto entero si algo está mal.
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
    // ── Validar slug antes de tocar la red. Cierra inyección GraphQL. ──
    validate_slug(&slug)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    // El slug viaja como variable GraphQL ($slug), nunca como string
    // interpolado. Así un slug con `"` o `\` no puede romper la query.
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
        // S-6: NO exponer el cuerpo HTTP al frontend. Log internamente
        // para debugging y devolver mensaje genérico con el código de estado.
        log::error!(
            "Twitch clip GQL failed: status={} body_len={} preview={}",
            status.as_u16(),
            text.len(),
            &text[..200.min(text.len())]
        );
        return Err(format!("Twitch API error: HTTP {}", status.as_u16()));
    }

    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        // S-6: log interno con detalle, mensaje genérico al frontend.
        log::error!(
            "Twitch clip JSON parse error: err={} body_len={} preview={}",
            e,
            text.len(),
            &text[..200.min(text.len())]
        );
        "Twitch API: respuesta inválida".to_string()
    })?;

    let Some(clip) = data.get("data").and_then(|d| d.get("clip")) else {
        // S-6: el cuerpo puede contener HTML/JSON de error con info sensible;
        // nunca se lo devolvemos al frontend.
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
    // ── Validar vod_id antes de tocar la red. Cierra inyección GraphQL. ──
    validate_vod_id(&vod_id)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    // El VOD ID viaja como variable GraphQL ($id), nunca como string
    // interpolado. Validamos formato numérico en validate_vod_id().
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
    // S-6: log interno con detalle, mensaje genérico al frontend.
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
            // S-6: cuerpo puede contener HTML de error o info sensible;
            // nunca exponer al frontend.
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

/// Obtiene la URL del stream directamente desde la API de Twitch (GQL + Usher).
/// Esto evita las restricciones CORS del WebView al usar reqwest desde el backend Rust.
#[tauri::command]
async fn get_direct_stream_url(channel: String) -> Result<String, String> {
    validate_channel(&channel)?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {e}"))?;

    // ── Step 1: Obtener access token vía GraphQL de Twitch ──
    // El channel viaja como variable GraphQL ($channelName) — ya validado
    // arriba con validate_channel(&channel)? — así cerramos la inyección.
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

    // ── Step 2: Obtener playlist HLS de Usher ──
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

    // Devolver la URL final (después de redirecciones)
    Ok(usher_res.url().to_string())
}

/// Almacena un secreto en el keychain del SO.
/// Servicio: "blinkstream", cuenta: el key proporcionado.
#[tauri::command]
async fn store_secret(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new("blinkstream", &key)
        .map_err(|e| format!("Error creando entrada keychain: {e}"))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Error guardando en keychain: {e}"))
}

/// Recupera un secreto del keychain del SO.
/// Devuelve vacío si no existe.
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

/// Elimina un secreto del keychain del SO.
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

// ============================================================
// App Access Token (client_credentials) — Channel Points
// ============================================================
// WT-20260628-14: el endpoint /helix/channel_points/custom_rewards
// requiere un App Access Token (client_credentials flow), NO un
// token de usuario. Twitch rota el client_secret por app, asi que
// aqui lo leemos de env (build-time, igual que TWITCH_CLIENT_ID).
//
// El token se cachea en memoria con TTL = expires_in - 60s para
// evitar edge cases de expiracion. NUNCA loggeamos el secret ni
// el access_token (sensitive material).
//
// Fallback legacy: si no se define TWITCH_APP_CLIENT_SECRET en
// build-time, no podemos obtener tokens de app. Devolvemos error
// explicito en vez de fallar silenciosamente. Asi el operador
// sabe que tiene que provisionar el secret. Esto es diferente
// del comportamiento de TWITCH_CLIENT_ID (que tiene fallback
// legacy de un Client ID publico de terceros): el SECRET no
// tiene fallback posible por seguridad.
// ============================================================

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

/// Devuelve un App Access Token de Twitch para los endpoints de
/// Channel Points. Cache en memoria con TTL = expires_in - 60s.
/// NUNCA loggea el secret ni el access_token.
#[tauri::command]
async fn get_app_token() -> Result<serde_json::Value, String> {
    warn_missing_app_secret_once();

    let client_secret = twitch_app_client_secret().ok_or_else(|| {
        "TWITCH_APP_CLIENT_SECRET no configurado. Define la variable de entorno en build-time."
            .to_string()
    })?;

    // 1) Cache: si tenemos uno valido, lo devolvemos sin red.
    {
        let cache = app_token_cache()
            .lock()
            .map_err(|e| format!("Lock poisoned: {e}"))?;
        if let Some((token, expires_at)) = cache.as_ref() {
            if *expires_at > Instant::now() {
                // Devolvemos el token + expiresAt en ms epoch para
                // que el frontend pueda cachearlo en localStorage.
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

    // 2) Llamada a Twitch id.twitch.tv.
    let client = reqwest::Client::builder()
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
        // S-6: log interno con codigo de estado, mensaje generico al
        // frontend. NO loggeamos el body porque Twitch a veces lo
        // devuelve con info del grant.
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

    // Cache: TTL = expires_in - 60s para evitar edge cases. Si
    // expires_in es 0 o absurdo, no cacheamos (pedimos de nuevo).
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

    // Devolvemos expiresAt como ms epoch (mismo formato que el
    // frontend cachea en localStorage). Asi JS puede reusar la
    // cache entre reloads sin un segundo round-trip a Tauri.
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
            get_twitch_clip_url,
            get_vod_manifest_url,
            start_recording,
            stop_recording,
            get_app_token,
            // G1 / WT-20260628-16: comandos nuevos de grabacion global
            recorder::recorder_set_global_enabled,
            recorder::recorder_get_global_state,
            recorder::recorder_list_active,
            recorder::recorder_get_full_state,
            // Mando a Distancia Wi-Fi Móvil (Companion Remote)
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

            // G1 / WT-20260628-16: carga el estado global de grabacion
            // desde disco al Mutex en memoria. Si el archivo no existe
            // (primera ejecucion), queda en OFF.
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
    // B-2: tests de validación contra inyección GraphQL.
    // Las queries GQL de twitch viajan como variables, no como strings
    // interpolados, pero igualmente validamos el input con regex
    // ANTES de cualquier I/O como segunda línea de defensa.

    use super::*;

    // ── validate_slug ──────────────────────────────────────────────

    #[test]
    fn validate_slug_rejects_injection_payload() {
        // Intento clásico de inyección SQL/GQL: cierra string, mete payload.
        assert!(validate_slug(r#""; DROP TABLE--"#).is_err());
    }

    #[test]
    fn validate_slug_rejects_quote() {
        // Una comilla suelta debe ser rechazada.
        assert!(validate_slug(r#"abc"def"#).is_err());
    }

    #[test]
    fn validate_slug_rejects_backslash() {
        // Un backslash suelto (escape de string) debe ser rechazado.
        assert!(validate_slug(r"ab\cd").is_err());
    }

    #[test]
    fn validate_slug_rejects_empty() {
        assert!(validate_slug("").is_err());
    }

    #[test]
    fn validate_slug_rejects_too_long() {
        // 101 chars excede el límite.
        let s = "a".repeat(101);
        assert!(validate_slug(&s).is_err());
    }

    #[test]
    fn validate_slug_accepts_valid_slug() {
        assert!(validate_slug("valid_slug-123").is_ok());
    }

    #[test]
    fn validate_slug_accepts_double_dash() {
        // Los slugs reales de Twitch pueden tener "--" o "__" en medio.
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
        // Slash = path traversal smell, también cierra query.
        assert!(validate_slug("../etc/passwd").is_err());
    }

    // ── validate_vod_id ────────────────────────────────────────────

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
        // El regex no permite signo, así que "-123" cae fuera.
        assert!(validate_vod_id("-123").is_err());
    }

    #[test]
    fn validate_vod_id_rejects_too_long() {
        // 21 dígitos excede el límite.
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

    // ── validate_channel (cobertura adicional) ─────────────────────

    #[test]
    fn validate_channel_rejects_path_traversal() {
        assert!(validate_channel("../etc/passwd").is_err());
    }

    #[test]
    fn validate_channel_rejects_injection_payload() {
        // Mismo payload que el caso de slug — debe caer por la regex
        // de canal (solo letras, números y `_`).
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
        // Si el secret SI esta configurado (build local con .env),
        // no podemos testear nada sin pegarle a Twitch real, asi
        // que este test se convierte en no-op. Aun asi, no panic.
    }
}
