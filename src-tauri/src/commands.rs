// ─── Tauri IPC Commands ──────────────────────────────────────────────────
// Desktop UI communicates with Control Core via these commands.
// No HTTP calls needed for normal UI operation.

use crate::ControlCore;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Response wrapper for all IPC commands.
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResponse<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

// ─── Project Commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_projects_list(
    core: State<'_, ControlCore>,
) -> Result<CommandResponse<Vec<String>>, String> {
    match core.projects().read().await.list() {
        Ok(projects) => {
            let ids: Vec<String> = projects.iter().map(|p| p.id.clone()).collect();
            Ok(CommandResponse::ok(ids))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_projects_add(
    core: State<'_, ControlCore>,
    path: String,
    name: Option<String>,
) -> Result<CommandResponse<ProjectDTO>, String> {
    match core
        .projects()
        .write()
        .await
        .add_from_path(&path, name)
        .await
    {
        Ok(project) => Ok(CommandResponse::ok(ProjectDTO::from(project))),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_projects_get(
    core: State<'_, ControlCore>,
    id: String,
) -> Result<CommandResponse<ProjectDTO>, String> {
    match core.projects().read().await.get(&id) {
        Ok(Some(project)) => Ok(CommandResponse::ok(ProjectDTO::from(project))),
        Ok(None) => Ok(CommandResponse::err(format!("Project not found: {}", id))),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── Task Commands ──────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_tasks_list(
    core: State<'_, ControlCore>,
    project_id: Option<String>,
) -> Result<CommandResponse<Vec<TaskDTO>>, String> {
    match core
        .tasks()
        .read()
        .await
        .list(project_id.as_deref())
    {
        Ok(tasks) => {
            let dtos: Vec<TaskDTO> = tasks.iter().map(TaskDTO::from).collect();
            Ok(CommandResponse::ok(dtos))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_task_create(
    core: State<'_, ControlCore>,
    title: String,
    project_id: String,
    description: Option<String>,
) -> Result<CommandResponse<TaskDTO>, String> {
    match core
        .tasks()
        .write()
        .await
        .create(title, project_id, description)
    {
        Ok(task) => Ok(CommandResponse::ok(TaskDTO::from(task))),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_task_start(
    core: State<'_, ControlCore>,
    task_id: String,
) -> Result<CommandResponse<RunDTO>, String> {
    match core.tasks().write().await.start(&task_id).await {
        Ok(run) => Ok(CommandResponse::ok(RunDTO::from(run))),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── Agent Commands ─────────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_runtimes_list(
    core: State<'_, ControlCore>,
) -> Result<CommandResponse<Vec<RuntimeStatusDTO>>, String> {
    match core.runtimes().read().await.list() {
        Ok(runtimes) => {
            let dtos: Vec<RuntimeStatusDTO> = runtimes.iter().map(RuntimeStatusDTO::from).collect();
            Ok(CommandResponse::ok(dtos))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── Workspace Commands ─────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_workspaces_list(
    core: State<'_, ControlCore>,
    project_id: Option<String>,
) -> Result<CommandResponse<Vec<WorkspaceDTO>>, String> {
    match core
        .workspaces()
        .read()
        .await
        .list(project_id.as_deref())
    {
        Ok(workspaces) => {
            let dtos: Vec<WorkspaceDTO> = workspaces
                .iter()
                .map(WorkspaceDTO::from)
                .collect();
            Ok(CommandResponse::ok(dtos))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── DTOs (Data Transfer Objects) ────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectDTO {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub repository_path: String,
    pub runtime: Option<String>,
}

impl ProjectDTO {
    fn from(_project: &crate::project::Project) -> Self {
        // Will implement when project types are ready
        Self {
            id: String::new(),
            name: String::new(),
            description: None,
            repository_path: String::new(),
            runtime: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TaskDTO {
    pub id: String,
    pub title: String,
    pub project_id: String,
    pub status: String,
    pub created_at: String,
}

impl TaskDTO {
    fn from(_task: &crate::task::Task) -> Self {
        // Will implement when task types are ready
        Self {
            id: String::new(),
            title: String::new(),
            project_id: String::new(),
            status: "pending".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RunDTO {
    pub id: String,
    pub task_id: String,
    pub status: String,
    pub workspace: String,
    pub runtime: String,
}

impl RunDTO {
    fn from(_run: &crate::task::Run) -> Self {
        // Will implement when run types are ready
        Self {
            id: String::new(),
            task_id: String::new(),
            status: "pending".to_string(),
            workspace: String::new(),
            runtime: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RuntimeStatusDTO {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}

impl RuntimeStatusDTO {
    fn from(_runtime: &crate::runtime::RuntimeInfo) -> Self {
        // Will implement when runtime types are ready
        Self {
            name: String::new(),
            available: false,
            version: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceDTO {
    pub id: String,
    pub project_id: String,
    pub path: String,
    pub mode: String,
    pub status: String,
}

impl WorkspaceDTO {
    fn from(_workspace: &crate::workspace::Workspace) -> Self {
        // Will implement when workspace types are ready
        Self {
            id: String::new(),
            project_id: String::new(),
            path: String::new(),
            mode: "worktree".to_string(),
            status: "idle".to_string(),
        }
    }
}
