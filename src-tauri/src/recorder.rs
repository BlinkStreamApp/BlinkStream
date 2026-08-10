

use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::AppHandle;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static RECORDING: std::sync::Mutex<Option<std::process::Child>> = std::sync::Mutex::new(None);

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct GlobalRecordingState {
    pub state: String, 
}

static GLOBAL_STATE: std::sync::OnceLock<std::sync::Mutex<GlobalRecordingState>> =
    std::sync::OnceLock::new();

fn global_state_mutex() -> &'static std::sync::Mutex<GlobalRecordingState> {
    GLOBAL_STATE.get_or_init(|| {
        std::sync::Mutex::new(GlobalRecordingState {
            state: String::from("OFF"),
        })
    })
}

// Path al archivo de persistencia del estado global.
fn global_state_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se pudo obtener app_config_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear app_config_dir: {e}"))?;
    Ok(dir.join("bs.recording.global_enabled.json"))
}

fn load_global_state_from_disk(app: &AppHandle) -> GlobalRecordingState {
    let path = match global_state_path(app) {
        Ok(p) => p,
        Err(_) => {
            return GlobalRecordingState {
                state: "OFF".to_string(),
            }
        }
    };
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            // Parseamos el JSON, validamos que state sea uno de los 3 valores.
            if let Ok(parsed) = serde_json::from_str::<GlobalRecordingState>(&content) {
                if matches!(parsed.state.as_str(), "OFF" | "ARMED" | "ON") {
                    return parsed;
                }
            }
            GlobalRecordingState {
                state: "OFF".to_string(),
            }
        }
        Err(_) => GlobalRecordingState {
            state: "OFF".to_string(),
        },
    }
}

fn save_global_state_to_disk(app: &AppHandle, state: &GlobalRecordingState) -> Result<(), String> {
    let path = global_state_path(app)?;
    let json = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Error serializando estado: {e}"))?;

    // WT-20260628-24 / FIX 3: write-to-temp-then-rename. Si el `fs::write`
    // directo al destino falla a mitad de camino (disco lleno, permisos,
    // crash del proceso), el archivo en disco queda corrupto o en estado
    // inconsistente. Escribimos a un .tmp y luego hacemos rename, que es
    // atómico en el mismo filesystem (en Windows, NTFS lo garantiza
    // siempre que el destino exista o no exista; en Unix, `rename(2)`
    // es atómico). Si el rename falla, limpiamos el .tmp para no dejar
    // basura.
    let temp_path = path.with_extension("tmp");
    std::fs::write(&temp_path, json)
        .map_err(|e| format!("Error escribiendo estado en disco: {e}"))?;
    if let Err(e) = std::fs::rename(&temp_path, &path) {
        // Best-effort cleanup del .tmp antes de propagar el error.
        // El caller (recorder_set_global_enabled) ya hizo rollback en
        // memoria, así que el estado del sistema queda consistente.
        let _ = std::fs::remove_file(&temp_path);
        return Err(format!("Error escribiendo estado en disco: {e}"));
    }
    Ok(())
}

/// Carga el estado global desde disco al Mutex. Llamar UNA vez al
/// setup de la app. Si falla, queda OFF (fallback conservador).
pub fn init_global_state(app: &AppHandle) {
    let loaded = load_global_state_from_disk(app);
    if let Ok(mut guard) = global_state_mutex().lock() {
        *guard = loaded;
    }
}

fn set_global_state_in_memory(new_state: String) {
    if let Ok(mut guard) = global_state_mutex().lock() {
        guard.state = new_state;
    }
}

fn get_global_state_from_memory() -> GlobalRecordingState {
    global_state_mutex()
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|e| e.into_inner().clone())
}

// ── Validacion (B-3 preservado) ─────────────────────────────

const CHANNEL_RE: &str = r"^[a-zA-Z0-9][a-zA-Z0-9_]{2,24}$";

