#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use tauri::{
    api::notification::Notification,
    CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem,
};

use gilbert_desktop_lib::{
    api::ApiClient,
    background_sync,
    config::AppDirs,
    mic_monitor::MicMonitor,
    queue::QueueManager,
    state::{AppState, StatusPayload},
    video_app_detector::VideoAppDetector,
};

/// Flush stdout to ensure logs appear immediately
fn flush_logs() {
    let _ = std::io::stdout().flush();
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

/// Variable statique pour le handle de l'app (utilisé par le callback Dock C)
#[cfg(target_os = "macos")]
static DOCK_APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

/// Callback C appelé depuis Swift quand l'utilisateur clique sur l'icône Dock
#[cfg(target_os = "macos")]
extern "C" fn dock_reopen_callback() {
    println!("[DOCK] applicationShouldHandleReopen triggered");
    if let Some(app_handle) = DOCK_APP_HANDLE.get() {
        if let Some(window) = app_handle.get_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.unminimize();
            println!("[DOCK] ✅ Fenêtre rouverte depuis le Dock");
        }
    }
}

/// Recording mode: "mic", "system", or "both"
fn parse_recording_mode(mode: Option<String>) -> gilbert_desktop_lib::recorder::RecordingMode {
    match mode.as_deref() {
        Some("mic") => gilbert_desktop_lib::recorder::RecordingMode::MicOnly,
        Some("system") => gilbert_desktop_lib::recorder::RecordingMode::SystemOnly,
        Some("both") | None => gilbert_desktop_lib::recorder::RecordingMode::Both,
        _ => gilbert_desktop_lib::recorder::RecordingMode::Both,
    }
}

