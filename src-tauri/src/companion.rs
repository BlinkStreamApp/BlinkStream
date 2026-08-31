use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, UdpSocket};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionStateData {
    pub channel: String,
    pub title: String,
    pub volume: i32,
    pub is_muted: bool,
    pub is_live: bool,
    pub view_mode: String,
    pub favorites_live: Vec<serde_json::Value>,
    pub avatar: String,
}

impl Default for CompanionStateData {
    fn default() -> Self {
        Self {
            channel: "".to_string(),
            title: "Sin emisión activa en BlinkStream".to_string(),
            volume: 80,
            is_muted: false,
            is_live: false,
            view_mode: "normal".to_string(),
            favorites_live: Vec::new(),
            avatar: "".to_string(),
        }
    }
}

pub struct CompanionServerState {
    pub is_running: bool,
    pub port: u16,
    pub ip: String,
    pub pin: String,
    pub state_data: CompanionStateData,
}

static SERVER_STATE: OnceLock<Arc<Mutex<CompanionServerState>>> = OnceLock::new();
static DROPS_CACHE: OnceLock<Arc<Mutex<serde_json::Value>>> = OnceLock::new();

fn get_drops_cache() -> Arc<Mutex<serde_json::Value>> {
    DROPS_CACHE
        .get_or_init(|| Arc::new(Mutex::new(json!({ "campaigns": [] }))))
        .clone()
}

fn detect_local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.starts_with("127.") && !ip.is_empty() {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

fn get_server_state() -> Arc<Mutex<CompanionServerState>> {
    SERVER_STATE
        .get_or_init(|| {
            Arc::new(Mutex::new(CompanionServerState {
                is_running: false,
                port: 9876,
                ip: detect_local_ip(),
                pin: String::new(),
                state_data: CompanionStateData::default(),
            }))
        })
        .clone()
}

fn query_parameter<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (candidate, value) = pair.split_once('=')?;
        (candidate == key).then_some(value)
    })
}

fn request_body(req: &str) -> Option<&str> {
    req.split_once("\r\n\r\n").map(|(_, body)| body)
}

fn supplied_pin(query: &str, req: &str) -> Option<String> {
    query_parameter(query, "pin")
        .map(str::to_owned)
        .or_else(|| {
            let value = serde_json::from_str::<serde_json::Value>(request_body(req)?).ok()?;
            value.get("pin").and_then(|pin| {
                pin.as_str()
                    .map(str::to_owned)
                    .or_else(|| pin.as_u64().map(|n| n.to_string()))
            })
        })
}

fn generate_pin() -> Result<String, String> {
    let value = getrandom::u32()
        .map_err(|e| format!("No se pudo generar un PIN seguro para el mando: {e}"))?;
    Ok(format!("{:06}", (value % 900_000) + 100_000))
}

pub fn init_and_start_companion_server(app: AppHandle) -> Result<(), String> {
    let state_arc = get_server_state();
    let (ip, port) = {
        let mut guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
        if guard.is_running {
            return Ok(());
        }
        guard.pin = generate_pin()?;
        guard.is_running = true;
        (guard.ip.clone(), guard.port)
    };

    let bind_addr = format!("0.0.0.0:{port}");
    let listener = match TcpListener::bind(&bind_addr) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("[Companion] El puerto {port} está en uso ({e}), intentando 9877...");
            let mut guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
            guard.port = 9877;
            match TcpListener::bind("0.0.0.0:9877") {
                Ok(l2) => l2,
                Err(e2) => {
                    log::error!("[Companion] Fallo crítico al enlazar servidor local: {e2}");
                    guard.is_running = false;
                    return Err(format!("No se pudo iniciar el mando Wi-Fi: {e2}"));
                }
            }
        }
    };

    if let Err(error) = listener.set_nonblocking(true) {
        state_arc
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_running = false;
        return Err(format!(
            "No se pudo configurar el servidor del mando: {error}"
        ));
    }

    let app_clone = app.clone();
    thread::spawn(move || {
        log::info!("[Companion] Servidor Remoto escuchando en http://{ip}:{port}");
        loop {
            let is_running = {
                let state = get_server_state();
                let guard = state.lock().unwrap_or_else(|e| e.into_inner());
                guard.is_running
            };
            if !is_running {
                log::info!("[Companion] Servidor Remoto detenido");
                break;
            }

            match listener.accept() {
                Ok((mut stream, _)) => {
                    let state_arc = get_server_state();
                    let app_handle = app_clone.clone();
                    let _ = handle_client_stream(&mut stream, state_arc, app_handle);
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    log::error!("[Companion] Error aceptando conexión: {e}");
                    let state = get_server_state();
                    state
                        .lock()
                        .unwrap_or_else(|err| err.into_inner())
                        .is_running = false;
                    break;
                }
            }
        }
    });
    Ok(())
}

