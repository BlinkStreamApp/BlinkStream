use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub(crate) const QUERY: &str = "query ViewerRewards($login: String!) { currentUser { id } user(login:$login) { id login channel { communityPointsSettings { customRewards { id title cost prompt isEnabled isPaused isInStock isUserInputRequired image { url } defaultImage { url } } } } } }";
// Keep the bounded receipt journal below the smallest OS credential-blob limit.
const LIMIT: usize = 8;
const SERVICE: &str = "blinkstream.points.requests.v1";

pub(crate) fn valid_request(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())
}

pub(crate) fn catalog(data: &Value, owner: &str, channel: &str) -> Result<Value, String> {
    let user = &data["data"]["user"];
    if data.pointer("/data/currentUser/id").and_then(Value::as_str) != Some(owner)
        || !user["id"].as_str().is_some_and(|id| {
            !id.is_empty() && id.len() <= 32 && id.bytes().all(|b| b.is_ascii_digit())
        })
        || user["login"]
            .as_str()
            .map(str::to_ascii_lowercase)
            .as_deref()
            != Some(channel)
    {
        return Err("account".into());
    }
    let rows = user
        .pointer("/channel/communityPointsSettings/customRewards")
        .and_then(Value::as_array)
        .ok_or("catalog")?;
    let items: Vec<Value> = rows.iter().take(200).filter(|r| r["id"].as_str().is_some_and(|id| !id.is_empty() && id.len() <= 128) && r["title"].as_str().is_some_and(|title| title.chars().count() <= 500)).map(|r| json!({
        "id":r["id"], "title":r["title"], "cost":r["cost"].as_u64(), "prompt":r["prompt"].as_str().unwrap_or_default(),
        "enabled":r["isEnabled"].as_bool(), "paused":r["isPaused"].as_bool(), "inStock":r["isInStock"].as_bool(),
        "inputRequired":r["isUserInputRequired"].as_bool(), "image":r.pointer("/image/url").or_else(|| r.pointer("/defaultImage/url")).and_then(Value::as_str)
    })).collect();
    Ok(json!({"accountId":owner,"channel":channel,"channelId":user["id"],"items":items}))
}

pub(crate) fn prepare(
    snapshot: &Value,
    reward_id: &str,
    expected_cost: u64,
    expected_title: &str,
    text: &str,
    transaction: &str,
) -> Result<Value, String> {
    if !valid_request(transaction) || text.chars().count() > 500 {
        return Err("input".into());
    }
    let item = snapshot["items"]
        .as_array()
        .and_then(|rows| rows.iter().find(|r| r["id"].as_str() == Some(reward_id)))
        .ok_or("reward")?;
    if item["enabled"] != true
        || item["paused"] != false
        || item["inStock"] != true
        || !item["inputRequired"].is_boolean()
    {
        return Err("unavailable".into());
    }
    if item["cost"].as_u64() != Some(expected_cost)
        || expected_cost == 0
        || item["title"].as_str() != Some(expected_title)
    {
        return Err("changed".into());
    }
    if item["inputRequired"] == true && text.trim().is_empty() {
        return Err("input".into());
    }
    let mut input = json!({"channelID":snapshot["channelId"],"cost":expected_cost,"pricingType":"POINTS","prompt":item["prompt"],"rewardID":reward_id,"title":item["title"],"transactionID":transaction});
    if !text.trim().is_empty() {
        input["textInput"] = json!(text.trim());
    }
    Ok(
        json!({"operationName":"RedeemCustomReward","variables":{"input":input},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"d56249a7adb4978898ea3412e196688d4ac3cea1c0c2dfd65561d229ea5dcc42"}}}),
    )
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Outcome {
    Pending,
    Accepted,
    Rejected,
}

