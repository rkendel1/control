//! Engineering memory and context storage.

use crate::error::Result;

pub struct MemoryStore;

impl MemoryStore {
    pub async fn load() -> Result<Self> {
        Ok(Self)
    }

    pub async fn save(&self) -> Result<()> {
        Ok(())
    }
}
