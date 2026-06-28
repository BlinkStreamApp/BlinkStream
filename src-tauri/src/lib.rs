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
use std::io::{Read, Write};
use keyring::Entry;

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

const LEGACY_FALLBACK_CLIENT_ID: &str = "kimne78kx3ncx6brgo4mv6wki5h1ko";


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
// Los slugs de clips de Twitch son tokens opacos: alfanumÃ©ricos, guiones y
// guiones bajos, tÃ­picamente 10-50 chars pero aceptamos 1-100 por margen.
// NO permitimos comillas, barras, espacios ni caracteres de control â€” eso
// cierra la inyecciÃ³n GraphQL en el cuerpo de la query.
const SLUG_RE: &str = r"^[a-zA-Z0-9_-]{1,100}$";
// Los VOD IDs de Twitch son enteros sin signo (generalmente < 2^31).
// Solo dÃ­gitos, 1-20 caracteres de margen.
const VOD_ID_RE: &str = r"^[0-9]{1,20}$";

fn validate_channel(name: &str) -> Result<(), String> {
    let re = regex_lite::Regex::new(CHANNEL_RE).expect("CHANNEL_RE estÃ¡tico - no deberÃ­a fallar");
    if !re.is_match(name) {
        return Err(
            "Nombre de canal invÃ¡lido. Solo letras, nÃºmeros y guiÃ³n bajo (3-25 caracteres)."
                .into(),
        );
    }
    Ok(())
}

/// Valida un slug de clip de Twitch. Devuelve Ok solo si cumple
/// `^[a-zA-Z0-9_-]{1,100}$`. Esto blinda contra inyecciÃ³n GraphQL.
fn validate_slug(slug: &str) -> Result<(), String> {
    let re = regex_lite::Regex::new(SLUG_RE).expect("SLUG_RE estÃ¡tico - no deberÃ­a fallar");
    if !re.is_match(slug) {
        return Err(
            "Slug de clip invÃ¡lido. Solo letras, nÃºmeros, guion y guion bajo (1-100 caracteres)."
                .into(),
        );
    }
    Ok(())
}

/// Valida un VOD ID de Twitch. Debe ser numÃ©rico (1-20 dÃ­gitos).
fn validate_vod_id(vod_id: &str) -> Result<(), String> {
    let re = regex_lite::Regex::new(VOD_ID_RE).expect("VOD_ID_RE estÃ¡tico - no deberÃ­a fallar");
    if !re.is_match(vod_id) {
        return Err("VOD ID invÃ¡lido. Debe ser numÃ©rico (1-20 dÃ­gitos).".into());
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

    Err(format!("Streamlink no estÃ¡ instalado.\n\nInstÃ¡lalo con: {}", INSTALL_CMD))
}

/// Ejecuta streamlink con un timeout configurable (en segundos).
/// Es sÃ­ncrona: usa `Command::spawn` + `wait_timeout`. Para no bloquear
/// el event loop de Tauri, los llamadores async deben envolverla en
/// `tokio::task::spawn_blocking`.
fn run_streamlink_with_timeout(
    app: &AppHandle,
    args: &[&str],
    timeout_secs: u64,
) -> Result<(String, String), String> {
    let binary = find_streamlink(app)?;

    let mut cmd = Command::new(&binary);
    cmd.args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                format!("Streamlink no estÃ¡ instalado.\n\nInstÃ¡lalo con: {}", INSTALL_CMD)
            } else {
                format!("Error al ejecutar streamlink: {}", e)
            }
        })?;

    // Leer pipes en hilos paralelos MIENTRAS el hijo se ejecuta
    // Esto evita el deadlock cuando streamlink produce mucha salida
    // y el buffer del pipe (tÃ­picamente 64KB) se llena.
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
        .map_err(|e| format!("Error esperando a streamlink: {}", e))?
    {
        Some(status) => status,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            // Unir hilos pendientes para evitar thread leak
            let _ = stdout_thread.join();
            let _ = stderr_thread.join();
            return Err(
                format!("Streamlink tardÃ³ mÃ¡s de {} segundos.", timeout_secs),
            );
        }
    };

    // Recoger resultados de los hilos
    let stdout = stdout_thread.join()
        .map_err(|_| "Error interno leyendo stdout de streamlink".to_string())?;
    let stderr = stderr_thread.join()
        .map_err(|_| "Error interno leyendo stderr de streamlink".to_string())?;

    Ok((stdout, stderr))
}

/// Wrapper con el timeout histÃ³rico (60s). Mantiene la firma que ya usan
/// `get_stream_url` y `get_master_playlist` sin cambiar su semÃ¡ntica.
fn run_streamlink(app: &AppHandle, args: &[&str]) -> Result<(String, String), String> {
    run_streamlink_with_timeout(app, args, 60)
}

static RECORDING: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

