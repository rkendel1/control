// ─── Tauri IPC Commands ──────────────────────────────────────────────────
// Desktop UI communicates with Control Core via these commands.
// No HTTP calls needed for normal UI operation.

use control::ControlCore;
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
) -> Result<CommandResponse<Vec<ProjectDTO>>, String> {
    match core.projects().read().await.list() {
        Ok(projects) => {
            let dtos: Vec<ProjectDTO> = projects.iter().map(ProjectDTO::from).collect();
            Ok(CommandResponse::ok(dtos))
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
        Ok(project) => Ok(CommandResponse::ok(ProjectDTO::from(&project))),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_projects_get(
    core: State<'_, ControlCore>,
    id: String,
) -> Result<CommandResponse<ProjectDTO>, String> {
    match core.projects().read().await.get(&id) {
        Ok(Some(project)) => Ok(CommandResponse::ok(ProjectDTO::from(&project))),
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
        Ok(task) => Ok(CommandResponse::ok(TaskDTO::from(&task))),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_task_start(
    core: State<'_, ControlCore>,
    task_id: String,
) -> Result<CommandResponse<RunDTO>, String> {
    match core.tasks().write().await.start(&task_id).await {
        Ok(run) => Ok(CommandResponse::ok(RunDTO::from(&run))),
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
    let mut dtos: Vec<WorkspaceDTO> = match core
        .workspaces()
        .read()
        .await
        .list(project_id.as_deref())
    {
        Ok(workspaces) => workspaces
            .iter()
            .map(WorkspaceDTO::from)
            .collect(),
        Err(e) => return Ok(CommandResponse::err(e.to_string())),
    };

    // Fallback: synthesize a direct workspace from project path so UI is usable.
    if dtos.is_empty() {
        if let Some(pid) = project_id {
            if let Ok(Some(project)) = core.projects().read().await.get(&pid) {
                dtos.push(WorkspaceDTO {
                    id: format!("ws_{}", project.id),
                    project_id: project.id,
                    path: project.repository_path,
                    mode: "direct".to_string(),
                    status: "ready".to_string(),
                });
            }
        }
    }

    Ok(CommandResponse::ok(dtos))
}

// ─── DTOs (Data Transfer Objects) ────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectDTO {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub runtime: Option<String>,
}

impl ProjectDTO {
    fn from(project: &control::project::Project) -> Self {
        Self {
            id: project.id.clone(),
            name: project.name.clone(),
            path: project.repository_path.clone(),
            description: project.description.clone(),
            runtime: project.runtime.clone(),
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
    fn from(_task: &control::task::Task) -> Self {
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
    fn from(_run: &control::task::Run) -> Self {
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
    fn from(_runtime: &control::runtime::RuntimeInfo) -> Self {
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
    fn from(_workspace: &control::workspace::Workspace) -> Self {
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
    match control::git::GitManager::status(&workspace_path) {
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
    let file_manager = control::file::FileManager::new(&workspace_path);
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
    let file_manager = control::file::FileManager::new(&workspace_path);
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
    let file_manager = control::file::FileManager::new(&workspace_path);
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
    pub fn from_tree_node(node: control::file::TreeNode) -> Self {
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
    match control::git::GitManager::stage_file(&workspace_path, &file_path) {
        Ok(_) => Ok(CommandResponse::ok(true)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub async fn cmd_git_commit(
    workspace_path: String,
    message: String,
) -> Result<CommandResponse<String>, String> {
    match control::git::GitManager::commit(&workspace_path, &message) {
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
    let manager = control::terminal::TerminalManager::new();
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
    let manager = control::terminal::TerminalManager::new();
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
    match control::watcher::FileWatcher::new(tx) {
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
    match control::search::SearchEngine::search(&workspace_path, &pattern, include_patterns).await {
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

// ─── Graph Commands ────────────────────────────────────────

#[tauri::command]
pub fn cmd_detect_repository(
    project_path: String,
) -> Result<CommandResponse<control::graph::RepositoryInfo>, String> {
    match control::graph::detect_git_repository(&project_path) {
        Ok(info) => Ok(CommandResponse::ok(info)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub fn cmd_scan_directory(
    path: String,
    max_depth: usize,
) -> Result<CommandResponse<control::graph::FileNode>, String> {
    match control::graph::scan_directory_tree(&path, max_depth) {
        Ok(tree) => Ok(CommandResponse::ok(tree)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

#[tauri::command]
pub fn cmd_index_project(
    project_id: String,
    project_name: String,
    project_path: String,
) -> Result<CommandResponse<control::graph::ProjectIndexResult>, String> {
    match control::graph::index_project(&project_id, &project_name, &project_path) {
        Ok(result) => Ok(CommandResponse::ok(result)),
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}

// ─── Comprehensive Project Initialization ────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ProjectInitResult {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub graph_id: String,
    pub entity_count: usize,
    pub file_count: usize,
    pub dir_count: usize,
    pub is_git: bool,
    pub default_branch: Option<String>,
    pub remote_url: Option<String>,
}

#[tauri::command]
pub fn cmd_initialize_project(
    project_id: String,
    project_name: String,
    project_path: String,
) -> Result<CommandResponse<ProjectInitResult>, String> {
    // Step 1: Index the project (filesystem + git)
    match control::graph::index_project(&project_id, &project_name, &project_path) {
        Ok(index_result) => {
            let graph_id = format!("graph:{}", project_id);

            println!(
                "✓ Project initialized: {} at {}",
                project_name, project_path
            );

            Ok(CommandResponse::ok(ProjectInitResult {
                project_id,
                project_name,
                project_path,
                graph_id,
                entity_count: index_result.file_count + index_result.dir_count + 2, // +2 for Project and Repository
                file_count: index_result.file_count,
                dir_count: index_result.dir_count,
                is_git: index_result
                    .repository
                    .as_ref()
                    .map(|r| r.is_git)
                    .unwrap_or(false),
                default_branch: index_result
                    .repository
                    .as_ref()
                    .and_then(|r| r.default_branch.clone()),
                remote_url: index_result
                    .repository
                    .as_ref()
                    .and_then(|r| r.remote_url.clone()),
            }))
        }
        Err(e) => Ok(CommandResponse::err(e.to_string())),
    }
}
