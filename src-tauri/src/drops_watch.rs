//! Experimental watch reporting. Inventory remains the only source of earned progress.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tauri::Webview;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackSample {
    pub enabled: bool,
    pub active: bool,
    pub position: f64,
    pub playback_rate: f64,
    pub muted: bool,
    pub frames: Option<u64>,
}

#[derive(Default)]
struct PlaybackGate {
    previous: Option<(Instant, PlaybackSample)>,
    seconds: f64,
}

impl PlaybackGate {
    fn observe(&mut self, now: Instant, sample: PlaybackSample) -> bool {
        let valid = sample.active
            && sample.position.is_finite()
            && sample.position >= 0.0
            && sample.playback_rate.is_finite()
            && (0.5..=1.5).contains(&sample.playback_rate);
        if !valid {
            self.previous = None;
            return false;
        }
        if let Some((previous_time, previous)) = &self.previous {
            let wall = now.saturating_duration_since(*previous_time).as_secs_f64();
            let media = sample.position - previous.position;
            let frames_advanced = match (previous.frames, sample.frames) {
                (Some(before), Some(after)) => after > before,
                _ => true, // Platforms without frame counters still require advancing media time.
            };
            // Ignore unverified intervals without losing earlier real viewing (DVR can seek).
            if wall > 0.0
                && wall <= 10.0
                && media > 0.0
                && media <= wall * 1.5 + 0.75
                && frames_advanced
            {
                self.seconds += wall.min(media / sample.playback_rate.max(previous.playback_rate));
            }
        }
        self.previous = Some((now, sample));
        if self.seconds >= 60.0 {
            self.seconds -= 60.0;
            return true;
        }
        false
    }
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchStatus {
    pub state: String,
    pub sampled_seconds: u64,
    pub accepted_reports: u64,
    pub last_report_at: Option<u64>,
    pub error: Option<String>,
}

struct Session {
    owner: String,
    channel: String,
    gate: PlaybackGate,
    endpoint: Option<tauri::Url>,
    last_attempt: Option<Instant>,
    blocked: bool,
    status: WatchStatus,
}

static SESSION: tokio::sync::Mutex<Option<Session>> = tokio::sync::Mutex::const_new(None);

fn local_player_origin(url: &tauri::Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "tauri")
        && matches!(
            url.host_str(),
            Some("localhost" | "127.0.0.1" | "tauri.localhost")
        )
}

fn safe_endpoint(raw: &str) -> Result<tauri::Url, String> {
    let url: tauri::Url = raw.parse().map_err(|_| "Endpoint de telemetría inválido")?;
    if url.scheme() != "https"
        || url.host_str() != Some("spade.twitch.tv")
        || url.path() != "/track"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Twitch publicó un endpoint de telemetría no admitido".into());
    }
    Ok(url)
}

fn extract_endpoint(text: &str) -> Result<Option<tauri::Url>, String> {
    let pattern = regex_lite::Regex::new(r#""spade_?url"\s*:\s*"([^"\s]+)""#)
        .map_err(|_| "No se pudo preparar el detector de telemetría")?;
    pattern
        .captures(text)
        .map(|capture| safe_endpoint(&capture[1]))
        .transpose()
}

fn extract_settings(text: &str) -> Result<tauri::Url, String> {
    let pattern = regex_lite::Regex::new(
        r#"src="(https://assets\.twitch\.tv/config/settings\.[a-f0-9]{32}\.js)""#,
    )
    .map_err(|_| "No se pudo preparar el detector de configuración")?;
    pattern
        .captures(text)
        .ok_or("Twitch no publicó configuración de telemetría reconocible")?[1]
        .parse()
        .map_err(|_| "Configuración de Twitch inválida".into())
}

async fn bounded_text(client: &reqwest::Client, url: tauri::Url) -> Result<String, String> {
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "No se pudo consultar la configuración de Twitch")?;
    if !response.status().is_success() {
        return Err(format!("Configuración Twitch HTTP {}", response.status()));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Configuración Twitch incompleta")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Configuración Twitch demasiado grande".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "Configuración Twitch no válida".into())
}

async fn discover_endpoint(client: &reqwest::Client, channel: &str) -> Result<tauri::Url, String> {
    let page = format!("https://www.twitch.tv/{channel}")
        .parse()
        .map_err(|_| "Canal inválido")?;
    let html = bounded_text(client, page).await?;
    if let Some(endpoint) = extract_endpoint(&html)? {
        return Ok(endpoint);
    }
    let settings = bounded_text(client, extract_settings(&html)?).await?;
    extract_endpoint(&settings)?
        .ok_or_else(|| "Twitch no publicó un endpoint de telemetría reconocido".into())
}