pub(crate) fn outcome(value: &Value) -> Outcome {
    let payload = value.pointer("/data/redeemCommunityPointsCustomReward");
    let no_errors = value
        .get("errors")
        .is_none_or(|errors| errors.is_null() || errors.as_array().is_some_and(Vec::is_empty));
    match payload.and_then(|v| v.get("error")) {
        Some(Value::Null) if no_errors => Outcome::Accepted,
        Some(error) if error["code"].is_string() => Outcome::Rejected,
        _ => Outcome::Pending,
    }
}

pub(crate) fn rejection(value: &Value) -> &'static str {
    match value
        .pointer("/data/redeemCommunityPointsCustomReward/error/code")
        .and_then(Value::as_str)
    {
        Some("INSUFFICIENT_POINTS") => "insufficient-points",
        Some("MAX_PER_STREAM_EXCEEDED" | "MAX_PER_USER_PER_STREAM_EXCEEDED") => "limit",
        Some("COOLDOWN") => "cooldown",
        Some("PROPERTIES_MISMATCH" | "REWARD_COST_MISMATCH") => "changed",
        Some("NOT_AVAILABLE") => "unavailable",
        _ => "rejected",
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Receipt {
    pub request: String,
    pub channel: String,
    pub reward: String,
    pub outcome: Outcome,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Ledger {
    rows: Vec<Receipt>,
}

impl Ledger {
    pub fn previous(
        &self,
        request: &str,
        channel: &str,
        reward: &str,
    ) -> Result<Option<Outcome>, String> {
        match self.rows.iter().find(|r| r.request == request) {
            Some(row) if row.channel == channel && row.reward == reward => {
                Ok(Some(row.outcome.clone()))
            }
            Some(_) => Err("input".into()),
            None => Ok(None),
        }
    }
    pub fn reserve(
        &mut self,
        request: &str,
        channel: &str,
        reward: &str,
    ) -> Result<Option<Outcome>, String> {
        if let Some(outcome) = self.previous(request, channel, reward)? {
            return Ok(Some(outcome));
        }
        if self
            .rows
            .iter()
            .any(|r| r.channel == channel && r.reward == reward && r.outcome == Outcome::Pending)
        {
            return Err("unconfirmed".into());
        }
        if self.rows.len() >= LIMIT {
            let index = self
                .rows
                .iter()
                .position(|r| r.outcome != Outcome::Pending)
                .ok_or("unconfirmed")?;
            self.rows.remove(index);
        }
        self.rows.push(Receipt {
            request: request.into(),
            channel: channel.into(),
            reward: reward.into(),
            outcome: Outcome::Pending,
        });
        Ok(None)
    }
    pub fn settle(&mut self, request: &str, outcome: Outcome) {
        if let Some(row) = self.rows.iter_mut().find(|r| r.request == request) {
            row.outcome = outcome;
        }
    }
}

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|_| "storage".into())
}
pub(crate) fn load(account: &str) -> Result<Ledger, String> {
    match entry(account)?.get_password() {
        Ok(s) if s.len() <= 2400 => {
            let ledger: Ledger = serde_json::from_str(&s).map_err(|_| "storage")?;
            if ledger.rows.len() > LIMIT
                || ledger.rows.iter().any(|r| {
                    !valid_request(&r.request) || r.channel.len() > 25 || r.reward.len() > 128
                })
            {
                return Err("storage".into());
            }
            Ok(ledger)
        }
        Err(keyring::Error::NoEntry) => Ok(Ledger::default()),
        _ => Err("storage".into()),
    }
}
pub(crate) fn save(account: &str, ledger: &Ledger) -> Result<(), String> {
    let encoded = serde_json::to_string(ledger).map_err(|_| "storage")?;
    if encoded.len() > 2400 {
        return Err("storage".into());
    }
    entry(account)?
        .set_password(&encoded)
        .map_err(|_| "storage".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fresh_quote_and_known_availability_are_required_before_spending() {
        let mut snapshot = json!({"channelId":"1","items":[{"id":"reward","title":"Drink","cost":100,"prompt":"Which drink?","enabled":true,"paused":false,"inStock":true,"inputRequired":true}]});
        let tx = "a".repeat(32);
        assert!(prepare(&snapshot, "reward", 100, "Drink", "", &tx).is_err());
        assert!(prepare(&snapshot, "reward", 99, "Drink", "Water", &tx).is_err());
        assert!(prepare(&snapshot, "reward", 100, "Old title", "Water", &tx).is_err());
        let body = prepare(&snapshot, "reward", 100, "Drink", " Water ", &tx).unwrap();
        assert_eq!(body["variables"]["input"]["prompt"], "Which drink?");
        assert_eq!(body["variables"]["input"]["textInput"], "Water");
        assert_eq!(body["variables"]["input"]["transactionID"], tx);
        snapshot["items"][0]["inStock"] = Value::Null;
        assert!(prepare(&snapshot, "reward", 100, "Drink", "Water", &tx).is_err());
    }
    #[test]
    fn catalog_rejects_wrong_account_and_preserves_unknown_availability() {
        let data = json!({"data":{"currentUser":{"id":"1"},"user":{"id":"2","login":"Owner","channel":{"communityPointsSettings":{"customRewards":[{"id":"reward","title":"Drink","cost":100}]}}}}});
        assert!(catalog(&data, "3", "owner").is_err());
        assert!(catalog(&data, "1", "different").is_err());
        assert!(catalog(&data, "1", "owner").unwrap()["items"][0]["inStock"].is_null());
    }
    #[test]
    fn receipt_journal_is_bounded_and_never_discards_pending_transactions() {
        let mut ledger = Ledger::default();
        for n in 0..LIMIT {
            ledger
                .reserve(&format!("{n:032x}"), "channel", &n.to_string())
                .unwrap();
        }
        assert!(ledger.reserve(&"f".repeat(32), "channel", "new").is_err());
        ledger.settle(&format!("{:032x}", 0), Outcome::Accepted);
        ledger.reserve(&"f".repeat(32), "channel", "new").unwrap();
        assert_eq!(ledger.rows.len(), LIMIT);
        assert!(serde_json::to_string(&ledger).unwrap().len() < 2400);
    }
    #[test]
    fn reservations_survive_restart_and_prevent_duplicate_charges() {
        let mut ledger = Ledger::default();
        assert_eq!(ledger.reserve("a", "channel", "reward").unwrap(), None);
        let mut ledger: Ledger =
            serde_json::from_str(&serde_json::to_string(&ledger).unwrap()).unwrap();
        assert!(ledger.reserve("b", "channel", "reward").is_err());
        assert_eq!(
            ledger.reserve("a", "channel", "reward").unwrap(),
            Some(Outcome::Pending)
        );
        ledger.settle("a", Outcome::Accepted);
        assert_eq!(
            ledger.reserve("a", "channel", "reward").unwrap(),
            Some(Outcome::Accepted)
        );
        assert!(ledger.reserve("a", "other", "reward").is_err());
        assert_eq!(ledger.reserve("b", "channel", "reward").unwrap(), None);
    }
    #[test]
    fn never_reports_an_incomplete_response_as_success() {
        assert_eq!(
            outcome(
                &json!({"errors":[{"message":"failure"}],"data":{"redeemCommunityPointsCustomReward":{"error":null}}})
            ),
            Outcome::Pending
        );
        assert_eq!(
            outcome(
                &json!({"errors":"malformed","data":{"redeemCommunityPointsCustomReward":{"error":null}}})
            ),
            Outcome::Pending
        );
        assert_eq!(
            outcome(&json!({"data":{"redeemCommunityPointsCustomReward":{}}})),
            Outcome::Pending
        );
        assert_eq!(
            outcome(&json!({"data":{"redeemCommunityPointsCustomReward":{"error":null}}})),
            Outcome::Accepted
        );
        assert_eq!(
            outcome(
                &json!({"data":{"redeemCommunityPointsCustomReward":{"error":{"code":"COOLDOWN"}}}})
            ),
            Outcome::Rejected
        );
    }
}
