use serde_json::{json, Value};

const QUERY: &str = "mutation ClaimDrop($input: ClaimDropRewardsInput!) { claimDropRewards(input: $input) { status } }";

#[derive(Debug, PartialEq)]
enum ClaimResponse {
    Accepted,
    Rejected,
    Unknown,
}

fn classify(response: &Value) -> ClaimResponse {
    if response
        .get("errors")
        .and_then(Value::as_array)
        .is_some_and(|errors| !errors.is_empty())
    {
        return ClaimResponse::Rejected;
    }
    match response
        .pointer("/data/claimDropRewards/status")
        .and_then(Value::as_str)
    {
        Some("ELIGIBLE_FOR_ALL" | "DROP_INSTANCE_ALREADY_CLAIMED") => ClaimResponse::Accepted,
        Some("NOT_ELIGIBLE" | "DROP_INSTANCE_NOT_FOUND") => ClaimResponse::Rejected,
        Some(_) => ClaimResponse::Unknown,
        None => ClaimResponse::Unknown,
    }
}

pub(crate) async fn try_web_claim(
    token: &str,
    instance: &str,
    drop_id: &str,
) -> Result<bool, String> {
    let response = super::fetch_twitch_gql(
        QUERY.to_string(),
        Some(json!({"input":{"dropInstanceID":instance}})),
        Some(token.to_string()),
        None,
    )
    .await?;
    match classify(&response) {
        ClaimResponse::Rejected => Ok(false),
        ClaimResponse::Unknown => Err("Twitch no confirmó la solicitud de reclamo. Actualiza el inventario antes de volver a intentarlo.".to_string()),
        ClaimResponse::Accepted => {
            for _ in 0..3 {
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                let inventory = super::fetch_twitch_gql(super::TWITCH_DROPS_INVENTORY_QUERY.to_string(), None, Some(token.to_string()), None).await?;
                if super::official_drop_claim_confirmed(&inventory, drop_id)? { return Ok(true); }
            }
            Err("Twitch recibió el reclamo, pero el inventario aún no lo confirma. Actualiza el panel; el reclamo automático queda en pausa.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_explicit_status_is_an_acknowledgement_and_never_a_claim_confirmation() {
        assert_eq!(
            classify(&json!({"data":{"claimDropRewards":{"status":"ELIGIBLE_FOR_ALL"}}})),
            ClaimResponse::Accepted
        );
        assert_eq!(
            classify(
                &json!({"data":{"claimDropRewards":{"status":"DROP_INSTANCE_ALREADY_CLAIMED"}}})
            ),
            ClaimResponse::Accepted
        );
        assert_eq!(
            classify(&json!({"data":{"claimDropRewards":null}})),
            ClaimResponse::Unknown
        );
        assert_eq!(
            classify(&json!({"data":{"claimDropRewards":{"status":"NEW_UNKNOWN_STATUS"}}})),
            ClaimResponse::Unknown
        );
        assert_eq!(
            classify(&json!({"errors":[{"message":"failed integrity check"}]})),
            ClaimResponse::Rejected
        );
    }
}