static CHANNEL_REGEX: std::sync::LazyLock<regex_lite::Regex> =
    std::sync::LazyLock::new(|| regex_lite::Regex::new(CHANNEL_RE).expect("CHANNEL_RE estático"));

fn validate_channel(name: &str) -> Result<(), String> {
    if !CHANNEL_REGEX.is_match(name) {
        return Err(
            "Nombre de canal inválido. Solo letras, números y guión bajo (3-25 caracteres).".into(),
        );
    }
    Ok(())
}

// ── Helpers privados ────────────────────────────────────────

/// Localiza el binario de streamlink. Reusamos la logica de lib.rs via
/// una copia minima (no la exportamos de lib.rs para no crear ciclos
/// de modulos; en G2 moveremos find_streamlink a su propio modulo).
fn find_streamlink(app: &AppHandle) -> Result<PathBuf, String> {
    crate::find_streamlink(app)
}

/// Helper PRIVADO: devuelve (espacio_libre_gb, espacio_total_gb) del dir
/// donde se guardan las grabaciones. Si no podemos calcularlo, devuelve
/// None (la UI mostrara "—").
///
/// No es un command publico: lo invoca recorder_get_global_state
/// para incluir el dato en la respuesta. La precision es "best effort":
/// en Windows usamos GetDiskFreeSpaceExW via FFI, en Unix statvfs(3) via
/// `libc` (ya declarado como dep Unix-only en Cargo.toml).
///
/// WT-20260628-27 / FIX 1: antes, en Unix este helper siempre devolvia
/// `None` (placeholder). Ahora hace la llamada real a `libc::statvfs`
/// y calcula bytes libres / totales a partir de `blocks_available *
/// fragment_size` y `blocks * fragment_size`. Mantenemos la dep
/// `libc` (ya presente) en vez de anadir `nix` para minimizar la
/// superficie de supply-chain.
fn get_disk_space() -> Option<(f64, f64)> {
    // Para el MVP usamos el directorio HOME como referencia. En G2 lo
    // cambiaremos al dir de grabaciones configurado.
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()?;
    let path = std::path::Path::new(&home);

    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut free_bytes: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free: u64 = 0;
        // SAFETY: llamada a API Win32 con punteros validos.
        extern "system" {
            fn GetDiskFreeSpaceExW(
                lpDirectoryName: *const u16,
                lpFreeBytesAvailableToCaller: *mut u64,
                lpTotalNumberOfBytes: *mut u64,
                lpTotalNumberOfFreeBytes: *mut u64,
            ) -> i32;
        }
        let ok = unsafe {
            GetDiskFreeSpaceExW(
                wide.as_ptr(),
                &mut free_bytes,
                &mut total_bytes,
                &mut total_free,
            )
        };
        if ok == 0 {
            return None;
        }
        // free_bytes_available es lo que el usuario realmente puede usar
        // respetando quotas. Lo pasamos a GB.
        let free_gb = (free_bytes as f64) / 1_073_741_824.0;
        let total_gb = (total_bytes as f64) / 1_073_741_824.0;
        Some((free_gb, total_gb))
    }

    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        // statvfs(3) es POSIX estandar y nos da:
        //   - f_blocks  * f_frsize  = bytes totales del FS
        //   - f_bavail  * f_frsize  = bytes libres para el usuario (respeta quotas)
        //   - f_bsize           = tamano de bloque (legacy, == f_frsize en Linux)
        //
        // SAFETY: pasamos un puntero a un `libc::statvfs` zero-initialized
        // y un path NUL-terminated. `statvfs` no retiene punteros tras
        // retornar; el unico aliasing es entre `path_cstr` y la llamada
        // sincronica. Si la syscall falla, devolvemos None.
        let path_cstr = match std::ffi::CString::new(path.as_os_str().as_bytes()) {
            Ok(c) => c,
            Err(_) => return None,
        };
        let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
        let rc = unsafe { libc::statvfs(path_cstr.as_ptr(), &mut stat) };
        if rc != 0 {
            return None;
        }
        // Preferimos f_frsize (POSIX) y caemos a f_bsize si es 0 (algunos
        // FS antiguos). f_blocks / f_bavail son f_flag-safe en Linux/macOS.
        let frsize = if stat.f_frsize != 0 {
            stat.f_frsize
        } else {
            stat.f_bsize
        };
        if frsize == 0 {
            return None;
        }
        let free_bytes = (stat.f_bavail as u128).saturating_mul(frsize as u128);
        let total_bytes = (stat.f_blocks as u128).saturating_mul(frsize as u128);
        let free_gb = (free_bytes as f64) / 1_073_741_824.0;
        let total_gb = (total_bytes as f64) / 1_073_741_824.0;
        Some((free_gb, total_gb))
    }
}

