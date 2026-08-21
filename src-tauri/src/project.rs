//! Project management.

use crate::error::Result;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub repository_path: String,
    pub runtime: Option<String>,
}

pub struct ProjectRegistry {
    projects: Vec<Project>,
}

impl ProjectRegistry {
    pub async fn load() -> Result<Self> {
        let mut projects = Vec::new();

        if let Ok(cwd) = std::env::current_dir() {
            let root = resolve_workspace_root(&cwd);
            let default_name = root
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("control")
                .to_string();

            projects.push(Project {
                id: "proj_local_control".to_string(),
                name: default_name,
                description: Some("Local Control workspace".to_string()),
                repository_path: root.to_string_lossy().to_string(),
                runtime: Some("tauri".to_string()),
            });
        }

        Ok(Self { projects })
    }

    pub async fn save(&self) -> Result<()> {
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<Project>> {
        Ok(self.projects.clone())
    }

    pub fn get(&self, id: &str) -> Result<Option<Project>> {
        Ok(self.projects.iter().find(|p| p.id == id).cloned())
    }

    pub async fn add_from_path(&mut self, path: &str, name: Option<String>) -> Result<Project> {
        let default_name = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("project")
            .to_string();

        let project = Project {
            id: format!("proj_{}", chrono::Utc::now().timestamp_millis()),
            name: name.unwrap_or(default_name),
            description: None,
            repository_path: path.to_string(),
            runtime: None,
        };

        self.projects.push(project.clone());
        Ok(project)
    }
}

fn resolve_workspace_root(cwd: &std::path::Path) -> std::path::PathBuf {
    if is_control_root(cwd) {
        return cwd.to_path_buf();
    }

    if let Some(parent) = cwd.parent() {
        if is_control_root(parent) {
            return parent.to_path_buf();
        }
    }

    cwd.to_path_buf()
}

fn is_control_root(path: &std::path::Path) -> bool {
    path.join("src-ui").is_dir() && path.join("src-tauri").is_dir()
}
