use serde_json::{json, Value};
use std::time::Duration;

fn parse_roster(value: &Value) -> Result<Value, String> {
    if value
        .get("errors")
        .and_then(Value::as_array)
        .is_some_and(|errors| !errors.is_empty())
    {
        return Err("response".into());
    }
    let roster = value
        .pointer("/data/channel/chatters")
        .filter(|v| v.is_object())
        .ok_or("response")?;
    let mut users = Vec::new();
    for role in [
        "broadcasters",
        "moderators",
        "vips",
        "staff",
        "chatbots",
        "viewers",
    ] {
        let entries = roster[role].as_array().ok_or("response")?;
        for entry in entries.iter().take(1000) {
            let login = entry["login"]
                .as_str()
                .filter(|s| valid_login(s))
                .ok_or("response")?;
            users.push(json!({"user_login": login, "user_name": login,
                "isBroadcaster": role == "broadcasters", "isMod": matches!(role, "moderators" | "staff"),
                "isVip": role == "vips"}));
        }
    }
    Ok(json!({"users": users, "total": roster["count"].as_u64(), "source": "public"}))
}

fn valid_login(login: &str) -> bool {
    !login.is_empty()
        && login.len() <= 25
        && login
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_')
}

#[tauri::command]
pub async fn get_public_chat_roster(
    webview: tauri::Webview,
    channel: String,
) -> Result<Value, String> {
    super::embedded_drops::require_ui(&webview)?;
    if !valid_login(&channel) {
        return Err("channel".into());
    }
    let client_id = option_env!("BLINKSTREAM_EXPERIMENTAL_DROPS_CLIENT_ID")
        .filter(|_| !cfg!(feature = "microsoft-store"))
        .ok_or("disabled")?;
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "network")?;
    let response = client.post("https://gql.twitch.tv/gql").header("Client-ID", client_id)
        .json(&json!({"query": "query CommunityRoster($login: String!) { channel(name: $login) { chatters { count broadcasters { login } moderators { login } vips { login } staff { login } chatbots { login } viewers { login } } } }", "variables": {"login": channel.to_lowercase()}}))
        .send().await.map_err(|_| "network")?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let bytes = super::media_security::read_limited(response, 2 * 1024 * 1024)
        .await
        .map_err(|_| "response")?;
    let value = serde_json::from_slice(&bytes).map_err(|_| "response")?;
    parse_roster(&value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_public_roles_without_claiming_full_presence() {
        let value = json!({"data":{"channel":{"chatters":{"count":200,"broadcasters":[{"login":"owner"}],"moderators":[{"login":"mod"}],"vips":[],"staff":[],"chatbots":[],"viewers":[{"login":"alice"}]}}}});
        let result = parse_roster(&value).unwrap();
        assert_eq!(result["total"], 200);
        assert_eq!(result["users"].as_array().unwrap().len(), 3);
        assert_eq!(result["users"][0]["isBroadcaster"], true);
        assert_eq!(result["users"][1]["isMod"], true);
        assert!(parse_roster(&json!({"errors":[{"message":"denied"}]})).is_err());
        assert!(parse_roster(&json!({"data":{"channel":null}})).is_err());
        assert!(!valid_login("a\" }"));
    }
}
