use crate::error::Result;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
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
            let mut watcher = match RecommendedWatcher::new(
                move |res: notify::Result<notify::Event>| match res {
                    Ok(event) => {
                        let (event_type, path_str) = match event.kind {
                            EventKind::Create(_) => {
                                if let Some(p) = event.paths.first() {
                                    (FileEventType::Created, p.to_string_lossy().to_string())
                                } else {
                                    return;
                                }
                            }
                            EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                                if let Some(p) = event.paths.first() {
                                    (FileEventType::Renamed, p.to_string_lossy().to_string())
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
                },
                Config::default(),
            ) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("Failed to initialize watcher: {}", e);
                    return;
                }
            };

            if let Err(e) = watcher.watch(&path, RecursiveMode::Recursive) {
                eprintln!("Failed to watch directory {}: {}", path.display(), e);
                return;
            }

            // Keep watcher alive for as long as this thread is alive.
            loop {
                std::thread::park();
            }
        });

        Ok(())
    }
}
