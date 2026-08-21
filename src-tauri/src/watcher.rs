use crate::error::Result;
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEvent {
    pub workspace_path: String,
    pub path: String,
    pub event_type: FileEventType,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FileEventType {
    Created,
    Modified,
    Removed,
    Renamed,
}

pub struct FileWatcher {
    _watcher: RecommendedWatcher,
    root: PathBuf,
}

impl FileWatcher {
    pub fn watch_directory(
        path: impl AsRef<Path>,
        on_change: impl Fn(FileChangeEvent) + Send + 'static,
    ) -> Result<Self> {
        let root = path.as_ref().canonicalize()?;
        let callback_root = root.clone();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<notify::Event>| {
                let Ok(event) = result else { return };
                let event_type = match event.kind {
                    EventKind::Create(_) => FileEventType::Created,
                    EventKind::Modify(notify::event::ModifyKind::Name(_)) => FileEventType::Renamed,
                    EventKind::Modify(_) => FileEventType::Modified,
                    EventKind::Remove(_) => FileEventType::Removed,
                    _ => return,
                };
                for changed_path in event.paths {
                    let relative = changed_path
                        .strip_prefix(&callback_root)
                        .unwrap_or(&changed_path)
                        .to_string_lossy()
                        .replace('\\', "/");
                    on_change(FileChangeEvent {
                        workspace_path: callback_root.to_string_lossy().to_string(),
                        path: relative,
                        event_type,
                        timestamp: chrono::Utc::now().timestamp_millis().max(0) as u64,
                    });
                }
            },
            Config::default(),
        )?;
        watcher.watch(&root, RecursiveMode::Recursive)?;
        Ok(Self {
            _watcher: watcher,
            root,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emits_workspace_relative_file_events() {
        let root = std::env::temp_dir().join(format!("control-watcher-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("src")).expect("create fixture");
        let (sender, receiver) = std::sync::mpsc::channel();
        let watcher = FileWatcher::watch_directory(&root, move |event| {
            let _ = sender.send(event);
        })
        .expect("watch fixture");
        let watched = root.join("src/watched.txt");
        let event = (0..40)
            .find_map(|attempt| {
                std::fs::write(&watched, format!("changed {attempt}\n"))
                    .expect("write watched file");
                let deadline = std::time::Instant::now() + std::time::Duration::from_millis(250);
                while let Some(remaining) =
                    deadline.checked_duration_since(std::time::Instant::now())
                {
                    match receiver.recv_timeout(remaining) {
                        Ok(event) if event.path == "src/watched.txt" => return Some(event),
                        Ok(_) => continue,
                        Err(_) => break,
                    }
                }
                None
            })
            .expect("receive watched event");
        assert_eq!(event.workspace_path, watcher.root().to_string_lossy());
        assert!(matches!(
            event.event_type,
            FileEventType::Created | FileEventType::Modified
        ));
        drop(watcher);
        std::fs::remove_dir_all(root).expect("remove fixture");
    }
}