fn watch_payload(
    context: &Value,
    channel: &str,
    sample: &PlaybackSample,
    now_ms: u64,
) -> Result<String, String> {
    if context.get("errors").is_some() {
        return Err("Twitch rechazó consultar la sesión de visionado".into());
    }
    let id = |path: &str| -> Result<&str, String> {
        context
            .pointer(path)
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.bytes().all(|c| c.is_ascii_digit()))
            .ok_or_else(|| "No hay una sesión de usuario y directo válidos para reportar".into())
    };
    let user_id = id("/data/currentUser/id")?;
    let channel_id = id("/data/user/id")?;
    let broadcast_id = id("/data/user/stream/id")?;
    let game_id = id("/data/user/stream/game/id")?;
    let date = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(
        now_ms.try_into().map_err(|_| "Fecha inválida")?,
    )
    .ok_or("Fecha inválida")?
    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let payload = json!([{ "event": "minute-watched", "properties": {
        "user_id": user_id, "channel_id": channel_id, "broadcast_id": broadcast_id,
        "channel": channel, "game_id": game_id,
        "game": context.pointer("/data/user/stream/game/name").and_then(Value::as_str).unwrap_or(""),
        "client_time": date, "minutes_logged": 1, "logged_in": true,
        "is_live": true, "live": true, "hidden": false, "muted": sample.muted
    }}]);
    Ok(
        STANDARD
            .encode(serde_json::to_vec(&payload).map_err(|_| "No se pudo preparar el reporte")?),
    )
}

fn response_accepted(status: reqwest::StatusCode) -> Result<(), String> {
    if status == reqwest::StatusCode::NO_CONTENT {
        Ok(())
    } else {
        Err(format!(
            "Telemetría Twitch HTTP {status}; minutos no confirmados"
        ))
    }
}

fn validate_reporting_addresses(addresses: impl Iterator<Item = SocketAddr>) -> Result<(), String> {
    let mut found = false;
    for address in addresses {
        found = true;
        if address.ip().is_unspecified() || address.ip().is_loopback() {
            return Err("El DNS bloquea spade.twitch.tv (dirección nula o local). Revisa el filtro DNS; minutos no confirmados".into());
        }
    }
    if !found {
        return Err(
            "El DNS no devuelve direcciones para spade.twitch.tv; minutos no confirmados".into(),
        );
    }
    Ok(())
}

async fn verify_reporting_dns() -> Result<(), String> {
    // Diagnose sinkholes without changing DNS, overriding addresses or bypassing local filters.
    let addresses = tokio::time::timeout(
        Duration::from_secs(2),
        tokio::net::lookup_host(("spade.twitch.tv", 443)),
    )
    .await
    .map_err(|_| "La consulta DNS de spade.twitch.tv agotó el tiempo; minutos no confirmados")?
    .map_err(|_| "No se pudo resolver spade.twitch.tv. Revisa la conexión y el filtro DNS; minutos no confirmados")?;
    validate_reporting_addresses(addresses)
}

fn report_transport_error(error: reqwest::Error) -> String {
    // Only expose a category, never request URLs, credentials or the event payload.
    let reason = if error.is_timeout() {
        "El envío a spade.twitch.tv agotó el tiempo de espera"
    } else if error.is_connect() {
        "No se pudo conectar por HTTPS a spade.twitch.tv; revisa TLS, proxy o firewall"
    } else {
        "Error de transporte al enviar el reporte a spade.twitch.tv"
    };
    format!("{reason}; minutos no confirmados")
}