#[tauri::command]
fn start_recording(app: AppHandle, channel: String, output_path: String) -> Result<String, String> {
    // â”€â”€ Validar nombre de canal (mismo criterio que el resto de commands) â”€â”€
    // Antes este command omitÃ­a la validaciÃ³n, permitiendo que un channel
    // malicioso se inyectara directo en la URL de streamlink.
    validate_channel(&channel)?;

    let path = std::path::Path::new(&output_path);
    if !path.is_absolute() {
        return Err("La ruta de salida debe ser absoluta".into());
    }
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            return Err("El directorio de salida no existe".into());
        }
    }

    let binary = find_streamlink(&app)?;
    let url = format!("twitch.tv/{}", channel);

    let mut cmd = Command::new(&binary);
    cmd.args(&[&url, "best", "-o", &output_path])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd.spawn().map_err(|e| format!("No se pudo iniciar grabaciÃ³n: {}", e))?;
    let pid = child.id();
    let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    *rec = Some(child);

    Ok(format!("Grabando (PID: {})", pid))
}

#[tauri::command]
fn stop_recording() -> Result<String, String> {
    let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut child) = rec.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("GrabaciÃ³n detenida".into())
    } else {
        Err("No hay grabaciÃ³n activa".into())
    }
}

#[tauri::command]
fn get_stream_url(app: AppHandle, channel: String, quality: String) -> Result<String, String> {
    validate_channel(&channel)?;
    let (stdout, stderr) = run_streamlink(&app, &[&format!("twitch.tv/{}", channel), &quality, "--stream-url"])?;
    let url = stdout.trim().to_string();
    if url.is_empty() {
        Err(format!("Streamlink no devolviÃ³ URL. stderr: {}", stderr.trim()))
    } else {
        Ok(url)
    }
}

/// Devuelve la URL del MASTER PLAYLIST (contiene todas las calidades).
/// hls.js puede cargar esta URL y el usuario cambia calidad via level API,
/// sin recargar el stream. AsÃ­ evitamos pantallas negras con variantes raras.
#[tauri::command]
fn get_master_playlist(app: AppHandle, channel: String) -> Result<String, String> {
    validate_channel(&channel)?;
    // Primero obtenemos cualquier variante con best
    let (stdout, stderr) = run_streamlink(
        &app,
        &[&format!("twitch.tv/{}", channel), "best", "--stream-url"],
    )?;
    let variant_url = stdout.trim();

    if variant_url.is_empty() {
        return Err(format!(
            "Streamlink no devolviÃ³ URL. stderr: {}",
            stderr.trim()
        ));
    }

    // La URL de Twitch tiene formato:
    //   .../playlist/{TOKEN}/{resolucion}.m3u8   (variante)
    //   .../playlist/{TOKEN}.m3u8                (master)
    //
    // Eliminamos el Ãºltimo segmento (/{resolucion}.m3u8) para obtener el master.
    // Solo aplicamos la transformaciÃ³n si la URL contiene el segmento /playlist/.
    if variant_url.contains("/playlist/") {
        if let Some(last_slash) = variant_url.rfind('/') {
            let prefix = &variant_url[..last_slash];
            let suffix = &variant_url[last_slash + 1..];
            if suffix.ends_with(".m3u8") {
                let master = format!("{}.m3u8", prefix);
                return Ok(master);
            }
        }
    }

    // Si no podemos extraer el master, devolvemos la URL de la variante
    log::warn!(
        "get_master_playlist: formato inesperado, devolviendo variante: {}",
        variant_url
    );
    Ok(variant_url.to_string())
}

const DEFAULT_QUALITIES: &[&str] = &[
    "audio_only", "160p", "360p", "480p", "720p", "720p60", "1080p60",
];

/// Devuelve las calidades disponibles para un canal.
///
/// Esta funciÃ³n NUNCA debe fallar. Si algo sale mal, devuelve defaults
/// para que el frontend pueda mostrar el selector de calidad siempre.
///
/// Notas de rendimiento (M-3 de la auditorÃ­a WT-20260628-01):
/// - Usa `run_streamlink_with_timeout` con 15s (no 60s) para que el
///   selector de calidad no quede colgado si Twitch/streamlink no responden.
/// - Envuelve la llamada sÃ­ncrona en `tokio::task::spawn_blocking` para
///   no bloquear el event loop de Tauri (la funciÃ³n es `async`).
#[tauri::command]
async fn get_available_qualities(app: AppHandle, channel: String) -> Vec<String> {
    let defaults: Vec<String> = DEFAULT_QUALITIES.iter().map(|&s| s.to_string()).collect();

    if let Err(e) = validate_channel(&channel) {
        log::error!("get_available_qualities: validate_channel error: {}", e);
        return defaults;
    }

    // `run_streamlink_with_timeout` es sÃ­ncrona (usa `Command::spawn` +
    // `wait_timeout`). La movemos a un thread bloqueante para no
    // congelar el runtime de tokio que Tauri usa para los comandos.
    let channel_for_blocking = channel.clone();
    let join_result = tokio::task::spawn_blocking(move || {
        // 15s es suficiente: streamlink responde en <2s en condiciones
        // normales, y 15s cubre redes lentas sin hacer esperar al usuario
        // un minuto entero si algo estÃ¡ mal.
        run_streamlink_with_timeout(
            &app,
            &[&format!("twitch.tv/{}", channel_for_blocking), "--stream-url"],
            15,
        )
    })
    .await;

    let run_result = match join_result {
        Ok(r) => r,
        Err(e) => {
            log::error!("get_available_qualities: spawn_blocking join error: {}", e);
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
            log::error!("get_available_qualities: streamlink error: {}", e);
            defaults
        }
    }
}

