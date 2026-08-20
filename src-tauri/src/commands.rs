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

// ─── Workbench Commands ──────────────────────────────────────────

#[tauri::command]
pub async fn cmd_git_status(
    workspace_path: String,
) -> Result<CommandResponse<GitStatusDTO>, String> {
    match crate::git::GitManager::status(&workspace_path) {
        Ok(status) => {
            let files = status
                .files
                .into_iter()
                .map(|(_, file_status)| GitFileStatusDTO {
                    path: file_status.path,
                    status: file_status.status,
                    staged_status: file_status.staged_status,
                })
                .collect();

            Ok(CommandResponse::ok(GitStatusDTO {
                branch: status.branch,
                ahead: status.ahead,
                behind: status.behind,
                is_clean: status.is_clean,
                files,
                staged: status.staged,
            }))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_explorer_tree(
    workspace_path: String,
) -> Result<CommandResponse<Vec<ExplorerNodeDTO>>, String> {
    let file_manager = crate::file::FileManager::new(&workspace_path);
    match file_manager.build_tree(3).await {
        Ok(tree) => {
            let dto_tree: Vec<ExplorerNodeDTO> = tree
                .into_iter()
                .map(|node| ExplorerNodeDTO::from_tree_node(node))
                .collect();
            Ok(CommandResponse::ok(dto_tree))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_file_save(
    workspace_path: String,
    file_path: String,
    content: String,
) -> Result<CommandResponse<bool>, String> {
    let file_manager = crate::file::FileManager::new(&workspace_path);
    match file_manager.write(&file_path, &content).await {
        Ok(_) => Ok(CommandResponse::ok(true)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_file_read(
    workspace_path: String,
    file_path: String,
) -> Result<CommandResponse<String>, String> {
    let file_manager = crate::file::FileManager::new(&workspace_path);
    match file_manager.read(&file_path).await {
        Ok(content) => Ok(CommandResponse::ok(content)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── DTOs for Workbench ──────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitStatusDTO {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub is_clean: bool,
    pub files: Vec<GitFileStatusDTO>,
    pub staged: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitFileStatusDTO {
    pub path: String,
    pub status: String,
    pub staged_status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExplorerNodeDTO {
    pub id: String,
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub children: Option<Vec<ExplorerNodeDTO>>,
}

impl ExplorerNodeDTO {
    pub fn from_tree_node(node: crate::file::TreeNode) -> Self {
        let node_type = if node.is_dir { "folder" } else { "file" }.to_string();
        let children = node.children.map(|children| {
            children.into_iter().map(ExplorerNodeDTO::from_tree_node).collect()
        });

        Self {
            id: node.id,
            path: node.path,
            name: node.name,
            node_type,
            children,
        }
    }
}

// ─── Git Commands ───────────────────────────────────────────────

#[tauri::command]
pub async fn cmd_git_stage(
    workspace_path: String,
    file_path: String,
) -> Result<CommandResponse<bool>, String> {
    match crate::git::GitManager::stage_file(&workspace_path, &file_path) {
        Ok(_) => Ok(CommandResponse::ok(true)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_git_commit(
    workspace_path: String,
    message: String,
) -> Result<CommandResponse<String>, String> {
    match crate::git::GitManager::commit(&workspace_path, &message) {
        Ok(commit_id) => Ok(CommandResponse::ok(commit_id)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── Terminal Commands ──────────────────────────────────────────

#[tauri::command]
pub async fn cmd_terminal_create_session(
    name: String,
    cwd: String,
) -> Result<CommandResponse<String>, String> {
    let manager = crate::terminal::TerminalManager::new();
    match manager.create_session(name, cwd).await {
        Ok(session_id) => Ok(CommandResponse::ok(session_id)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_terminal_execute(
    session_id: String,
    command: String,
    cwd: String,
) -> Result<CommandResponse<String>, String> {
    let manager = crate::terminal::TerminalManager::new();
    match manager.execute_command(&session_id, &command, &cwd).await {
        Ok(output) => Ok(CommandResponse::ok(output)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── File Watching Commands ────────────────────────────────

#[tauri::command]
pub async fn cmd_watch_directory(
    workspace_path: String,
) -> Result<CommandResponse<String>, String> {
    let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    match crate::watcher::FileWatcher::new(tx) {
        Ok(watcher) => {
            match watcher.watch_directory(&workspace_path) {
                Ok(_) => Ok(CommandResponse::ok(format!("Watching: {}", workspace_path))),
                Err(e) => Ok(CommandResponse::err(e.to_string())),
            }
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── Search Commands ───────────────────────────────────────

#[tauri::command]
pub async fn cmd_search(
    workspace_path: String,
    pattern: String,
    include_patterns: Option<Vec<String>>,
) -> Result<CommandResponse<Vec<SearchResultDTO>>, String> {
    match crate::search::SearchEngine::search(&workspace_path, &pattern, include_patterns).await {
        Ok(results) => {
            let dtos: Vec<SearchResultDTO> = results
                .into_iter()
                .map(|r| SearchResultDTO {
                    file_path: r.file_path,
                    line_number: r.line_number,
                    line: r.line,
                })
                .collect();
            Ok(CommandResponse::ok(dtos))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResultDTO {
    pub file_path: String,
    pub line_number: usize,
    pub line: String,
}
