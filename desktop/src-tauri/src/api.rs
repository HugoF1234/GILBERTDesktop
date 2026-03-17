use std::{fs, path::Path};

use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};
use thiserror::Error;

// Constantes pour l'identification du device
pub const DEVICE_TYPE: &str = "desktop";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Error)]
pub enum ApiError {
    #[error("missing API endpoint configuration")]
    MissingConfig,
    #[error("missing authentication token")]
    MissingToken,
    #[error("http error: {0}")]
    Http(String),
    #[error("serialization error: {0}")]
    Serde(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResult {
    pub transcript: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingStartResponse {
    pub message: String,
    pub session_id: Option<String>,
    pub device_type: Option<String>,
    pub timestamp: Option<String>,
}

#[derive(Clone)]
pub struct ApiClient {
    pub base_url: String,
    pub token: Option<String>,
    pub client: Client,
    pub device_id: String,
}

impl ApiClient {
    pub fn new(client: Client) -> Self {
        // Utiliser la même URL de base que le frontend
        let base_url = std::env::var("GILBERT_API_BASE_URL")
            .unwrap_or_else(|_| "https://gilbert-assistant.ovh".to_string());

        // Générer un device_id unique basé sur le hostname + un hash
        let device_id = Self::generate_device_id();

        println!("🌐 [API] Client API initialisé avec URL: {}", base_url);
        println!("🖥️ [API] Device ID: {}", device_id);
        println!("📱 [API] Device Type: {}, Version: {}", DEVICE_TYPE, APP_VERSION);

        Self {
            base_url,
            token: None, // Le token sera passé dynamiquement depuis le frontend
            client,
            device_id,
        }
    }

    /// Génère un identifiant unique pour cette machine
    fn generate_device_id() -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string());

        let username = whoami::username();
        let platform = whoami::platform().to_string();

        // Créer un hash stable basé sur les infos de la machine
        let mut hasher = DefaultHasher::new();
        hostname.hash(&mut hasher);
        username.hash(&mut hasher);
        platform.hash(&mut hasher);

        format!("desktop-{:x}", hasher.finish())
    }

    /// Retourne le modèle de l'appareil (OS + hostname)
    fn get_device_model() -> String {
        let os = std::env::consts::OS;
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "Unknown".to_string());

        format!("{} ({})",
            match os {
                "macos" => "macOS",
                "windows" => "Windows",
                "linux" => "Linux",
                _ => os,
            },
            hostname
        )
    }

    pub fn set_token(&mut self, token: Option<String>) {
        self.token = token;
    }

    /// Notifie le backend du début d'un enregistrement
    pub async fn notify_recording_start(&self, token: Option<String>, meeting_title: Option<String>) -> Result<RecordingStartResponse, ApiError> {
        let url = format!("{}/recordings/start", self.base_url);

        let token_to_use = token.or_else(|| self.token.clone());
        if token_to_use.is_none() {
            println!("⚠️ [API] Pas de token pour notify_recording_start, skip");
            return Err(ApiError::MissingToken);
        }

        let device_model = Self::get_device_model();
        println!("🎙️ [API] Notification début enregistrement: device={}, model={}", DEVICE_TYPE, device_model);

        let body = serde_json::json!({
            "device_type": DEVICE_TYPE,
            "device_id": self.device_id,
            "device_model": device_model,
            "meeting_title": meeting_title.unwrap_or_default(),
            "app_version": APP_VERSION
        });

        let response = self.client
            .post(&url)
            .bearer_auth(token_to_use.unwrap())
            .header("X-Device-Type", DEVICE_TYPE)
            .header("X-Device-ID", &self.device_id)
            .header("X-Device-Model", &device_model)
            .header("X-App-Version", APP_VERSION)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| {
                println!("⚠️ [API] Erreur notify_recording_start: {}", e);
                ApiError::Http(e.to_string())
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            println!("⚠️ [API] Erreur HTTP {} pour recording/start: {}", status, error_text);
            return Err(ApiError::Http(format!("HTTP {}: {}", status, error_text)));
        }

        let result: RecordingStartResponse = response.json().await.map_err(|e| {
            println!("⚠️ [API] Erreur parsing response: {}", e);
            ApiError::Serde(e.to_string())
        })?;

        println!("✅ [API] Enregistrement notifié, session_id: {:?}", result.session_id);
        Ok(result)
    }