#[tauri::command]
async fn get_twitch_clip_url(slug: String) -> Result<String, String> {
    // â”€â”€ Validar slug antes de tocar la red. Cierra inyecciÃ³n GraphQL. â”€â”€
    validate_slug(&slug)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;
    
    // El slug viaja como variable GraphQL ($slug), nunca como string
    // interpolado. AsÃ­ un slug con `"` o `\` no puede romper la query.
    let body = serde_json::json!({
        "query": "query($slug: String!) { clip(slug: $slug) { videoQualities { sourceURL quality } playbackAccessToken(params: { platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }) { value signature } } }",
        "variables": { "slug": slug }
    });

    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", TWITCH_APP_CLIENT_ID)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP error: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| format!("Read error: {}", e))?;

    if !status.is_success() {
        // S-6: NO exponer el cuerpo HTTP al frontend. Log internamente
        // para debugging y devolver mensaje genÃ©rico con el cÃ³digo de estado.
        log::error!(
            "Twitch clip GQL failed: status={} body_len={} preview={}",
            status.as_u16(),
            text.len(),
            &text[..200.min(text.len())]
        );
        return Err(format!("Twitch API error: HTTP {}", status.as_u16()));
    }

    let data: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        // S-6: log interno con detalle, mensaje genÃ©rico al frontend.
        log::error!(
            "Twitch clip JSON parse error: err={} body_len={} preview={}",
            e,
            text.len(),
            &text[..200.min(text.len())]
        );
        "Twitch API: respuesta invÃ¡lida".to_string()
    })?;

    let clip = data.get("data").and_then(|d| d.get("clip"));
    if clip.is_none() {
        // S-6: el cuerpo puede contener HTML/JSON de error con info sensible;
        // nunca se lo devolvemos al frontend.
        log::error!(
            "Twitch clip missing in response: body_len={} preview={}",
            text.len(),
            &text[..200.min(text.len())]
        );
        return Err("Twitch API: clip no encontrado".to_string());
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
    // â”€â”€ Validar vod_id antes de tocar la red. Cierra inyecciÃ³n GraphQL. â”€â”€
    validate_vod_id(&vod_id)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    // El VOD ID viaja como variable GraphQL ($id), nunca como string
    // interpolado. Validamos formato numÃ©rico en validate_vod_id().
    let body = serde_json::json!({
        "query": "query($id: ID!) { video(id: $id) { playbackAccessToken(params: { platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }) { value signature } } }",
        "variables": { "id": vod_id }
    });

    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", TWITCH_APP_CLIENT_ID)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP: {}", e))?;

    let text = response.text().await.map_err(|e| format!("Read: {}", e))?;
    // S-6: log interno con detalle, mensaje genÃ©rico al frontend.
    let json_res: serde_json::Value = serde_json::from_str(&text).map_err(|e| {
        log::error!(
            "Twitch VOD JSON parse error: err={} body_len={} preview={}",
            e,
            text.len(),
            &text[..200.min(text.len())]
        );
        "Twitch API: respuesta invÃ¡lida".to_string()
    })?;

    let video = json_res.get("data").and_then(|d| d.get("video"))
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
        .map_err(|e| format!("Error creando cliente HTTP: {}", e))?;

    // â”€â”€ Step 1: Obtener access token vÃ­a GraphQL de Twitch â”€â”€
    // El channel viaja como variable GraphQL ($channelName) â€” ya validado
    // arriba con validate_channel(&channel)? â€” asÃ­ cerramos la inyecciÃ³n.
    let gql_body = serde_json::json!({
        "query": "query($channelName: String!) { streamPlaybackAccessToken(channelName: $channelName, params: { platform: \"web\", playerBackend: \"mediaplayer\", playerType: \"site\" }) { value signature } }",
        "variables": { "channelName": channel }
    });

    let gql_res = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-Id", TWITCH_APP_CLIENT_ID)
        .header("Content-Type", "application/json")
        .json(&gql_body)
        .send()
        .await
        .map_err(|e| format!("Error conectando con Twitch GQL: {}", e))?;

    if !gql_res.status().is_success() {
        return Err(format!("Twitch GQL respondiÃ³ con HTTP {}", gql_res.status()));
    }

    let gql_data: serde_json::Value = gql_res
        .json()
        .await
        .map_err(|e| format!("Error parseando respuesta GQL: {}", e))?;

    let token = gql_data["data"]["streamPlaybackAccessToken"]["value"]
        .as_str()
        .ok_or_else(|| "No se pudo obtener token de acceso de Twitch".to_string())?
        .to_string();
    let sig = gql_data["data"]["streamPlaybackAccessToken"]["signature"]
        .as_str()
        .ok_or_else(|| "No se pudo obtener signature de Twitch".to_string())?
        .to_string();

    // â”€â”€ Step 2: Obtener playlist HLS de Usher â”€â”€
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
        .header("Client-Id", TWITCH_APP_CLIENT_ID)
        .send()
        .await
        .map_err(|e| format!("Error conectando con Twitch Usher: {}", e))?;

    if !usher_res.status().is_success() {
        return Err(format!("Twitch Usher respondiÃ³ con HTTP {}", usher_res.status()));
    }

    // Devolver la URL final (despuÃ©s de redirecciones)
    Ok(usher_res.url().to_string())
}

