//! Agent runtime management.

use crate::error::Result;

pub struct RuntimeManager;

impl RuntimeManager {
    pub async fn discover() -> Result<Self> {
        Ok(Self)
    }

    pub async fn stop_all(&mut self) -> Result<()> {
        Ok(())
    }
}
