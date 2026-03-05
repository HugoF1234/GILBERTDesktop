use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::api::{ApiClient, ApiError, ApiResult};

#[derive(Debug, Error)]
pub enum QueueError {
    #[error("io error: {0}")]
    Io(String),
    #[error("api error: {0}")]
    Api(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Pending,
    Uploading,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueJob {
    pub id: String,
    pub file_path: String,
    pub status: JobStatus,
    pub retries: u32,
    pub last_error: Option<String>,
    pub updated_at: DateTime<Utc>,
    pub result: Option<ApiResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<u64>,
    #[serde(default)]
    pub created_at: DateTime<Utc>,
}

impl QueueJob {
    pub fn new(file_path: PathBuf) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.display().to_string(),
            status: JobStatus::Pending,
            retries: 0,
            last_error: None,
            updated_at: now,
            result: None,
            token: None,
            title: None,
            duration_secs: None,
            created_at: now,
        }
    }

    pub fn with_token(file_path: PathBuf, token: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.display().to_string(),
            status: JobStatus::Pending,
            retries: 0,
            last_error: None,
            updated_at: now,
            result: None,
            token,
            title: None,
            duration_secs: None,
            created_at: now,
        }
    }

    pub fn with_metadata(file_path: PathBuf, token: Option<String>, title: Option<String>, duration_secs: Option<u64>) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.display().to_string(),
            status: JobStatus::Pending,
            retries: 0,
            last_error: None,
            updated_at: now,
            result: None,
            token,
            title,
            duration_secs,
            created_at: now,
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
pub struct QueueStore {
    pub jobs: Vec<QueueJob>,
}

pub struct QueueManager {
    file: PathBuf,
    pub store: QueueStore,
}

impl QueueManager {
    pub fn load(file: PathBuf) -> Result<Self, QueueError> {
        if !file.exists() {
            return Ok(Self {
                file,
                store: QueueStore::default(),
            });
        }

        let data = fs::read_to_string(&file).map_err(|e| QueueError::Io(e.to_string()))?;
        let store: QueueStore =
            serde_json::from_str(&data).map_err(|e| QueueError::Io(e.to_string()))?;
        Ok(Self { file, store })
    }

    fn persist(&self) -> Result<(), QueueError> {
        let data =
            serde_json::to_string_pretty(&self.store).map_err(|e| QueueError::Io(e.to_string()))?;
        fs::write(&self.file, data).map_err(|e| QueueError::Io(e.to_string()))
    }

    pub fn enqueue(&mut self, file_path: PathBuf) -> Result<QueueJob, QueueError> {
        let job = QueueJob::new(file_path);
        self.store.jobs.push(job.clone());
        self.persist()?;
        Ok(job)
    }

    pub fn enqueue_with_token(&mut self, file_path: PathBuf, token: Option<String>) -> Result<QueueJob, QueueError> {
        let job = QueueJob::with_token(file_path, token);
        self.store.jobs.push(job.clone());
        self.persist()?;
        Ok(job)
    }

    pub fn enqueue_with_metadata(&mut self, file_path: PathBuf, token: Option<String>, title: Option<String>, duration_secs: Option<u64>) -> Result<QueueJob, QueueError> {
        let job = QueueJob::with_metadata(file_path, token, title, duration_secs);
        self.store.jobs.push(job.clone());
        self.persist()?;
        Ok(job)
    }

    pub fn list(&self) -> Vec<QueueJob> {
        self.store.jobs.clone()
    }

    pub fn purge_successful(&mut self) -> Result<(), QueueError> {
        self.store.jobs.retain(|j| j.status != JobStatus::Done);
        self.persist()
    }

    /// Delete a specific job by ID
    pub fn delete_job(&mut self, job_id: &str) -> Result<Option<QueueJob>, QueueError> {
        let idx = self.store.jobs.iter().position(|j| j.id == job_id);
        if let Some(idx) = idx {
            let job = self.store.jobs.remove(idx);
            // Also delete the audio file
            let path = std::path::Path::new(&job.file_path);
            if path.exists() {
                let _ = std::fs::remove_file(path);
            }
            self.persist()?;
            Ok(Some(job))
        } else {
            Ok(None)
        }
    }

    /// Export a job's audio file to a user-specified location
    pub fn get_job(&self, job_id: &str) -> Option<&QueueJob> {
        self.store.jobs.iter().find(|j| j.id == job_id)
    }

    /// Get a mutable job by ID for status updates
    pub fn get_job_mut(&mut self, job_id: &str) -> Option<&mut QueueJob> {
        self.store.jobs.iter_mut().find(|j| j.id == job_id)
    }

    /// Retry a single job
    pub async fn retry_job(&mut self, job_id: &str, api: &ApiClient) -> Result<Option<QueueJob>, QueueError> {
        // Find and update the job
        let job_snapshot = {
            let job = self.store.jobs.iter_mut().find(|j| j.id == job_id);
            match job {
                Some(j) if j.status == JobStatus::Done => return Ok(Some(j.clone())),
                Some(j) => {
                    j.status = JobStatus::Uploading;
                    j.updated_at = Utc::now();
                    j.clone()
                }
                None => return Ok(None),
            }
        };
        self.persist()?;

        let result = Self::process_job(&job_snapshot, api).await;

        // Update job with result
        if let Some(job) = self.store.jobs.iter_mut().find(|j| j.id == job_id) {
            match result {
                Ok(res) => {
                    job.status = JobStatus::Done;
                    job.result = Some(res);
                    job.last_error = None;
                    let _ = std::fs::remove_file(&job.file_path);
                }
                Err(e) => {
                    job.status = JobStatus::Failed;
                    job.last_error = Some(e.to_string());
                    job.retries += 1;
                }
            }
            job.updated_at = Utc::now();
        }
        self.persist()?;

        Ok(self.store.jobs.iter().find(|j| j.id == job_id).cloned())
    }

    pub async fn retry_all(&mut self, api: &ApiClient) -> Result<Vec<QueueJob>, QueueError> {
        let mut updated = vec![];
        for idx in 0..self.store.jobs.len() {
            let job_snapshot = {
                let job = &mut self.store.jobs[idx];
                if job.status == JobStatus::Done {
                    updated.push(job.clone());
                    continue;
                }
                job.status = JobStatus::Uploading;
                job.updated_at = Utc::now();
                job.clone()
            };
            self.persist()?;

            let result = Self::process_job(&job_snapshot, api).await;

            {
                let job = &mut self.store.jobs[idx];
                match result {
                    Ok(res) => {
                        job.status = JobStatus::Done;
                        job.result = Some(res);
                        job.last_error = None;
                        let _ = std::fs::remove_file(&job.file_path);
                    }
                    Err(e) => {
                        job.status = JobStatus::Failed;
                        job.last_error = Some(e.to_string());
                        job.retries += 1;
                    }
                }
                job.updated_at = Utc::now();
            }
            self.persist()?;
            updated.push(self.store.jobs[idx].clone());
        }

        Ok(updated)
    }

    async fn process_job(job: &QueueJob, api: &ApiClient) -> Result<ApiResult, QueueError> {
        // Utiliser le titre stocké dans le job s'il existe
        let res = api
            .transcribe_and_summarize(Path::new(&job.file_path), job.token.clone(), job.title.clone())
            .await
            .map_err(|e| match e {
                ApiError::MissingConfig => QueueError::Api("missing API config".into()),
                ApiError::MissingToken => QueueError::Api("missing authentication token".into()),
                ApiError::Http(s) | ApiError::Serde(s) => QueueError::Api(s),
            })?;
        Ok(res)
    }
}
