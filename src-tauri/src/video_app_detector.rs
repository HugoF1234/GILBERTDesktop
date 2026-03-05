use std::time::Duration;
use std::sync::Arc;
use std::process::Command;
use tokio::time::sleep;
use tauri::api::notification::Notification;

pub struct VideoAppDetector {
    pub app_identifier: String,
    pub app_handle: Arc<parking_lot::Mutex<Option<tauri::AppHandle>>>,
    last_notification: Arc<std::sync::atomic::AtomicU64>,
    is_recording: Arc<std::sync::atomic::AtomicBool>,
    startup_time: Arc<std::sync::atomic::AtomicU64>, // Temps de démarrage pour éviter les notifs au lancement
}

impl VideoAppDetector {
    pub fn new(app_identifier: String) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        Self {
            app_identifier,
            app_handle: Arc::new(parking_lot::Mutex::new(None)),
            last_notification: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            is_recording: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            startup_time: Arc::new(std::sync::atomic::AtomicU64::new(now)),
        }
    }

    pub fn with_handles(
        app_identifier: String,
        app_handle: Arc<parking_lot::Mutex<Option<tauri::AppHandle>>>,
        is_recording: Arc<std::sync::atomic::AtomicBool>,
    ) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        Self {
            app_identifier,
            app_handle,
            last_notification: Arc::new(std::sync::atomic::AtomicU64::new(0)),
            is_recording,
            startup_time: Arc::new(std::sync::atomic::AtomicU64::new(now)),
        }
    }
    
    pub fn set_recording(&self, recording: bool) {
        self.is_recording.store(recording, std::sync::atomic::Ordering::SeqCst);
        if recording {
            println!("🎬 Enregistrement démarré - notifications désactivées");
        } else {
            println!("⏹️ Enregistrement arrêté - notifications réactivées");
        }
    }
    
    pub fn get_is_recording(&self) -> Arc<std::sync::atomic::AtomicBool> {
        self.is_recording.clone()
    }

    pub fn set_app_handle(&self, app_handle: tauri::AppHandle) {
        *self.app_handle.lock() = Some(app_handle);
    }

    /// Liste des apps de visio connues
    const VIDEO_APPS: &'static [(&'static str, &'static str)] = &[
        ("discord", "Discord"),
        ("zoom.us", "Zoom"),
        ("teams", "Microsoft Teams"),
        ("slack", "Slack"),
        ("webex", "Webex"),
        ("facetime", "FaceTime"),
        ("skype", "Skype"),
        ("meet.google", "Google Meet"),
    ];

    /// Vérifie si une app de visio est en cours d'exécution
    fn get_running_video_app() -> Option<String> {
        let output = Command::new("ps")
            .args(["aux"])
            .output()
            .ok()?;

        let ps_str = String::from_utf8_lossy(&output.stdout).to_lowercase();

        for (pattern, name) in Self::VIDEO_APPS {
            if ps_str.contains(pattern) {
                return Some(name.to_string());
            }
        }
        None
    }

    /// Vérifie si l'utilisateur est dans un call actif (via connexions UDP voix)
    /// Les apps de visio utilisent UDP pour la voix/vidéo en temps réel
    /// Note: UDP:443 = QUIC (normal), UDP:autres ports = call voix actif
    fn is_in_active_call() -> bool {
        // Méthode principale : Vérifier les connexions UDP voix (pas QUIC)
        // Discord/Teams/Zoom utilisent UDP sur des ports autres que 443 pour la voix
        // UDP:443 = QUIC (transport HTTP/3, pas voix)
        let output = Command::new("sh")
            .arg("-c")
            // Compter les connexions UDP qui ne sont PAS sur le port 443 (exclure QUIC)
            .arg("lsof -i -nP 2>/dev/null | grep -iE 'discord|teams|zoom|slack|webex|facetime|skype' | grep 'UDP' | grep -v ':443' | wc -l || echo '0'")
            .output()
            .ok();

        if let Some(out) = output {
            let voice_udp: i32 = String::from_utf8_lossy(&out.stdout)
                .trim()
                .parse()
                .unwrap_or(0);
            // Si connexion UDP non-QUIC = appel voix/vidéo actif
            if voice_udp > 0 {
                println!("🔊 {} connexion(s) UDP voix détectée(s) = call actif", voice_udp);
                return true;
            }
        }

        // Méthode 2 : Plus de 3 connexions UDP totales = probablement en call
        // (normal = 1-2 connexions QUIC, call = 3+ connexions)
        let output2 = Command::new("sh")
            .arg("-c")
            .arg("lsof -i -nP 2>/dev/null | grep -iE 'discord|teams|zoom|slack|webex|facetime|skype' | grep -c 'UDP' || echo '0'")
            .output()
            .ok();

        if let Some(out) = output2 {
            let total_udp: i32 = String::from_utf8_lossy(&out.stdout)
                .trim()
                .parse()
                .unwrap_or(0);
            // Si plus de 3 connexions UDP = probablement un call
            if total_udp > 3 {
                println!("🔊 {} connexions UDP totales = call probable", total_udp);
                return true;
            }
        }

        // Méthode 3 : Vérifier si l'app de visio est au premier plan
        let output3 = Command::new("osascript")
            .arg("-e")
            .arg(r#"
                try
                    tell application "System Events"
                        set frontApp to name of first application process whose frontmost is true
                        if frontApp is "Discord" or frontApp is "Zoom" or frontApp is "Microsoft Teams" or frontApp is "Slack" or frontApp is "FaceTime" then
                            return frontApp
                        end if
                    end tell
                end try
                return ""
            "#)
            .output()
            .ok();

        if let Some(out) = output3 {
            let app = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !app.is_empty() {
                println!("📱 {} est au premier plan", app);
                return true;
            }
        }

        false
    }

    pub async fn start_detection_loop(&self) {
        // DÉTECTION RGPD-COMPLIANT : Polling des processus + état audio
        // PAS d'écoute du contenu audio, juste les métadonnées système

        let app_id = self.app_identifier.clone();
        let last_notif = self.last_notification.clone();
        let is_recording = self.is_recording.clone();
        let startup_time = self.startup_time.clone();

        // Variables pour tracker les changements d'état
        let was_video_app_running = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let was_video_app_clone = was_video_app_running.clone();

        tauri::async_runtime::spawn(async move {
            // Délai de démarrage
            sleep(Duration::from_secs(5)).await;
            println!("✅ Détection RGPD-compliant démarrée");
            println!("🔒 Pas d'écoute audio - surveillance des processus uniquement");

            loop {
                sleep(Duration::from_secs(3)).await; // Vérifier toutes les 3 secondes

                // Ne pas vérifier si on enregistre
                if is_recording.load(std::sync::atomic::Ordering::SeqCst) {
                    was_video_app_clone.store(false, std::sync::atomic::Ordering::SeqCst);
                    continue;
                }

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs();

                // Vérifier délai de démarrage
                let startup = startup_time.load(std::sync::atomic::Ordering::SeqCst);
                if now.saturating_sub(startup) < 8 {
                    continue;
                }

                // Vérifier si l'utilisateur est en call actif
                let video_app = Self::get_running_video_app();
                let in_call = Self::is_in_active_call();
                let was_active = was_video_app_clone.load(std::sync::atomic::Ordering::SeqCst);

                // Log périodique de l'état
                if now % 30 == 0 {
                    println!("📊 État: video_app={:?}, in_call={}, was_active={}",
                        video_app.as_ref().map(|s| s.as_str()), in_call, was_active);
                }

                if let Some(app_name) = video_app {
                    // App de visio au premier plan = proposer d'enregistrer
                    if in_call && !was_active {
                        println!("🎙️ Call détecté: {} est au premier plan", app_name);

                        let last_notif_time = last_notif.load(std::sync::atomic::Ordering::SeqCst);

                        // Cooldown de 180 secondes (3 min)
                        if now.saturating_sub(last_notif_time) >= 180 {
                            let _ = Notification::new(&app_id)
                                .title("🎙️ Réunion détectée")
                                .body(&format!("{} est actif - Prendre des notes ?", app_name))
                                .show();

                            last_notif.store(now, std::sync::atomic::Ordering::SeqCst);
                            println!("✅ Notification envoyée pour {}", app_name);
                        } else {
                            println!("⏳ Cooldown actif ({} sec restantes)", 180 - (now - last_notif_time));
                        }

                        was_video_app_clone.store(true, std::sync::atomic::Ordering::SeqCst);
                    } else if !in_call && was_active {
                        // L'utilisateur a quitté le call ou changé de fenêtre
                        println!("👋 Plus au premier plan");
                        was_video_app_clone.store(false, std::sync::atomic::Ordering::SeqCst);
                    }
                } else {
                    // Pas d'app de visio
                    if was_active {
                        println!("👋 App de visio fermée");
                        was_video_app_clone.store(false, std::sync::atomic::Ordering::SeqCst);
                    }
                }
            }
        });
        
        // Boucle async pour maintenir la tâche active
        loop {
            sleep(Duration::from_secs(10)).await;
        }
    }
}

