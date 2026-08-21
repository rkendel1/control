//! Task engine.

use crate::error::Result;

pub struct TaskEngine;

impl TaskEngine {
    pub fn new() -> Self {
        Self
    }

    pub async fn save(&self) -> Result<()> {
        Ok(())
    }
}
