use crate::error::Result;
use git2::{Repository, Status};
use std::collections::HashMap;
use std::path::Path;

/// Git repository manager
pub struct GitManager;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub is_clean: bool,
    pub files: HashMap<String, FileStatus>,
    pub staged: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
    pub staged_status: Option<String>,
}

impl GitManager {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    /// Get repository status
    pub fn status(repo_path: impl AsRef<Path>) -> Result<GitStatus> {
        let repo = Repository::open(repo_path)?;

        // Get current branch
        let head = repo.head()?;
        let branch = head
            .shorthand()
            .unwrap_or("HEAD")
            .to_string();

        // Get ahead/behind
        let (ahead, behind) = Self::get_ahead_behind(&repo)?;

        // Get file statuses
        let statuses = repo.statuses(None)?;
        let mut files = HashMap::new();
        let mut staged = Vec::new();
        let mut is_clean = true;

        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("").to_string();
            let status_flags = entry.status();

            if status_flags.is_empty() {
                continue;
            }

            is_clean = false;

            let status = Self::status_to_string(status_flags);
            let staged_status = if status_flags.contains(git2::Status::INDEX_NEW)
                || status_flags.contains(git2::Status::INDEX_MODIFIED)
                || status_flags.contains(git2::Status::INDEX_DELETED)
                || status_flags.contains(git2::Status::INDEX_RENAMED)
            {
                Some("staged".to_string())
            } else {
                None
            };

            if staged_status.is_some() {
                staged.push(path.clone());
            }

            files.insert(
                path.clone(),
                FileStatus {
                    path,
                    status,
                    staged_status,
                },
            );
        }

        Ok(GitStatus {
            branch,
            ahead,
            behind,
            is_clean,
            files,
            staged,
        })
    }

    /// Stage file for commit
    pub fn stage_file(repo_path: impl AsRef<Path>, file_path: &str) -> Result<()> {
        let repo = Repository::open(repo_path)?;
        let mut index = repo.index()?;
        index.add_path(std::path::Path::new(file_path))?;
        index.write()?;
        Ok(())
    }

    /// Commit staged changes
    pub fn commit(
        repo_path: impl AsRef<Path>,
        message: &str,
    ) -> Result<String> {
        let repo = Repository::open(repo_path)?;
        let signature = repo.signature()?;
        let tree_id = {
            let mut index = repo.index()?;
            index.write_tree()?
        };

        let tree = repo.find_tree(tree_id)?;
        let parent_commit = repo.head()?.peel_to_commit()?;
        let commit_id = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent_commit],
        )?;

        Ok(commit_id.to_string())
    }

    fn get_ahead_behind(_repo: &Repository) -> Result<(u32, u32)> {
        Ok((0, 0))
    }

    fn status_to_string(status: Status) -> String {
        if status.contains(Status::WT_MODIFIED) || status.contains(Status::INDEX_MODIFIED) {
            "M".to_string()
        } else if status.contains(Status::WT_NEW) || status.contains(Status::INDEX_NEW) {
            "A".to_string()
        } else if status.contains(Status::WT_DELETED) || status.contains(Status::INDEX_DELETED) {
            "D".to_string()
        } else if status.contains(Status::WT_RENAMED) || status.contains(Status::INDEX_RENAMED) {
            "R".to_string()
        } else if status.contains(Status::CONFLICTED) {
            "C".to_string()
        } else {
            "?".to_string()
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: u64,
}
