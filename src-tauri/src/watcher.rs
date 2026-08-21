use crate::error::Result;
use notify::{Watcher, RecursiveMode, watcher};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Event emitted when a file is modified
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FileChangeEvent {
    pub path: String,
    pub event_type: FileEventType,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize)]
pub enum FileEventType {
    Created,
    Modified,
    Removed,
    Renamed,
}

/// File system watcher for detecting changes
pub struct FileWatcher {
    sender: mpsc::UnboundedSender<FileChangeEvent>,
}

impl FileWatcher {
    pub fn new(sender: mpsc::UnboundedSender<FileChangeEvent>) -> Result<Self> {
        Ok(Self { sender })
    }

    /// Watch a directory for file changes
    pub fn watch_directory(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref().to_path_buf();
        let sender = self.sender.clone();

        std::thread::spawn(move || {
            if let Ok(mut watcher) = watcher(
                move |res| {
                    match res {
                        Ok(event) => {
                            use notify::EventKind;
                            let (event_type, path_str) = match event.kind {
                                EventKind::Create(_) => {
                                    if let Some(p) = event.paths.first() {
                                        (FileEventType::Created, p.to_string_lossy().to_string())
                                    } else {
                                        return;
                                    }
                                }
                                EventKind::Modify(_) => {
                                    if let Some(p) = event.paths.first() {
                                        (FileEventType::Modified, p.to_string_lossy().to_string())
                                    } else {
                                        return;
                                    }
                                }
                                EventKind::Remove(_) => {
                                    if let Some(p) = event.paths.first() {
                                        (FileEventType::Removed, p.to_string_lossy().to_string())
                                    } else {
                                        return;
                                    }
                                }
                                EventKind::Rename(_) => {
                                    if let Some(p) = event.paths.first() {
                                        (FileEventType::Renamed, p.to_string_lossy().to_string())
                                    } else {
                                        return;
                                    }
                                }
                                _ => return,
                            };

                            let change_event = FileChangeEvent {
                                path: path_str,
                                event_type,
                                timestamp: chrono::Utc::now().timestamp() as u64,
                            };

                            let _ = sender.send(change_event);
                        }
                        Err(e) => {
                            eprintln!("Watch error: {}", e);
                        }
                    }
                },
                Default::default(),
            ) {
                let _ = watcher.watch(&path, RecursiveMode::Recursive);
                std::future::pending::<()>().await;
            }
        });

        Ok(())
    }
}
