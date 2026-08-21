use crate::error::Result;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::fs;

/// File manager for workspace operations
pub struct FileManager {
    workspace_root: PathBuf,
}

impl FileManager {
    pub fn new(workspace_root: impl Into<PathBuf>) -> Self {
        Self {
            workspace_root: workspace_root.into(),
        }
    }

    /// Read file contents from workspace
    pub async fn read(&self, relative_path: &str) -> Result<String> {
        let path = self.resolve_path(relative_path)?;
        let content = fs::read_to_string(&path).await?;
        Ok(content)
    }

    /// Write file contents to workspace
    pub async fn write(&self, relative_path: &str, content: &str) -> Result<()> {
        let path = self.resolve_path(relative_path)?;
        fs::write(&path, content).await?;
        Ok(())
    }

    /// List directory contents
    pub async fn list_directory(&self, relative_path: &str) -> Result<Vec<FileEntry>> {
        let path = self.resolve_path(relative_path)?;
        let mut entries = Vec::new();

        let mut read_dir = fs::read_dir(&path).await?;
        while let Some(entry) = read_dir.next_entry().await? {
            let metadata = entry.metadata().await?;
            let file_type = entry.file_type().await?;
            let file_name = entry.file_name();

            entries.push(FileEntry {
                path: entry.path(),
                name: file_name.to_string_lossy().to_string(),
                is_dir: file_type.is_dir(),
                is_file: file_type.is_file(),
                size: metadata.len(),
                modified: metadata
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0),
            });
        }

        Ok(entries)
    }

    /// Build explorer tree structure
    pub async fn build_tree(&self, max_depth: usize) -> Result<Vec<TreeNode>> {
        self.build_tree_recursive_sync(&self.workspace_root, 0, max_depth)
    }

    fn build_tree_recursive_sync(
        &self,
        path: &Path,
        depth: usize,
        max_depth: usize,
    ) -> Result<Vec<TreeNode>> {
        if depth > max_depth {
            return Ok(Vec::new());
        }

        let mut nodes = Vec::new();
        let read_dir = std::fs::read_dir(path)?;

        for entry in read_dir {
            let entry = entry?;
            let file_type = entry.file_type()?;
            let file_name = entry.file_name();
            let entry_path = entry.path();

            // Skip hidden files and common unimportant directories
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with('.') || self.should_ignore(&name_str) {
                continue;
            }

            let relative = entry_path
                .strip_prefix(&self.workspace_root)
                .unwrap_or(&entry_path);

            if file_type.is_dir() {
                let children = if depth < max_depth - 1 {
                    self.build_tree_recursive_sync(&entry_path, depth + 1, max_depth)
                        .unwrap_or_default()
                } else {
                    Vec::new()
                };

                nodes.push(TreeNode {
                    id: format!("dir-{}", relative.display()),
                    path: relative.to_string_lossy().to_string(),
                    name: name_str.to_string(),
                    is_dir: true,
                    children: if children.is_empty() { None } else { Some(children) },
                });
            } else {
                nodes.push(TreeNode {
                    id: format!("file-{}", relative.display()),
                    path: relative.to_string_lossy().to_string(),
                    name: name_str.to_string(),
                    is_dir: false,
                    children: None,
                });
            }
        }

        // Sort: folders first, then alphabetically
        nodes.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.cmp(&b.name)
            }
        });

        Ok(nodes)
    }

    /// Resolve and validate path (security check)
    fn resolve_path(&self, relative_path: &str) -> Result<PathBuf> {
        let path = self.workspace_root.join(relative_path);
        let canonical = path.canonicalize().unwrap_or(path);

        // Ensure path is within workspace
        if !canonical.starts_with(&self.workspace_root.canonicalize().unwrap_or_else(|_| self.workspace_root.clone())) {
            return Err(crate::error::ControlError::workspace_error(
                "Path escapes workspace boundary",
            ));
        }

        Ok(canonical)
    }

    fn should_ignore(&self, name: &str) -> bool {
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
        )
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileEntry {
    pub path: PathBuf,
    pub name: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub size: u64,
    pub modified: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TreeNode {
    pub id: String,
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<TreeNode>>,
}