    /// Notifie le backend de la fin d'un enregistrement
    pub async fn notify_recording_stop(&self, token: Option<String>) -> Result<(), ApiError> {
        let url = format!("{}/recordings/stop", self.base_url);

        let token_to_use = token.or_else(|| self.token.clone());
        if token_to_use.is_none() {
            println!("⚠️ [API] Pas de token pour notify_recording_stop, skip");
            return Err(ApiError::MissingToken);
        }

        println!("🛑 [API] Notification fin enregistrement");

        let response = self.client
            .post(&url)
            .bearer_auth(token_to_use.unwrap())
            .header("X-Device-Type", DEVICE_TYPE)
            .header("X-Device-ID", &self.device_id)
            .send()
            .await
            .map_err(|e| {
                println!("⚠️ [API] Erreur notify_recording_stop: {}", e);
                ApiError::Http(e.to_string())
            })?;

        if !response.status().is_success() {
            let status = response.status();
            println!("⚠️ [API] Erreur HTTP {} pour recording/stop", status);
            // Ne pas échouer, juste logger
        } else {
            println!("✅ [API] Fin d'enregistrement notifiée");
        }

        Ok(())
    }

    pub async fn transcribe_and_summarize(&self, path: &Path, token: Option<String>, title: Option<String>) -> Result<ApiResult, ApiError> {
        // Utiliser l'API unifiée du backend Python
        // Le titre est envoyé comme query parameter (comme la web app)
        let upload_url = if let Some(ref t) = title {
            format!("{}/simple/meetings/upload?title={}", self.base_url, urlencoding::encode(t))
        } else {
            format!("{}/simple/meetings/upload", self.base_url)
        };

        println!("🔗 [API] Tentative de connexion au backend...");
        println!("🔗 [API] URL: {}", upload_url);
        println!("🔗 [API] Token présent: {}", token.is_some() || self.token.is_some());
        if let Some(ref t) = title {
            println!("📝 [API] Titre: {}", t);
        }

        // Utiliser le titre pour le nom du fichier si disponible (SANS extension .wav)
        // Le backend utilise le nom du fichier comme titre, donc on ne veut pas d'extension
        let file_name = if let Some(ref t) = title {
            // Nettoyer le titre pour en faire un nom de fichier valide
            let clean_title: String = t
                .chars()
                .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
                .collect();
            clean_title.trim().to_string()
        } else {
            // Pour les fichiers sans titre, enlever l'extension du nom original
            path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "audio".to_string())
        };

        println!("📁 [API] Lecture du fichier audio: {:?}", path);
        // Lire le fichier audio
        let data = fs::read(path).map_err(|e| {
            println!("❌ [API] Erreur lecture fichier: {}", e);
            ApiError::Http(format!("Failed to read audio file: {}", e))
        })?;

        let data_size = data.len();
        println!("📁 [API] Fichier lu: {} bytes", data_size);

        let file_part = multipart::Part::bytes(data)
            .file_name(file_name.clone())
            .mime_str("audio/wav")
            .map_err(|e| {
                println!("❌ [API] Erreur MIME type: {}", e);
                ApiError::Http(format!("Failed to set MIME type: {}", e))
            })?;

        let form = multipart::Form::new().part("file", file_part);

        // Construire la requête avec authentification et headers device
        let device_model = Self::get_device_model();
        let mut request = self.client
            .post(&upload_url)
            .multipart(form)
            .header("X-Device-Type", DEVICE_TYPE)
            .header("X-Device-ID", &self.device_id)
            .header("X-Device-Model", &device_model)
            .header("X-App-Version", APP_VERSION)
            .header("User-Agent", format!("Gilbert/{}", APP_VERSION));

