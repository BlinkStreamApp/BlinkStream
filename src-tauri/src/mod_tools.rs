use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Manager, Webview};

#[derive(Deserialize)]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
pub enum ReadOperation {
    History,
    Rewards,
}

fn operation_available(operation: &ReadOperation) -> bool {
    !cfg!(feature = "microsoft-store") && !matches!(operation, ReadOperation::History)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 32 && id.bytes().all(|b| b.is_ascii_digit())
}

fn query(operation: &ReadOperation, channel: &str, target: &str) -> (&'static str, Value) {
    match operation {
        ReadOperation::History => (
            "query NativeViewerHistory($channel: ID!, $target: ID!) { logs: viewerCardModLogs(channelID:$channel,targetID:$target) { actions: targetedActions(first:50) { __typename ... on ModLogsTargetedActionsConnection { edges { node { id timestamp type localizedLabel { fallbackString } } } } ... on ModLogsTargetedActionsError { code } } messages(first:100) { __typename ... on ViewerCardModLogsMessagesConnection { edges { node { __typename ... on ViewerCardModLogsChatMessage { id sentAt isDeleted content { text } } } } } ... on ViewerCardModLogsMessagesError { code } } comments(first:20) { __typename ... on ModLogsCommentConnection { edges { node { id text timestamp author { login displayName } } } } ... on ModLogsCommentsError { code } } } }",
            json!({"channel":channel,"target":target}),
        ),
        ReadOperation::Rewards => (
            "query NativeRewardCatalog($channel: ID!) { channel(id:$channel) { communityPointsSettings { customRewards { id title cost prompt isEnabled isPaused isInStock isUserInputRequired } } } }",
            json!({"channel":channel}),
        ),
    }
}

fn text(v: &Value) -> String {
    v.as_str().unwrap_or_default().chars().take(4096).collect()
}

fn normalize(operation: &ReadOperation, value: &Value) -> Result<Value, String> {
    if value
        .get("errors")
        .and_then(Value::as_array)
        .is_some_and(|e| !e.is_empty())
    {
        return Err(
            "Twitch ha rechazado la consulta de herramientas; utiliza la vista oficial.".into(),
        );
    }
    match operation {
        ReadOperation::History => {
            let logs = value
                .pointer("/data/logs")
                .filter(|v| v.is_object())
                .ok_or("Historial no disponible para esta cuenta/canal")?;
            let mut out = json!({});
            let mut partial = false;
            for kind in ["actions", "messages", "comments"] {
                let block = &logs[kind];
                let available = block["edges"].is_array();
                partial |= !available;
                let items: Vec<Value> = block["edges"].as_array().into_iter().flatten().take(100).map(|edge| {
                    let n = &edge["node"];
                    json!({"id":text(&n["id"]),"timestamp":text(n.get("timestamp").unwrap_or(&n["sentAt"])),
                        "text":text(n.get("text").unwrap_or_else(|| n.pointer("/content/text").unwrap_or(&Value::Null))),
                        "label":text(&n["localizedLabel"]["fallbackString"]),"deleted":n["isDeleted"].as_bool().unwrap_or(false),
                        "author":text(n["author"].get("displayName").unwrap_or(&n["author"]["login"]))})
                }).collect();
                out[kind] = json!({"available":available,"items":items});
            }
            out["partial"] = json!(partial);
            Ok(out)
        }
        ReadOperation::Rewards => {
            let rewards = value
                .pointer("/data/channel/communityPointsSettings/customRewards")
                .and_then(Value::as_array)
                .ok_or("Catálogo no disponible")?;
            Ok(
                json!({"items":rewards.iter().take(200).map(|r| json!({"id":text(&r["id"]),"title":text(&r["title"]),"cost":r["cost"].as_u64(),"prompt":text(&r["prompt"]),"enabled":r["isEnabled"].as_bool(),"paused":r["isPaused"].as_bool(),"inStock":r["isInStock"].as_bool(),"inputRequired":r["isUserInputRequired"].as_bool()})).collect::<Vec<_>>() }),
            )
        }
    }
}