/// Almacena un secreto en el keychain del SO.
/// Servicio: "blinkstream", cuenta: el key proporcionado.
#[tauri::command]
async fn store_secret(key: String, value: String) -> Result<(), String> {
    let entry = Entry::new("blinkstream", &key).map_err(|e| format!("Error creando entrada keychain: {}", e))?;
    entry.set_password(&value).map_err(|e| format!("Error guardando en keychain: {}", e))
}

/// Recupera un secreto del keychain del SO.
/// Devuelve vacÃ­o si no existe.
#[tauri::command]
async fn get_secret(key: String) -> Result<String, String> {
    let entry = Entry::new("blinkstream", &key).map_err(|e| format!("Error creando entrada keychain: {}", e))?;
    match entry.get_password() {
        Ok(password) => Ok(password),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(format!("Error leyendo keychain: {}", e)),
    }
}

/// Elimina un secreto del keychain del SO.
#[tauri::command]
async fn delete_secret(key: String) -> Result<(), String> {
    let entry = Entry::new("blinkstream", &key).map_err(|e| format!("Error creando entrada keychain: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Error eliminando del keychain: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            store_secret,
            get_secret,
            delete_secret,
            get_stream_url,
            get_available_qualities,
            get_direct_stream_url,
            get_master_playlist,
            get_twitch_clip_url,
            get_vod_manifest_url,
            start_recording,
            stop_recording,
        ])
        .setup(|app| {
            let mut labels_to_close = Vec::new();
            warn_legacy_client_id_once();

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
                    .level(if cfg!(debug_assertions) { log::LevelFilter::Info } else { log::LevelFilter::Warn })
                    .build(),
            )?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    // B-2: tests de validaciÃ³n contra inyecciÃ³n GraphQL.
    // Las queries GQL de twitch viajan como variables, no como strings
    // interpolados, pero igualmente validamos el input con regex
    // ANTES de cualquier I/O como segunda lÃ­nea de defensa.

    use super::*;

    // â”€â”€ validate_slug â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    #[test]
    fn validate_slug_rejects_injection_payload() {
        // Intento clÃ¡sico de inyecciÃ³n SQL/GQL: cierra string, mete payload.
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
        // 101 chars excede el lÃ­mite.
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
        // Slash = path traversal smell, tambiÃ©n cierra query.
        assert!(validate_slug("../etc/passwd").is_err());
    }

    // â”€â”€ validate_vod_id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        // El regex no permite signo, asÃ­ que "-123" cae fuera.
        assert!(validate_vod_id("-123").is_err());
    }

    #[test]
    fn validate_vod_id_rejects_too_long() {
        // 21 dÃ­gitos excede el lÃ­mite.
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

    // â”€â”€ validate_channel (cobertura adicional) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    #[test]
    fn validate_channel_rejects_path_traversal() {
        assert!(validate_channel("../etc/passwd").is_err());
    }

    #[test]
    fn validate_channel_rejects_injection_payload() {
        // Mismo payload que el caso de slug â€” debe caer por la regex
        // de canal (solo letras, nÃºmeros y `_`).
        assert!(validate_channel(r#""; DROP TABLE--"#).is_err());
    }

    #[test]
    fn validate_channel_accepts_valid() {
        assert!(validate_channel("ninja").is_ok());
    }

    #[test]
    fn validate_channel_rejects_too_short() {
        // MÃ­nimo 3 chars.
        assert!(validate_channel("ab").is_err());
    }
}
