use serde::Serialize;
use std::fmt;
use thiserror::Error;

/// Control core error type.
#[derive(Error, Debug, Serialize, Clone)]
pub enum ControlError {
    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    #[error("Task not found: {0}")]
    TaskNotFound(String),

    #[error("Runtime not found: {0}")]
    RuntimeNotFound(String),

    #[error("Workspace error: {0}")]
    WorkspaceError(String),

    #[error("Git error: {0}")]
    GitError(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Authorization denied: {0}")]
    AuthorizationDenied(String),

    #[error("Runtime error: {0}")]
    RuntimeError(String),

    #[error("Invalid state: {0}")]
    InvalidState(String),

    #[error("Unknown error: {0}")]
    Unknown(String),
}

impl ControlError {
    pub fn project_not_found(id: impl Into<String>) -> Self {
        Self::ProjectNotFound(id.into())
    }

    pub fn task_not_found(id: impl Into<String>) -> Self {
        Self::TaskNotFound(id.into())
    }

    pub fn workspace_error(msg: impl Into<String>) -> Self {
        Self::WorkspaceError(msg.into())
    }

    pub fn git_error(msg: impl Into<String>) -> Self {
        Self::GitError(msg.into())
    }
}

/// Result type for Control operations.
pub type Result<T> = std::result::Result<T, ControlError>;

impl From<std::io::Error> for ControlError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err.to_string())
    }
}

impl From<serde_json::Error> for ControlError {
    fn from(err: serde_json::Error) -> Self {
        Self::ConfigError(err.to_string())
    }
}

impl From<git2::Error> for ControlError {
    fn from(err: git2::Error) -> Self {
        Self::GitError(err.message().to_string())
    }
}
