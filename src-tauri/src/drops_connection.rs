use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// Separate from the frontend-accessible secret namespace.
const SERVICE: &str = "blinkstream.drops.connection.v1";
const KEY: &str = "connection";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SavedConnection {
    pub token: String,
    pub owner: String,
    pub client: String,
    pub expires_at: u64,
    pub attempted: HashSet<String>,
    pub blocked: bool,
}

pub(crate) fn now() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| "state".into())
}

impl SavedConnection {
    pub fn remaining(&self, client: &str, now: u64) -> Result<Duration, String> {
        let seconds = self.expires_at.saturating_sub(now);
        if seconds == 0
            || seconds > 86400
            || self.client != client
            || self.owner.is_empty()
            || self.owner.len() > 25
            || !self.owner.bytes().all(|c| c.is_ascii_digit())
            || self.token.is_empty()
            || self.token.len() > 8192
            || !self.token.bytes().all(|c| c.is_ascii_alphanumeric())
            || self.attempted.len() > 1000
            || self
                .attempted
                .iter()
                .any(|id| id.is_empty() || id.len() > 1024)
        {
            return Err("authorization".into());
        }
        Ok(Duration::from_secs(seconds))
    }
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, KEY).map_err(|_| "storage".into())
}

pub(crate) fn load() -> Result<Option<SavedConnection>, String> {
    match entry()?.get_password() {
        Ok(value) if value.len() <= 65536 => serde_json::from_str(&value)
            .map(Some)
            .map_err(|_| "authorization".into()),
        Ok(_) => Err("authorization".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("storage".into()),
    }
}

pub(crate) fn save(connection: &SavedConnection) -> Result<(), String> {
    let value = serde_json::to_string(connection).map_err(|_| "storage")?;
    entry()?.set_password(&value).map_err(|_| "storage".into())
}

pub(crate) fn clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("storage".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn saved() -> SavedConnection {
        SavedConnection {
            token: "fixtureToken".into(),
            owner: "100".into(),
            client: "client".into(),
            expires_at: 1600,
            attempted: HashSet::from(["issued".into()]),
            blocked: true,
        }
    }
    #[test]
    fn restore_does_not_extend_deadline_or_accept_another_client() {
        assert_eq!(
            saved().remaining("client", 1000).unwrap(),
            Duration::from_secs(600)
        );
        assert_eq!(
            saved().remaining("client", 1500).unwrap(),
            Duration::from_secs(100)
        );
        assert!(saved().remaining("other", 1000).is_err());
        assert!(saved().remaining("client", 1600).is_err());
        assert!(saved().remaining("client", 0).is_ok());
        let mut future = saved();
        future.expires_at = 86401;
        assert!(future.remaining("client", 0).is_err());
    }
    #[test]
    fn restart_retains_attempted_instances_and_uncertainty() {
        let roundtrip: SavedConnection =
            serde_json::from_str(&serde_json::to_string(&saved()).unwrap()).unwrap();
        assert!(roundtrip.blocked);
        assert!(roundtrip.attempted.contains("issued"));
        assert!(serde_json::from_str::<SavedConnection>("{}").is_err());
        let mut invalid = saved();
        invalid.token = "token\ninvalid".into();
        assert!(invalid.remaining("client", 1000).is_err());
        invalid = saved();
        invalid.owner = "display-name".into();
        assert!(invalid.remaining("client", 1000).is_err());
    }
}
