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
    network,
    queue::{JobStatus, QueueManager},
    state::{AppState, StatusPayload},
    video_app_detector::VideoAppDetector,
};

/// Flush stdout to ensure logs appear immediately
fn flush_logs() {
    let _ = std::io::stdout().flush();
}

/// Request Microphone permission at startup (macOS)
#[cfg(target_os = "macos")]
fn request_microphone_permission_startup() {
    extern "C" {
        fn request_microphone_permission();
        fn has_microphone_permission() -> bool;
    }
    let has = unsafe { has_microphone_permission() };
    if has {
        println!("[PERMISSIONS] ✅ Microphone already granted");
    } else {
        println!("[PERMISSIONS] Requesting Microphone permission...");
        unsafe { request_microphone_permission() };
    }
    flush_logs();
}

#[cfg(not(target_os = "macos"))]
fn request_microphone_permission_startup() {}

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

            // Sauvegarder token+titre pour récupération après crash éventuel
            state.save_recording_session(token.as_deref(), title.as_deref());

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
                .title("Gilbert")
                .body("Enregistrement terminé")
                .show();
        }
        Err(e) => {
            println!("⚠️ [TAURI] stop_and_process failed: {:?}", e);
            // Notification d'erreur mais on continue
            let _ = Notification::new("com.gilbert.desktop")
                .title("Gilbert")
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
    state.refresh_online().await;
    Ok(state.status().await)
}

#[tauri::command]
async fn stop_system_audio(state: tauri::State<'_, ArcAppState>) -> Result<StatusPayload, String> {
    let path = state.stop_system_audio().map_err(|e| e.to_string())?;
    if let Some(path) = path {
        println!("System audio saved to: {:?}", path);
    }
    state.refresh_online().await;
    Ok(state.status().await)
}

/// Nonce de session unique généré au démarrage du process Rust.
/// Permet au frontend de détecter un cold start : si le nonce stocké
/// diffère du nonce actuel, c'est une nouvelle session → vider l'auth.
static SESSION_NONCE: std::sync::OnceLock<String> = std::sync::OnceLock::new();

fn generate_session_nonce() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    // XOR avec l'adresse mémoire du stack pour plus d'entropie
    let entropy = &nanos as *const _ as u128 ^ nanos;
    format!("{:032x}", entropy)
}

#[tauri::command]
fn get_session_nonce() -> String {
    SESSION_NONCE.get_or_init(generate_session_nonce).clone()
}

// ── Mode compact : réduire/restaurer la fenêtre principale ──────────────────
// Les statics et la logique sont dans window_state.rs (partagé avec les modules lib)
use gilbert_desktop_lib::window_state::{saved_size, saved_large_position};

/// Sauvegarde la taille et position de la grande fenêtre (appelé depuis on_window_event)
#[tauri::command]
fn save_large_window_state(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app_handle.get_window("main") {
        if let Ok(size) = window.inner_size() {
            if size.width > 400 {
                *saved_size().lock() = Some((size.width, size.height));
                if let Ok(pos) = window.outer_position() {
                    *saved_large_position().lock() = Some((pos.x, pos.y));
                }
            }
        }
    }
    Ok(())
}

/// Passe la fenêtre principale en mode compact — délègue à window_state
#[tauri::command]
fn enter_compact_mode(app_handle: tauri::AppHandle) -> Result<(), String> {
    gilbert_desktop_lib::window_state::enter_compact_mode(app_handle)
}

/// Restaure la fenêtre principale à sa taille exacte d'avant, à sa position d'avant
#[tauri::command]
fn exit_compact_mode(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app_handle.get_window("main") {
        let _ = window.set_decorations(true);
        let _ = window.set_always_on_top(false);
        let _ = window.set_resizable(true);
        let (w, h) = saved_size().lock().unwrap_or((1100, 780));
        let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: w, height: h }));

        let saved_pos = *saved_large_position().lock();
        if let Some((px, py)) = saved_pos {
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x: px, y: py }
            ));
        } else if let Some(monitor) = window.current_monitor().ok().flatten()
            .or_else(|| window.primary_monitor().ok().flatten())
        {
            let screen = monitor.size();
            let x = (screen.width as i32 - w as i32) / 2;
            let y = (screen.height as i32 - h as i32) / 2;
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x, y }
            ));
        }

        let _ = window.emit("compact-mode-changed", false);
        let _ = window.set_focus();
    }
    Ok(())
}

