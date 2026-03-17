use std::path::PathBuf;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Mutex as AsyncMutex;

use crate::{
    api::{ApiClient, ApiResult},
    config::AppDirs,
    network,
    queue::{JobStatus, QueueJob, QueueManager},
    recorder::{Recorder, RecordingMode},
    system_audio::{self, SystemAudioCapture},
    video_app_detector::VideoAppDetector,
};

#[derive(Debug, Error)]
pub enum StateError {
    #[error("recorder: {0}")]
    Recorder(String),
    #[error("queue: {0}")]
    Queue(String),
    #[error("api: {0}")]
    Api(String),
    #[error("io: {0}")]
    Io(String),
    #[error("system audio: {0}")]
    SystemAudio(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusPayload {
    pub is_recording: bool,
    pub is_system_audio_recording: bool,
    pub system_audio_available: bool,
    pub system_audio_permission: bool,
    pub online: bool,
    pub queue_len: usize,
    /// Nombre de jobs Pending ou Failed (pour le badge Récupérer)
    pub pending_queue_count: usize,
    pub last_result: Option<ApiResult>,
}

pub struct AppState {
    pub dirs: AppDirs,
    pub recorder: Mutex<Recorder>,
    pub video_detector: Mutex<VideoAppDetector>,
    pub system_audio: Mutex<Option<Box<dyn SystemAudioCapture>>>,
    pub queue: AsyncMutex<QueueManager>,
    pub api: ApiClient,
    pub online: Mutex<bool>,
    pub last_result: Mutex<Option<ApiResult>>,
    /// Cache de la permission system audio — mis à jour uniquement au démarrage
    /// pour éviter d'appeler SCShareableContent (et sa popup) en boucle
    pub system_audio_permission_cache: std::sync::atomic::AtomicBool,
}

impl AppState {
    pub fn new(dirs: AppDirs, api: ApiClient, queue: QueueManager, app_identifier: String) -> Self {
        // Try to create system audio capturer (optional - only on supported platforms)
        let system_audio = match system_audio::create_capturer() {
            Ok(capturer) => {
                println!("✅ System audio capture available");
                Some(capturer)
            }
            Err(e) => {
                println!("⚠️ System audio capture not available: {}", e);
                None
            }
        };

        Self {
            dirs,
            recorder: Mutex::new(Recorder::new()),
            video_detector: Mutex::new(VideoAppDetector::new(app_identifier)),
            system_audio: Mutex::new(system_audio),
            queue: AsyncMutex::new(queue),
            api,
            online: Mutex::new(true),
            last_result: Mutex::new(None),
            system_audio_permission_cache: std::sync::atomic::AtomicBool::new(false),
        }
    }

    /// Scanne le dossier audio/ au démarrage et enregistre dans la queue
    /// tous les fichiers WAV qui ne sont pas déjà référencés.
    /// Cela protège contre les crashes pendant un enregistrement.
    pub async fn recover_orphaned_audio_files(&self) {
        let audio_dir = &self.dirs.audio_dir;
        let wav_files: Vec<PathBuf> = match std::fs::read_dir(audio_dir) {
            Ok(entries) => entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.extension().and_then(|e| e.to_str()) == Some("wav")
                        && p.metadata().map(|m| m.len() > 1024).unwrap_or(false) // > 1 Ko = enregistrement réel
                })
                .collect(),
            Err(_) => return,
        };

        if wav_files.is_empty() {
            return;
        }

        let mut queue = self.queue.lock().await;

        // Construire l'ensemble des fichiers déjà dans la queue
        let known: std::collections::HashSet<String> = queue
            .store
            .jobs
            .iter()
            .filter(|j| j.status != crate::queue::JobStatus::Done)
            .map(|j| j.file_path.clone())
            .collect();

        // Lire le token/titre de la dernière session (crash recovery)
        let (session_token, session_title) = self.load_recording_session().unwrap_or((None, None));

        let mut orphans = 0usize;
        for wav in wav_files {
            let path_str = wav.display().to_string();
            // Ignorer les fichiers déjà dans la queue
            if known.contains(&path_str) {
                continue;
            }
            let name = wav.file_name().and_then(|n| n.to_str()).unwrap_or("");
            println!("[RECOVERY] Fichier WAV orphelin détecté: {}", name);

            let title = session_title.clone().unwrap_or_else(|| "Enregistrement récupéré".to_string());
            let _ = queue.enqueue_with_metadata(wav.clone(), session_token.clone(), Some(title), None);
            orphans += 1;
        }

        if orphans > 0 {
            println!("[RECOVERY] ✅ {} fichier(s) audio orphelin(s) ajouté(s) à la queue", orphans);
            // Effacer la session en cours (le crash est terminé, les fichiers sont en queue)
            self.clear_recording_session();
        }
    }

