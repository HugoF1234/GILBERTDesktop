use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

use crate::network;
use crate::state::AppState;

/// Interval entre chaque vérification de connexion (en secondes)
const SYNC_INTERVAL_SECS: u64 = 30;

/// Démarre la boucle de synchronisation en arrière-plan
pub async fn start_background_sync_loop(
    app_state: Arc<AppState>,
    app_handle: tauri::AppHandle,
) {
    println!("[BACKGROUND_SYNC] Démarrage de la boucle de synchronisation...");

    let mut was_offline = false;

    loop {
        // Attendre l'intervalle
        tokio::time::sleep(Duration::from_secs(SYNC_INTERVAL_SECS)).await;

        // Vérifier la connexion
        let is_online = network::is_online(&app_state.api.client).await;

        // Mettre à jour l'état online dans AppState
        {
            let mut online_guard = app_state.online.lock();
            *online_guard = is_online;
        }

        // Obtenir le nombre de jobs en attente
        let pending_count = {
            let queue = app_state.queue.lock().await;
            queue.store.jobs.iter()
                .filter(|j| j.status == crate::queue::JobStatus::Pending || j.status == crate::queue::JobStatus::Failed)
                .count()
        };

        // Log de debug périodique
        if pending_count > 0 || !is_online {
            println!(
                "[BACKGROUND_SYNC] Status: {}, Pending jobs: {}",
                if is_online { "online" } else { "offline" },
                pending_count
            );
        }

        // Si on revient online et qu'il y a des jobs en attente, notifier le frontend
        // NOTE: Pas d'auto-retry - l'utilisateur doit uploader manuellement via la boîte de dialogue
        if was_offline && is_online && pending_count > 0 {
            println!("[BACKGROUND_SYNC] Connexion restaurée avec {} jobs en attente - en attente d'action manuelle", pending_count);

            // Émettre un événement au frontend pour afficher le bouton "Récupérer"
            let _ = app_handle.emit_all("sync-status", serde_json::json!({
                "status": "pending_manual_upload",
                "pending_count": pending_count
            }));

            // Notification système pour informer l'utilisateur
            let _ = tauri::api::notification::Notification::new("com.gilbert.desktop")
                .title("Gilbert Desktop")
                .body(format!("{} enregistrement{} en attente d'upload",
                    pending_count,
                    if pending_count > 1 { "s" } else { "" }
                ))
                .show();
        }

        // Mettre à jour l'état précédent
        was_offline = !is_online;

        // Émettre un événement de statut périodique si des jobs sont en attente
        if pending_count > 0 {
            let _ = app_handle.emit_all("queue-status", serde_json::json!({
                "is_online": is_online,
                "pending_count": pending_count
            }));
        }
    }
}

/// Démarre le background sync dans un thread séparé
pub fn spawn_background_sync(
    app_state: Arc<AppState>,
    app_handle: tauri::AppHandle,
) {
    tauri::async_runtime::spawn(async move {
        start_background_sync_loop(app_state, app_handle).await;
    });
}
