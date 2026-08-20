use crate::error::Result;
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub file_path: String,
    pub line_number: usize,
    pub line: String,
}

pub struct SearchEngine;

impl SearchEngine {
    /// Search for text pattern in files within a directory
    pub async fn search(
        workspace_path: impl AsRef<Path>,
        pattern: &str,
        include_patterns: Option<Vec<String>>,
    ) -> Result<Vec<SearchResult>> {
        let workspace = workspace_path.as_ref();
        let mut results = Vec::new();

        Self::search_recursive(workspace, pattern, &include_patterns, &mut results).await?;

        Ok(results)
    }

    async fn search_recursive(
        path: &Path,
        pattern: &str,
        include_patterns: &Option<Vec<String>>,
        results: &mut Vec<SearchResult>,
    ) -> Result<()> {
        if !path.is_dir() {
            return Ok(());
        }

        let mut entries = fs::read_dir(path).await?;

        while let Some(entry) = entries.next_entry().await? {
            let entry_path = entry.path();
            let file_type = entry.file_type().await?;
            let file_name = entry.file_name();

            // Skip hidden files and common unimportant directories
            let name_str = file_name.to_string_lossy();
            if name_str.starts_with('.') || Self::should_ignore(&name_str) {
                continue;
            }

            if file_type.is_dir() {
                Self::search_recursive(&entry_path, pattern, include_patterns, results).await?;
            } else {
                // Check if file matches include patterns
                if let Some(ref patterns) = include_patterns {
                    let name = file_name.to_string_lossy();
                    if !patterns.iter().any(|p| name.contains(p)) {
                        continue;
                    }
                }

                // Search file content
                if let Ok(content) = fs::read_to_string(&entry_path).await {
                    for (line_num, line) in content.lines().enumerate() {
                        if line.contains(pattern) {
                            results.push(SearchResult {
                                file_path: entry_path.to_string_lossy().to_string(),
                                line_number: line_num + 1,
                                line: line.to_string(),
                            });
                        }
                    }
                }
            }
        }

        Ok(())
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
        )
    }
}
