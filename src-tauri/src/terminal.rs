use crate::error::Result;
use std::process::{Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;

/// Terminal session manager
pub struct TerminalManager {
    sessions: Arc<Mutex<Vec<TerminalSession>>>,
}

pub struct TerminalSession {
    pub id: String,
    pub name: String,
    pub cwd: String,
    pub shell: String,
    pub history: Vec<String>,
    pub is_active: bool,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// Create a new terminal session
    pub async fn create_session(&self, name: String, cwd: String) -> Result<String> {
        let id = format!("term-{}", uuid::Uuid::new_v4());
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        let session = TerminalSession {
            id: id.clone(),
            name,
            cwd,
            shell,
            history: vec!["$ ".to_string()],
            is_active: true,
        };

        let mut sessions = self.sessions.lock().await;
        sessions.push(session);

        Ok(id)
    }

    /// Execute command in terminal
    pub async fn execute_command(
        &self,
        session_id: &str,
        command: &str,
        cwd: &str,
    ) -> Result<String> {
        // Parse command
        let parts: Vec<&str> = command.split_whitespace().collect();
        if parts.is_empty() {
            return Ok(String::new());
        }

        let output = Command::new(parts[0])
            .args(&parts[1..])
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        let mut result = stdout;
        if !stderr.is_empty() {
            result.push_str(&format!("Error: {}", stderr));
        }

        Ok(result)
    }

    /// Get session history
    pub async fn get_history(&self, session_id: &str) -> Result<Vec<String>> {
        let sessions = self.sessions.lock().await;
        for session in sessions.iter() {
            if session.id == session_id {
                return Ok(session.history.clone());
            }
        }
        Err(crate::error::ControlError::workspace_error("Session not found"))
    }

    /// Add to session history
    pub async fn add_history(&self, session_id: &str, line: String) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        for session in sessions.iter_mut() {
            if session.id == session_id {
                session.history.push(line);
                // Keep last 10000 lines
                if session.history.len() > 10000 {
                    session.history.remove(0);
                }
                return Ok(());
            }
        }
        Err(crate::error::ControlError::workspace_error("Session not found"))
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
