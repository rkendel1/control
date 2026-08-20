// ─── Graph Operations ────────────────────────────────────────────────────
// Tauri IPC commands for project discovery and graph management.
// These commands drive the FeltDB-backed project graph operations.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Response wrapper for graph commands
#[derive(Debug, Serialize, Deserialize)]
pub struct GraphResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> GraphResponse<T> {
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

// ─── Project Discovery DTOs ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryInfo {
    pub path: String,
    pub is_git: bool,
    pub default_branch: Option<String>,
    pub remote_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectIndexResult {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub repository: Option<RepositoryInfo>,
    pub file_count: usize,
    pub dir_count: usize,
}

// ─── Discovery Functions ─────────────────────────────────────────────

/// Detect if a path is a git repository
pub fn detect_git_repository(project_path: &str) -> Result<RepositoryInfo> {
    let git_dir = Path::new(project_path).join(".git");

    if !git_dir.exists() {
        return Err(crate::error::ControlError::workspace_error(
            "Not a git repository",
        ));
    }

    let mut default_branch = "main".to_string();

    // Try to read HEAD to determine default branch
    let head_path = git_dir.join("HEAD");
    if let Ok(head_content) = fs::read_to_string(&head_path) {
        if let Some(branch) = head_content
            .trim()
            .strip_prefix("ref: refs/heads/")
        {
            default_branch = branch.to_string();
        }
    }

    // Try to read remote URL from config
    let mut remote_url: Option<String> = None;
    let config_path = git_dir.join("config");
    if let Ok(config_content) = fs::read_to_string(&config_path) {
        if let Some(line) = config_content.lines().find(|l| l.contains("url =")) {
            if let Some(url) = line.split("url = ").nth(1) {
                remote_url = Some(url.trim().to_string());
            }
        }
    }

    Ok(RepositoryInfo {
        path: project_path.to_string(),
        is_git: true,
        default_branch: Some(default_branch),
        remote_url,
    })
}

/// Scan directory tree and return file/directory structure
pub fn scan_directory_tree(
    path: &str,
    max_depth: usize,
) -> Result<FileNode> {
    scan_directory_recursive(path, 0, max_depth)
}

fn scan_directory_recursive(
    path: &str,
    current_depth: usize,
    max_depth: usize,
) -> Result<FileNode> {
    let path_obj = Path::new(path);
    let name = path_obj
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("root")
        .to_string();

    let mut node = FileNode {
        path: path.to_string(),
        name,
        is_dir: true,
        children: Some(Vec::new()),
    };

    if current_depth >= max_depth {
        return Ok(node);
    }

    let mut children = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            if let Ok(path) = entry.path().into_os_string().into_string() {
                let file_name = entry
                    .file_name()
                    .into_string()
                    .unwrap_or_default();

                // Skip ignored paths
                if should_ignore(&file_name) {
                    continue;
                }

                if let Ok(metadata) = fs::metadata(&path) {
                    if metadata.is_dir() {
                        if let Ok(child) =
                            scan_directory_recursive(&path, current_depth + 1, max_depth)
                        {
                            children.push(child);
                        }
                    } else {
                        children.push(FileNode {
                            path,
                            name: file_name,
                            is_dir: false,
                            children: None,
                        });
                    }
                }
            }
        }
    }

    // Sort: directories first, then alphabetically
    children.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.cmp(&b.name)
        }
    });

    node.children = Some(children);
    Ok(node)
}

fn should_ignore(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | "target"
            | ".git"
            | ".github"
            | "dist"
            | "build"
            | ".vscode"
            | ".idea"
            | "__pycache__"
            | ".pytest_cache"
            | ".cargo"
            | ".next"
            | ".turbo"
            | ".swc"
            | "."
            | ".."
    )
}

// ─── Project Indexing ────────────────────────────────────────────────

pub fn index_project(
    project_id: &str,
    project_name: &str,
    project_path: &str,
) -> Result<ProjectIndexResult> {
    // Detect repository
    let repository = detect_git_repository(project_path).ok();

    // Scan directory tree
    let tree = scan_directory_tree(project_path, 3)?;

    // Count files and directories
    let (file_count, dir_count) = count_nodes(&tree);

    println!(
        "✓ Indexed project '{}' at {} ({} files, {} dirs)",
        project_name, project_path, file_count, dir_count
    );

    Ok(ProjectIndexResult {
        project_id: project_id.to_string(),
        project_name: project_name.to_string(),
        project_path: project_path.to_string(),
        repository,
        file_count,
        dir_count,
    })
}

fn count_nodes(node: &FileNode) -> (usize, usize) {
    let mut files = if !node.is_dir { 1 } else { 0 };
    let mut dirs = if node.is_dir { 1 } else { 0 };

    if let Some(children) = &node.children {
        for child in children {
            let (f, d) = count_nodes(child);
            files += f;
            dirs += d;
        }
    }

    (files, dirs)
}