fn handle_client_stream(
    stream: &mut std::net::TcpStream,
    state_arc: Arc<Mutex<CompanionServerState>>,
    app_handle: AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(4)))?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(4)))?;

    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf)?;
    if n == 0 {
        return Ok(());
    }

    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req_str.lines();
    let first_line = match lines.next() {
        Some(l) => l,
        None => return Ok(()),
    };

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }
    let method = parts[0];
    let path_and_query = parts[1];

    let path = path_and_query.split('?').next().unwrap_or("/");
    let query = if let Some(idx) = path_and_query.find('?') {
        &path_and_query[idx + 1..]
    } else {
        ""
    };

    // La interfaz móvil se sirve desde este mismo origen. No habilitamos CORS:
    // así una web externa no puede usar el navegador para atacar la API LAN.
    let response_headers = "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nContent-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'\r\n";

    if method == "OPTIONS" {
        let resp = format!("HTTP/1.1 204 No Content\r\n{response_headers}\r\n");
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if path.starts_with("/api/") {
        let expected_pin = {
            let guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
            guard.pin.clone()
        };

        let has_valid_pin = supplied_pin(query, &req_str).as_deref() == Some(&expected_pin);

        if !has_valid_pin {
            let err_json = json!({"error": "Unauthorized", "message": "PIN de seguridad incorrecto u omitido. Escanea el código QR desde BlinkStream."}).to_string();
            let resp = format!(
                "HTTP/1.1 403 Forbidden\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
                response_headers,
                err_json.len(),
                err_json
            );
            stream.write_all(resp.as_bytes())?;
            return Ok(());
        }
    }

    if method == "GET" && (path == "/" || path == "/index.html") {
        let html = get_companion_html();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n{}Content-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
            response_headers,
            html.len(),
            html
        );
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "GET" && path == "/api/state" {
        let json_str = {
            let guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
            serde_json::to_string(&guard.state_data).unwrap_or_else(|_| "{}".to_string())
        };
        let resp = format!(
            "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
            response_headers,
            json_str.len(),
            json_str
        );
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "POST" && path == "/api/drops_update" {
        if let Some(body) = request_body(&req_str) {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(body) {
                let cache = get_drops_cache();
                if let Ok(mut guard) = cache.lock() {
                    *guard = json_val.clone();
                }
                let _ = app_handle.emit("twitch_drops_update", &json_val);
            }
        }
        let ok_json = json!({"status": "ok"}).to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n{}Access-Control-Allow-Origin: *\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
            response_headers,
            ok_json.len(),
            ok_json
        );
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    if method == "POST" && path == "/api/command" {
        if let Some(body) = request_body(&req_str) {
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(body) {
                if let Some(action) = json_val.get("action").and_then(|v| v.as_str()) {
                    if action == "send_chat" {
                        let _ = app_handle.emit("companion_send_chat", &json_val);
                    } else {
                        let _ = app_handle.emit("companion_command", &json_val);
                    }
                }
            }
        }
        let ok_json =
            json!({"status": "success", "message": "Orden procesada por BlinkStream"}).to_string();
        let resp = format!(
            "HTTP/1.1 200 OK\r\n{}Content-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
            response_headers,
            ok_json.len(),
            ok_json
        );
        stream.write_all(resp.as_bytes())?;
        return Ok(());
    }

    let not_found = "404 Not Found in BlinkStream Companion Remote Server";
    let resp = format!(
        "HTTP/1.1 404 Not Found\r\n{response_headers}Content-Length: {}\r\n\r\n{not_found}",
        not_found.len()
    );
    stream.write_all(resp.as_bytes())?;
    Ok(())
}

#[tauri::command]
pub fn get_companion_status() -> Result<serde_json::Value, String> {
    let state_arc = get_server_state();
    let guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
    let url = format!("http://{}:{}/?pin={}", guard.ip, guard.port, guard.pin);
    Ok(json!({
        "isRunning": guard.is_running,
        "ip": guard.ip,
        "port": guard.port,
        "pin": guard.pin,
        "url": url
    }))
}

#[tauri::command]
pub fn start_companion_server_cmd(app: AppHandle) -> Result<serde_json::Value, String> {
    init_and_start_companion_server(app)?;
    get_companion_status()
}

#[tauri::command]
pub fn get_cached_drops_inventory() -> Result<serde_json::Value, String> {
    let cache = get_drops_cache();
    let guard = cache.lock().map_err(|e| format!("Lock error: {e}"))?;
    Ok(guard.clone())
}

#[tauri::command]
pub async fn claim_twitch_drop(app: AppHandle, drop_instance_id: String) -> Result<bool, String> {
    let escaped_id = drop_instance_id.replace('"', "\\\"");
    let script = format!(
        "if (typeof window.__claimTwitchDrop === 'function') {{ window.__claimTwitchDrop(\"{escaped_id}\"); }}"
    );
    if let Some(watcher) = app.get_webview_window("twitch_drops_watcher") {
        let _ = watcher.eval(&script);
    }
    if let Some(chat) = app.get_webview("embedded_twitch_chat") {
        let _ = chat.eval(&script);
    }
    Ok(true)
}

#[tauri::command]
pub async fn force_refresh_drops_watcher(app: AppHandle) -> Result<bool, String> {
    let script = "if (typeof window.__syncDropsData === 'function') { window.__syncDropsData(); }";
    if let Some(watcher) = app.get_webview_window("twitch_drops_watcher") {
        let _ = watcher.eval(script);
    }
    if let Some(chat) = app.get_webview("embedded_twitch_chat") {
        let _ = chat.eval(script);
    }
    Ok(true)
}

#[tauri::command]
pub fn stop_companion_server_cmd() -> Result<serde_json::Value, String> {
    let state_arc = get_server_state();
    let mut guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
    guard.is_running = false;
    Ok(json!({ "status": "stopped" }))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri IPC recibe estos campos planos desde la UI existente.
pub fn update_companion_state(
    channel: Option<String>,
    title: Option<String>,
    volume: Option<i32>,
    is_muted: Option<bool>,
    is_live: Option<bool>,
    view_mode: Option<String>,
    favorites_live: Option<Vec<serde_json::Value>>,
    avatar: Option<String>,
) -> Result<(), String> {
    let state_arc = get_server_state();
    let mut guard = state_arc.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(c) = channel {
        guard.state_data.channel = c;
    }
    if let Some(t) = title {
        guard.state_data.title = t;
    }
    if let Some(v) = volume {
        guard.state_data.volume = v;
    }
    if let Some(m) = is_muted {
        guard.state_data.is_muted = m;
    }
    if let Some(l) = is_live {
        guard.state_data.is_live = l;
    }
    if let Some(vm) = view_mode {
        guard.state_data.view_mode = vm;
    }
    if let Some(favs) = favorites_live {
        guard.state_data.favorites_live = favs;
    }
    if let Some(a) = avatar {
        guard.state_data.avatar = a;
    }
    Ok(())
}

fn get_companion_html() -> &'static str {
    r#"<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>BlinkStream Remote</title>
    <style>
        :root {
            --bg-color: #0b0c10;
            --card-bg: #1f2833;
            --twitch-color: #9146ff;
            --cyan-color: #66fcf1;
            --text-main: #ffffff;
            --text-muted: #c5c6c7;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-tap-highlight-color: transparent; }
        body { background-color: var(--bg-color); color: var(--text-main); display: flex; flex-direction: column; min-height: 100vh; padding: 16px; max-width: 500px; margin: 0 auto; }
        .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 16px; }
        .title-group { display: flex; align-items: center; gap: 10px; }
        .logo-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--cyan-color); box-shadow: 0 0 10px var(--cyan-color); animation: pulse 2s infinite; }
        @keyframes pulse { 0% { transform: scale(0.95); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.8; } }
        .app-name { font-size: 20px; font-weight: 800; background: linear-gradient(to right, var(--cyan-color), var(--twitch-color)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .status-badge { font-size: 11px; padding: 4px 10px; border-radius: 20px; background: rgba(102, 252, 241, 0.15); color: var(--cyan-color); font-weight: 700; border: 1px solid rgba(102, 252, 241, 0.3); }
        .card { background-color: var(--card-bg); border-radius: 16px; padding: 16px; margin-bottom: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); }
        .channel-info { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; }
        .avatar-holder { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(45deg, var(--twitch-color), var(--cyan-color)); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; border: 3px solid #fff; box-shadow: 0 4px 15px rgba(145, 70, 255, 0.5); }
        .channel-name { font-size: 24px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
        .stream-status { font-size: 13px; color: #ff5252; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
        .grid-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 16px; color: #fff; font-size: 15px; font-weight: 700; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.15s; }
        .btn:active { transform: scale(0.94); background: rgba(255,255,255,0.15); border-color: var(--cyan-color); }
        .btn i { font-size: 24px; }
        .btn.full-width { grid-column: span 2; background: linear-gradient(135deg, rgba(145, 70, 255, 0.3), rgba(102, 252, 241, 0.2)); border-color: rgba(145, 70, 255, 0.5); flex-direction: row; }
        .slider-section { display: flex; flex-direction: column; gap: 12px; }
        .slider-header { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; color: var(--text-muted); }
        input[type=range] { -webkit-appearance: none; width: 100%; background: transparent; }
        input[type=range]:focus { outline: none; }
        input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 8px; cursor: pointer; background: rgba(255,255,255,0.15); border-radius: 6px; }
        input[type=range]::-webkit-slider-thumb { height: 24px; width: 24px; border-radius: 50%; background: var(--cyan-color); cursor: pointer; -webkit-appearance: none; margin-top: -8px; box-shadow: 0 0 10px var(--cyan-color); }
        .favorites-scroll { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
        .favorites-scroll::-webkit-scrollbar { display: none; }
        .fav-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; min-width: 68px; }
        .fav-avatar { width: 54px; height: 54px; border-radius: 50%; background: var(--twitch-color); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; border: 2px solid #2ecc71; position: relative; }
        .fav-live-dot { position: absolute; bottom: -2px; right: 0; width: 12px; height: 12px; background: #2ecc71; border-radius: 50%; border: 2px solid var(--card-bg); }
        .fav-name { font-size: 12px; font-weight: 700; max-width: 68px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chat-section { margin-top: auto; padding-top: 8px; }
        .chat-form { display: flex; gap: 8px; }
        .chat-input { flex: 1; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px; padding: 14px 16px; color: #fff; font-size: 15px; outline: none; }
        .chat-input:focus { border-color: var(--cyan-color); }
        .chat-send { background: linear-gradient(45deg, var(--twitch-color), #b072ff); border: none; border-radius: 12px; padding: 0 20px; color: #fff; font-weight: 800; font-size: 15px; cursor: pointer; transition: transform 0.1s; }
        .chat-send:active { transform: scale(0.92); }
        .toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.9); border: 1px solid var(--cyan-color); color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: bold; opacity: 0; pointer-events: none; transition: opacity 0.3s; z-index: 99; }
    </style>
</head>
<body>
    <div class="header">
        <div class="title-group">
            <div class="logo-dot"></div>
            <div class="app-name">BlinkStream Remote</div>
        </div>
        <div class="status-badge" id="statusBadge">ONLINE</div>
    </div>

    <div class="card channel-info" id="streamCard">
        <div class="avatar-holder" id="chanAvatar">?</div>
        <div class="channel-name" id="chanName">Sin Emisión Activa</div>
        <div class="stream-status" id="streamStatus">⚪ En Espera de Directo</div>
    </div>

    <div class="grid-buttons">
        <button class="btn" onclick="sendCommand('toggle_pause')">
            <i>⏯️</i> <span>Play / Pausa</span>
        </button>
        <button class="btn" onclick="sendCommand('toggle_mute')">
            <i>🔇</i> <span>Mute Audio</span>
        </button>
        <button class="btn" onclick="sendCommand('toggle_theatre')">
            <i>🖼️</i> <span>Modo Teatro</span>
        </button>
        <button class="btn" onclick="sendCommand('toggle_multistream')">
            <i>🔲</i> <span>Modo Rejilla</span>
        </button>
        <button class="btn full-width" onclick="sendCommand('take_snapshot')">
            <i>📸</i> <span>Capturar Clip HD (Instantánea)</span>
        </button>
    </div>

    <div class="card slider-section">
        <div class="slider-header">
            <span>🔊 Volumen del Directo</span>
            <span id="volumeVal">80%</span>
        </div>
        <input type="range" id="volSlider" min="0" max="100" value="80" oninput="onVolumeSlider(this.value)">
    </div>

    <div class="card" id="favsCard" style="display: none;">
        <div class="slider-header" style="margin-bottom: 12px;">
            <span>🟢 Tus Canales en Vivo (Súper Atajo)</span>
        </div>
        <div class="favorites-scroll" id="favsContainer"></div>
    </div>

    <div class="chat-section">
        <form class="chat-form" onsubmit="submitChat(event)">
            <input type="text" id="chatInput" class="chat-input" placeholder="💬 Escribe un mensaje al chat..." required autocomplete="off">
            <button type="submit" class="chat-send">Enviar 🚀</button>
        </form>
    </div>

    <div id="toast" class="toast"></div>

    <script>
        const params = new URLSearchParams(window.location.search);
        const pin = params.get('pin') || '';

        function showToast(msg) {
            const t = document.getElementById('toast');
            t.textContent = msg;
            t.style.opacity = '1';
            setTimeout(() => { t.style.opacity = '0'; }, 2000);
        }

        async function sendCommand(action, extra = {}) {
            try {
                const res = await fetch(`/api/command?pin=${encodeURIComponent(pin)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin, action, ...extra })
                });
                if (res.ok) {
                    if (action === 'take_snapshot') showToast('📸 Captura HD Guardada con Exito!');
                    if (action === 'toggle_pause') showToast('⏯️ Reproducción Alternada');
                    if (action === 'toggle_theatre') showToast('🖼️ Modo Teatro Alternado');
                    if (action === 'toggle_multistream') showToast('🔲 Modo Rejilla Alternado');
                    if (action === 'toggle_mute') showToast('🔇 Silencio (Mute) Alternado');
                } else if (res.status === 403) {
                    showToast('⛔ PIN Incorrecto. Escanea el QR del PC.');
                }
            } catch (err) {
                showToast('⚠️ Error de conexión con el PC');
            }
        }

        function onVolumeSlider(val) {
            document.getElementById('volumeVal').textContent = `${val}%`;
            sendCommand('set_volume', { value: parseInt(val, 10) });
        }

        function submitChat(e) {
            e.preventDefault();
            const input = document.getElementById('chatInput');
            const text = input.value.trim();
            if (text) {
                sendCommand('send_chat', { text });
                input.value = '';
                showToast('💬 Mensaje Enviado al Chat!');
            }
        }

        async function pollState() {
            try {
                const res = await fetch(`/api/state?pin=${encodeURIComponent(pin)}`);
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('statusBadge').style.color = '#2ecc71';
                    document.getElementById('statusBadge').style.borderColor = '#2ecc71';
                    document.getElementById('statusBadge').textContent = 'ONLINE';

                    if (data.channel) {
                        document.getElementById('chanName').textContent = data.channel.toUpperCase();
                        if (data.avatar) {
                            document.getElementById('chanAvatar').innerHTML = `<img src="${data.avatar}" alt="${data.channel}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid #00e5ff;box-shadow:0 0 12px rgba(0,229,255,0.35);">`;
                        } else {
                            document.getElementById('chanAvatar').textContent = data.channel.charAt(0).toUpperCase();
                        }
                        document.getElementById('streamStatus').innerHTML = '🔴 EN DIRECTO AHORA';
                        document.getElementById('streamStatus').style.color = '#2ecc71';
                    } else {
                        document.getElementById('chanName').textContent = 'Sin Emisión Activa';
                        document.getElementById('chanAvatar').innerHTML = '📺';
                        document.getElementById('streamStatus').innerHTML = '⚪ En Espera de Canal';
                        document.getElementById('streamStatus').style.color = '#ff5252';
                    }

                    if (typeof data.volume === 'number' && document.activeElement !== document.getElementById('volSlider')) {
                        document.getElementById('volSlider').value = data.volume;
                        document.getElementById('volumeVal').textContent = `${data.volume}%`;
                    }

                    const favs = data.favorites_live || [];
                    if (favs.length > 0) {
                        document.getElementById('favsCard').style.display = 'block';
                        const container = document.getElementById('favsContainer');
                        container.innerHTML = favs.map(f => {
                            const name = typeof f === 'string' ? f : (f.name || f.user_name || f.user_login || 'Unknown');
                            const avatar = typeof f === 'object' ? (f.avatar || '') : '';
                            const isLive = typeof f === 'object' ? (f.live !== false) : true;
                            const initial = name.charAt(0).toUpperCase();
                            const avatarImg = avatar
                                ? `<img src="${avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;${isLive ? 'border:2px solid #2ecc71;' : 'filter:grayscale(70%);opacity:0.5;'}">`
                                : initial;
                            const badge = isLive ? `<span class="fav-live-dot" style="background:#2ecc71;box-shadow:0 0 8px #2ecc71;"></span>` : `<span class="fav-live-dot" style="background:#666;"></span>`;
                            return `<div class="fav-item" onclick="sendCommand('change_channel', { channel: '${name}' }); showToast('📺 Cambiando a ${name}')" style="${isLive ? 'opacity:1;' : 'opacity:0.6;'}">
                                <div class="fav-avatar" style="${avatar ? 'padding:0;overflow:hidden;background:transparent;border:none;' : ''}">${avatarImg}${badge}</div>
                                <div class="fav-name" style="color:${isLive ? '#fff' : '#999'};">${name}</div>
                            </div>`;
                        }).join('');
                    } else {
                        document.getElementById('favsCard').style.display = 'none';
                    }
                }
            } catch (err) {
                document.getElementById('statusBadge').style.color = '#ff5252';
                document.getElementById('statusBadge').style.borderColor = '#ff5252';
                document.getElementById('statusBadge').textContent = 'DESCONECTADO';
            }
        }

        setInterval(pollState, 2500);
        pollState();
    </script>
</body>
</html>"#
}

#[cfg(test)]
mod tests {
    use super::{query_parameter, request_body, supplied_pin};

    #[test]
    fn pin_query_requires_exact_parameter_name() {
        assert_eq!(query_parameter("pin=123456&x=1", "pin"), Some("123456"));
        assert_eq!(query_parameter("notpin=123456", "pin"), None);
        assert_eq!(supplied_pin("notpin=123456", ""), None);
    }

    #[test]
    fn pin_body_requires_exact_json_field() {
        let request = "POST /api/command HTTP/1.1\r\n\r\n{\"pin\":\"123456\"}";
        assert_eq!(request_body(request), Some("{\"pin\":\"123456\"}"));
        assert_eq!(supplied_pin("", request).as_deref(), Some("123456"));

        let spoofed = "POST /api/command HTTP/1.1\r\n\r\n{\"notpin\":\"123456\"}";
        assert_eq!(supplied_pin("", spoofed), None);
    }
}