#[tauri::command]
pub async fn sample_native_drops_watch(
    webview: Webview,
    channel: String,
    sample: PlaybackSample,
) -> Result<WatchStatus, String> {
    super::validate_channel(&channel)?;
    if webview.label() != "main"
        || !local_player_origin(
            &webview
                .url()
                .map_err(|_| "No se pudo verificar el origen del reproductor")?,
        )
    {
        return Err(
            "El reporte de visionado solo se permite desde el reproductor principal".into(),
        );
    }
    let mut state = SESSION.lock().await;
    if !sample.enabled {
        // Cleanup from an old channel must not stop a newly activated channel.
        if state
            .as_ref()
            .is_some_and(|session| session.channel == channel && session.owner == webview.label())
        {
            *state = None;
        }
        return Ok(WatchStatus {
            state: "paused".into(),
            ..Default::default()
        });
    }
    if !state
        .as_ref()
        .is_some_and(|session| session.channel == channel && session.owner == webview.label())
    {
        *state = Some(Session {
            owner: webview.label().into(),
            channel: channel.clone(),
            gate: PlaybackGate::default(),
            endpoint: None,
            last_attempt: None,
            blocked: false,
            status: WatchStatus {
                state: "sampling".into(),
                ..Default::default()
            },
        });
    }
    let session = state
        .as_mut()
        .ok_or("No se pudo iniciar la sesión nativa")?;
    if session.blocked {
        return Ok(session.status.clone());
    }
    if !sample.active
        || !webview.window().is_visible().unwrap_or(false)
        || webview.window().is_minimized().unwrap_or(true)
    {
        session.gate.previous = None;
        session.status.state = "paused".into();
        return Ok(session.status.clone());
    }
    if session.status.state == "paused" {
        session.status.state = "sampling".into();
    }
    let now = Instant::now();
    let ready = session.gate.observe(now, sample.clone());
    session.status.sampled_seconds = session.gate.seconds.floor() as u64;
    if !ready
        || session
            .last_attempt
            .is_some_and(|attempt| now.duration_since(attempt) < Duration::from_secs(60))
    {
        return Ok(session.status.clone());
    }
    session.last_attempt = Some(now);
    let inventory = super::companion::get_cached_drops_inventory()?;
    if inventory.get("channel").and_then(Value::as_str) != Some(channel.as_str())
        || inventory
            .get("channelCampaigns")
            .and_then(Value::as_array)
            .is_none_or(|campaigns| campaigns.is_empty())
    {
        session.status.state = "not-eligible".into();
        session.status.error =
            Some("Sin campaña del canal confirmada; no se envió telemetría".into());
        return Ok(session.status.clone());
    }
    let result = tokio::time::timeout(Duration::from_secs(25), async {
        let token = super::twitch_webview_auth_token(&webview).await?.ok_or("Inicia sesión en Twitch para reportar visionado")?;
        let context = super::fetch_twitch_gql(
            "query NativeDropWatch($login: String!) { currentUser { id } user(login: $login) { id stream { id game { id name } } } }".into(),
            Some(json!({"login": channel})), Some(token), None).await?;
        let body = watch_payload(&context, &channel, &sample, super::drops_now_ms())?;
        let client = reqwest::Client::builder().use_rustls_tls()
            .user_agent(concat!("BlinkStream/", env!("CARGO_PKG_VERSION")))
            .timeout(Duration::from_secs(10)).redirect(reqwest::redirect::Policy::none())
            .build().map_err(|_| "No se pudo preparar telemetría")?;
        let endpoint = match &session.endpoint { Some(endpoint) => endpoint.clone(), None => discover_endpoint(&client, &channel).await? };
        session.endpoint = Some(endpoint.clone());
        if let Err(error) = verify_reporting_dns().await {
            session.blocked = true;
            return Err(error);
        }
        // Spade receives only the measured event, not OAuth cookies or authorization headers.
        let response = client.post(endpoint).form(&[("data", body)]).send().await.map_err(report_transport_error)?;
        if matches!(response.status().as_u16(), 401 | 403 | 429) { session.blocked = true; }
        response_accepted(response.status())
    }).await.unwrap_or_else(|_| Err("Telemetría agotó el tiempo de espera; minutos no confirmados".into()));
    match result {
        Ok(()) => {
            session.status.accepted_reports += 1;
            session.status.state = "reported".into();
            session.status.last_report_at = Some(super::drops_now_ms());
            session.status.error = None;
            log::info!("[DropsWatch] Reporte nativo aceptado para {channel}; acreditación pendiente del inventario");
        }
        Err(error) => {
            let lowered = error.to_ascii_lowercase();
            if lowered.contains("integrity")
                || lowered.contains("http 401")
                || lowered.contains("http 403")
            {
                session.blocked = true;
            }
            session.status.state = if session.blocked { "blocked" } else { "error" }.into();
            session.status.error = Some(error);
        }
    }
    Ok(session.status.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dns_sinkholes_and_empty_answers_stop_reporting_without_a_fallback() {
        for ip in ["0.0.0.0", "::", "127.0.0.1", "::1"] {
            let address = SocketAddr::new(ip.parse().unwrap(), 443);
            let error = validate_reporting_addresses([address].into_iter()).unwrap_err();
            assert!(error.contains("DNS bloquea spade.twitch.tv"));
            assert!(error.contains("minutos no confirmados"));
        }
        assert!(validate_reporting_addresses(std::iter::empty()).is_err());
        let public: SocketAddr = "192.0.2.1:443".parse().unwrap();
        assert!(validate_reporting_addresses([public].into_iter()).is_ok());
        assert!(
            validate_reporting_addresses([public, "0.0.0.0:443".parse().unwrap()].into_iter())
                .is_err()
        );
    }

    #[test]
    fn transport_errors_do_not_expose_request_urls_or_credentials() {
        let client = reqwest::Client::new();
        let error = client.get("http://[").build().unwrap_err();
        assert_eq!(
            report_transport_error(error),
            "Error de transporte al enviar el reporte a spade.twitch.tv; minutos no confirmados"
        );
    }

    fn sample(position: f64) -> PlaybackSample {
        PlaybackSample {
            enabled: true,
            active: true,
            position,
            playback_rate: 1.0,
            muted: false,
            frames: Some((position * 30.0) as u64),
        }
    }

    #[test]
    fn reports_only_after_a_real_minute_and_never_more_than_wall_time() {
        let start = Instant::now();
        let mut gate = PlaybackGate::default();
        for second in (0..60).step_by(5) {
            assert!(!gate.observe(start + Duration::from_secs(second), sample(second as f64)));
        }
        assert!(gate.observe(start + Duration::from_secs(60), sample(60.0)));
        assert!(!gate.observe(start + Duration::from_secs(60), sample(120.0)));
        assert_eq!(gate.seconds, 0.0);
    }

    #[test]
    fn pause_seek_stall_sleep_invalid_numbers_and_frozen_frames_add_no_time() {
        let start = Instant::now();
        for bad in [
            PlaybackSample {
                active: false,
                ..sample(10.0)
            },
            sample(99.0),
            sample(5.0),
            sample(f64::NAN),
            PlaybackSample {
                frames: Some(150),
                ..sample(10.0)
            },
        ] {
            let mut gate = PlaybackGate::default();
            gate.observe(start, sample(0.0));
            gate.observe(start + Duration::from_secs(5), sample(5.0));
            assert!(!gate.observe(start + Duration::from_secs(10), bad));
            assert_eq!(gate.seconds, 5.0);
        }
        let mut gate = PlaybackGate::default();
        gate.observe(start, sample(0.0));
        assert!(!gate.observe(start + Duration::from_secs(120), sample(120.0)));
        assert_eq!(gate.seconds, 0.0);
    }

    #[test]
    fn fast_playback_does_not_accelerate_reports() {
        let start = Instant::now();
        let mut gate = PlaybackGate::default();
        for second in (0..60).step_by(5) {
            assert!(!gate.observe(
                start + Duration::from_secs(second),
                PlaybackSample {
                    playback_rate: 1.2,
                    ..sample(second as f64 * 1.2)
                }
            ));
        }
        assert!(gate.observe(
            start + Duration::from_secs(60),
            PlaybackSample {
                playback_rate: 1.2,
                ..sample(72.0)
            }
        ));
    }

    #[test]
    fn discovery_rejects_untrusted_hosts_redirect_targets_credentials_and_queries() {
        assert!(local_player_origin(
            &"http://localhost:5173/".parse().unwrap()
        ));
        assert!(local_player_origin(
            &"http://tauri.localhost/".parse().unwrap()
        ));
        assert!(!local_player_origin(
            &"https://www.twitch.tv/".parse().unwrap()
        ));
        assert!(safe_endpoint("https://spade.twitch.tv/track").is_ok());
        for bad in [
            "http://spade.twitch.tv/track",
            "https://evil.test/track",
            "https://spade.twitch.tv.evil.test/track",
            "https://spade.twitch.tv/track?secret=1",
            "https://user@spade.twitch.tv/track",
            "https://spade.twitch.tv/other",
        ] {
            assert!(safe_endpoint(bad).is_err());
        }
        assert!(
            extract_endpoint(r#"{"spade_url":"https://spade.twitch.tv/track"}"#)
                .unwrap()
                .is_some()
        );
        assert!(extract_settings(r#"<script src="https://evil.test/config/settings.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js">"#).is_err());
    }

    #[test]
    fn payload_uses_real_context_timestamp_and_mute_not_local_drop_progress() {
        let context = json!({"data": {"currentUser": {"id": "123"}, "user": {"id": "456", "stream": {"id": "789", "game": {"id": "10", "name": "AION 2"}}}}});
        let encoded = watch_payload(
            &context,
            "cahos_gaming",
            &PlaybackSample {
                muted: true,
                ..sample(60.0)
            },
            0,
        )
        .unwrap();
        let decoded: Value = serde_json::from_slice(&STANDARD.decode(encoded).unwrap()).unwrap();
        assert_eq!(decoded[0]["properties"]["user_id"], "123");
        assert_eq!(decoded[0]["properties"]["muted"], true);
        assert_eq!(
            decoded[0]["properties"]["client_time"],
            "1970-01-01T00:00:00Z"
        );
        assert_eq!(decoded[0]["properties"]["minutes_logged"], 1);
        assert!(watch_payload(
            &json!({"data": {"currentUser": null}}),
            "ibai",
            &sample(60.0),
            0
        )
        .is_err());
        assert!(response_accepted(reqwest::StatusCode::OK).is_err());
        assert!(response_accepted(reqwest::StatusCode::FORBIDDEN).is_err());
    }
}
