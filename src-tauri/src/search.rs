use crate::error::Result;
use std::path::Path;
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
        case_sensitive: bool,
        whole_word: bool,
        use_regex: bool,
        include_generated: bool,
    ) -> Result<Vec<SearchResult>> {
        let mut results = Vec::new();
        let workspace_root = workspace_path.as_ref().to_path_buf();
        let mut stack = vec![workspace_root.clone()];
        let expression = if use_regex {
            Some(
                regex::RegexBuilder::new(pattern)
                    .case_insensitive(!case_sensitive)
                    .build()
                    .map_err(|error| crate::error::ControlError::ConfigError(error.to_string()))?,
            )
        } else {
            None
        };
        let needle = if case_sensitive {
            pattern.to_string()
        } else {
            pattern.to_lowercase()
        };

        while let Some(path) = stack.pop() {
            if !path.is_dir() {
                continue;
            }

            let mut entries = fs::read_dir(&path).await?;

            while let Some(entry) = entries.next_entry().await? {
                let entry_path = entry.path();
                let file_type = entry.file_type().await?;
                let file_name = entry.file_name();

                // Always skip Git internals; generated/vendor trees follow the UI's All toggle.
                let name_str = file_name.to_string_lossy();
                if Self::should_ignore(&name_str, include_generated) {
                    continue;
                }

                if file_type.is_dir() {
                    stack.push(entry_path);
                    continue;
                }

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
                        let matched = if let Some(expression) = &expression {
                            expression.is_match(line)
                        } else {
                            let haystack = if case_sensitive {
                                line.to_string()
                            } else {
                                line.to_lowercase()
                            };
                            if whole_word {
                                haystack
                                    .split(|character: char| {
                                        !character.is_alphanumeric() && character != '_'
                                    })
                                    .any(|word| word == needle)
                            } else {
                                haystack.contains(&needle)
                            }
                        };
                        if matched {
                            results.push(SearchResult {
                                file_path: entry_path
                                    .strip_prefix(&workspace_root)
                                    .unwrap_or(&entry_path)
                                    .to_string_lossy()
                                    .to_string(),
                                line_number: line_num + 1,
                                line: line.to_string(),
                            });
                            if results.len() >= 2000 {
                                return Ok(results);
                            }
                        }
                    }
                }
            }
        }

        Ok(results)
    }

    fn should_ignore(name: &str, include_generated: bool) -> bool {
        name == ".git"
            || !include_generated
                && matches!(
                    name,
                    "node_modules"
                        | "target"
                        | "dist"
                        | "build"
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