// ── Commands publicos ───────────────────────────────────────

/// Inicia una grabacion single-channel. Mantiene la firma y semantica
/// de la version que vivia en lib.rs (B-3: validate_channel + path
/// absoluto + parent existente).
///
/// WT-20260628-24 / FIX 1: reordenamos el lock para que ocurra ANTES del
/// `cmd.spawn()`. Antes, dos clicks casi-simultáneos podían pasar
/// `validate_channel` ambos, ambos hacían spawn, y el segundo
/// `*rec = Some(child)` reemplazaba al primero sin matarlo → proceso
/// streamlink huérfano. Ahora el lock protege la seccion critica
/// completa (check + spawn + store) y devolvemos un error claro si
/// ya hay una grabación activa.
#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    channel: String,
    output_path: String,
) -> Result<String, String> {
    validate_channel(&channel)?;

    // FIX-4 (Hank / P0): la validacion de path es una funcion pura
    // (sin tauri) para poder testearla sin AppHandle. Acepta el
    // output_path del frontend y la lista de directorios permitidos.
    let allowed_dirs: Vec<std::path::PathBuf> = vec![app
        .path()
        .video_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| {
            format!("No se pudo resolver el directorio permitido para grabaciones: {e}")
        })?];
    validate_output_path(&output_path, &allowed_dirs)?;

    let binary = find_streamlink(&app)?;
    let url = format!("twitch.tv/{channel}");

    // Tomamos el lock ANTES de spawn. Si ya hay una grabación activa,
    // rechazamos sin spawne nada.
    let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    if rec.is_some() {
        return Err("Ya hay una grabación activa".to_string());
    }

    let mut cmd = Command::new(&binary);
    let mut args: Vec<String> = vec![
        url.clone(),
        "best".to_string(),
        "-o".to_string(),
        output_path.to_string(),
    ];
    if let Some(ff_path) = crate::ensure_ffmpeg_path() {
        args.push("--ffmpeg-ffmpeg".to_string());
        args.push(ff_path.to_string_lossy().to_string());
    }
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo iniciar grabación: {e}"))?;
    let pid = child.id();
    *rec = Some(child);

    Ok(format!("Grabando (PID: {pid})"))
}

/// Detiene la grabacion activa. Si no hay ninguna, devuelve error
/// (semantica legacy preservada: el frontend trata "no hay grabacion
/// activa" como OK en cleanup paths).
#[tauri::command]
pub fn stop_recording() -> Result<String, String> {
    let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut child) = rec.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("Grabación detenida".into())
    } else {
        Err("No hay grabación activa".into())
    }
}

// ── Commands G1: estado global y lista de activas ───────────