        let token_to_use = token.or_else(|| self.token.clone());
        if let Some(t) = &token_to_use {
            request = request.bearer_auth(t);
            println!("🔐 [API] Token d'authentification ajouté (longueur: {})", t.len());
            println!("🖥️ [API] Headers device: type={}, id={}, model={}", DEVICE_TYPE, self.device_id, device_model);
        } else {
            println!("❌ [API] Aucun token d'authentification disponible !");
            return Err(ApiError::MissingToken);
        }

        // Envoyer la requête
        println!("📤 [API] Envoi de la requête POST vers {}", upload_url);
        println!("📤 [API] Taille du fichier: {} bytes", data_size);
        
        let response = request
            .send()
            .await
            .map_err(|e| {
                let error_msg = e.to_string();
                println!("❌ [API] Erreur lors de l'envoi de la requête: {}", error_msg);
                println!("❌ [API] Type d'erreur: {:?}", e);
                
                // Détecter les différents types d'erreurs
                if error_msg.contains("Failed to connect") || error_msg.contains("Connection refused") || error_msg.contains("dns") {
                    ApiError::Http(format!("Impossible de se connecter au serveur backend à {}. Vérifiez que le serveur est en ligne et que votre connexion internet fonctionne.", self.base_url))
                } else if error_msg.contains("timeout") || error_msg.contains("timed out") {
                    ApiError::Http(format!("Timeout lors de la connexion au serveur backend. Le serveur met trop de temps à répondre."))
                } else if error_msg.contains("certificate") || error_msg.contains("SSL") || error_msg.contains("TLS") {
                    ApiError::Http(format!("Erreur de certificat SSL. Impossible de vérifier le certificat du serveur."))
                } else {
                    ApiError::Http(format!("Erreur réseau: {}", error_msg))
                }
            })?;
        
        println!("📥 [API] Réponse reçue: Status {}", response.status());

        // Vérifier le statut de la réponse
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Erreur inconnue".to_string());
            
            println!("❌ [API] Erreur HTTP {}: {}", status, error_text);
            
            let error_msg = if status == 401 {
                "Token d'authentification invalide ou expiré. Veuillez vous reconnecter."
            } else if status == 403 {
                "Accès refusé. Vérifiez vos permissions."
            } else if status == 404 {
                "Endpoint non trouvé. Vérifiez la configuration de l'API."
            } else if status == 500 {
                "Erreur serveur. Le backend a rencontré une erreur interne."
            } else if status == 503 {
                "Service indisponible. Le serveur backend est temporairement indisponible."
            } else {
                &error_text
            };
            
            return Err(ApiError::Http(format!("Erreur API ({}): {}", status, error_msg)));
        }

        // Parser la réponse JSON
        println!("📄 [API] Parsing de la réponse JSON...");
        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| {
                println!("❌ [API] Erreur parsing JSON: {}", e);
                ApiError::Serde(format!("Failed to parse JSON response: {}", e))
            })?;
        
        println!("✅ [API] Réponse JSON parsée avec succès");

        // Extraire la transcription et le résumé depuis la réponse
        let transcript = json
            .get("transcript_text")
            .or_else(|| json.get("transcript"))
            .or_else(|| json.get("text"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let summary = json
            .get("summary_text")
            .or_else(|| json.get("summary"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        println!("✅ [API] Transcription réussie !");
        if transcript.is_some() {
            println!("📝 [API] Transcript disponible ({} caractères)", transcript.as_ref().unwrap().len());
        }
        if summary.is_some() {
            println!("📄 [API] Summary disponible ({} caractères)", summary.as_ref().unwrap().len());
        }
        
        Ok(ApiResult {
            transcript,
            summary,
        })
    }
}