    /// Check if system audio capture has permission
    /// Met à jour le cache pour éviter les appels répétés à SCShareableContent
    pub fn has_system_audio_permission(&self) -> bool {
        if let Some(ref capturer) = *self.system_audio.lock() {
            let result = capturer.has_permission();
            self.system_audio_permission_cache.store(result, std::sync::atomic::Ordering::Relaxed);
            result
        } else {
            false
        }
    }

    /// Request system audio permission
    /// Met à jour le cache après la demande
    pub fn request_system_audio_permission(&self) -> Result<bool, StateError> {
        if let Some(ref capturer) = *self.system_audio.lock() {
            let result = capturer.request_permission().map_err(|e| StateError::SystemAudio(e.to_string()))?;
            self.system_audio_permission_cache.store(result, std::sync::atomic::Ordering::Relaxed);
            Ok(result)
        } else {
            Err(StateError::SystemAudio("System audio capture not available".into()))
        }
    }

    /// Start system audio capture
    pub fn start_system_audio(&self) -> Result<PathBuf, StateError> {
        if let Some(ref mut capturer) = *self.system_audio.lock() {
            let filename = format!("system_audio_{}.wav", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
            let path = self.dirs.audio_dir.join(filename);
            capturer.start_recording(path.clone())
                .map_err(|e| StateError::SystemAudio(e.to_string()))?;
            Ok(path)
        } else {
            Err(StateError::SystemAudio("System audio capture not available".into()))
        }
    }

    /// Stop system audio capture
    pub fn stop_system_audio(&self) -> Result<Option<PathBuf>, StateError> {
        if let Some(ref mut capturer) = *self.system_audio.lock() {
            capturer.stop_recording()
                .map_err(|e| StateError::SystemAudio(e.to_string()))
        } else {
            Ok(None)
        }
    }

    /// Check if system audio is currently recording
    pub fn is_system_audio_recording(&self) -> bool {
        if let Some(ref capturer) = *self.system_audio.lock() {
            capturer.is_recording()
        } else {
            false
        }
    }

    pub async fn refresh_online(&self) {
        let ok = network::is_online(&self.api.client).await;
        *self.online.lock() = ok;
    }

    pub async fn status(&self) -> StatusPayload {
        println!("[STATE] status() called");

        // Obtenir queue_len et pending_queue_count avec un timeout pour éviter les deadlocks
        let (queue_len, pending_queue_count) = {
            use tokio::time::{timeout, Duration};
            match timeout(Duration::from_millis(100), self.queue.lock()).await {
                Ok(guard) => {
                    let total = guard.store.jobs.len();
                    let pending = guard.store.jobs.iter()
                        .filter(|j| j.status == crate::queue::JobStatus::Pending || j.status == crate::queue::JobStatus::Failed)
                        .count();
                    (total, pending)
                }
                Err(_) => {
                    println!("[STATE] ⚠️ Timeout sur queue.lock(), utilisant 0");
                    (0, 0)
                }
            }
        };

        println!("[STATE] queue_len = {}, pending_queue_count = {}", queue_len, pending_queue_count);

        // Obtenir les valeurs system_audio — NE PAS appeler has_permission() ici
        // car cela triggerait SCShareableContent à chaque get_status (toutes les 3s)
        // La permission est gérée uniquement au démarrage de l'enregistrement
        let (system_audio_available, is_system_audio_rec) = {
            let guard = self.system_audio.lock();
            let available = guard.is_some();
            let is_rec = if let Some(ref capturer) = *guard {
                capturer.is_recording()
            } else {
                false
            };
            (available, is_rec)
        };
        // Utiliser le cache de permission (mis à jour uniquement au démarrage)
        let system_audio_permission = self.system_audio_permission_cache.load(std::sync::atomic::Ordering::Relaxed);

        let is_rec = self.recorder.lock().is_recording();
        println!("[STATE] is_recording = {}", is_rec);

        let online = *self.online.lock();
        let last_result = self.last_result.lock().clone();

        println!("[STATE] Building StatusPayload...");

        StatusPayload {
            is_recording: is_rec,
            is_system_audio_recording: is_system_audio_rec,
            system_audio_available,
            system_audio_permission,
            online,
            queue_len,
            pending_queue_count,
            last_result,
        }
    }

    pub fn start_record(&self) -> Result<PathBuf, StateError> {
        self.start_record_with_mode(RecordingMode::Both)
    }

    pub fn start_record_with_mode(&self, mode: RecordingMode) -> Result<PathBuf, StateError> {
        let mut recorder = self.recorder.lock();

        // Vérifier si déjà en train d'enregistrer AVANT de notifier le détecteur
        if recorder.is_recording() {
            println!("[STATE] Déjà en train d'enregistrer - retourne le status actuel");
            // Retourner le chemin actuel si disponible, sinon une erreur
            return Err(StateError::Recorder("Already recording".to_string()));
        }

        println!("[STATE] Démarrage enregistrement avec mode: {:?}", mode);

        // Démarrer l'enregistrement avec le mode spécifié
        let result = recorder
            .start_with_mode(self.dirs.audio_dir.clone(), mode)
            .map_err(|e| StateError::Recorder(e.to_string()));

        // Indiquer au détecteur qu'on enregistre SEULEMENT si le démarrage a réussi
        if result.is_ok() {
            self.video_detector.lock().set_recording(true);
        }

        result
    }

    /// Sauvegarde le token/titre dans recording_session.json au démarrage.
    /// En cas de crash, le scan d'orphelins peut utiliser ces métadonnées.
    pub fn save_recording_session(&self, token: Option<&str>, title: Option<&str>) {
        let session_file = self.dirs.root.join("recording_session.json");
        let data = serde_json::json!({
            "token": token,
            "title": title,
            "started_at": chrono::Utc::now().to_rfc3339()
        });
        if let Ok(json) = serde_json::to_string_pretty(&data) {
            let _ = std::fs::write(&session_file, json);
        }
    }

    /// Supprime la session en cours (appelé après stop réussi ou annulation)
    pub fn clear_recording_session(&self) {
        let session_file = self.dirs.root.join("recording_session.json");
        let _ = std::fs::remove_file(&session_file);
    }

    /// Lit la dernière session sauvegardée (pour récupérer token/titre après crash)
    pub fn load_recording_session(&self) -> Option<(Option<String>, Option<String>)> {
        let session_file = self.dirs.root.join("recording_session.json");
        if !session_file.exists() {
            return None;
        }
        let data = std::fs::read_to_string(&session_file).ok()?;
        let v: serde_json::Value = serde_json::from_str(&data).ok()?;
        let token = v["token"].as_str().map(|s| s.to_string());
        let title = v["title"].as_str().map(|s| s.to_string());
        Some((token, title))
    }

    /// Notifie le backend du début d'un enregistrement (async, non-bloquant)
    pub async fn notify_recording_start(&self, token: Option<String>, meeting_title: Option<String>) {
        println!("🎙️ [STATE] Notification début enregistrement au backend...");
        match self.api.notify_recording_start(token, meeting_title).await {
            Ok(response) => {
                println!("✅ [STATE] Backend notifié du début d'enregistrement, session_id: {:?}", response.session_id);
            }
            Err(e) => {
                // Ne pas faire échouer l'enregistrement si la notification échoue
                println!("⚠️ [STATE] Échec notification début enregistrement (non-bloquant): {}", e);
            }
        }
    }

    /// Notifie le backend de la fin d'un enregistrement (async, non-bloquant)
    pub async fn notify_recording_stop(&self, token: Option<String>) {
        println!("🛑 [STATE] Notification fin enregistrement au backend...");
        match self.api.notify_recording_stop(token).await {
            Ok(_) => {
                println!("✅ [STATE] Backend notifié de la fin d'enregistrement");
            }
            Err(e) => {
                // Ne pas faire échouer si la notification échoue
                println!("⚠️ [STATE] Échec notification fin enregistrement (non-bloquant): {}", e);
            }
        }
    }

    /// Annuler l'enregistrement sans uploader (abandon)
    pub fn cancel_recording(&self) -> Result<(), StateError> {
        println!("🗑️ [STATE] Annulation de l'enregistrement (abandon)...");

        // Effacer la session sauvegardée
        self.clear_recording_session();

        // Arrêter l'enregistrement et obtenir le chemin du fichier
        let path = self.recorder.lock().stop();

        // Indiquer au détecteur qu'on a arrêté
        self.video_detector.lock().set_recording(false);

        // Supprimer les fichiers audio s'ils existent
        if let Some(p) = path {
            if p.exists() {
                let _ = std::fs::remove_file(&p);
                println!("🗑️ [STATE] Fichier audio supprimé: {:?}", p);
            }
        }

        // Supprimer aussi les fichiers mic et system si présents
        // (le recorder peut avoir créé plusieurs fichiers)
        let audio_dir = &self.dirs.audio_dir;
        if let Ok(entries) = std::fs::read_dir(audio_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    // Supprimer les fichiers créés récemment (mic-*, system-*)
                    if name.starts_with("mic-") || name.starts_with("system-") {
                        let _ = std::fs::remove_file(&path);
                        println!("🗑️ [STATE] Fichier temporaire supprimé: {:?}", path);
                    }
                }
            }
        }

