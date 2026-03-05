use std::time::Duration;
use std::sync::Arc;
use std::process::Command;
use tokio::time::sleep;
use tauri::api::notification::Notification;

pub struct VideoAppDetector {
    pub app_identifier: String,
    pub app_handle: Arc<parking_lot::Mutex<Option<tauri::AppHandle>>>,
    last_notification: Arc<std::sync::atomic::AtomicU64>,
    last_mic_notification: Arc<std::sync::atomic::AtomicU64>,
    is_recording: Arc<std::sync::atomic::AtomicBool>,
    startup_time: Arc<std::sync::atomic::AtomicU64>,
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
            last_mic_notification: Arc::new(std::sync::atomic::AtomicU64::new(0)),
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
            last_mic_notification: Arc::new(std::sync::atomic::AtomicU64::new(0)),
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
        ("zoom", "Zoom"),
        ("teams", "Microsoft Teams"),
        ("slack", "Slack"),
        ("webex", "Webex"),
        ("facetime", "FaceTime"),
        ("skype", "Skype"),
        ("meet.google", "Google Meet"),
        ("whereby", "Whereby"),
        ("around", "Around"),
        ("loom", "Loom"),
        ("riverside", "Riverside"),
    ];

    /// Détecte quelle app utilise le micro en ce moment (macOS uniquement)
    /// Utilise `lsof` sur le device audio d'entrée
    #[cfg(target_os = "macos")]
    fn get_app_using_mic() -> Option<String> {
        // Cherche les processus qui ont ouvert le device audio d'entrée
        let output = Command::new("sh")
            .arg("-c")
            .arg("lsof /dev/osxspeex /dev/osxsnd 2>/dev/null | awk 'NR>1 {print $1}' | sort -u | head -5 || true")
            .output()
            .ok()?;

        let apps = String::from_utf8_lossy(&output.stdout);
        let app = apps.lines()
            .filter(|l| !l.trim().is_empty())
            .filter(|l| !l.contains("lsof") && !l.contains("sh"))
            .next()
            .map(|s| s.trim().to_string());

        // Méthode 2 : via CoreAudio avec osascript
        if app.is_none() {
            let out2 = Command::new("osascript")
                .arg("-e")
                .arg(r#"
                    try
                        set result to ""
                        tell application "System Events"
                            repeat with proc in application processes
                                try
                                    if (count of (audio devices of proc)) > 0 then
                                        set result to result & name of proc & "\n"
                                    end if
                                end try
                            end repeat
                        end tell
                        return result
                    end try
                    return ""
                "#)
                .output()
                .ok()?;
            let names = String::from_utf8_lossy(&out2.stdout);
            let name = names.lines()
                .filter(|l| !l.trim().is_empty())
                .filter(|l| !l.eq_ignore_ascii_case("Gilbert"))
                .next()
                .map(|s| s.trim().to_string());
            return name;
        }

        app
    }

    #[cfg(not(target_os = "macos"))]
    fn get_app_using_mic() -> Option<String> {
        None
    }

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
        let app_id = self.app_identifier.clone();
        let last_notif_meeting = self.last_notification.clone();
        let last_notif_mic = self.last_mic_notification.clone();
        let is_recording = self.is_recording.clone();
        let startup_time = self.startup_time.clone();

        // Timestamp du début de l'enregistrement actuel (pour notif 1h)
        let recording_start_ts: Arc<std::sync::atomic::AtomicU64> = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let rec_start_clone = recording_start_ts.clone();
        let is_recording_for_timer = is_recording.clone();
        let app_id_for_timer = app_id.clone();

        // ── Tâche 1 : Détection apps de visio + micro any-app ────────────────
        tauri::async_runtime::spawn(async move {
            // Délai initial pour laisser l'app démarrer
            sleep(Duration::from_secs(15)).await;
            println!("✅ Détection meetings + micro démarrée");

            // État précédent pour éviter les doublons
            let mut prev_meeting_active = false;
            let mut prev_mic_app: Option<String> = None;

            loop {
                sleep(Duration::from_secs(10)).await;

                // Pas de notif si on enregistre déjà
                if is_recording.load(std::sync::atomic::Ordering::SeqCst) {
                    prev_meeting_active = false;
                    prev_mic_app = None;
                    continue;
                }

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                // Pas de notif dans les 15 premières secondes après le démarrage
                let startup = startup_time.load(std::sync::atomic::Ordering::SeqCst);
                if now.saturating_sub(startup) < 15 {
                    continue;
                }

                // ── Cas 1 : app de visio EN CALL actif ───────────────────────
                let video_app = Self::get_running_video_app();
                let in_call = if video_app.is_some() { Self::is_in_active_call() } else { false };

                if let Some(ref app_name) = video_app {
                    if in_call {
                        // Notifier seulement si : (1) pas notifié avant, (2) cooldown 10 min respecté
                        let last_meeting = last_notif_meeting.load(std::sync::atomic::Ordering::SeqCst);
                        let cooldown_ok = now.saturating_sub(last_meeting) >= 600; // 10 min

                        if !prev_meeting_active && cooldown_ok {
                            println!("🎙️ Meeting détecté: {}", app_name);
                            let _ = Notification::new(&app_id)
                                .title("Gilbert — Réunion détectée")
                                .body(&format!("{} — Voulez-vous enregistrer cette réunion ?", app_name))
                                .show();
                            last_notif_meeting.store(now, std::sync::atomic::Ordering::SeqCst);
                        }
                        prev_meeting_active = true;
                        prev_mic_app = None;
                        continue;
                    }
                }

                // Pas de call actif → reset état réunion
                prev_meeting_active = false;

                // ── Cas 2 : micro ouvert par n'importe quelle app (hors visio) ──
                let mic_app = Self::get_app_using_mic();

                // Filtrer les apps de visio (déjà gérées au-dessus)
                let mic_app_filtered = mic_app.as_ref().and_then(|name| {
                    let lower = name.to_lowercase();
                    let is_video = Self::VIDEO_APPS.iter().any(|(p, _)| lower.contains(p));
                    // Aussi filtrer Gilbert lui-même
                    let is_gilbert = lower.contains("gilbert");
                    if is_video || is_gilbert { None } else { Some(name.clone()) }
                });

                if let Some(ref mic_name) = mic_app_filtered {
                    // Notifier seulement si c'est une nouvelle app (différente de la précédente)
                    let is_new_app = prev_mic_app.as_deref() != Some(mic_name.as_str());
                    let last_mic = last_notif_mic.load(std::sync::atomic::Ordering::SeqCst);
                    let cooldown_ok = now.saturating_sub(last_mic) >= 600; // 10 min

                    if is_new_app && cooldown_ok {
                        println!("🎤 Micro actif: {}", mic_name);
                        let _ = Notification::new(&app_id)
                            .title("Gilbert — Micro actif")
                            .body(&format!("{} utilise votre micro — Démarrer un enregistrement ?", mic_name))
                            .show();
                        last_notif_mic.store(now, std::sync::atomic::Ordering::SeqCst);
                    }
                    prev_mic_app = Some(mic_name.clone());
                } else {
                    prev_mic_app = None;
                }
            }
        });

        // ── Tâche 2 : Notif si recording > 1h ────────────────────────────────
        tauri::async_runtime::spawn(async move {
            loop {
                sleep(Duration::from_secs(60)).await;

                if !is_recording_for_timer.load(std::sync::atomic::Ordering::SeqCst) {
                    rec_start_clone.store(0, std::sync::atomic::Ordering::SeqCst);
                    continue;
                }

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let start = rec_start_clone.load(std::sync::atomic::Ordering::SeqCst);

                if start == 0 {
                    rec_start_clone.store(now, std::sync::atomic::Ordering::SeqCst);
                    continue;
                }

                let elapsed_min = now.saturating_sub(start) / 60;

                // Notifier à 60 min, puis toutes les 30 min
                if elapsed_min >= 60 && (elapsed_min - 60) % 30 == 0 {
                    println!("⏱️ Enregistrement en cours depuis {}min", elapsed_min);
                    let _ = Notification::new(&app_id_for_timer)
                        .title("Gilbert — Enregistrement long")
                        .body(&format!(
                            "Vous enregistrez depuis {}h{}min — Pensez à sauvegarder !",
                            elapsed_min / 60,
                            elapsed_min % 60
                        ))
                        .show();
                }
            }
        });

        // Maintenir la tâche principale active
        loop {
            sleep(Duration::from_secs(60)).await;
        }
    }
}