// ── Notifications interactives via AppleScript ───────────────────────────────

/// Émet un événement Tauri vers le frontend pour afficher la bannière "micro actif"
/// (remplace la dialog AppleScript bloquante)
#[tauri::command]
async fn notify_mic_activity(app_handle: tauri::AppHandle, app_name: Option<String>) -> bool {
    use tauri::Manager;
    let _ = app_handle.emit_all("mic-activity-detected", app_name.unwrap_or_default());
    false
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

/// Flag global : true si un enregistrement est en cours (mis à jour par le frontend via set_recording_active)
static IS_RECORDING_ACTIVE: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Retourne le nom de l'application vidéo/visio active (Zoom, Teams, etc.) pour l'auto-titre
#[tauri::command]
fn get_active_video_app() -> Option<String> {
    detect_active_video_app()
}

/// Détection de l'app visio active (macOS) — utilisée pour l'auto-titre au démarrage d'un enregistrement.
/// Priorité : UDP actif (call en cours) → URL navigateur avec chemin de call.
#[cfg(target_os = "macos")]
fn detect_active_video_app() -> Option<String> {
    // Méthode 1 : UDP avec IP distante = flux media en direct (call actif)
    let udp_out = std::process::Command::new("sh")
        .arg("-c")
        .arg(r#"lsof -i UDP -nP 2>/dev/null | grep -v '\*:' | grep -v ':443 '"#)
        .output()
        .ok();

    if let Some(out) = udp_out {
        let lines = String::from_utf8_lossy(&out.stdout).to_lowercase();
        let udp_apps: &[(&str, &str)] = &[
            ("msteams", "Microsoft Teams"),
            ("teams",   "Microsoft Teams"),
            ("zoom.us", "Zoom"),
            ("zoom",    "Zoom"),
            ("discord", "Discord"),
            ("webex",   "Webex"),
            ("facetime","FaceTime"),
            ("skype",   "Skype"),
            ("slack",   "Slack"),
        ];
        for line in lines.lines() {
            for (pattern, name) in udp_apps {
                if line.contains(pattern) {
                    return Some(name.to_string());
                }
            }
        }
    }

    // Méthode 2 : URL active du navigateur avec chemin de call
    let url_out = std::process::Command::new("osascript")
        .arg("-e")
        .arg(r#"
            set result to ""
            try
                tell application "Google Chrome"
                    set result to URL of active tab of front window
                end tell
            end try
            if result is "" then
                try
                    tell application "Safari"
                        set result to URL of current tab of front window
                    end tell
                end try
            end if
            return result
        "#)
        .output()
        .ok();

    if let Some(out) = url_out {
        let url = String::from_utf8_lossy(&out.stdout).to_lowercase();
        let url = url.trim();

        // Google Meet : chemin avec code de réunion (ex: /abc-defg-hij)
        if url.contains("meet.google.com/") {
            let path = url.split("meet.google.com/").nth(1).unwrap_or("");
            if path.len() >= 8 && path.contains('-') && !path.starts_with("new") {
                return Some("Google Meet".to_string());
            }
        }
        // Jitsi
        if url.contains("meet.jit.si/") {
            let path = url.split("meet.jit.si/").nth(1).unwrap_or("");
            if path.len() > 2 { return Some("Jitsi Meet".to_string()); }
        }
        if url.contains("8x8.vc/") {
            return Some("Jitsi Meet".to_string());
        }
        // Zoom web
        if url.contains("zoom.us/j/") || url.contains("zoom.us/wc/") {
            return Some("Zoom".to_string());
        }
        // Teams web (call actif)
        if (url.contains("teams.microsoft.com") || url.contains("teams.live.com"))
            && (url.contains("meetup-join") || url.contains("/meet/") || url.contains("calling"))
        {
            return Some("Microsoft Teams".to_string());
        }
        // Whereby
        if url.contains("whereby.com/") {
            let path = url.split("whereby.com/").nth(1).unwrap_or("");
            if !path.is_empty() && !path.starts_with("business") && !path.starts_with("pricing") {
                return Some("Whereby".to_string());
            }
        }
    }

    None
}

#[cfg(not(target_os = "macos"))]
fn detect_active_video_app() -> Option<String> {
    None
}

/// Démarre un serveur HTTP local pour intercepter le callback OAuth Google.
///
/// Flux OAuth desktop propre (sans afficher la web app dans le WebView Tauri) :
/// 1. Frontend appelle start_oauth_listener() → reçoit un port local
/// 2. Frontend ouvre dans le navigateur système : /auth/google?desktop_port=PORT
/// 3. Le backend Gilbert redirige Google OAuth avec callback_url pointant vers localhost:PORT
/// 4. Ce serveur local intercepte GET /callback?token=JWT&success=true
/// 5. Émet l'événement Tauri "oauth-callback" avec le token → le frontend le stocke
/// 6. Répond au navigateur avec une page HTML "Vous pouvez retourner à Gilbert"
#[tauri::command]
fn start_oauth_listener(app_handle: tauri::AppHandle) -> Result<u16, String> {
    use std::net::TcpListener;
    use std::io::{Read, Write};

    // Bind sur un port aléatoire disponible
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Impossible de démarrer le serveur OAuth local: {}", e))?;
    let port = listener.local_addr()
        .map_err(|e| format!("Impossible de lire le port: {}", e))?
        .port();

    println!("[OAUTH] Serveur local démarré sur port {}", port);

    // Lancer un thread dédié pour attendre le callback OAuth
    // On boucle jusqu'à trouver une requête /callback?token=... (les navigateurs font plusieurs connexions)
    std::thread::spawn(move || {
        // Timeout global : 5 minutes pour éviter de laisser le serveur tourner indéfiniment
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(300);
        let _ = listener.set_nonblocking(false); // mode bloquant

        // Boucle pour accepter plusieurs connexions (favicon, preflight, etc.)
        loop {
            if start.elapsed() > timeout {
                println!("[OAUTH] Timeout : aucun token reçu en 5 minutes");
                break;
            }

            // Accepter la prochaine connexion
            let (mut stream, _addr) = match listener.accept() {
                Ok(s) => s,
                Err(e) => {
                    println!("[OAUTH] Erreur lors de l'acceptation de connexion: {}", e);
                    break;
                }
            };

            let mut buf = vec![0u8; 8192]; // buffer plus grand pour les headers lourds
            let n = stream.read(&mut buf).unwrap_or(0);
            if n == 0 { continue; }
            let request = String::from_utf8_lossy(&buf[..n]);

            println!("[OAUTH] Requête reçue: {}", &request[..request.len().min(200)]);

            // Ignorer les requêtes favicon et autres ressources
            let first_line = match request.lines().next() {
                Some(l) => l,
                None => continue,
            };

            // Extraire le path de la première ligne HTTP: "GET /callback?... HTTP/1.1"
            let token = {
                // first_line = "GET /callback?token=JWT&success=true HTTP/1.1"
                let parts: Vec<&str> = first_line.split_whitespace().collect();
                if parts.len() < 2 {
                    // Réponse vide et continuer
                    let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
                    continue;
                }
                let url_part = parts[1]; // "/callback?token=JWT&success=true"

                // Ignorer les requêtes qui ne sont pas /callback
                if !url_part.starts_with("/callback") {
                    let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n");
                    continue;
                }

                // Parser les query params
                let query = url_part.split('?').nth(1).unwrap_or("");
                let mut token_val = None;
                for pair in query.split('&') {
                    let mut kv = pair.splitn(2, '=');
                    let key = kv.next().unwrap_or("");
                    let val = kv.next().unwrap_or("");
                    if key == "token" {
                        token_val = Some(percent_decode(val));
                    }
                }
                token_val
            };

                // Réponse HTML au navigateur : page de succès avec fermeture automatique
                let success_html = r#"<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gilbert — Connexion réussie</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
    display:flex;align-items:center;justify-content:center;
    min-height:100vh;background:#0f0f1a;
  }
  .card{
    background:#1a1a2e;border:1px solid rgba(255,255,255,.08);
    padding:2.5rem 3rem;border-radius:20px;
    box-shadow:0 8px 48px rgba(0,0,0,.5);
    text-align:center;max-width:380px;width:90%;
    animation:fadeUp .4s ease;
  }
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  .check{
    width:48px;height:48px;border-radius:50%;
    background:rgba(34,197,94,.15);border:2px solid rgba(34,197,94,.4);
    display:flex;align-items:center;justify-content:center;
    margin:0 auto 1rem;
  }
  .check svg{width:24px;height:24px;stroke:#22c55e;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
  h1{color:#f1f5f9;font-size:1.25rem;font-weight:600;margin-bottom:.5rem}
  p{color:#94a3b8;font-size:.9rem;line-height:1.6}
  .hint{
    margin-top:1.5rem;padding:.75rem 1rem;
    background:rgba(255,255,255,.04);border-radius:10px;
    color:#64748b;font-size:.78rem;
  }
  .progress{
    width:100%;height:3px;background:rgba(255,255,255,.06);
    border-radius:99px;margin-top:1.75rem;overflow:hidden;
  }
  .bar{
    height:100%;width:0;border-radius:99px;
    background:linear-gradient(90deg,#6c63ff,#3b82f6);
    animation:fill 1.5s ease forwards;
  }
  @keyframes fill{to{width:100%}}
</style>
</head>
<body>
<div class="card">
  <div class="check">
    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
  <h1>Connexion réussie !</h1>
  <p>Vous êtes connecté à <strong style="color:#e2e8f0">Gilbert</strong>.<br>
     Retournez dans l'application.</p>
  <div class="hint">Cette fenêtre va se fermer automatiquement…</div>
  <div class="progress"><div class="bar"></div></div>
</div>
<script>
  setTimeout(function(){try{window.close()}catch(e){}},1600);
</script>
</body></html>"#;

                let error_html = r#"<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;text-align:center;padding:3rem;">
<h2>⚠️ Erreur de connexion</h2><p>Token manquant. Veuillez réessayer depuis Gilbert.</p>
</body></html>"#;

                let (status, body) = if token.is_some() {
                    ("200 OK", success_html)
                } else {
                    ("400 Bad Request", error_html)
                };

                let response = format!(
                    "HTTP/1.1 {}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    status, body.len(), body
                );
                let _ = stream.write_all(response.as_bytes());
                drop(stream);

                // Si on a le token → émettre et quitter la boucle
                if let Some(tok) = token {
                    println!("[OAUTH] ✅ Token OAuth reçu, émission vers le frontend");
                    let _ = app_handle.emit_all("oauth-callback", tok);

                    // Mettre la fenêtre Tauri au premier plan
                    use tauri::Manager;
                    if let Some(win) = app_handle.get_window("main") {
                        let _ = win.show();
                        let _ = win.unminimize();
                        let _ = win.set_focus();
                    }

                    // Sur macOS : activer Gilbert via osascript (plus fiable que set_focus seul)
                    #[cfg(target_os = "macos")]
                    {
                        let _ = std::process::Command::new("osascript")
                            .arg("-e")
                            .arg(r#"tell application "Gilbert" to activate"#)
                            .spawn();
                    }

                    // Token reçu → arrêter d'écouter
                    break;
                } else {
                    println!("[OAUTH] ⚠️ Requête /callback sans token, on continue à écouter...");
                    // Continuer la boucle, peut-être une autre requête arrive avec le token
                }
        } // fin du loop
    }); // fin du thread

    Ok(port)
}

/// Decode percent-encoding (%2B → +, %40 → @, etc.) dans un token JWT
fn percent_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next().unwrap_or('0');
            let h2 = chars.next().unwrap_or('0');
            let hex = format!("{}{}", h1, h2);
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            } else {
                result.push('%');
                result.push(h1);
                result.push(h2);
            }
        } else if c == '+' {
            result.push(' ');
        } else {
            result.push(c);
        }
    }
    result
}

/// Appelé par le frontend pour indiquer si un enregistrement est en cours
/// (permet au backend de décider si passer en compact lors d'une minimisation)
#[tauri::command]
fn set_recording_active(app_handle: tauri::AppHandle, active: bool) {
    IS_RECORDING_ACTIVE.store(active, std::sync::atomic::Ordering::SeqCst);

    // Badge rouge dans le dock macOS + icône tray selon l'état
    update_recording_indicators(&app_handle, active);
}

/// Met à jour les indicateurs visuels système (dock badge + tray) selon l'état d'enregistrement
fn update_recording_indicators(app_handle: &tauri::AppHandle, recording: bool) {
    // Badge dock macOS via osascript
    #[cfg(target_os = "macos")]
    {
        let badge = if recording { "●" } else { "" };
        let pid = std::process::id();
        let script = format!(
            r#"tell application "System Events" to set badgeLabel of (first process whose unix id is {}) to "{}""#,
            pid, badge
        );
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn();
    }

    // Titre à côté de l'icône dans la barre de menu macOS (set_title n'existe que sur macOS)
    #[cfg(target_os = "macos")]
    {
        let tray_title = if recording { "● REC" } else { "" };
        let _ = app_handle.tray_handle().set_title(tray_title);
    }
}

/// Crée le menu du system tray
fn create_tray_menu() -> SystemTrayMenu {
    let show = CustomMenuItem::new("show".to_string(), "Afficher Gilbert");
    let hide = CustomMenuItem::new("hide".to_string(), "Masquer");
    let widget = CustomMenuItem::new("widget".to_string(), "Mode compact  ⊡");
    let separator = SystemTrayMenuItem::Separator;
    let start_rec = CustomMenuItem::new("start_rec".to_string(), "▶  Démarrer enregistrement");
    let separator2 = SystemTrayMenuItem::Separator;
    let quit = CustomMenuItem::new("quit".to_string(), "Quitter");

    SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_item(widget)
        .add_native_item(separator)
        .add_item(start_rec)
        .add_native_item(separator2)
        .add_item(quit)
}

// ── APP_HANDLE global pour le callback de notification ──────────────────────
// Utilisé par notification_record_callback (extern "C" qui ne peut pas capturer)
static APP_HANDLE_FOR_NOTIF: std::sync::OnceLock<parking_lot::Mutex<Option<tauri::AppHandle>>> =
    std::sync::OnceLock::new();

fn app_handle_for_notif() -> &'static parking_lot::Mutex<Option<tauri::AppHandle>> {
    APP_HANDLE_FOR_NOTIF.get_or_init(|| parking_lot::Mutex::new(None))
}

/// Callback extern "C" appelé par Swift quand l'user clique "Enregistrer" ou tape la notification
/// → compact mode → show window → émet start-recording-compact (frontend navigue vers / et démarre)
extern "C" fn notification_record_callback() {
    use tauri::Manager;
    println!("[NOTIF-RUST] ▶ Clic notification → compact + start recording");
    let handle = app_handle_for_notif().lock().as_ref().cloned();
    if let Some(h) = handle {
        // Petit délai si la fenêtre n'est pas encore prête (app lancée depuis la notif)
        for attempt in 0..5 {
            if h.get_window("main").is_some() {
                break;
            }
            println!("[NOTIF-RUST] Fenêtre pas prête, attente {}ms", (attempt + 1) * 200);
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        // 1. Passer en mode compact (raccourci) et afficher la fenêtre
        let _ = gilbert_desktop_lib::window_state::enter_compact_mode(h.clone());
        // 2. Émettre l'event pour que le frontend navigue vers / et démarre l'enregistrement
        let _ = h.emit_all("start-recording-compact", ());
        println!("[NOTIF-RUST] ✅ compact mode + start-recording-compact émis");
    } else {
        println!("[NOTIF-RUST] ⚠️ app_handle non disponible pour le callback");
    }
}

fn main() {
    // Créer le system tray
    let system_tray = SystemTray::new().with_menu(create_tray_menu());

    tauri::Builder::default()
        .system_tray(system_tray)
        .on_window_event(|event| {
            match event.event() {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    use tauri::Manager;
                    // Vérifier si on est en mode compact (fenêtre réduite)
                    let is_compact = if let Some(window) = event.window().app_handle().get_window("main") {
                        if let Ok(size) = window.inner_size() {
                            size.width < 500
                        } else { false }
                    } else { false };

                    if is_compact {
                        let _ = event.window().emit("compact-close-requested", ());
                    } else if IS_RECORDING_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
                        let _ = enter_compact_mode(event.window().app_handle());
                    } else {
                        let _ = event.window().hide();
                    }
                }
                tauri::WindowEvent::Focused(false) => {
                    // Perte de focus pendant un enregistrement → passer en compact
                    // Petit délai pour ignorer les pertes de focus transitoires (dialogs, etc.)
                    let app = event.window().app_handle();
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(400));
                        // Vérifier que l'enregistrement est toujours actif et qu'on n'est pas déjà en compact
                        if !IS_RECORDING_ACTIVE.load(std::sync::atomic::Ordering::SeqCst) {
                            return;
                        }
                        use tauri::Manager;
                        if let Some(window) = app.get_window("main") {
                            // Déjà en compact ? ne rien faire
                            if let Ok(size) = window.inner_size() {
                                if size.width < 500 { return; }
                            }
                            // La fenêtre principale a-t-elle toujours le focus ? si oui, ne pas compresser
                            if window.is_focused().unwrap_or(true) { return; }
                            let _ = enter_compact_mode(app.clone());
                        }
                    });
                }
                tauri::WindowEvent::Resized(size) => {
                    // Sauvegarder la taille de la grande fenêtre après chaque redimensionnement
                    // (ignorer si on est en compact : width < 500)
                    if size.width > 400 {
                        *saved_size().lock() = Some((size.width, size.height));
                        use tauri::Manager;
                        if let Some(window) = event.window().app_handle().get_window("main") {
                            if let Ok(pos) = window.outer_position() {
                                *saved_large_position().lock() = Some((pos.x, pos.y));
                            }
                        }
                    }
                }
                tauri::WindowEvent::Moved(pos) => {
                    // Sauvegarder la position de la grande fenêtre après chaque déplacement
                    use tauri::Manager;
                    if let Some(window) = event.window().app_handle().get_window("main") {
                        if let Ok(size) = window.inner_size() {
                            if size.width > 400 {
                                *saved_large_position().lock() = Some((pos.x, pos.y));
                            }
                        }
                    }
                }
                _ => {}
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
                "widget" => {
                    let _ = enter_compact_mode(app.clone());
                }
                "start_rec" => {
                    // Afficher la fenêtre principale et envoyer un event pour démarrer l'enregistrement
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.unminimize();
                    }
                    // Émettre un event Tauri que le frontend écoute pour démarrer automatiquement
                    let _ = app.emit_all("tray-start-recording", ());
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

            // 1a. Notification permission — on demande silencieusement sans notif visible
            println!("[PERMISSIONS] Requesting notification access (silent)...");
            flush_logs();

            // 1b. Microphone permission — demandée silencieusement, seulement si pas encore accordée
            // Ne jamais afficher la popup au démarrage si déjà accordée (persistance TCC)
            request_microphone_permission_startup();

            // 1c. Screen Recording permission — NE PAS demander au démarrage.
            // macOS TCC affiche la popup système à chaque lancement si on appelle
            // CGRequestScreenCaptureAccess() même quand la permission est accordée.
            // On vérifie juste silencieusement via CGPreflightScreenCaptureAccess().
            // La demande réelle se fait uniquement quand l'utilisateur clique "Enregistrer".
            #[cfg(target_os = "macos")]
            {
                extern "C" { fn sck_has_permission() -> bool; }
                let screen_ok = unsafe { sck_has_permission() };
                println!("[PERMISSIONS] Screen Recording (silencieux): {}", if screen_ok { "✅ OK" } else { "⚠️ à demander au 1er enregistrement" });
            }

            println!("\n========================================");
            println!("       PERMISSIONS SUMMARY");
            println!("========================================");
            println!("  Microphone:       ✅ demandée");
            println!("  Screen Recording: vérifié silencieusement (demande au 1er rec)");
            println!("========================================\n");
            flush_logs();

            // 1d. Notifications : demander la permission ET configurer le delegate
            // Le delegate est installé ici (setup) puis réinstallé après init Tauri
            // car Tauri peut écraser UNUserNotificationCenter.delegate pendant son init WebView
            #[cfg(target_os = "macos")]
            {
                extern "C" {
                    fn set_notification_action_callback(callback: extern "C" fn());
                    fn request_notification_permission();
                    fn reinstall_notification_delegate();
                }
                let app_for_notif = app.handle();
                // Stocker l'app_handle dans le global pour notification_record_callback
                {
                    let mut guard = app_handle_for_notif().lock();
                    *guard = Some(app_for_notif);
                }
                // 1. Enregistrer le callback et installer le delegate
                unsafe { set_notification_action_callback(notification_record_callback); }
                // 2. Demander la permission de notification (si pas encore accordée)
                unsafe { request_notification_permission(); }
                println!("[PERMISSIONS] ✅ Notifications configurées (delegate + permission)");
                flush_logs();

                // 3. Réinstaller le delegate 2s après l'init Tauri (qui peut l'écraser)
                let app_for_reinstall = app.handle();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    #[cfg(target_os = "macos")]
                    unsafe {
                        reinstall_notification_delegate();
                    }
                    println!("[PERMISSIONS] ✅ Delegate notification réinstallé après init Tauri");
                    let mut guard = app_handle_for_notif().lock();
                    *guard = Some(app_for_reinstall);
                });
            }

            let dirs =
                AppDirs::new().map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            
            // Créer un client HTTP avec configuration appropriée pour HTTPS
            // Timeout généreux pour les gros uploads (enregistrements longs > 1h)
            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(1800)) // 30 min pour les gros uploads
                .connect_timeout(std::time::Duration::from_secs(30))
            .user_agent("Gilbert/1.0")
                .build()
                .map_err(|e| Box::<dyn std::error::Error>::from(format!("Failed to create HTTP client: {}", e)))?;
            
            println!("🌐 [HTTP] Client HTTP configuré avec timeout 30min (gros uploads)");
            flush_logs();
            
            let api = ApiClient::new(http_client);
            let mut queue = QueueManager::load(dirs.queue_file.clone())
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            let _ = queue.purge_invalid_jobs();
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
            println!("✅ Background sync démarré (auto-retry uploads toutes les 15s)");

            // Scan des fichiers audio orphelins au démarrage (crash recovery)
            // Les WAV dans audio/ non référencés dans queue.json sont automatiquement enqueués
            let state_for_recovery = state_arc.clone();
            let app_handle_for_recovery = app.handle();
            tauri::async_runtime::spawn(async move {
                // Délai de 3s pour laisser l'app s'initialiser
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                state_for_recovery.recover_orphaned_audio_files().await;
                // Notifier le frontend si des orphelins ont été trouvés
                let pending = {
                    let q = state_for_recovery.queue.lock().await;
                    q.store.jobs.iter()
                        .filter(|j| j.status == JobStatus::Pending || j.status == JobStatus::Failed)
                        .count()
                };
                if pending > 0 {
                    println!("[RECOVERY] {} enregistrement(s) en attente au démarrage", pending);
                    let _ = app_handle_for_recovery.emit_all("queue-status", serde_json::json!({
                        "is_online": true,
                        "pending_count": pending
                    }));
                    // Tenter l'auto-upload immédiatement si online
                    let is_online = network::is_online(&state_for_recovery.api.client).await;
                    if is_online {
                        match state_for_recovery.retry_queue().await {
                            Ok(jobs) => {
                                let done = jobs.iter().filter(|j| j.status == JobStatus::Done).count();
                                println!("[RECOVERY] Auto-upload au démarrage: {} réussi(s)", done);
                                if done > 0 {
                                    let _ = app_handle_for_recovery.emit_all("sync-status", serde_json::json!({
                                        "status": "all_uploaded",
                                        "done": done,
                                        "failed": 0
                                    }));
                                }
                            }
                            Err(e) => println!("[RECOVERY] Auto-upload échoué: {}", e),
                        }
                    }
                }
            });
            println!("✅ Scan de récupération audio planifié au démarrage");

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
            get_mic_audio_level,
            get_session_nonce,
            enter_compact_mode,
            exit_compact_mode,
            save_large_window_state,
            set_recording_active,
            get_active_video_app,
            notify_mic_activity,
            start_oauth_listener
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
