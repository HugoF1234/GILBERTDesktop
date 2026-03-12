#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use tauri::{api::notification::Notification, Manager};

use gilbert_desktop_lib::{
    api::ApiClient,
    config::AppDirs,
    queue::QueueManager,
    state::{AppState, StatusPayload},
    video_app_detector::VideoAppDetector,
};

/// Flush stdout to ensure logs appear immediately
fn flush_logs() {
    let _ = std::io::stdout().flush();
}

/// Request microphone permission by attempting to access the default input device
/// This will trigger macOS permission dialog if not already granted
fn request_microphone_permission() -> bool {
    use cpal::traits::{DeviceTrait, HostTrait};

    println!("[PERMISSIONS] Requesting microphone access...");
    flush_logs();

    let host = cpal::default_host();
    match host.default_input_device() {
        Some(device) => {
            // Try to get device config to trigger permission
            match device.default_input_config() {
                Ok(config) => {
                    println!("[PERMISSIONS] ✅ Microphone access granted: {:?}", device.name().unwrap_or_default());
                    println!("[PERMISSIONS]    Config: {} ch, {} Hz", config.channels(), config.sample_rate().0);
                    flush_logs();
                    true
                }
                Err(e) => {
                    println!("[PERMISSIONS] ⚠️ Microphone config error: {}", e);
                    flush_logs();
                    false
                }
            }
        }
        None => {
            println!("[PERMISSIONS] ❌ No microphone found");
            flush_logs();
            false
        }
    }
}

/// Request Screen Recording permission for system audio capture (macOS)
#[cfg(target_os = "macos")]
fn request_screen_recording_permission() -> bool {
    // FFI to Swift ScreenCaptureKit
    extern "C" {
        fn sck_is_available() -> bool;
        fn sck_has_permission() -> bool;
        fn sck_request_permission() -> bool;
    }

    println!("[PERMISSIONS] Checking Screen Recording permission...");
    flush_logs();

    let available = unsafe { sck_is_available() };
    println!("[PERMISSIONS] ScreenCaptureKit available: {}", available);
    flush_logs();

    if !available {
        println!("[PERMISSIONS] ⚠️ ScreenCaptureKit requires macOS 13.0+");
        flush_logs();
        return false;
    }

    let has_perm = unsafe { sck_has_permission() };
    println!("[PERMISSIONS] Screen Recording permission: {}", has_perm);
    flush_logs();

    if has_perm {
        println!("[PERMISSIONS] ✅ Screen Recording already granted");
        flush_logs();
        return true;
    }

    println!("[PERMISSIONS] Requesting Screen Recording permission...");
    flush_logs();

    let granted = unsafe { sck_request_permission() };
    if granted {
        println!("[PERMISSIONS] ✅ Screen Recording permission granted");
    } else {
        println!("[PERMISSIONS] ⚠️ Screen Recording permission denied or pending");
        println!("[PERMISSIONS]    Please grant in System Preferences > Privacy & Security > Screen Recording");
    }
    flush_logs();
    granted
}

#[cfg(not(target_os = "macos"))]
fn request_screen_recording_permission() -> bool {
    println!("[PERMISSIONS] Screen Recording: Not applicable (non-macOS)");
    flush_logs();
    true
}

type ArcAppState = std::sync::Arc<AppState>;

#[tauri::command]
async fn start_record(state: tauri::State<'_, ArcAppState>) -> Result<StatusPayload, String> {
    println!("[TAURI] start_record command called");
    flush_logs();
    match state.start_record() {
        Ok(path) => {
            println!("[TAURI] Recording started successfully: {:?}", path);
            flush_logs();
            // Notification système pour signaler le début d'enregistrement
            // Notification désactivée pour éviter le spam
            // let _ = Notification::new("com.gilbert.desktop")
            //     .title("Gilbert Desktop")
            //     .body("Enregistrement démarré")
            //     .show();
        }
        Err(e) => {
            println!("[TAURI] ERROR starting recording: {:?}", e);
            flush_logs();
            return Err(e.to_string());
        }
    }
    println!("[TAURI] Getting status...");
    flush_logs();
    state.refresh_online().await;
    let status = state.status().await;
    println!("[TAURI] ✅ Returning: is_recording={}", status.is_recording);
    flush_logs();
    Ok(status)
}

#[tauri::command]
async fn stop_record(
    state: tauri::State<'_, ArcAppState>,
    token: Option<String>,
    title: Option<String>,
) -> Result<StatusPayload, String> {
    state.stop_and_process(token, title).await.map_err(|e| e.to_string())?;
    // Notification système pour signaler la fin d'enregistrement
    let _ = Notification::new("com.gilbert.desktop")
        .title("Gilbert Desktop")
        .body("Enregistrement terminé")
        .show();
    state.refresh_online().await;
    Ok(state.status().await)
}

#[tauri::command]
async fn cancel_record(
    state: tauri::State<'_, ArcAppState>,
) -> Result<StatusPayload, String> {
    // Arrêter l'enregistrement sans uploader (abandon)
    println!("🗑️ [TAURI] cancel_record - abandon de l'enregistrement");
    state.cancel_recording().map_err(|e| e.to_string())?;
    state.refresh_online().await;
    Ok(state.status().await)
}

#[tauri::command]
async fn get_status(state: tauri::State<'_, ArcAppState>) -> Result<StatusPayload, String> {
    state.refresh_online().await;
    Ok(state.status().await)
}

