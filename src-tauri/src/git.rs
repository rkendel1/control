use crate::error::Result;
use git2::{IndexAddOption, Repository, Status};
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
    pub has_worktree_changes: bool,
}

impl GitManager {
    fn is_protected_path(path: &str) -> bool {
        if path.split('/').any(|part| part == ".control") {
            return true;
        }
        path.split('/').any(|part| {
            part == ".env"
                || part.starts_with(".env.")
                || matches!(
                    part.to_ascii_lowercase().as_str(),
                    "credentials.json"
                        | "credential.json"
                        | "secrets.json"
                        | "secret.json"
                        | "credentials.yaml"
                        | "credentials.yml"
                        | "secrets.yaml"
                        | "secrets.yml"
                )
        })
    }

    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    /// Get repository status
    pub fn status(repo_path: impl AsRef<Path>) -> Result<GitStatus> {
        let repo = Repository::open(repo_path)?;

        // Get current branch
        let branch = repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_string))
            .or_else(|| {
                repo.find_reference("HEAD").ok().and_then(|head| {
                    head.symbolic_target()
                        .and_then(|name| name.rsplit('/').next())
                        .map(str::to_string)
                })
            })
            .unwrap_or_else(|| "main".to_string());

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
            let has_worktree_changes = status_flags.intersects(
                git2::Status::WT_NEW
                    | git2::Status::WT_MODIFIED
                    | git2::Status::WT_DELETED
                    | git2::Status::WT_RENAMED
                    | git2::Status::WT_TYPECHANGE,
            );

            if staged_status.is_some() {
                staged.push(path.clone());
            }

            files.insert(
                path.clone(),
                FileStatus {
                    path,
                    status,
                    staged_status,
                    has_worktree_changes,
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
        if Self::is_protected_path(file_path) {
            return Err(crate::error::ControlError::AuthorizationDenied(format!(
                "Protected local credential file cannot be staged: {file_path}"
            )));
        }
        let repo_path = repo_path.as_ref();
        let repo = Repository::open(repo_path)?;
        let mut index = repo.index()?;
        let normalized = file_path.trim_end_matches(['/', '\\']);
        let relative = std::path::Path::new(normalized);
        if repo_path.join(relative).is_dir() {
            index.add_all([relative], IndexAddOption::DEFAULT, None)?;
        } else if repo_path.join(relative).exists() {
            index.add_path(relative)?;
        } else {
            index.remove_path(relative)?;
        }
        index.write()?;
        Ok(())
    }

    /// Commit staged changes
    pub fn commit(repo_path: impl AsRef<Path>, message: &str) -> Result<String> {
        let repo = Repository::open(repo_path)?;
        let signature = repo.signature()?;
        let tree_id = {
            let mut index = repo.index()?;
            index.write_tree()?
        };

        let tree = repo.find_tree(tree_id)?;
        let commit_id = match repo.head().ok().and_then(|head| head.peel_to_commit().ok()) {
            Some(parent) => repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &[&parent],
            )?,
            None => repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &[])?,
        };

        Ok(commit_id.to_string())
    }

    fn get_ahead_behind(repo: &Repository) -> Result<(u32, u32)> {
        let head = match repo.head().ok().and_then(|head| head.target()) {
            Some(head) => head,
            None => return Ok((0, 0)),
        };
        let branch = match repo
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_string))
        {
            Some(branch) => branch,
            None => return Ok((0, 0)),
        };
        let upstream = match repo
            .find_branch(&branch, git2::BranchType::Local)
            .ok()
            .and_then(|branch| branch.upstream().ok())
            .and_then(|branch| branch.get().target())
        {
            Some(upstream) => upstream,
            None => return Ok((0, 0)),
        };
        let (ahead, behind) = repo.graph_ahead_behind(head, upstream)?;
        Ok((ahead as u32, behind as u32))
    }

    fn status_to_string(status: Status) -> String {
        if status.contains(Status::CONFLICTED) {
            "C".to_string()
        } else if status.contains(Status::WT_MODIFIED) || status.contains(Status::INDEX_MODIFIED) {
            "M".to_string()
        } else if status.contains(Status::WT_NEW) || status.contains(Status::INDEX_NEW) {
            "A".to_string()
        } else if status.contains(Status::WT_DELETED) || status.contains(Status::INDEX_DELETED) {
            "D".to_string()
        } else if status.contains(Status::WT_RENAMED) || status.contains(Status::INDEX_RENAMED) {
            "R".to_string()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supports_an_unborn_repository_and_initial_commit() {
        let root = std::env::temp_dir().join(format!("control-git-test-{}", uuid::Uuid::new_v4()));
        let repo = Repository::init(&root).expect("initialize repository");
        repo.config()
            .expect("config")
            .set_str("user.name", "Control Test")
            .expect("name");
        repo.config()
            .expect("config")
            .set_str("user.email", "control@example.test")
            .expect("email");
        std::fs::write(root.join("README.md"), "hello\n").expect("write fixture");
        GitManager::stage_file(&root, "README.md").expect("stage initial file");
        let status = GitManager::status(&root).expect("status before first commit");
        assert!(status.staged.contains(&"README.md".to_string()));
        GitManager::commit(&root, "Initial commit").expect("initial commit");
        assert_eq!(
            repo.head()
                .expect("head")
                .peel_to_commit()
                .expect("commit")
                .message(),
            Some("Initial commit")
        );
        std::fs::remove_dir_all(&root).expect("remove fixture");
    }

    #[test]
    fn stages_deleted_files() {
        let root =
            std::env::temp_dir().join(format!("control-git-delete-test-{}", uuid::Uuid::new_v4()));
        let repo = Repository::init(&root).expect("initialize repository");
        repo.config()
            .expect("config")
            .set_str("user.name", "Control Test")
            .expect("name");
        repo.config()
            .expect("config")
            .set_str("user.email", "control@example.test")
            .expect("email");
        std::fs::write(root.join("obsolete.txt"), "remove me\n").expect("write fixture");
        GitManager::stage_file(&root, "obsolete.txt").expect("stage initial file");
        GitManager::commit(&root, "Add obsolete file").expect("initial commit");
        std::fs::remove_file(root.join("obsolete.txt")).expect("delete fixture file");
        GitManager::stage_file(&root, "obsolete.txt").expect("stage deletion");
        let status = GitManager::status(&root).expect("status after deletion");
        assert!(status.staged.contains(&"obsolete.txt".to_string()));
        assert_eq!(
            status
                .files
                .get("obsolete.txt")
                .map(|file| file.status.as_str()),
            Some("D")
        );
        std::fs::remove_dir_all(&root).expect("remove fixture");
    }

    #[test]
    fn stages_every_file_in_an_untracked_directory() {
        let root = std::env::temp_dir().join(format!(
            "control-git-directory-test-{}",
            uuid::Uuid::new_v4()
        ));
        Repository::init(&root).expect("initialize repository");
        std::fs::create_dir(root.join("assets")).expect("create directory");
        std::fs::write(root.join("assets/one.txt"), "one\n").expect("write first fixture");
        std::fs::write(root.join("assets/two.txt"), "two\n").expect("write second fixture");

        GitManager::stage_file(&root, "assets/").expect("stage directory");

        let status = GitManager::status(&root).expect("status after staging directory");
        assert!(status.staged.contains(&"assets/one.txt".to_string()));
        assert!(status.staged.contains(&"assets/two.txt".to_string()));
        std::fs::remove_dir_all(&root).expect("remove fixture");
    }

    #[test]
    fn refuses_to_stage_local_environment_files() {
        let root = std::env::temp_dir().join(format!(
            "control-git-secret-test-{}",
            uuid::Uuid::new_v4()
        ));
        Repository::init(&root).expect("initialize repository");
        std::fs::write(root.join(".env.local"), "API_KEY=secret\n").expect("write fixture");

        let error = GitManager::stage_file(&root, ".env.local").expect_err("reject secret file");

        assert!(error.to_string().contains("Protected local credential"));
        let status = GitManager::status(&root).expect("status after rejection");
        assert!(status.staged.is_empty());
        std::fs::remove_dir_all(&root).expect("remove fixture");
    }
}