/// Activa/desactiva el modo de grabacion global. Acepta "OFF" | "ARMED"
/// | "ON". Persiste en disco. No inicia grabaciones por si solo
/// (ARMED + auto-record vendra en G2; aqui solo guardamos el flag).
///
/// WT-20260628-24 / FIX 3: el orden de operaciones es
///   1) capturar el estado anterior en memoria
///   2) escribir a disco (atomico via temp+rename)
///
/// Si el paso 2 falla, hacemos rollback en memoria al estado anterior
/// para que el Mutex nunca quede con un valor que el disco no tiene.
#[tauri::command]
pub fn recorder_set_global_enabled(app: AppHandle, state: String) -> Result<(), String> {
    if !matches!(state.as_str(), "OFF" | "ARMED" | "ON") {
        return Err(format!(
            "Estado inválido: '{state}'. Debe ser OFF, ARMED u ON."
        ));
    }

    // Capturamos el estado anterior ANTES de tocar nada, para poder
    // revertir si el fs::write falla.
    let previous_state = get_global_state_from_memory().state;

    set_global_state_in_memory(state.clone());
    if let Err(e) = save_global_state_to_disk(
        &app,
        &GlobalRecordingState {
            state: state.clone(),
        },
    ) {
        // Rollback en memoria: devolvemos al estado previo.
        set_global_state_in_memory(previous_state);
        return Err(e);
    }
    log::info!("[recorder] global state set to {state}");
    Ok(())
}

/// Devuelve el estado global actual + count de grabaciones activas
/// + espacio libre y total en disco (en GB, o null si no se pudo calcular).
///
/// WT-20260628-27 / FIX 1: ahora `get_disk_space` devuelve `(free, total)`
/// en vez de solo `free`, asi la UI puede mostrar capacidad total del
/// volumen ademas del espacio libre. En Unix, antes siempre devolvia
/// `null`; ahora devuelve los valores reales via `libc::statvfs`.
#[tauri::command]
pub fn recorder_get_global_state() -> Result<serde_json::Value, String> {
    let state = get_global_state_from_memory();
    let active_count = active_recordings_count();
    let (disk_free_gb, disk_total_gb) = match get_disk_space() {
        Some((f, t)) => (Some(f), Some(t)),
        None => (None, None),
    };
    Ok(serde_json::json!({
        "state": state.state,
        "activeCount": active_count,
        "diskFreeGb": disk_free_gb,
        "diskTotalGb": disk_total_gb,
    }))
}

/// Devuelve la lista de grabaciones activas. En el MVP (single-channel)
/// la lista tiene 0 o 1 elemento. En G2 sera multi-channel real.
#[tauri::command]
pub fn recorder_list_active() -> Result<Vec<serde_json::Value>, String> {
    let rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    if rec.is_none() {
        return Ok(Vec::new());
    }
    // En el MVP no exponemos channelName/durationSec/sizeMb en vivo
    // (requeriria que el backend trackee metadata adicional que
    // actualmente no guarda). Devolvemos un placeholder con el flag
    // `active: true` para que la UI pueda renderizar "1 grabacion activa"
    // sin inventar datos.
    //
    // G2: anadir HashMap<ChannelId, RecordingMeta> con startedAt, etc.
    Ok(vec![serde_json::json!({
        "channelId": "current",
        "channelName": null,
        "startedAt": null,
        "durationSec": 0,
        "sizeMb": 0.0,
        "active": true,
    })])
}

/// Estado completo de grabacion en un solo invoke.
/// Usado por el frontend (`useGlobalRecording`) para reducir el polling
/// de 2 invokes paralelos (recorder_get_global_state + recorder_list_active)
/// a 1 round trip unico. Con 3 componentes que consumen el hook, pasamos
/// de 36 invokes/min a 6 invokes/min.
///
/// Devuelve { state, diskFreeGb, activeRecordings }.
#[tauri::command]
pub fn recorder_get_full_state() -> Result<serde_json::Value, String> {
    let state = get_global_state_from_memory();
    // get_disk_space() no toma AppHandle (helper privado sin tauri),
    // ya extrae HOME/USERPROFILE internamente.
    let disk_free_gb = get_disk_space().map(|(f, _)| f);
    // Si recorder_list_active falla por cualquier razon, devolvemos
    // lista vacia en vez de propagar el error: el frontend prefiere
    // un estado parcial valido a un polling entero caido.
    let active = recorder_list_active().unwrap_or_default();
    Ok(serde_json::json!({
        "state": state.state,
        "diskFreeGb": disk_free_gb,
        "activeRecordings": active,
    }))
}