#[tauri::command]
async fn list_jobs(
    state: tauri::State<'_, ArcAppState>,
) -> Result<Vec<gilbert_desktop_lib::queue::QueueJob>, String> {
    Ok(state.queue.lock().await.list())
}

#[tauri::command]
async fn retry_queue(
    state: tauri::State<'_, ArcAppState>,
) -> Result<Vec<gilbert_desktop_lib::queue::QueueJob>, String> {
    state.retry_queue().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn purge_successful(state: tauri::State<'_, ArcAppState>) -> Result<(), String> {
    state.purge_successful().await.map_err(|e| e.to_string())
}

// System Audio Capture Commands

#[tauri::command]
fn has_system_audio_permission(state: tauri::State<'_, ArcAppState>) -> bool {
    state.has_system_audio_permission()
}

#[tauri::command]
fn request_system_audio_permission(state: tauri::State<'_, ArcAppState>) -> Result<bool, String> {
    state.request_system_audio_permission().map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_system_audio(state: tauri::State<'_, ArcAppState>) -> Result<StatusPayload, String> {
    state.start_system_audio().map_err(|e| e.to_string())?;
    let _ = Notification::new("com.gilbert.desktop")
        .title("Gilbert Desktop")
        .body("Capture audio système démarrée")
        .show();
    state.refresh_online().await;
    Ok(state.status().await)
}

#[tauri::command]
async fn stop_system_audio(state: tauri::State<'_, ArcAppState>) -> Result<StatusPayload, String> {
    let path = state.stop_system_audio().map_err(|e| e.to_string())?;
    if let Some(path) = path {
        println!("System audio saved to: {:?}", path);
    }
    let _ = Notification::new("com.gilbert.desktop")
        .title("Gilbert Desktop")
        .body("Capture audio système terminée")
        .show();
    state.refresh_online().await;
    Ok(state.status().await)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            println!("========================================");
            println!("       GILBERT DESKTOP STARTING");
            println!("========================================");
            flush_logs();

            // ========================================
            // STEP 1: Request permissions at startup
            // NOTE: Microphone permission is NOT requested at startup
            //       It will be requested when user clicks "Démarrer"
            // ========================================
            println!("\n[STARTUP] Checking permissions...");
            flush_logs();

            // 1a. Notification permission
            println!("[PERMISSIONS] Requesting notification access...");
            flush_logs();
            let _ = Notification::new("com.gilbert.desktop")
                .title("Gilbert Desktop")
                .body("Application démarrée")
                .show();
            println!("[PERMISSIONS] ✅ Notification sent");
            flush_logs();

            // 1b. Microphone permission - NOT requested at startup
            // The microphone will only be accessed when user clicks "Démarrer"
            println!("[PERMISSIONS] 🎤 Microphone: sera demandé au clic sur Démarrer");
            flush_logs();

            // 1c. Screen Recording permission for system audio (check only, don't request)
            let screen_ok = request_screen_recording_permission();

            // Summary
            println!("\n========================================");
            println!("       PERMISSIONS SUMMARY");
            println!("========================================");
            println!("  Microphone:      🔒 Pas utilisé (attente clic Démarrer)");
            println!("  Screen Recording: {}", if screen_ok { "✅ OK" } else { "⚠️ PENDING/DENIED" });
            println!("========================================\n");
            flush_logs();

            let dirs =
                AppDirs::new().map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            
            // Créer un client HTTP avec configuration appropriée pour HTTPS
            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .connect_timeout(std::time::Duration::from_secs(10))
                .user_agent("GilbertDesktop/1.0")
                .build()
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("Failed to create HTTP client: {}", e)))?;
            
            println!("🌐 [HTTP] Client HTTP configuré avec timeout 30s");
            flush_logs();
            
            let api = ApiClient::new(http_client);
            let queue = QueueManager::load(dirs.queue_file.clone())
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            let app_identifier = "com.gilbert.desktop".to_string();
            let app_handle = app.handle();
            let state = AppState::new(dirs, api, queue, app_identifier.clone());
            
            // Configurer le détecteur d'apps de visio (sans ouvrir le micro)
            {
                let detector = state.video_detector.lock();
                detector.set_app_handle(app_handle.clone());
            }
            
            // Démarrer la boucle de détection en arrière-plan (sans utiliser le micro)
            // On doit wrapper dans Arc pour pouvoir le partager avec tokio::spawn
            let state_arc = std::sync::Arc::new(state);
            
            // Cloner les données nécessaires avant de lancer la boucle
            let (app_id, app_handle_for_loop, is_recording_clone) = {
                let detector = state_arc.video_detector.lock();
                (
                    detector.app_identifier.clone(),
                    detector.app_handle.clone(),
                    detector.get_is_recording(),
                )
            };
            
            // Utiliser le runtime async de Tauri au lieu de tokio::spawn
            tauri::async_runtime::spawn(async move {
                // Créer une nouvelle instance pour la boucle (sans lock)
                let detector_for_loop = VideoAppDetector::with_handles(
                    app_id,
                    app_handle_for_loop,
                    is_recording_clone,
                );
                detector_for_loop.start_detection_loop().await;
            });
            
            println!("✅ Détecteur d'apps de visio démarré (sans utiliser le micro)");
            
            // Tauri gère automatiquement les Arc
            app.manage(state_arc);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_record,
            stop_record,
            cancel_record,
            get_status,
            list_jobs,
            retry_queue,
            purge_successful,
            has_system_audio_permission,
            request_system_audio_permission,
            start_system_audio,
            stop_system_audio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
