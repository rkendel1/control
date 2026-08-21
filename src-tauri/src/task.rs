//! Task engine.

use crate::error::Result;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub project_id: String,
    pub description: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Run {
    pub id: String,
    pub task_id: String,
    pub status: String,
    pub workspace: String,
    pub runtime: String,
}

pub struct TaskEngine {
    tasks: Vec<Task>,
}

impl TaskEngine {
    pub fn new() -> Self {
        Self { tasks: Vec::new() }
    }

    pub async fn save(&self) -> Result<()> {
        Ok(())
    }

    pub fn list(&self, project_id: Option<&str>) -> Result<Vec<Task>> {
        let tasks = match project_id {
            Some(pid) => self
                .tasks
                .iter()
                .filter(|t| t.project_id == pid)
                .cloned()
                .collect(),
            None => self.tasks.clone(),
        };
        Ok(tasks)
    }

    pub fn create(
        &mut self,
        title: String,
        project_id: String,
        description: Option<String>,
    ) -> Result<Task> {
        let task = Task {
            id: format!("task_{}", chrono::Utc::now().timestamp_millis()),
            title,
            project_id,
            description,
            status: "not-started".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        self.tasks.push(task.clone());
        Ok(task)
    }

    pub async fn start(&mut self, task_id: &str) -> Result<Run> {
        if let Some(task) = self.tasks.iter_mut().find(|t| t.id == task_id) {
            task.status = "in-progress".to_string();
        }

        Ok(Run {
            id: format!("run_{}", chrono::Utc::now().timestamp_millis()),
            task_id: task_id.to_string(),
            status: "running".to_string(),
            workspace: String::new(),
            runtime: "auto".to_string(),
        })
    }
}
