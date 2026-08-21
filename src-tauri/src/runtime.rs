//! Agent runtime management.

use crate::error::Result;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RuntimeInfo {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}

pub struct RuntimeManager;

impl RuntimeManager {
    pub async fn discover() -> Result<Self> {
        Ok(Self)
    }

    pub async fn stop_all(&mut self) -> Result<()> {
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<RuntimeInfo>> {
        Ok(vec![
            RuntimeInfo {
                name: "claude-code".to_string(),
                available: true,
                version: None,
            },
            RuntimeInfo {
                name: "ollama".to_string(),
                available: true,
                version: None,
            },
        ])
    }
}
