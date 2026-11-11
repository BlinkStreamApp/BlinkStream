use serde_json::{json, Value};

#[derive(Debug, PartialEq)]
pub(crate) enum ClaimResponse {
    Accepted,
    Rejected,
    Unknown,
}

pub(crate) fn classify(response: &Value) -> ClaimResponse {
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

pub(crate) fn persisted_claim_request(instance: &str) -> Value {
    json!({
        "operationName": "DropsPage_ClaimDropRewards",
        "variables": {"input": {"dropInstanceID": instance}},
        "extensions": {"persistedQuery": {"version": 1,
            "sha256Hash": "a455deea71bdc9015b78eb49f4acfbce8baa7ccbedd28e549bb025bd0f751930"}}
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn experimental_payload_uses_the_exact_issued_instance_and_fixed_operation() {
        let payload = persisted_claim_request("issued-instance");
        assert_eq!(payload["operationName"], "DropsPage_ClaimDropRewards");
        assert_eq!(
            payload["variables"]["input"],
            json!({"dropInstanceID":"issued-instance"})
        );
        assert_eq!(payload["extensions"]["persistedQuery"]["version"], 1);
        assert_eq!(
            payload["extensions"]["persistedQuery"]["sha256Hash"]
                .as_str()
                .unwrap()
                .len(),
            64
        );
        assert!(payload.get("query").is_none());
    }
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
