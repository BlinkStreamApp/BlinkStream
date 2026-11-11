//! Opt-in Drops transport. Credentials stay native; remembered connections use OS credentials.
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, Webview};

struct Attempt {
    session: String,
    state: String,
    owner: String,
    login: String,
    token: Option<String>,
    phase: &'static str,
    expires: Instant,
    inventory: Option<Value>,
    device: String,
    claim_started: bool,
    claim_attempts: HashSet<String>,
    claim_blocked: bool,
    remember: bool,
    expires_at: u64,
}

static ATTEMPT: Mutex<Option<Attempt>> = Mutex::new(None);
static SESSION_IO_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static ACCOUNT_EPOCH: AtomicU64 = AtomicU64::new(0);
static RESTORE_ALLOWED: AtomicBool = AtomicBool::new(true);

pub(crate) fn clear_account() -> Result<(), String> {
    let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
    ACCOUNT_EPOCH.fetch_add(1, Ordering::SeqCst);
    RESTORE_ALLOWED.store(false, Ordering::SeqCst);
    *slot = None;
    super::drops_connection::clear()
}

fn save_connection(attempt: &Attempt) -> Result<(), String> {
    if !attempt.remember {
        return Ok(());
    }
    super::drops_connection::save(&super::drops_connection::SavedConnection {
        token: attempt.token.clone().ok_or("authorization")?,
        owner: attempt.owner.clone(),
        client: configured_client().ok_or("disabled")?.into(),
        expires_at: attempt.expires_at,
        attempted: attempt.claim_attempts.clone(),
        blocked: attempt.claim_blocked || attempt.claim_started,
    })
}

async fn restore_connection() -> Result<(), String> {
    configured_client().ok_or("disabled")?;
    if !RESTORE_ALLOWED.load(Ordering::SeqCst) {
        return Ok(());
    }
    let _io = SESSION_IO_LOCK.try_lock().map_err(|_| "busy")?;
    let epoch = ACCOUNT_EPOCH.load(Ordering::SeqCst);
    let saved = {
        let slot = ATTEMPT.lock().map_err(|_| "state")?;
        if slot.is_some() {
            return Ok(());
        }
        match super::drops_connection::load() {
            Ok(Some(saved)) => saved,
            Ok(None) => return Ok(()),
            Err(error) => {
                if error != "storage" {
                    super::drops_connection::clear()?;
                }
                return Err(error);
            }
        }
    };
    let result = async {
        let remaining = saved.remaining(
            configured_client().ok_or("disabled")?,
            super::drops_connection::now()?,
        )?;
        let main = main_identity().await?;
        let metadata = identity(&saved.token).await?;
        if !same_identity(&main, &saved.owner, None)
            || !same_identity(&metadata, &saved.owner, configured_client())
            || !same_identity(&main_identity().await?, &saved.owner, None)
        {
            return Err("account".to_string());
        }
        let remaining = remaining
            .min(saved.remaining(
                configured_client().ok_or("disabled")?,
                super::drops_connection::now()?,
            )?)
            .min(credential_lifetime(metadata["expires_in"].as_u64())?);
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random).map_err(|_| "state")?;
        Ok((
            remaining,
            main,
            random
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>(),
        ))
    }
    .await;
    let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
    if epoch != ACCOUNT_EPOCH.load(Ordering::SeqCst) || slot.is_some() {
        return Err("cancelled".into());
    }
    match result {
        Ok((remaining, main, session)) => {
            *slot = Some(Attempt {
                session,
                state: String::new(),
                owner: saved.owner,
                login: main["login"].as_str().unwrap_or_default().into(),
                token: Some(saved.token),
                phase: "connected",
                expires: Instant::now() + remaining,
                expires_at: saved.expires_at,
                inventory: None,
                device: String::new(),
                claim_started: false,
                claim_attempts: saved.attempted,
                claim_blocked: saved.blocked,
                remember: true,
            });
            Ok(())
        }
        Err(error) => {
            if matches!(error.as_str(), "account" | "authorization") {
                super::drops_connection::clear()?;
            }
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn remember_drops_connection(
    webview: Webview,
    session: String,
    remember: bool,
) -> Result<(), String> {
    super::embedded_drops::require_ui(&webview)?;
    configured_client().ok_or("disabled")?;
    let _io = SESSION_IO_LOCK.try_lock().map_err(|_| "busy")?;
    let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
    let attempt = slot
        .as_mut()
        .filter(|a| active(a, &session) && a.phase == "connected")
        .ok_or("authorization")?;
    if remember {
        attempt.remember = true;
        if let Err(error) = save_connection(attempt) {
            attempt.remember = false;
            return Err(error);
        }
    } else {
        super::drops_connection::clear()?;
        attempt.remember = false;
    }
    Ok(())
}

fn configured_client() -> Option<&'static str> {
    if cfg!(feature = "microsoft-store") {
        return None;
    }
    option_env!("BLINKSTREAM_EXPERIMENTAL_DROPS_CLIENT_ID").filter(|id| valid_client_id(id))
}

fn valid_client_id(id: &str) -> bool {
    (16..=64).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_alphanumeric())
}