#[tauri::command]
async fn start_record(
    state: tauri::State<'_, ArcAppState>,
    mode: Option<String>,
    token: Option<String>,
    title: Option<String>,
) -> Result<StatusPayload, String> {
    let recording_mode = parse_recording_mode(mode.clone());
    println!("[TAURI] start_record command called with mode: {:?} -> {:?}", mode, recording_mode);
    if title.is_some() {
        println!("[TAURI] Title: {:?}", title);
    }
    flush_logs();
    match state.start_record_with_mode(recording_mode) {
        Ok(path) => {
            println!("[TAURI] Recording started successfully: {:?}", path);
            flush_logs();

            // Notifier le backend du début d'enregistrement (non-bloquant)
            // Le token est nécessaire pour authentifier la requête
            if token.is_some() {
                println!("[TAURI] 🎙️ Notifying backend of recording start...");
                state.notify_recording_start(token, title).await;
            } else {
                println!("[TAURI] ⚠️ No token provided, skipping backend notification");
            }
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
    println!("🛑 [TAURI] stop_record called");
    flush_logs();

    // IMPORTANT: Toujours arrêter l'enregistrement, même si le traitement échoue
    let process_result = state.stop_and_process(token, title).await;

    // Log le résultat du traitement
    match &process_result {
        Ok(_) => {
            println!("✅ [TAURI] stop_and_process succeeded");
            let _ = Notification::new("com.gilbert.desktop")
                .title("Gilbert Desktop")
                .body("Enregistrement terminé")
                .show();
        }
        Err(e) => {
            println!("⚠️ [TAURI] stop_and_process failed: {:?}", e);
            // Notification d'erreur mais on continue
            let _ = Notification::new("com.gilbert.desktop")
                .title("Gilbert Desktop")
                .body("Enregistrement arrêté (erreur de traitement)")
                .show();
        }
    }
    flush_logs();

    // TOUJOURS retourner le statut actuel, même en cas d'erreur
    // Cela permet au frontend de mettre à jour son état
    state.refresh_online().await;
    let status = state.status().await;
    println!("✅ [TAURI] Returning status: is_recording={}", status.is_recording);
    flush_logs();

    Ok(status)
}

#[tauri::command]
async fn cancel_record(
    state: tauri::State<'_, ArcAppState>,
) -> Result<StatusPayload, String> {
    println!("🗑️ [TAURI] cancel_record - abandon de l'enregistrement");
    flush_logs();

    // Arrêter l'enregistrement sans uploader (abandon)
    let cancel_result = state.cancel_recording();

    match &cancel_result {
        Ok(_) => {
            println!("✅ [TAURI] cancel_recording succeeded");
        }
        Err(e) => {
            println!("⚠️ [TAURI] cancel_recording failed: {:?}", e);
        }
    }
    flush_logs();

    // TOUJOURS retourner le statut actuel
    state.refresh_online().await;
    let status = state.status().await;
    println!("✅ [TAURI] cancel_record returning: is_recording={}", status.is_recording);
    flush_logs();

    Ok(status)
}

#[tauri::command]
fn pause_record(state: tauri::State<'_, ArcAppState>) -> Result<bool, String> {
    println!("⏸️ [TAURI] pause_record called");
    flush_logs();
    state.recorder.lock().pause();
    Ok(true)
}

#[tauri::command]
fn resume_record(state: tauri::State<'_, ArcAppState>) -> Result<bool, String> {
    println!("▶️ [TAURI] resume_record called");
    flush_logs();
    state.recorder.lock().resume();
    Ok(true)
}

#[tauri::command]
fn is_paused(state: tauri::State<'_, ArcAppState>) -> bool {
    state.recorder.lock().is_paused()
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

#[tauri::command]
async fn delete_job(
    state: tauri::State<'_, ArcAppState>,
    job_id: String,
) -> Result<bool, String> {
    println!("🗑️ [TAURI] delete_job called for: {}", job_id);
    flush_logs();
    match state.delete_job(&job_id).await {
        Ok(Some(_)) => {
            println!("✅ [TAURI] Job {} deleted", job_id);
            flush_logs();
            Ok(true)
        }
        Ok(None) => {
            println!("⚠️ [TAURI] Job {} not found", job_id);
            flush_logs();
            Ok(false)
        }
        Err(e) => {
            println!("❌ [TAURI] Error deleting job {}: {:?}", job_id, e);
            flush_logs();
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn retry_single_job(
    state: tauri::State<'_, ArcAppState>,
    job_id: String,
) -> Result<Option<gilbert_desktop_lib::queue::QueueJob>, String> {
    println!("🔄 [TAURI] retry_single_job called for: {}", job_id);
    flush_logs();
    match state.retry_job(&job_id).await {
        Ok(job) => {
            if let Some(ref j) = job {
                println!("✅ [TAURI] Job {} status: {:?}", job_id, j.status);
            } else {
                println!("⚠️ [TAURI] Job {} not found", job_id);
            }
            flush_logs();
            Ok(job)
        }
        Err(e) => {
            println!("❌ [TAURI] Error retrying job {}: {:?}", job_id, e);
            flush_logs();
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn export_job(
    state: tauri::State<'_, ArcAppState>,
    job_id: String,
) -> Result<Option<String>, String> {
    println!("📤 [TAURI] export_job called for: {}", job_id);
    flush_logs();
    match state.get_job(&job_id).await {
        Some(job) => {
            let file_path = job.file_path.clone();
            if std::path::Path::new(&file_path).exists() {
                println!("✅ [TAURI] Job {} file path: {}", job_id, file_path);
                flush_logs();
                Ok(Some(file_path))
            } else {
                println!("⚠️ [TAURI] Job {} file does not exist: {}", job_id, file_path);
                flush_logs();
                Err("File does not exist".to_string())
            }
        }
        None => {
            println!("⚠️ [TAURI] Job {} not found", job_id);
            flush_logs();
            Ok(None)
        }
    }
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

/// Get the current system audio level (for UI visualization)
/// Returns a value between 0.0 and 1.0
#[tauri::command]
fn get_system_audio_level() -> f32 {
    gilbert_desktop_lib::recorder::get_system_audio_level()
}

/// Get the current microphone audio level (for UI visualization)
/// Returns a value between 0.0 and 1.0
#[tauri::command]
fn get_mic_audio_level() -> f32 {
    gilbert_desktop_lib::recorder::get_mic_audio_level()
}

/// Crée le menu du system tray
fn create_tray_menu() -> SystemTrayMenu {
    let show = CustomMenuItem::new("show".to_string(), "Afficher Gilbert");
    let hide = CustomMenuItem::new("hide".to_string(), "Masquer");
    let separator = SystemTrayMenuItem::Separator;
    let quit = CustomMenuItem::new("quit".to_string(), "Quitter");

    SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(separator)
        .add_item(quit)
}

fn main() {
    // Créer le system tray
    let system_tray = SystemTray::new().with_menu(create_tray_menu());

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_window_event(|event| {
            // Intercepter la fermeture de fenêtre pour masquer au lieu de quitter
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                api.prevent_close();
                let _ = event.window().hide();
                println!("[WINDOW] Fenêtre masquée, app continue en arrière-plan");
            }
        })
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = window.unminimize();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.unminimize();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
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

            // 1b. Screen Recording permission for system audio — demande au premier lancement
            let screen_ok = request_screen_recording_permission();

            println!("\n========================================");
            println!("       PERMISSIONS SUMMARY");
            println!("========================================");
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

            // Démarrer le background sync pour auto-retry les uploads
            let state_for_sync = state_arc.clone();
            let app_handle_for_sync = app.handle();
            background_sync::spawn_background_sync(state_for_sync, app_handle_for_sync);
            println!("✅ Background sync démarré (auto-retry uploads toutes les 30s)");

            // ========================================
            // Démarrer le MicMonitor (détection micro + apps de visio via RMS)
            // ========================================
            {
                let mut mic_monitor = MicMonitor::new("com.gilbert.desktop".to_string());
                match mic_monitor.start_with_app_handle(app.handle()) {
                    Ok(_) => println!("✅ MicMonitor démarré (détection micro actif)"),
                    Err(e) => println!("⚠️ MicMonitor non démarré (permission micro non accordée ou pas de device): {}", e),
                }
                // On laisse le monitor se gérer seul (le stream reste actif tant que mic_monitor vit)
                // On le leak intentionnellement pour qu'il dure toute la session
                std::mem::forget(mic_monitor);
            }

            // Tauri gère automatiquement les Arc
            app.manage(state_arc);

            // ========================================
            // DOCK REOPEN FIX (macOS)
            // Intercepte applicationShouldHandleReopen via NSApplicationDelegate (Swift)
            // pour rouvrir la fenêtre quand l'utilisateur clique sur l'icône Dock
            // ========================================
            #[cfg(target_os = "macos")]
            {
                extern "C" {
                    fn setup_dock_reopen_handler(callback: extern "C" fn());
                }
                // Stocker le handle dans le static pour que le callback C puisse y accéder
                let _ = DOCK_APP_HANDLE.set(app.handle());
                unsafe {
                    setup_dock_reopen_handler(dock_reopen_callback);
                }
                println!("[DOCK] Handler applicationShouldHandleReopen installé");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_record,
            stop_record,
            cancel_record,
            pause_record,
            resume_record,
            is_paused,
            get_status,
            list_jobs,
            retry_queue,
            purge_successful,
            delete_job,
            retry_single_job,
            export_job,
            has_system_audio_permission,
            request_system_audio_permission,
            start_system_audio,
            stop_system_audio,
            get_system_audio_level,
            get_mic_audio_level
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
