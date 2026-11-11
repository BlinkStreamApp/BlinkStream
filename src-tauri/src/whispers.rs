use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Manager, Webview};

static SEND_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn valid_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 32 && value.bytes().all(|c| c.is_ascii_digit())
}

fn validate_message(account: &str, target: &str, message: &str) -> Result<(), String> {
    if !valid_id(account) || !valid_id(target) || account == target {
        return Err("recipient".into());
    }
    if message.trim().is_empty() || message.chars().count() > 500 {
        return Err("message".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn send_native_whisper(
    app: AppHandle,
    webview: Webview,
    account: String,
    target: String,
    message: String,
    web_session: bool,
) -> Result<Value, String> {
    crate::embedded_drops::require_ui(&webview)?;
    validate_message(&account, &target, &message)?;
    let _guard = SEND_LOCK.try_lock().map_err(|_| "busy")?;
    let primary = crate::get_secret("twitch_token".into()).await?;
    let main = app.get_webview("main").ok_or("authorization")?;
    let token = if web_session {
        crate::twitch_webview_auth_token(&main)
            .await?
            .ok_or("web-session")?
    } else {
        primary.clone()
    };
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "connection")?;
    if crate::playback_user_id(&client, &primary).await.as_deref() != Some(&account) {
        return Err("account".into());
    }
    let response = client
        .get("https://id.twitch.tv/oauth2/validate")
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await
        .map_err(|_| "connection")?;
    if !response.status().is_success() {
        return Err("authorization".into());
    }
    let bytes = crate::media_security::read_limited(response, 16384)
        .await
        .map_err(|_| "authorization")?;
    let identity: Value = serde_json::from_slice(&bytes).map_err(|_| "authorization")?;
    if identity["user_id"].as_str() != Some(&account) {
        return Err("account".into());
    }
    if !identity["scopes"]
        .as_array()
        .is_some_and(|s| s.iter().any(|v| v == "user:manage:whispers"))
    {
        return Err("permission".into());
    }
    let client_id = identity["client_id"]
        .as_str()
        .filter(|s| !s.is_empty())
        .ok_or("authorization")?;
    if crate::get_secret("twitch_token".into()).await? != primary {
        return Err("account".into());
    }
    if web_session && crate::twitch_webview_auth_token(&main).await?.as_deref() != Some(&token) {
        return Err("account".into());
    }
    let response = client
        .post("https://api.twitch.tv/helix/whispers")
        .query(&[("from_user_id", &account), ("to_user_id", &target)])
        .header("Authorization", format!("Bearer {token}"))
        .header("Client-ID", client_id)
        .json(&json!({"message":message.trim()}))
        .send()
        .await
        .map_err(|_| "unconfirmed")?;
    match response.status().as_u16() {
        204 => Ok(json!({"status":"accepted"})),
        401 => Err("permission".into()),
        400 | 403 => Err("recipient-policy".into()),
        429 => Err("rate-limit".into()),
        _ => Err("unconfirmed".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_recipients_and_oversized_messages() {
        assert!(validate_message("1", "2", "hello").is_ok());
        for (target, message) in [("1", "hello"), ("x&to=3", "hello"), ("2", " ")] {
            assert!(validate_message("1", target, message).is_err());
        }
        assert!(validate_message("1", "2", &"a".repeat(501)).is_err());
        assert!(validate_message("1", "2", &"😀".repeat(500)).is_ok());
    }
}
