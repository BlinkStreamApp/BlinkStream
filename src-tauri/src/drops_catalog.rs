use serde_json::Value;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

pub(crate) const QUERY: &str = "query DropsCatalog { currentUser { dropCampaigns { id name status startAt endAt imageURL game { name boxArtURL } timeBasedDrops { id name requiredMinutesWatched self { isClaimed } benefitEdges { benefit { name imageAssetURL } } } } } }";

struct CachedCatalog {
    account: String,
    fetched: Instant,
    result: Result<Value, String>,
}

impl CachedCatalog {
    fn for_account(&self, account: &str) -> Option<Result<Value, String>> {
        (self.account == account
            && (self.result.is_err() || self.fetched.elapsed() < Duration::from_secs(60)))
        .then(|| self.result.clone())
    }
}

static CACHE: OnceLock<Mutex<Option<CachedCatalog>>> = OnceLock::new();

pub(crate) fn clear() {
    if let Ok(mut cache) = CACHE.get_or_init(|| Mutex::new(None)).lock() {
        *cache = None;
    }
}

pub(crate) async fn fetch(account: &str, token: &str) -> Result<Value, String> {
    {
        let cache = CACHE
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|_| "No se pudo leer la caché de campañas".to_string())?;
        if let Some(result) = cache
            .as_ref()
            .and_then(|cached| cached.for_account(account))
        {
            return result;
        }
    }
    let response = tokio::time::timeout(
        Duration::from_secs(6),
        super::fetch_twitch_gql(QUERY.to_string(), None, Some(token.to_string()), None),
    )
    .await
    .map_err(|_| "La consulta del catálogo de Drops agotó el tiempo de espera".to_string())??;
    let result = parse_catalog_response(&response);
    if let Err(error) = &result {
        if !error.to_lowercase().contains("integrity") {
            return result;
        }
    }
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(None))
        .lock()
        .map_err(|_| "No se pudo guardar la caché de campañas".to_string())?;
    *cache = Some(CachedCatalog {
        account: account.to_string(),
        fetched: Instant::now(),
        result: result.clone(),
    });
    result
}

fn parse_catalog_response(response: &Value) -> Result<Value, String> {
    let campaigns = super::drops_response_array(response, "/data/currentUser/dropCampaigns")?;
    let active: Vec<Value> = campaigns
        .as_array()
        .into_iter()
        .flatten()
        .filter(|campaign| campaign.get("status").and_then(Value::as_str) == Some("ACTIVE"))
        .cloned()
        .collect();
    if active.len() > 500
        || serde_json::to_vec(&active)
            .map_err(|error| error.to_string())?
            .len()
            > 500_000
    {
        return Err("El catálogo de Drops supera el tamaño permitido".to_string());
    }
    Ok(Value::Array(active))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integrity_rejection_stays_paused_for_its_account_after_normal_cache_expiry() {
        let fetched = Instant::now() - Duration::from_secs(120);
        let blocked = CachedCatalog {
            account: "alice".to_string(),
            fetched,
            result: Err("failed integrity check".to_string()),
        };
        assert!(blocked.for_account("alice").unwrap().is_err());
        assert!(blocked.for_account("bob").is_none());
        let ready = CachedCatalog {
            account: "alice".to_string(),
            fetched,
            result: Ok(serde_json::json!([])),
        };
        assert!(ready.for_account("alice").is_none());
    }

    #[test]
    fn catalog_is_read_only_and_does_not_request_or_fabricate_personal_progress() {
        assert!(QUERY.contains("dropCampaigns {"));
        assert!(QUERY.contains("timeBasedDrops {"));
        assert!(QUERY.contains("imageAssetURL"));
        assert!(!QUERY.contains("currentMinutesWatched"));
        assert!(!QUERY.contains("dropInstanceID"));
        assert!(!QUERY.contains("mutation"));
    }

    #[test]
    fn rejected_catalog_is_not_a_successful_empty_list() {
        assert!(
            parse_catalog_response(&serde_json::json!({"errors":[{"message":"denied"}]})).is_err()
        );
        assert!(parse_catalog_response(&serde_json::json!({"data":{"currentUser":null}})).is_err());
        assert_eq!(
            parse_catalog_response(
                &serde_json::json!({"data":{"currentUser":{"dropCampaigns":[]}}})
            )
            .unwrap(),
            serde_json::json!([])
        );
    }

    #[test]
    fn only_active_campaigns_are_exported_with_their_rewards() {
        let response = serde_json::json!({"data":{"currentUser":{"dropCampaigns":[
            {"id":"active","status":"ACTIVE","timeBasedDrops":[{"id":"reward"}]},
            {"id":"past","status":"EXPIRED"}, {"id":"next","status":"UPCOMING"}
        ]}}});
        let campaigns = parse_catalog_response(&response).unwrap();
        assert_eq!(campaigns.as_array().unwrap().len(), 1);
        assert_eq!(campaigns[0]["timeBasedDrops"][0]["id"], "reward");
    }
}
