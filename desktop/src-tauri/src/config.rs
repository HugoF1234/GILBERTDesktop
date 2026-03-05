use std::path::PathBuf;

use dirs::{cache_dir, data_dir};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("no data directory available on this platform")]
    NoDataDir,
    #[error("failed to create directory {path}: {source}")]
    Mkdir {
        path: String,
        source: std::io::Error,
    },
}

#[derive(Debug, Clone)]
pub struct AppDirs {
    pub root: PathBuf,
    pub audio_dir: PathBuf,
    pub queue_file: PathBuf,
    pub results_file: PathBuf,
    pub cache_dir: PathBuf,
}

impl AppDirs {
    pub fn new() -> Result<Self, ConfigError> {
        let base = data_dir()
            .ok_or(ConfigError::NoDataDir)?
            .join("gilbert-desktop");
        let audio_dir = base.join("audio");
        let cache = cache_dir().unwrap_or(base.clone());
        let queue_file = base.join("queue.json");
        let results_file = base.join("results.json");

        for dir in [&base, &audio_dir, &cache] {
            std::fs::create_dir_all(dir).map_err(|source| ConfigError::Mkdir {
                path: dir.display().to_string(),
                source,
            })?;
        }

        Ok(Self {
            root: base,
            audio_dir,
            queue_file,
            results_file,
            cache_dir: cache,
        })
    }
}
