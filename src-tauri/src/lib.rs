// ─── Control Core Library ────────────────────────────────────────────────

pub mod error;
pub mod file;
pub mod git;
pub mod search;
pub mod terminal;
pub mod watcher;

pub use error::{ControlError, Result};