fn label(session: &str) -> Result<String, String> {
    super::embedded_drops::host_label(session)?;
    Ok(format!("drops_probe_{session}"))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .use_rustls_tls()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "network".into())
}

async fn response_json(response: reqwest::Response) -> Result<Value, String> {
    let bytes = super::media_security::read_limited(response, 2 * 1024 * 1024)
        .await
        .map_err(|_| "network".to_string())?;
    serde_json::from_slice(&bytes).map_err(|_| "response".into())
}

async fn identity(token: &str) -> Result<Value, String> {
    if token.is_empty() || token.len() > 8192 {
        return Err("account".into());
    }
    let response = client()?
        .get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await
        .map_err(|_| "network".to_string())?;
    if !response.status().is_success() {
        return Err(if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            "authorization"
        } else {
            "network"
        }
        .into());
    }
    let value = response_json(response).await?;
    if value["user_id"].as_str().is_none_or(str::is_empty) {
        return Err("account".into());
    }
    Ok(value)
}

async fn main_identity() -> Result<Value, String> {
    let token = super::get_secret("twitch_token".into())
        .await
        .map_err(|_| "account".to_string())?;
    identity(&token).await
}

fn callback_token(url: &tauri::Url, state: &str) -> Result<String, String> {
    if url.scheme() != "https"
        || url.host_str() != Some("www.twitch.tv")
        || url.path() != "/"
        || url.port().is_some()
        || !url.username().is_empty()
    {
        return Err("authorization".into());
    }
    let parsed = tauri::Url::parse(&format!(
        "https://callback.invalid/?{}",
        url.fragment().unwrap_or_default()
    ))
    .map_err(|_| "authorization".to_string())?;
    let pairs: Vec<_> = parsed.query_pairs().collect();
    let exactly_one = |key: &str| {
        let values: Vec<_> = pairs.iter().filter(|(k, _)| k == key).collect();
        (values.len() == 1).then(|| values[0].1.to_string())
    };
    if exactly_one("state").as_deref() != Some(state)
        || pairs.iter().any(|(key, _)| key == "error")
        || exactly_one("token_type").as_deref() != Some("bearer")
    {
        return Err("authorization".into());
    }
    exactly_one("access_token")
        .filter(|token| {
            !token.is_empty()
                && token.len() <= 8192
                && token.bytes().all(|b| b.is_ascii_alphanumeric())
        })
        .ok_or_else(|| "authorization".into())
}

fn same_identity(value: &Value, owner: &str, expected_client: Option<&str>) -> bool {
    value["user_id"].as_str() == Some(owner)
        && expected_client.is_none_or(|id| value["client_id"].as_str() == Some(id))
}

fn active(attempt: &Attempt, session: &str) -> bool {
    attempt.session == session && attempt.expires > Instant::now()
}

fn credential_lifetime(seconds: Option<u64>) -> Result<Duration, String> {
    match seconds {
        Some(0) => Ok(Duration::from_secs(600)),
        Some(seconds) => Ok(Duration::from_secs(seconds.min(86400))),
        None => Ok(Duration::from_secs(600)),
    }
}

fn close_host(app: &AppHandle, session: &str) {
    if let Ok(label) = label(session) {
        if let Some(view) = app.get_webview(&label) {
            let _ = view.close();
        }
    }
}

async fn finish(app: AppHandle, session: String, token: String, owner: String) {
    let result = async {
        let metadata = identity(&token).await?;
        if !same_identity(&metadata, &owner, configured_client())
            || !same_identity(&main_identity().await?, &owner, None)
        {
            return Err("account".to_string());
        }
        credential_lifetime(metadata["expires_in"].as_u64())
    }
    .await;
    if let Ok(mut slot) = ATTEMPT.lock() {
        if let Some(attempt) = slot
            .as_mut()
            .filter(|a| active(a, &session) && a.phase == "checking")
        {
            match result {
                Ok(lifetime) => {
                    attempt.token = Some(token);
                    attempt.phase = "connected";
                    attempt.expires = Instant::now() + lifetime;
                    attempt.expires_at = super::drops_connection::now()
                        .unwrap_or(0)
                        .saturating_add(lifetime.as_secs());
                }
                Err(error) => {
                    attempt.token = None;
                    attempt.phase = match error.as_str() {
                        "account" => "account",
                        "authorization" => "authorization",
                        "network" => "network",
                        _ => "response",
                    };
                }
            }
        }
    }
    close_host(&app, &session);
}