#[tauri::command]
pub async fn read_moderation_tool(
    app: AppHandle,
    webview: Webview,
    account: String,
    channel_id: String,
    target_id: Option<String>,
    operation: ReadOperation,
) -> Result<Value, String> {
    crate::embedded_drops::require_ui(&webview)?;
    if !operation_available(&operation) {
        return Err("La conexión experimental no está disponible en esta distribución".into());
    }
    let target = target_id.unwrap_or_default();
    if !valid_id(&account)
        || !valid_id(&channel_id)
        || matches!(operation, ReadOperation::History) && !valid_id(&target)
    {
        return Err("Identidad de herramientas inválida".into());
    }
    let main = app.get_webview("main").ok_or("Interfaz no disponible")?;
    let token = crate::twitch_webview_auth_token(&main)
        .await?
        .ok_or("Inicia sesión en Twitch oficial para conectar las herramientas")?;
    let primary = crate::get_secret("twitch_token".into()).await?;
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Conexión no disponible")?;
    let (web_id, primary_id) = tokio::join!(
        crate::playback_user_id(&client, &token),
        crate::playback_user_id(&client, &primary)
    );
    if web_id.as_deref() != Some(&account) || primary_id.as_deref() != Some(&account) {
        return Err("La sesión web no coincide con la cuenta de BlinkStream".into());
    }
    let (query, variables) = query(&operation, &channel_id, &target);
    let response = client
        .post("https://gql.twitch.tv/gql")
        .header("Client-ID", crate::TWITCH_WEB_CLIENT_ID)
        .header("Authorization", format!("OAuth {token}"))
        .json(&json!({"query":query,"variables":variables}))
        .send()
        .await
        .map_err(|_| "No se pudo consultar Twitch")?;
    if !response.status().is_success() {
        return Err(format!(
            "Herramientas Twitch: HTTP {}",
            response.status().as_u16()
        ));
    }
    let bytes = crate::media_security::read_limited(response, 2 * 1024 * 1024)
        .await
        .map_err(|_| "Respuesta de herramientas demasiado grande o incompleta")?;
    let value: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Respuesta de herramientas inválida")?;
    // Revalidate after the response so an account change cannot publish another identity's data.
    let latest = crate::get_secret("twitch_token".into()).await?;
    if latest != primary {
        return Err("La cuenta ha cambiado durante la consulta".into());
    }
    if crate::twitch_webview_auth_token(&main).await?.as_deref() != Some(&token) {
        return Err("La sesión web ha cambiado durante la consulta".into());
    }
    normalize(&operation, &value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn public_history_is_disabled_and_store_cannot_enable_web_tools() {
        assert!(!operation_available(&ReadOperation::History));
        assert_eq!(
            operation_available(&ReadOperation::Rewards),
            !cfg!(feature = "microsoft-store")
        );
    }

    #[test]
    fn validates_ids() {
        assert!(valid_id("123"));
        for s in ["", "abc", "1&x=2"] {
            assert!(!valid_id(s));
        }
    }
    #[test]
    fn preserves_partial_history_and_denials() {
        let value = json!({"data":{"logs":{"actions":{"edges":[]},"messages":{"code":"FORBIDDEN"},"comments":{"edges":[{"node":{"id":"1","text":"note","author":{"login":"mod"}}}]}}}});
        let result = normalize(&ReadOperation::History, &value).expect("valid partial history");
        assert_eq!(result["partial"], true);
        assert_eq!(result["messages"]["available"], false);
        assert_eq!(result["comments"]["items"][0]["text"], "note");
        assert!(normalize(
            &ReadOperation::History,
            &json!({"errors":[{"message":"denied"}]})
        )
        .is_err());
    }
    #[test]
    fn keeps_deleted_message_text_and_never_invents_catalog_availability() {
        let history = normalize(&ReadOperation::History, &json!({"data":{"logs":{"actions":{"edges":[]},"messages":{"edges":[{"node":{"id":"m","isDeleted":true,"content":{"text":"message"}}}]},"comments":{"edges":[]}}}})).expect("history");
        assert_eq!(history["messages"]["items"][0]["text"], "message");
        assert_eq!(history["messages"]["items"][0]["deleted"], true);
        let catalog = normalize(&ReadOperation::Rewards, &json!({"data":{"channel":{"communityPointsSettings":{"customRewards":[{"id":"r","title":"Reward"}]}}}})).expect("catalog");
        assert!(catalog["items"][0]["inStock"].is_null());
        assert!(normalize(&ReadOperation::Rewards, &json!({"data":{"channel":null}})).is_err());
    }
}
