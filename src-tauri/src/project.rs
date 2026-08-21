//! Project management.

use crate::error::Result;

pub struct ProjectRegistry;

impl ProjectRegistry {
    pub async fn load() -> Result<Self> {
        Ok(Self)
    }

    pub async fn save(&self) -> Result<()> {
        Ok(())
    }
}
