// ─── Control Core Library ────────────────────────────────────────────────

pub mod agent;
pub mod error;
pub mod file;
pub mod git;
pub mod memory;
pub mod project;
pub mod runtime;
pub mod search;
pub mod task;
pub mod terminal;
pub mod watcher;
pub mod workspace;

pub use error::{ControlError, Result};

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Control core application state.
/// Manages projects, tasks, workspaces, and agent runtimes.
pub struct ControlCore {
    /// Project registry
    projects: Arc<RwLock<project::ProjectRegistry>>,

    /// Task engine
    tasks: Arc<RwLock<task::TaskEngine>>,

    /// Workspace manager
    workspaces: Arc<RwLock<workspace::WorkspaceManager>>,

    /// Runtime manager
    runtimes: Arc<RwLock<runtime::RuntimeManager>>,

    /// Git integration
    git: Arc<RwLock<git::GitManager>>,

    /// Engineering memory
    memory: Arc<RwLock<memory::MemoryStore>>,
}

impl ControlCore {
    /// Initialize the Control core.
    pub async fn new() -> Result<Self> {
        Ok(Self {
            projects: Arc::new(RwLock::new(project::ProjectRegistry::load().await?)),
            tasks: Arc::new(RwLock::new(task::TaskEngine::new())),
            workspaces: Arc::new(RwLock::new(workspace::WorkspaceManager::new()?)),
            runtimes: Arc::new(RwLock::new(runtime::RuntimeManager::discover().await?)),
            git: Arc::new(RwLock::new(git::GitManager::new()?)),
            memory: Arc::new(RwLock::new(memory::MemoryStore::load().await?)),
        })
    }

    /// Gracefully shutdown the Control core.
    pub async fn shutdown(&self) -> Result<()> {
        // Stop all active agent runs
        self.runtimes.write().await.stop_all().await?;

        // Persist state
        self.projects.read().await.save().await?;
        self.tasks.read().await.save().await?;
        self.memory.read().await.save().await?;

        Ok(())
    }

    // Public accessors
    pub fn projects(&self) -> Arc<RwLock<project::ProjectRegistry>> {
        Arc::clone(&self.projects)
    }

    pub fn tasks(&self) -> Arc<RwLock<task::TaskEngine>> {
        Arc::clone(&self.tasks)
    }

    pub fn workspaces(&self) -> Arc<RwLock<workspace::WorkspaceManager>> {
        Arc::clone(&self.workspaces)
    }

    pub fn runtimes(&self) -> Arc<RwLock<runtime::RuntimeManager>> {
        Arc::clone(&self.runtimes)
    }

    pub fn git(&self) -> Arc<RwLock<git::GitManager>> {
        Arc::clone(&self.git)
    }

    pub fn memory(&self) -> Arc<RwLock<memory::MemoryStore>> {
        Arc::clone(&self.memory)
    }
}

/// Status of the Control daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonStatus {
    pub version: String,
    pub uptime_seconds: u64,
    pub pid: u32,
    pub projects_count: usize,
    pub tasks_count: usize,
    pub active_runs: usize,
    pub runtimes: Vec<RuntimeStatus>,
}

/// Runtime availability status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStatus {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_core_initialization() {
        let core = ControlCore::new().await;
        assert!(core.is_ok());
    }
}
