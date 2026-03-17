use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

use crate::network;
use crate::state::AppState;

/// Interval entre chaque vérification de connexion (en secondes)
const SYNC_INTERVAL_SECS: u64 = 15;

/// Démarre la boucle de synchronisation en arrière-plan
pub async fn start_background_sync_loop(
    app_state: Arc<AppState>,
    app_handle: tauri::AppHandle,
) {
    println!("[BACKGROUND_SYNC] Démarrage de la boucle de synchronisation...");

    let mut was_offline = false;
    // Cooldown pour éviter de re-notifier si l'upload auto vient d'être déclenché
    let mut last_auto_retry_secs: u64 = 0;

    loop {
        tokio::time::sleep(Duration::from_secs(SYNC_INTERVAL_SECS)).await;

        // Vérifier la connexion
        let is_online = network::is_online(&app_state.api.client).await;

        // Mettre à jour l'état online dans AppState
        {
            let mut online_guard = app_state.online.lock();
            *online_guard = is_online;
        }

        // Nombre de jobs en attente (Pending ou Failed)
        let pending_count = {
            let queue = app_state.queue.lock().await;
            queue.store.jobs.iter()
                .filter(|j| j.status == crate::queue::JobStatus::Pending || j.status == crate::queue::JobStatus::Failed)
                .count()
        };

        if pending_count > 0 || !is_online {
            println!(
                "[BACKGROUND_SYNC] Status: {}, Pending jobs: {}",
                if is_online { "online" } else { "offline" },
                pending_count
            );
        }

        let now_secs = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // ── Reconnexion détectée avec des jobs en attente ──────────────────────
        if was_offline && is_online && pending_count > 0 {
            println!("[BACKGROUND_SYNC] Connexion restaurée avec {} jobs en attente → auto-retry", pending_count);

            // Cooldown : ne pas re-lancer si on vient de le faire il y a moins de 60s
            let can_retry = now_secs.saturating_sub(last_auto_retry_secs) >= 60;

            if can_retry {
                last_auto_retry_secs = now_secs;

                // Émettre un event au frontend (pour le spinner de progression)
                let _ = app_handle.emit_all("sync-status", serde_json::json!({
                    "status": "auto_retrying",
                    "pending_count": pending_count
                }));

                // Lancer l'auto-retry en arrière-plan (non-bloquant pour la boucle)
                let app_state_clone = app_state.clone();
                let app_handle_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    match app_state_clone.retry_queue().await {
                        Ok(jobs) => {
                            let done = jobs.iter().filter(|j| j.status == crate::queue::JobStatus::Done).count();
                            let failed = jobs.iter().filter(|j| j.status == crate::queue::JobStatus::Failed).count();
                            println!("[BACKGROUND_SYNC] Auto-retry terminé: {} réussi(s), {} échoué(s)", done, failed);

                            // Notifier le frontend du résultat
                            let _ = app_handle_clone.emit_all("sync-status", serde_json::json!({
                                "status": if failed == 0 { "all_uploaded" } else { "partial_upload" },
                                "done": done,
                                "failed": failed
                            }));

                            // Notification système si au moins un enregistrement uploadé
                            if done > 0 {
                                let _ = tauri::api::notification::Notification::new("com.gilbert.desktop")
                                    .title("Gilbert — Enregistrement(s) uploadé(s)")
                                    .body(format!(
                                        "{} enregistrement{} uploadé{} avec succès.",
                                        done,
                                        if done > 1 { "s" } else { "" },
                                        if done > 1 { "s" } else { "" }
                                    ))
                                    .show();
                            }
                            // Notification si certains ont échoué
                            if failed > 0 {
                                let _ = tauri::api::notification::Notification::new("com.gilbert.desktop")
                                    .title("Gilbert — Échec upload")
                                    .body(format!(
                                        "{} enregistrement{} n'a pas pu être uploadé. Ouvrez Gilbert → Récupérer.",
                                        failed,
                                        if failed > 1 { "s" } else { "" }
                                    ))
                                    .show();
                            }
                        }
                        Err(e) => {
                            println!("[BACKGROUND_SYNC] Auto-retry échoué: {}", e);
                            // Si offline de nouveau, on retente au prochain cycle
                            let _ = app_handle_clone.emit_all("sync-status", serde_json::json!({
                                "status": "pending_manual_upload",
                                "pending_count": pending_count
                            }));
                        }
                    }
                });
            }
        }

        // ── Pas de WiFi et jobs en attente → notifier si on est resté offline longtemps ──
        if !is_online && pending_count > 0 {
            // Notifier seulement au premier passage offline (quand on vient de perdre la connexion)
            if !was_offline {
                let _ = tauri::api::notification::Notification::new("com.gilbert.desktop")
                    .title("Gilbert — Connexion perdue")
                    .body(format!(
                        "{} enregistrement{} sauvegardé{} localement. Upload automatique à la reconnexion.",
                        pending_count,
                        if pending_count > 1 { "s" } else { "" },
                        if pending_count > 1 { "s" } else { "" }
                    ))
                    .show();
            }

            // Toujours émettre l'état de la queue au frontend
            let _ = app_handle.emit_all("sync-status", serde_json::json!({
                "status": "pending_manual_upload",
                "pending_count": pending_count
            }));
        }

        // Mettre à jour l'état précédent
        was_offline = !is_online;

        // Émettre queue-status à chaque cycle (même quand 0) pour que le badge soit toujours correct
        let _ = app_handle.emit_all("queue-status", serde_json::json!({
            "is_online": is_online,
            "pending_count": pending_count
        }));
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