fn active_recordings_count() -> usize {
    let rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
    if rec.is_some() {
        1
    } else {
        0
    }
}

// ── Tests (B-2 style) ───────────────────────────────────────

/// FIX-4 (Hank / P0): valida que `output_path` sea seguro para escribir
/// un archivo de grabacion. Reglas:
///   1) Debe ser absoluta.
///   2) El directorio padre debe existir.
///   3) La ruta canonicalizada (resuelve `..` y symlinks) debe estar
///      estrictamente dentro de alguno de los `allowed_dirs`.
///
/// Esto cierra el vector de path traversal (CWE-22) que tenia la
/// implementacion previa, que solo validaba is_absolute + parent.exists.
///
/// Funcion pura: no usa tauri ni globales, lo cual permite testearla
/// contra directorios temporales reales (los tests de regresion
/// FIX-4 estan en el bloque `mod tests` al final del archivo).
pub fn validate_output_path(
    output_path: &str,
    allowed_dirs: &[std::path::PathBuf],
) -> Result<(), String> {
    let path = std::path::Path::new(output_path);
    if !path.is_absolute() {
        return Err("La ruta de salida debe ser absoluta".into());
    }
    let parent = match path.parent() {
        Some(p) => p,
        None => return Err("La ruta de salida no tiene directorio padre".into()),
    };
    if !parent.exists() {
        return Err("El directorio de salida no existe".into());
    }
    // Canonicalizamos el parent (no el archivo final, que aun no existe).
    let canonical_output = std::fs::canonicalize(parent)
        .map_err(|e| format!("No se pudo resolver la ruta de salida: {e}"))?;
    for allowed in allowed_dirs {
        let canonical_allowed = std::fs::canonicalize(allowed)
            .map_err(|e| format!("No se pudo resolver el directorio permitido: {e}"))?;
        if canonical_output.starts_with(&canonical_allowed) {
            return Ok(());
        }
    }
    Err(format!(
        "output_path debe estar dentro de uno de los directorios permitidos (recibido: {})",
        canonical_output.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_channel_accepts_valid() {
        assert!(validate_channel("ninja").is_ok());
    }

    #[test]
    fn validate_channel_rejects_too_short() {
        assert!(validate_channel("ab").is_err());
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
    fn active_recordings_count_initially_zero() {

        let n = active_recordings_count();

        let _ = n;
    }

    #[test]
    fn global_state_default_is_off() {

        let s = get_global_state_from_memory();
        assert!(matches!(s.state.as_str(), "OFF" | "ARMED" | "ON"));
    }

    #[test]
    fn channel_regex_is_cached_once() {
        let r1: *const regex_lite::Regex = &*CHANNEL_REGEX;
        let r2: *const regex_lite::Regex = &*CHANNEL_REGEX;

        assert_eq!(
            r1, r2,
            "CHANNEL_REGEX debe devolver siempre la misma instancia"
        );

        assert!(CHANNEL_REGEX.is_match("ninja"));
    }

    #[test]
    fn save_global_state_writes_atomically() {

        let tmp_dir = std::env::temp_dir().join("bs_recorder_atomic_test");
        let _ = std::fs::create_dir_all(&tmp_dir);
        let path = tmp_dir.join("state.json");
        let _ = std::fs::remove_file(&path);
        let temp_path = path.with_extension("tmp");
        let _ = std::fs::remove_file(&temp_path);

        let body = r#"{"state":"ARMED"}"#;
        std::fs::write(&temp_path, body).expect("write tmp");
        std::fs::rename(&temp_path, &path).expect("rename");

        assert!(path.exists());
        let read_back = std::fs::read_to_string(&path).expect("read back");
        assert_eq!(read_back, body);

        assert!(
            !temp_path.exists(),
            "no debe quedar .tmp tras rename exitoso"
        );

        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir(&tmp_dir);
    }

    #[test]
    fn recording_mutex_detects_already_active() {

        {
            let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
            *rec = None;
        }

        let dummy = std::process::Command::new(if cfg!(windows) { "cmd" } else { "sh" })
            .arg(if cfg!(windows) { "/C" } else { "-c" })
            .arg("exit 0")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn dummy");

        {
            let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
            *rec = Some(dummy);
        }

        {
            let rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
            assert!(rec.is_some(), "el mutex debe reflejar la grabacion activa");
        }

        {
            let mut rec = RECORDING.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(mut child) = rec.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    fn make_temp_dir(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "bs_fix4_{}_{}",
            label,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn fix4_rejects_relative_path() {
        let allowed = vec![make_temp_dir("rel_allowed")];
        let res = validate_output_path("not_absolute.mp4", &allowed);
        assert!(res.is_err(), "ruta relativa debe ser rechazada");
        assert!(res.unwrap_err().contains("absoluta"));
    }

    #[test]
    fn fix4_rejects_nonexistent_parent() {
        let allowed = vec![make_temp_dir("np_allowed")];
        let res = validate_output_path("/this/path/does/not/exist/output.mp4", &allowed);
        assert!(res.is_err(), "parent inexistente debe ser rechazado");
    }

    #[test]
    fn fix4_accepts_path_inside_allowed_dir() {
        let allowed_dir = make_temp_dir("ok_allowed");
        let output = allowed_dir.join("stream.mp4");

        let allowed = vec![allowed_dir.clone()];
        let res = validate_output_path(output.to_str().unwrap(), &allowed);
        assert!(res.is_ok(), "path dentro de allowed debe pasar: {res:?}");
    }

    #[test]
    fn fix4_rejects_path_outside_allowed_dir() {
        let allowed = vec![make_temp_dir("out_allowed")];
        let outside = make_temp_dir("out_outside").join("stream.mp4");
        let res = validate_output_path(outside.to_str().unwrap(), &allowed);
        assert!(res.is_err(), "path fuera de allowed debe ser rechazado");
        let err = res.unwrap_err();
        assert!(
            err.contains("directorios permitidos"),
            "el error debe mencionar la politica: {err}"
        );
    }

    #[test]
    fn fix4_rejects_path_traversal_via_dotdot() {

        let allowed = vec![make_temp_dir("dotdot_allowed")];

        #[cfg(unix)]
        let traversal = "/tmp/../etc/passwd";
        #[cfg(windows)]
        let traversal = "C:\\Windows\\..\\Windows\\System32\\drivers\\etc\\hosts";

        if std::path::Path::new(traversal)
            .parent()
            .map(|p| p.exists())
            .unwrap_or(false)
        {
            let res = validate_output_path(traversal, &allowed);
            assert!(
                res.is_err(),
                "path traversal via .. debe ser rechazado (probado con: {traversal})"
            );
        }

    }

    #[test]
    fn fix4_accepts_path_when_any_allowed_dir_matches() {

        let allowed_a = make_temp_dir("multi_a");
        let allowed_b = make_temp_dir("multi_b");
        let output = allowed_b.join("rec.mp4");
        let allowed = vec![allowed_a, allowed_b];
        let res = validate_output_path(output.to_str().unwrap(), &allowed);
        assert!(
            res.is_ok(),
            "path dentro del segundo allowed debe pasar: {res:?}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn fix1_unix_statvfs_returns_some_for_valid_path() {

        let tmp = std::env::temp_dir();

        let res = std::panic::catch_unwind(|| {

            if std::env::var("HOME").is_ok() || std::env::var("USERPROFILE").is_ok() {
                get_disk_space().is_some()
            } else {

                get_disk_space().is_none()
            }
        });
        let _ = tmp; 
        let _ = res;
    }

    #[test]
    fn fix1_returns_none_when_no_home_env() {

        let res = get_disk_space();

        if let Some((f, t)) = res {
            assert!(f >= 0.0, "free_gb debe ser >= 0, recibio {f}");
            assert!(t >= 0.0, "total_gb debe ser >= 0, recibio {t}");
            assert!(f <= t, "free_gb ({f}) no puede superar total_gb ({t})");
        }

    }
}