#[tauri::command]
pub async fn experimental_drops_status(
    webview: Webview,
    session: Option<String>,
) -> Result<Value, String> {
    super::embedded_drops::require_ui(&webview)?;
    if configured_client().is_some() && session.is_none() {
        restore_connection().await?;
    }
    let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
    if slot.as_ref().is_some_and(|a| a.expires <= Instant::now()) {
        if slot.as_ref().is_some_and(|a| a.remember) {
            super::drops_connection::clear()?;
        }
        *slot = None;
    }
    let status = slot
        .as_ref()
        .filter(|a| session.is_none() || session.as_deref() == Some(&a.session));
    Ok(
        json!({ "enabled": configured_client().is_some(), "phase": status.map_or("idle", |a| a.phase),
        "login": status.map(|a| &a.login), "accountId": status.map(|a| &a.owner),
        "session": status.map(|a| &a.session), "remember": status.is_some_and(|a| a.remember),
        "claimBlocked": status.is_some_and(|a| a.claim_blocked) }),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn mount_experimental_drops_auth(
    app: AppHandle,
    webview: Webview,
    session: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    super::embedded_drops::require_ui(&webview)?;
    let client_id = configured_client().ok_or("disabled")?;
    let host = label(&session)?;
    super::embedded_drops::check_bounds(&app, x, y, width, height)?;
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random).map_err(|_| "authorization")?;
    let state: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    {
        let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
        if slot.as_ref().is_some_and(|a| a.expires > Instant::now()) {
            return Err("busy".into());
        }
        *slot = Some(Attempt {
            session: session.clone(),
            state: state.clone(),
            owner: String::new(),
            login: String::new(),
            token: None,
            phase: "preparing",
            expires: Instant::now() + Duration::from_secs(600),
            inventory: None,
            device: String::new(),
            claim_started: false,
            claim_attempts: HashSet::new(),
            claim_blocked: false,
            remember: false,
            expires_at: 0,
        });
    }
    let expiry_app = app.clone();
    let expiry_session = session.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let remaining = ATTEMPT.lock().ok().and_then(|slot| {
                slot.as_ref()
                    .filter(|a| a.session == expiry_session)
                    .map(|a| a.expires.saturating_duration_since(Instant::now()))
            });
            let Some(remaining) = remaining else { break };
            if !remaining.is_zero() {
                tokio::time::sleep(remaining).await;
                continue;
            }
            if let Ok(mut slot) = ATTEMPT.lock() {
                if slot
                    .as_ref()
                    .is_some_and(|a| a.session == expiry_session && a.expires <= Instant::now())
                {
                    if slot.as_ref().is_some_and(|a| a.remember) {
                        let _ = super::drops_connection::clear();
                    }
                    *slot = None;
                }
            }
            close_host(&expiry_app, &expiry_session);
            break;
        }
    });
    let main = main_identity().await?;
    let mut url: tauri::Url = "https://id.twitch.tv/oauth2/authorize"
        .parse()
        .map_err(|_| "authorization")?;
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id),
        ("response_type", "token"),
        ("redirect_uri", "https://www.twitch.tv/"),
        ("scope", ""),
        ("state", &state),
    ]);
    let navigation_app = app.clone();
    let navigation_session = session.clone();
    let builder = tauri::WebviewBuilder::new(&host, tauri::WebviewUrl::External(url))
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_navigation(move |url| {
            if url
                .fragment()
                .is_some_and(|f| f.contains("access_token") || f.contains("error="))
            {
                if let Ok(mut slot) = ATTEMPT.lock() {
                    if let Some(attempt) = slot
                        .as_mut()
                        .filter(|a| active(a, &navigation_session) && a.phase == "authorizing")
                    {
                        match callback_token(url, &attempt.state) {
                            Ok(token) => {
                                attempt.phase = "checking";
                                tauri::async_runtime::spawn(finish(
                                    navigation_app.clone(),
                                    navigation_session.clone(),
                                    token,
                                    attempt.owner.clone(),
                                ));
                            }
                            Err(_) => {
                                attempt.phase = "authorization";
                                let app = navigation_app.clone();
                                let session = navigation_session.clone();
                                tauri::async_runtime::spawn(async move {
                                    close_host(&app, &session);
                                });
                            }
                        }
                    }
                }
                return false;
            }
            url.scheme() == "https"
                && matches!(
                    url.host_str(),
                    Some("www.twitch.tv" | "id.twitch.tv" | "passport.twitch.tv")
                )
        });
    let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
    let attempt = slot
        .as_mut()
        .filter(|a| active(a, &session))
        .ok_or("cancelled")?;
    attempt.owner = main["user_id"].as_str().ok_or("account")?.into();
    attempt.login = main["login"].as_str().unwrap_or_default().into();
    attempt.phase = "authorizing";
    app.get_window("main")
        .ok_or("window")?
        .add_child(
            builder,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|_| "window".to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_experimental_drops_bounds(
    app: AppHandle,
    webview: Webview,
    session: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    super::embedded_drops::require_ui(&webview)?;
    super::embedded_drops::check_bounds(&app, x, y, width, height)?;
    if let Some(view) = app.get_webview(&label(&session)?) {
        view.set_position(tauri::LogicalPosition::new(x, y))
            .map_err(|_| "window")?;
        view.set_size(tauri::LogicalSize::new(width, height))
            .map_err(|_| "window")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn disconnect_experimental_drops(
    app: AppHandle,
    webview: Webview,
    session: String,
) -> Result<(), String> {
    super::embedded_drops::require_ui(&webview)?;
    label(&session)?;
    let cleanup = {
        let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
        if slot.as_ref().is_some_and(|a| a.session == session) {
            *slot = None;
            ACCOUNT_EPOCH.fetch_add(1, Ordering::SeqCst);
            RESTORE_ALLOWED.store(false, Ordering::SeqCst);
            super::drops_connection::clear()
        } else {
            Ok(())
        }
    };
    close_host(&app, &session);
    cleanup
}

async fn request(
    token: &str,
    payload: &Value,
    device: &str,
    session: &str,
) -> Result<Value, String> {
    let response = client()?
        .post("https://gql.twitch.tv/gql")
        .header("Client-ID", configured_client().ok_or("disabled")?)
        .header("Authorization", format!("OAuth {token}"))
        .header("Origin", "https://www.twitch.tv")
        .header("Referer", "https://www.twitch.tv/")
        .header("Accept", "application/json")
        .header("Accept-Language", "en-US")
        .header("X-Device-Id", device)
        .header("Client-Session-Id", session)
        .json(payload)
        .send()
        .await
        .map_err(|_| "network")?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err("authorization".into());
    }
    if !response.status().is_success() {
        return Err("network".into());
    }
    let value = response_json(response).await?;
    if value
        .get("errors")
        .and_then(Value::as_array)
        .is_some_and(|e| !e.is_empty())
    {
        return Err(if value["errors"]
            .to_string()
            .to_lowercase()
            .contains("integrity")
        {
            "integrity"
        } else {
            "response"
        }
        .into());
    }
    Ok(value)
}

async fn query(token: &str, query: &str, device: &str, session: &str) -> Result<Value, String> {
    request(
        token,
        &json!({"query": query, "variables": {}}),
        device,
        session,
    )
    .await
}

#[tauri::command]
pub async fn experimental_drops_probe(webview: Webview, session: String) -> Result<Value, String> {
    super::embedded_drops::require_ui(&webview)?;
    configured_client().ok_or("disabled")?;
    let _io_guard = SESSION_IO_LOCK.lock().await;
    let (owner, login, token) = {
        let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
        let attempt = slot
            .as_mut()
            .filter(|a| active(a, &session) && a.phase == "connected")
            .ok_or("authorization")?;
        (
            attempt.owner.clone(),
            attempt.login.clone(),
            attempt.token.clone().ok_or("authorization")?,
        )
    };
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    let mut random_device = [0_u8; 16];
    getrandom::fill(&mut random_device).map_err(|_| "state")?;
    let device: String = random_device
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let catalog = query(&token, super::drops_catalog::QUERY, &device, &session).await?;
    let inventory = query(
        &token,
        super::TWITCH_DROPS_INVENTORY_QUERY,
        &device,
        &session,
    )
    .await?;
    let catalog = super::drops_catalog::parse_catalog_response(&catalog).map_err(|_| "response")?;
    let inventory = super::drops_response_array(
        &inventory,
        "/data/currentUser/inventory/dropCampaignsInProgress",
    )
    .map_err(|_| "response")?;
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
    let attempt = slot
        .as_mut()
        .filter(|a| active(a, &session) && a.phase == "connected")
        .ok_or("cancelled")?;
    attempt.inventory = Some(inventory.clone());
    attempt.device = device;
    Ok(
        json!({"campaigns": inventory, "catalogCampaigns": catalog, "accountLogin": login, "accountId": owner,
        "status": "ready", "updatedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "state")?.as_millis() as u64}),
    )
}

const CONNECTED_POINTS_QUERY: &str = "query ConnectedPoints($login: String!) { currentUser { id } user(login: $login) { id login channel { self { communityPoints { balance } } communityPointsSettings { name } } } }";

fn points_result(value: &Value, owner: &str, channel: &str) -> Result<Value, String> {
    if value
        .pointer("/data/currentUser/id")
        .and_then(Value::as_str)
        != Some(owner)
    {
        return Err("account".into());
    }
    let user = &value["data"]["user"];
    if user["login"]
        .as_str()
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some(channel)
        || user["id"].as_str().is_none_or(str::is_empty)
    {
        return Err("response".into());
    }
    let balance = user
        .pointer("/channel/self/communityPoints/balance")
        .and_then(Value::as_u64);
    Ok(
        json!({ "accountId": owner, "channel": channel, "channelId": user["id"], "balance": balance,
        "pointsName": user.pointer("/channel/communityPointsSettings/name").and_then(Value::as_str) }),
    )
}

#[tauri::command]
pub async fn read_connected_channel_points(
    webview: Webview,
    session: String,
    channel: String,
) -> Result<Value, String> {
    super::embedded_drops::require_ui(&webview)?;
    configured_client().ok_or("disabled")?;
    super::validate_channel(&channel)?;
    let channel = channel.to_ascii_lowercase();
    let _guard = SESSION_IO_LOCK.lock().await;
    let (owner, token, device) = {
        let slot = ATTEMPT.lock().map_err(|_| "state")?;
        let attempt = slot
            .as_ref()
            .filter(|a| active(a, &session) && a.phase == "connected")
            .ok_or("authorization")?;
        (
            attempt.owner.clone(),
            attempt.token.clone().ok_or("authorization")?,
            attempt.device.clone(),
        )
    };
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    let data = request(
        &token,
        &json!({"query": CONNECTED_POINTS_QUERY, "variables": {"login": channel}}),
        &device,
        &session,
    )
    .await?;
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    require_connected(&session, &owner)?;
    points_result(&data, &owner, &channel)
}

fn reward_connection(session: &str) -> Result<(String, String, String), String> {
    configured_client().ok_or("disabled")?;
    let slot = ATTEMPT.lock().map_err(|_| "state")?;
    let attempt = slot
        .as_ref()
        .filter(|a| active(a, session) && a.phase == "connected")
        .ok_or("authorization")?;
    Ok((
        attempt.owner.clone(),
        attempt.token.clone().ok_or("authorization")?,
        attempt.device.clone(),
    ))
}

async fn reward_snapshot(
    session: &str,
    channel: &str,
    owner: &str,
    token: &str,
    device: &str,
) -> Result<Value, String> {
    if !same_identity(&main_identity().await?, owner, None) {
        return Err("account".into());
    }
    let value = request(
        token,
        &json!({"query":super::viewer_rewards::QUERY,"variables":{"login":channel}}),
        device,
        session,
    )
    .await?;
    require_connected(session, owner)?;
    if !same_identity(&main_identity().await?, owner, None) {
        return Err("account".into());
    }
    super::viewer_rewards::catalog(&value, owner, channel)
}

#[tauri::command]
pub async fn read_connected_channel_rewards(
    webview: Webview,
    session: String,
    channel: String,
) -> Result<Value, String> {
    super::embedded_drops::require_ui(&webview)?;
    super::validate_channel(&channel)?;
    let _guard = SESSION_IO_LOCK.lock().await;
    let (owner, token, device) = reward_connection(&session)?;
    reward_snapshot(
        &session,
        &channel.to_ascii_lowercase(),
        &owner,
        &token,
        &device,
    )
    .await
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RewardIntent {
    session: String,
    channel: String,
    reward_id: String,
    expected_cost: u64,
    expected_title: String,
    text: String,
    request_id: String,
    confirmed: bool,
}

#[tauri::command]
pub async fn redeem_connected_channel_reward(
    webview: Webview,
    intent: RewardIntent,
) -> Result<Value, String> {
    use super::viewer_rewards::{self, Outcome};
    super::embedded_drops::require_ui(&webview)?;
    super::validate_channel(&intent.channel)?;
    if !intent.confirmed
        || !viewer_rewards::valid_request(&intent.request_id)
        || intent.reward_id.is_empty()
        || intent.reward_id.len() > 128
        || intent.expected_title.chars().count() > 500
        || intent.text.chars().count() > 500
    {
        return Err("input".into());
    }
    let _guard = SESSION_IO_LOCK.try_lock().map_err(|_| "busy")?;
    let (owner, token, device) = reward_connection(&intent.session)?;
    let channel = intent.channel.to_ascii_lowercase();
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    let mut ledger = viewer_rewards::load(&owner)?;
    if let Some(previous) = ledger.previous(&intent.request_id, &channel, &intent.reward_id)? {
        return match previous {
            Outcome::Accepted => Ok(json!({"status":"accepted","requestId":intent.request_id})),
            Outcome::Rejected => Err("rejected".into()),
            Outcome::Pending => Err("unconfirmed".into()),
        };
    }
    let snapshot = reward_snapshot(&intent.session, &channel, &owner, &token, &device).await?;
    let body = viewer_rewards::prepare(
        &snapshot,
        &intent.reward_id,
        intent.expected_cost,
        &intent.expected_title,
        &intent.text,
        &intent.request_id,
    )?;
    ledger.reserve(&intent.request_id, &channel, &intent.reward_id)?;
    viewer_rewards::save(&owner, &ledger)?;
    let still_connected = require_connected(&intent.session, &owner).is_ok();
    let still_owner = main_identity()
        .await
        .is_ok_and(|identity| same_identity(&identity, &owner, None));
    if !still_connected || !still_owner {
        ledger.settle(&intent.request_id, Outcome::Rejected);
        viewer_rewards::save(&owner, &ledger)?;
        return Err("account".into());
    }
    let result = request(&token, &body, &device, &intent.session)
        .await
        .map_err(|_| "unconfirmed")?;
    let outcome = viewer_rewards::outcome(&result);
    ledger.settle(&intent.request_id, outcome.clone());
    viewer_rewards::save(&owner, &ledger)?;
    require_connected(&intent.session, &owner)?;
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    match outcome {
        Outcome::Accepted => Ok(json!({"status":"accepted","requestId":intent.request_id})),
        Outcome::Rejected => Err(viewer_rewards::rejection(&result).into()),
        Outcome::Pending => Err("unconfirmed".into()),
    }
}

fn eligible_drop_id(campaigns: &Value, instance: &str) -> Result<String, String> {
    if instance.is_empty() || instance.len() > 1024 {
        return Err("not-eligible".into());
    }
    for campaign in campaigns.as_array().into_iter().flatten() {
        for drop in campaign["timeBasedDrops"].as_array().into_iter().flatten() {
            if drop.pointer("/self/dropInstanceID").and_then(Value::as_str) != Some(instance) {
                continue;
            }
            let required = drop["requiredMinutesWatched"]
                .as_f64()
                .filter(|v| v.is_finite() && *v > 0.0);
            let watched = drop
                .pointer("/self/currentMinutesWatched")
                .and_then(Value::as_f64);
            if !required
                .zip(watched)
                .is_some_and(|(required, watched)| watched.is_finite() && watched >= required)
                || drop.pointer("/self/isClaimed").and_then(Value::as_bool) != Some(false)
            {
                return Err("not-eligible".into());
            }
            return drop["id"]
                .as_str()
                .filter(|id| !id.is_empty() && id.len() <= 256)
                .map(str::to_owned)
                .ok_or_else(|| "not-eligible".into());
        }
    }
    Err("not-eligible".into())
}

fn require_connected(session: &str, owner: &str) -> Result<(), String> {
    let slot = ATTEMPT.lock().map_err(|_| "state")?;
    if slot
        .as_ref()
        .is_some_and(|a| active(a, session) && a.phase == "connected" && a.owner == owner)
    {
        Ok(())
    } else {
        Err("cancelled".into())
    }
}

fn reserve_claim(attempt: &mut Attempt, session: &str, instance: &str) -> Result<String, String> {
    if !active(attempt, session)
        || attempt.phase != "connected"
        || attempt.claim_started
        || attempt.claim_blocked
        || attempt.claim_attempts.contains(instance)
    {
        return Err("authorization".into());
    }
    let id = eligible_drop_id(attempt.inventory.as_ref().ok_or("not-eligible")?, instance)?;
    attempt.claim_started = true;
    attempt.claim_attempts.insert(instance.to_string());
    Ok(id)
}

fn claim_inventory_result(inventory: &Value, outcome: &str) -> Result<Value, String> {
    let campaigns = super::drops_response_array(
        inventory,
        "/data/currentUser/inventory/dropCampaignsInProgress",
    )
    .map_err(|_| "response")?;
    Ok(json!({"campaigns": campaigns, "outcome": outcome,
        "updatedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "state")?.as_millis() as u64}))
}

#[tauri::command]
pub async fn claim_experimental_drop(
    webview: Webview,
    session: String,
    instance: String,
) -> Result<Value, String> {
    super::embedded_drops::require_ui(&webview)?;
    configured_client().ok_or("disabled")?;
    let _io_guard = SESSION_IO_LOCK.lock().await;
    let _claim_guard = super::OFFICIAL_DROPS_CLAIM_LOCK
        .try_lock()
        .map_err(|_| "busy")?;
    let (owner, token, device, drop_id) = {
        let mut slot = ATTEMPT.lock().map_err(|_| "state")?;
        let attempt = slot.as_mut().ok_or("authorization")?;
        let drop_id = reserve_claim(attempt, &session, &instance)?;
        if let Err(error) = save_connection(attempt) {
            attempt.claim_started = false;
            attempt.claim_blocked = true;
            return Err(error);
        }
        (
            attempt.owner.clone(),
            attempt.token.clone().ok_or("authorization")?,
            attempt.device.clone(),
            drop_id,
        )
    };
    let result = perform_claim(
        session.clone(),
        instance,
        owner.clone(),
        token,
        device,
        drop_id,
    )
    .await;
    if let Ok(mut slot) = ATTEMPT.lock() {
        if let Some(attempt) = slot
            .as_mut()
            .filter(|a| active(a, &session) && a.owner == owner)
        {
            attempt.claim_started = false;
            match &result {
                Ok(data) => attempt.inventory = data.get("campaigns").cloned(),
                Err(_) => attempt.claim_blocked = true,
            }
            if save_connection(attempt).is_err() {
                attempt.claim_blocked = true;
                return Err("storage".into());
            }
        }
    }
    result
}

async fn perform_claim(
    session: String,
    instance: String,
    owner: String,
    token: String,
    device: String,
    drop_id: String,
) -> Result<Value, String> {
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    require_connected(&session, &owner)?;
    let inventory = query(
        &token,
        super::TWITCH_DROPS_INVENTORY_QUERY,
        &device,
        &session,
    )
    .await?;
    if !same_identity(&main_identity().await?, &owner, None) {
        return Err("account".into());
    }
    require_connected(&session, &owner)?;
    if super::official_drop_claim_confirmed(&inventory, &drop_id).map_err(|_| "response")? {
        require_connected(&session, &owner)?;
        return claim_inventory_result(&inventory, "already-claimed");
    }
    let campaigns = super::drops_response_array(
        &inventory,
        "/data/currentUser/inventory/dropCampaignsInProgress",
    )
    .map_err(|_| "response")?;
    if eligible_drop_id(&campaigns, &instance)? != drop_id {
        return Err("not-eligible".into());
    }
    require_connected(&session, &owner)?;
    let mutation = request(
        &token,
        &super::drops_claim::persisted_claim_request(&instance),
        &device,
        &session,
    )
    .await
    .map_err(|error| {
        if error == "integrity" {
            error
        } else {
            "uncertain".into()
        }
    })?;
    match super::drops_claim::classify(&mutation) {
        super::drops_claim::ClaimResponse::Rejected => return Err("rejected".into()),
        super::drops_claim::ClaimResponse::Unknown => return Err("uncertain".into()),
        super::drops_claim::ClaimResponse::Accepted => (),
    }
    for _ in 0..3 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        require_connected(&session, &owner)?;
        let inventory = query(
            &token,
            super::TWITCH_DROPS_INVENTORY_QUERY,
            &device,
            &session,
        )
        .await
        .map_err(|_| "uncertain")?;
        if super::official_drop_claim_confirmed(&inventory, &drop_id).map_err(|_| "uncertain")? {
            if !same_identity(&main_identity().await?, &owner, None) {
                return Err("account".into());
            }
            require_connected(&session, &owner)?;
            return claim_inventory_result(&inventory, "claimed");
        }
    }
    Err("uncertain".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn points_snapshot_preserves_zero_unknown_and_identity_boundaries() {
        let data = json!({"data":{"currentUser":{"id":"100"},"user":{"id":"200","login":"channel","channel":{"self":{"communityPoints":{"balance":0}}}}}});
        assert_eq!(
            points_result(&data, "100", "channel").unwrap()["balance"],
            0
        );
        assert!(points_result(&data, "other", "channel").is_err());
        assert!(points_result(&data, "100", "elsewhere").is_err());
        let mut unknown = data.clone();
        unknown["data"]["user"]["channel"]["self"] = Value::Null;
        assert!(points_result(&unknown, "100", "channel").unwrap()["balance"].is_null());
    }
    #[test]
    fn connection_uses_verified_expiry_with_a_bounded_memory_lifetime() {
        assert_eq!(
            credential_lifetime(Some(3600)).unwrap(),
            Duration::from_secs(3600)
        );
        assert_eq!(
            credential_lifetime(Some(u64::MAX)).unwrap(),
            Duration::from_secs(86400)
        );
        assert_eq!(
            credential_lifetime(Some(0)).unwrap(),
            Duration::from_secs(600)
        );
        assert_eq!(credential_lifetime(None).unwrap(), Duration::from_secs(600));
    }
    fn pending_inventory() -> Value {
        json!([{"timeBasedDrops":[{"id":"drop", "requiredMinutesWatched":60,
            "self":{"currentMinutesWatched":60,"isClaimed":false,"dropInstanceID":"issued-instance"}}]}])
    }
    #[test]
    fn manual_claim_accepts_only_an_issued_pending_complete_instance() {
        let inventory = pending_inventory();
        assert_eq!(
            eligible_drop_id(&inventory, "issued-instance").unwrap(),
            "drop"
        );
        for instance in ["", "fabricated", "issued-instance:job-timestamp"] {
            assert!(eligible_drop_id(&inventory, instance).is_err());
        }
        for (pointer, value) in [
            ("/0/timeBasedDrops/0/self/currentMinutesWatched", json!(59)),
            ("/0/timeBasedDrops/0/self/isClaimed", json!(true)),
            ("/0/timeBasedDrops/0/requiredMinutesWatched", json!(0)),
            ("/0/timeBasedDrops/0/self/isClaimed", Value::Null),
            ("/0/timeBasedDrops/0/self/dropInstanceID", Value::Null),
        ] {
            let mut invalid = inventory.clone();
            *invalid.pointer_mut(pointer).unwrap() = value;
            assert!(eligible_drop_id(&invalid, "issued-instance").is_err());
        }
    }
    #[test]
    fn a_claim_reservation_is_session_scoped_and_cannot_be_repeated() {
        let session = "a".repeat(32);
        let mut attempt = Attempt {
            session: session.clone(),
            state: String::new(),
            owner: "owner".into(),
            login: String::new(),
            token: Some("test-only".into()),
            phase: "connected",
            expires: Instant::now() + Duration::from_secs(600),
            inventory: Some(pending_inventory()),
            device: "b".repeat(32),
            claim_started: false,
            claim_attempts: HashSet::new(),
            claim_blocked: false,
            remember: false,
            expires_at: 0,
        };
        assert!(reserve_claim(&mut attempt, &"c".repeat(32), "issued-instance").is_err());
        assert!(!attempt.claim_started);
        assert_eq!(
            reserve_claim(&mut attempt, &session, "issued-instance").unwrap(),
            "drop"
        );
        assert!(attempt.claim_started);
        attempt.claim_started = false;
        assert!(reserve_claim(&mut attempt, &session, "issued-instance").is_err());
        let mut second = pending_inventory();
        second[0]["timeBasedDrops"][0]["self"]["dropInstanceID"] = json!("second");
        attempt.inventory = Some(second);
        assert!(reserve_claim(&mut attempt, &session, "second").is_ok());
        attempt.claim_started = false;
        attempt.claim_blocked = true;
        assert!(reserve_claim(&mut attempt, &session, "third").is_err());
    }
    #[test]
    fn client_identifiers_are_bounded_without_assuming_a_fixed_length() {
        for length in [16, 30, 31, 32, 64] {
            assert!(valid_client_id(&"a".repeat(length)));
        }
        for invalid in [
            String::new(),
            "a".repeat(15),
            "a".repeat(65),
            "contains spaces here".into(),
        ] {
            assert!(!valid_client_id(&invalid));
        }
        if cfg!(feature = "microsoft-store")
            || option_env!("BLINKSTREAM_EXPERIMENTAL_DROPS_CLIENT_ID").is_none()
        {
            assert!(configured_client().is_none());
        }
    }
    #[test]
    fn oauth_callback_is_bound_to_origin_state_and_single_parameters() {
        let valid = "https://www.twitch.tv/#access_token=abc123&token_type=bearer&state=expected";
        assert_eq!(
            callback_token(&valid.parse().unwrap(), "expected").unwrap(),
            "abc123"
        );
        for invalid in [
            valid.replace("www.twitch.tv", "evil.test"),
            valid.replace("https:", "http:"),
            valid.replace("expected", "wrong"),
            format!("{valid}&state=expected"),
            format!("{valid}&access_token=second"),
            format!("{valid}&error=denied"),
            valid.replace("bearer", "other"),
            valid.replace("/#", "/login#"),
        ] {
            assert!(callback_token(&invalid.parse().unwrap(), "expected").is_err());
        }
    }
    #[test]
    fn token_must_match_owner_and_client() {
        let value = json!({"user_id":"owner", "client_id":"client"});
        assert!(same_identity(&value, "owner", Some("client")));
        assert!(!same_identity(&value, "other", Some("client")));
        assert!(!same_identity(&value, "owner", Some("other")));
    }
    #[test]
    fn expired_or_cancelled_sessions_cannot_publish_results() {
        let mut attempt = Attempt {
            session: "a".repeat(32),
            state: "csrf".into(),
            owner: "owner".into(),
            login: String::new(),
            token: None,
            phase: "connected",
            expires: Instant::now() + Duration::from_secs(600),
            inventory: None,
            device: String::new(),
            claim_started: false,
            claim_attempts: HashSet::new(),
            claim_blocked: false,
            remember: false,
            expires_at: 0,
        };
        assert!(active(&attempt, &"a".repeat(32)));
        assert!(!active(&attempt, &"b".repeat(32)));
        attempt.expires -= Duration::from_secs(601);
        assert!(!active(&attempt, &"a".repeat(32)));
        assert!(label("main").is_err());
    }
}