        println!("✅ [STATE] Enregistrement annulé");
        Ok(())
    }

    pub async fn stop_and_process(&self, token: Option<String>, title: Option<String>) -> Result<(), StateError> {
        println!("🛑 [STATE] Arrêt de l'enregistrement et traitement...");
        if let Some(ref t) = title {
            println!("📝 [STATE] Titre fourni: {}", t);
        }
        let path = self.recorder.lock().stop();
        let Some(path) = path else {
            println!("⚠️ [STATE] Aucun fichier audio à traiter");
            self.clear_recording_session();
            return Ok(());
        };

        println!("📁 [STATE] Fichier audio à traiter: {:?}", path);
        println!("🔐 [STATE] Token fourni: {}", if token.is_some() { "Oui" } else { "Non" });

        // Indiquer au détecteur qu'on a arrêté d'enregistrer (il peut notifier à nouveau)
        self.video_detector.lock().set_recording(false);

        // Notifier le backend de la fin d'enregistrement (non-bloquant)
        self.notify_recording_stop(token.clone()).await;

        println!("🌐 [STATE] Vérification de la connexion...");
        self.refresh_online().await;
        let is_online = *self.online.lock();
        println!("🌐 [STATE] Statut connexion: {}", if is_online { "En ligne" } else { "Hors ligne" });

        if is_online {
            println!("📤 [STATE] Tentative d'envoi au backend...");
            match self.api.transcribe_and_summarize(&path, token.clone(), title.clone()).await {
                Ok(res) => {
                    println!("✅ [STATE] Transcription réussie !");
                    *self.last_result.lock() = Some(res.clone());
                    // Remove audio file after successful processing to save disk
                    let _ = std::fs::remove_file(&path);
                    println!("🗑️ [STATE] Fichier audio supprimé après traitement");
                    // Session terminée avec succès
                    self.clear_recording_session();
                }
                Err(e) => {
                    println!("❌ [STATE] Erreur lors de la transcription: {}", e);
                    println!("📦 [STATE] Mise en queue du fichier pour retry ultérieur...");
                    // Si l'erreur est due à un token manquant, on met en queue quand même
                    // On conserve le titre pour le retry
                    let mut queue = self.queue.lock().await;
                    queue
                        .enqueue_with_metadata(path, token, title.clone(), None)
                        .map_err(|err| StateError::Queue(err.to_string()))?;
                    self.clear_recording_session();
                    return Err(StateError::Api(e.to_string()));
                }
            }
        } else {
            println!("📦 [STATE] Hors ligne - mise en queue du fichier...");
            // On conserve le titre pour le retry ultérieur
            let mut queue = self.queue.lock().await;
            queue
                .enqueue_with_metadata(path, token, title.clone(), None)
                .map_err(|e| StateError::Queue(e.to_string()))?;
            // Session mise en queue — on efface la session en cours
            self.clear_recording_session();
        }
        Ok(())
    }

    pub async fn retry_queue(&self) -> Result<Vec<QueueJob>, StateError> {
        self.refresh_online().await;
        if !*self.online.lock() {
            return Err(StateError::Api("offline".into()));
        }
        let mut queue = self.queue.lock().await;
        let updated = queue
            .retry_all(&self.api)
            .await
            .map_err(|e| StateError::Queue(e.to_string()))?;
        if let Some(done) = updated.iter().rev().find(|j| j.status == JobStatus::Done) {
            if let Some(result) = &done.result {
                *self.last_result.lock() = Some(result.clone());
            }
        }
        Ok(updated)
    }

    pub async fn purge_successful(&self) -> Result<(), StateError> {
        self.queue
            .lock()
            .await
            .purge_successful()
            .map_err(|e| StateError::Queue(e.to_string()))
    }

    /// Delete a specific job from the queue
    pub async fn delete_job(&self, job_id: &str) -> Result<Option<QueueJob>, StateError> {
        self.queue
            .lock()
            .await
            .delete_job(job_id)
            .map_err(|e| StateError::Queue(e.to_string()))
    }

    /// Retry a specific job
    pub async fn retry_job(&self, job_id: &str) -> Result<Option<QueueJob>, StateError> {
        self.refresh_online().await;
        if !*self.online.lock() {
            return Err(StateError::Api("offline".into()));
        }
        let mut queue = self.queue.lock().await;
        let result = queue
            .retry_job(job_id, &self.api)
            .await
            .map_err(|e| StateError::Queue(e.to_string()))?;

        // Update last_result if job succeeded
        if let Some(ref job) = result {
            if job.status == JobStatus::Done {
                if let Some(ref api_result) = job.result {
                    *self.last_result.lock() = Some(api_result.clone());
                }
            }
        }
        Ok(result)
    }

    /// Get a job by ID (for export)
    pub async fn get_job(&self, job_id: &str) -> Option<QueueJob> {
        self.queue.lock().await.get_job(job_id).cloned()
    }
}
