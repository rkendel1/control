//! Workspace management.

use crate::error::Result;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Workspace {
    pub id: String,
    pub project_id: String,
    pub path: String,
    pub mode: String,
    pub status: String,
}

pub struct WorkspaceManager;

impl WorkspaceManager {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    pub fn list(&self, _project_id: Option<&str>) -> Result<Vec<Workspace>> {
        Ok(Vec::new())
    }
}
