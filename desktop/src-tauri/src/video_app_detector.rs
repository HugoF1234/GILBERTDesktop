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

    /// Détecte si un CALL ACTIF est en cours (pas juste si l'app est ouverte).
    ///
    /// Stratégie multi-couches adaptée à chaque app :
    ///  1. Teams v2 : TCP ESTABLISHED (>= 4 connexions) vers serveurs Microsoft
    ///  2. Zoom : UDP non-*: sur ports > 1024 (flux RTP)
    ///  3. Discord/Slack/Webex : UDP avec IP distante ou TCP > seuil
    ///  4. URL navigateur : Google Meet, Jitsi, Zoom web, Teams web
    ///
    /// ⚠️ "App ouverte" ≠ "call en cours" :
    ///    Teams idle = 1-2 connexions TCP ESTABLISHED (heartbeat)
    ///    Teams en call = 4+ connexions TCP ESTABLISHED (média, signalisation, ICE)
    fn get_running_video_app() -> Option<String> {
        #[cfg(target_os = "macos")]
        {
            // Méthode 1 : URL navigateur (priorité) — plus fiable que le réseau
            // (évite "Teams" alors qu'on est sur Meet : l'URL indique la vraie app)
            if let Some(result) = Self::get_browser_active_call() {
                return Some(result);
            }

            // Méthode 2 : Connexions réseau (apps natives, fallback navigateur)
            if let Some(result) = Self::get_active_call_via_network() {
                return Some(result);
            }
        }

        None
    }

    /// Détecte les calls actifs.
    ///
    /// Méthode A : micro CoreAudio actif (is_microphone_active) + identification du process
    ///   → Apps natives : pgrep sur les apps de visio connues
    ///   → Navigateurs  : micro actif + connexions TCP vers domaines visio
    ///
    /// Méthode B (fallback, micro coupé) :
    ///
    /// Méthode A : micro CoreAudio actif (is_microphone_active) + identification du process
    ///   → Apps natives : pgrep + lsof -c ciblé (rapide, ~30ms par app)
    ///   → Navigateurs  : lsof -c ciblé sur les renderer processes
    ///
    /// Méthode B (toujours exécutée, micro coupé ou app gérant son propre audio) :
    ///   → Teams : lsof -c MSTeams TCP ESTABLISHED ≥ 4
    ///   → Zoom  : lsof -c zoom.us UDP
    ///   → Discord : lsof -c Discord UDP
    ///
    /// NOTE: On n'utilise PLUS lsof -i TCP global (trop lent, ~5s).
    ///       On utilise lsof -c <processname> ciblé (~30ms).
    #[cfg(target_os = "macos")]
    fn get_active_call_via_network() -> Option<String> {
        // Helper : lsof ciblé sur un nom de process, compter les lignes matchant un pattern
        fn lsof_count(proc_name: &str, proto: &str, extra_grep: &str) -> i32 {
            let grep_part = if extra_grep.is_empty() {
                String::new()
            } else {
                format!("| grep -cE '{}' || echo 0", extra_grep)
            };
            let cmd = if grep_part.is_empty() {
                format!("lsof -c '{}' -a -i {} -nP 2>/dev/null | grep -c {} || echo 0",
                    proc_name, proto, proto)
            } else {
                format!("lsof -c '{}' -a -i {} -nP 2>/dev/null {}",
                    proc_name, proto, grep_part)
            };
            Command::new("sh").arg("-c").arg(&cmd)
                .output().ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<i32>().unwrap_or(0))
                .unwrap_or(0)
        }

        // ── Méthode A : micro CoreAudio actif → apps natives ────────────────
        {
            extern "C" { fn is_microphone_active() -> bool; }
            let mic_active = unsafe { is_microphone_active() };
            println!("[DETECTION] Micro actif (CoreAudio): {}", mic_active);

            if mic_active {
                // Apps natives : si le micro CoreAudio est actif ET le process tourne = call
                let native_apps: &[(&str, &str)] = &[
                    ("zoom.us",    "Zoom"),
                    ("CptHost",    "Zoom"),
                    ("MSTeams",    "Microsoft Teams"),
                    ("Microsoft Teams", "Microsoft Teams"),
                    ("discord",    "Discord"),
                    ("webex",      "Webex"),
                    ("facetime",   "FaceTime"),
                    ("skype",      "Skype"),
                    ("slack",      "Slack"),
                    ("whereby",    "Whereby"),
                ];
                for (pattern, name) in native_apps {
                    let out = Command::new("pgrep").args(["-ix", pattern]).output().ok();
                    if let Some(o) = out {
                        let pid = String::from_utf8_lossy(&o.stdout).trim().to_string();
                        if !pid.is_empty() {
                            println!("[DETECTION] ✅ {} (micro CoreAudio actif + process)", name);
                            return Some(name.to_string());
                        }
                    }
                }
            }
        }

        // ── Méthode B : lsof ciblé par process (rapide ~30ms, indépendant du micro) ──
        // Teams peut gérer son propre audio sans passer par CoreAudio hardware

        // Teams — TCP ESTABLISHED ≥ 4 (idle = 1-2, call = 4-10)
        // MSTeams = ancienne app, "Microsoft Teams" = nouvelle app (Teams 2.0)
        {
            let n_msteams = lsof_count("MSTeams", "TCP", "ESTABLISHED");
            let n_teams = lsof_count("Microsoft Teams", "TCP", "ESTABLISHED");
            let n = n_msteams.max(n_teams);
            println!("[DETECTION] Teams TCP ESTABLISHED: MSTeams={}, Microsoft Teams={}", n_msteams, n_teams);
            if n >= 4 {
                return Some("Microsoft Teams".to_string());
            }
        }

        // Zoom — UDP hors mDNS/SSDP (flux RTP)
        {
            let running = Command::new("pgrep").args(["-ix", "zoom.us"]).output()
                .ok().map(|o| !o.stdout.is_empty()).unwrap_or(false);
            if running {
                let udp = lsof_count("zoom.us", "UDP", "");
                let udp2 = lsof_count("CptHost", "UDP", "");
                println!("[DETECTION] Zoom UDP: {} + CptHost UDP: {}", udp, udp2);
                if udp > 0 || udp2 > 0 {
                    return Some("Zoom".to_string());
                }
                let tcp = lsof_count("zoom.us", "TCP", "ESTABLISHED");
                if tcp >= 4 { return Some("Zoom".to_string()); }
            }
        }

        // Discord — UDP vocal
        {
            let n = lsof_count("Discord", "UDP", "");
            if n > 0 {
                println!("[DETECTION] Discord UDP: {}", n);
                return Some("Discord".to_string());
            }
        }

        // ── Méthode C : Navigateurs — WebRTC UDP actif ───────────────────────
        // Google Meet et autres services web utilisent WebRTC qui ouvre des sockets UDP.
        // On détecte via lsof -c ciblé sur les renderer processes des navigateurs.
        {
            // (nom_process, nom_affiché_pour_logs)
            let browser_procs: &[&str] = &[
                "Google Chrome Helper (Renderer)",
                "Google Chrome Helper",
                "Arc Helper (Renderer)",
                "Arc Helper",
                "Brave Browser Helper (Renderer)",
                "Brave Browser Helper",
                "Firefox",
                "Safari",
            ];

            for browser_proc in browser_procs {
                // UDP filtré : exclure mDNS (5353), SSDP (1900), NetBIOS (137)
                let udp_count = {
                    let cmd = format!(
                        "lsof -c '{}' -a -i UDP -nP 2>/dev/null | grep -vE ':5353|:1900|:137|\\*:' | grep -c UDP || echo 0",
                        browser_proc
                    );
                    Command::new("sh").arg("-c").arg(&cmd)
                        .output().ok()
                        .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<i32>().unwrap_or(0))
                        .unwrap_or(0)
                };

                println!("[DETECTION-BROWSER] {} — UDP WebRTC: {}", browser_proc, udp_count);

                // ≥ 2 sockets UDP = WebRTC actif (audio + vidéo ou audio seul)
                if udp_count >= 2 {
                    // Identifier le service par les ports caractéristiques
                    let meet_name = {
                        // Google Meet STUN : ports 19302-19312
                        let is_gmeet = {
                            let cmd = format!(
                                "lsof -c '{}' -a -i UDP -nP 2>/dev/null | grep -cE ':1930[2-9]|:1931[0-2]' || echo 0",
                                browser_proc
                            );
                            Command::new("sh").arg("-c").arg(&cmd)
                                .output().ok()
                                .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<i32>().unwrap_or(0))
                                .unwrap_or(0)
                        };
                        // Zoom web : ports 8801-8802
                        let is_zoom = {
                            let cmd = format!(
                                "lsof -c '{}' -a -i UDP -nP 2>/dev/null | grep -cE ':880[12]' || echo 0",
                                browser_proc
                            );
                            Command::new("sh").arg("-c").arg(&cmd)
                                .output().ok()
                                .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<i32>().unwrap_or(0))
                                .unwrap_or(0)
                        };
                        // Teams web : TCP vers *.teams.microsoft.com sur port 443 en ESTABLISHED
                        let is_teams_web = {
                            let cmd = format!(
                                "lsof -c '{}' -a -i TCP -nP 2>/dev/null | grep -cE 'ESTABLISHED.*:443|:443.*ESTABLISHED' || echo 0",
                                browser_proc
                            );
                            Command::new("sh").arg("-c").arg(&cmd)
                                .output().ok()
                                .map(|o| String::from_utf8_lossy(&o.stdout).trim().parse::<i32>().unwrap_or(0))
                                .unwrap_or(0)
                        };

                        if is_gmeet > 0 { "Google Meet" }
                        else if is_zoom > 0 { "Zoom" }
                        else if is_teams_web >= 2 { "Microsoft Teams" }
                        else { "Réunion web" }
                    };

                    println!("[DETECTION] ✅ {} (browser WebRTC UDP actif)", meet_name);
                    return Some(meet_name.to_string());
                }
            }
        }

        None
    }

    /// Trouve quelle app de visio est actuellement ouverte (dans l'ordre de priorité).
    /// Méthode de détection AppleScript fenêtres (gardée comme fallback annexe).
    #[cfg(target_os = "macos")]
    #[allow(dead_code)]
    fn detect_call_via_applescript_windows() -> Option<String> {
        let script = r#"
            set callApps to {{"Microsoft Teams", "msteams"}, {"Zoom", "zoom.us"}, {"Discord", "Discord"}, {"Webex", "Webex Meetings"}, {"FaceTime", "FaceTime"}, {"Skype", "Skype"}}

            repeat with appInfo in callApps
                set appName to item 1 of appInfo
                try
                    tell application "System Events"
                        if exists process appName then
                            tell process appName
                                set winCount to count of windows
                                if winCount > 0 then
                                    if appName is "Microsoft Teams" then
                                        repeat with w in windows
                                            try
                                                set winTitle to name of w
                                                set winTitle to do shell script "echo " & quoted form of winTitle & " | tr '[:upper:]' '[:lower:]'"
                                                if winTitle contains "meeting" or winTitle contains "réunion" or winTitle contains "appel" or winTitle contains "call" or winTitle contains "join" then
                                                    return "Microsoft Teams"
                                                end if
                                            end try
                                        end repeat
                                    end if
                                    if appName is "Zoom" then
                                        repeat with w in windows
                                            try
                                                set winTitle to name of w
                                                set winTitle to do shell script "echo " & quoted form of winTitle & " | tr '[:upper:]' '[:lower:]'"
                                                if winTitle contains "zoom meeting" or winTitle contains "zoom webinar" then
                                                    return "Zoom"
                                                end if
                                            end try
                                        end repeat
                                    end if
                                end if
                            end tell
                        end if
                    end tell
                end try
            end repeat
            return ""
        "#;

        let output = Command::new("osascript")
            .arg("-e")
            .arg(script)
            .output()
            .ok()?;

        let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if result.is_empty() || result == "\"\"" {
            return None;
        }
        println!("[APPLESCRIPT WINDOWS] Call détecté: {}", result);
        Some(result)
    }

    /// Détecte les calls via lsof ciblé sur les PIDs des apps de visio connues.
    #[cfg(target_os = "macos")]
    #[allow(dead_code)]
    fn detect_call_via_pid_lsof() -> Option<String> {
        let apps: &[(&str, &str)] = &[
            ("msteams",    "Microsoft Teams"),
            ("teams",      "Microsoft Teams"),
            ("zoom.us",    "Zoom"),
            ("CptHost",    "Zoom"),
            ("discord",    "Discord"),
            ("webex",      "Webex"),
            ("facetime",   "FaceTime"),
            ("skype",      "Skype"),
        ];

        for (pattern, name) in apps {
            let pgrep = Command::new("sh")
                .arg("-c")
                .arg(format!("pgrep -i {} 2>/dev/null | head -1", pattern))
                .output()
                .ok()?;

            let pid_str = String::from_utf8_lossy(&pgrep.stdout).trim().to_string();
            if pid_str.is_empty() {
                continue;
            }

            let lsof_check = Command::new("sh")
                .arg("-c")
                .arg(format!(
                    "lsof -p {} -i UDP -nP 2>/dev/null | grep -v '\\*:' | grep -v ':443 ' | wc -l",
                    pid_str
                ))
                .output()
                .ok()?;

            let count: i32 = String::from_utf8_lossy(&lsof_check.stdout)
                .trim()
                .parse()
                .unwrap_or(0);

            if count > 0 {
                println!("[PID LSOF] Call actif détecté: {} (pid={}, {} connexions UDP)", name, pid_str, count);
                return Some(name.to_string());
            }
        }

        None
    }

    /// Détection via URL active du navigateur (Chrome, Safari, Arc, etc.)
    /// Complète la détection réseau pour Teams web et Google Meet.
    #[cfg(target_os = "macos")]
    fn get_browser_active_call() -> Option<String> {
        let script = r#"
            set result to ""
            try
                tell application "Google Chrome" to set result to URL of active tab of front window
            end try
            if result is "" then
                try
                    tell application "Safari" to set result to URL of current tab of front window
                end try
            end if
            if result is "" then
                try
                    tell application "Arc" to set result to URL of active tab of front window
                end try
            end if
            if result is "" then
                try
                    tell application "Brave Browser" to set result to URL of active tab of front window
                end try
            end if
            return result
        "#;
        let out = Command::new("osascript").arg("-e").arg(script).output().ok()?;
        let url = String::from_utf8_lossy(&out.stdout).to_lowercase();
        let url = url.trim();

        // Google Meet : meet.google.com/xxx-xxx-xxx ou meet.google.com/call/xxx
        if url.contains("meet.google.com") {
            if url.contains("meet.google.com/call/") {
                return Some("Google Meet".to_string());
            }
            if let Some(path) = url.split("meet.google.com/").nth(1) {
                let path = path.split('?').next().unwrap_or(path);
                if path.len() >= 8 && path.contains('-') && !path.starts_with("new") {
                    return Some("Google Meet".to_string());
                }
            }
        }
        // Teams web : teams.microsoft.com ou teams.live.com avec call/meet
        if (url.contains("teams.microsoft.com") || url.contains("teams.live.com"))
            && (url.contains("meetup-join") || url.contains("/meet/") || url.contains("calling")
                || url.contains("/l/call/") || url.contains("/l/meetup-join/"))
        {
            return Some("Microsoft Teams".to_string());
        }
        // Zoom web
        if url.contains("zoom.us/j/") || url.contains("zoom.us/wc/") {
            return Some("Zoom".to_string());
        }
        // Jitsi, Whereby
        if url.contains("meet.jit.si/") {
            if let Some(path) = url.split("meet.jit.si/").nth(1) {
                if path.len() > 2 { return Some("Jitsi Meet".to_string()); }
            }
        }
        if url.contains("8x8.vc/") {
            return Some("Jitsi Meet".to_string());
        }
        if url.contains("whereby.com/") {
            if let Some(path) = url.split("whereby.com/").nth(1) {
                let base = path.split('/').next().unwrap_or("");
                if !base.is_empty() && !base.starts_with("business") && !base.starts_with("pricing") {
                    return Some("Whereby".to_string());
                }
            }
        }
        None
    }

    #[cfg(not(target_os = "macos"))]
    fn get_browser_active_call() -> Option<String> {
        None
    }

    /// Vérifie si l'utilisateur est dans un call actif (via connexions UDP voix)
    /// Les apps de visio utilisent UDP pour la voix/vidéo en temps réel
    /// Note: UDP:443 = QUIC (normal), UDP:autres ports = call voix actif
    #[allow(dead_code)]
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
        let app_id_for_timer = self.app_identifier.clone();
        let last_notif_meeting = self.last_notification.clone();
        let is_recording = self.is_recording.clone();
        let startup_time = self.startup_time.clone();
        let _app_handle_arc = self.app_handle.clone();

        // Timestamp du début de l'enregistrement actuel (pour notif 1h)
        let recording_start_ts: Arc<std::sync::atomic::AtomicU64> = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let rec_start_clone = recording_start_ts.clone();
        let is_recording_for_timer = is_recording.clone();

        // ── Tâche 1 : Détection calls visio actifs ───────────────────────────
        tauri::async_runtime::spawn(async move {
            sleep(Duration::from_secs(5)).await;
            println!("✅ Détection visioconférence démarrée (polling 2s)");

            // Dernière app détectée — on notifie quand ça change (nouvelle réunion ou switch Teams→Meet)
            let mut prev_app: Option<String> = None;

            loop {
                sleep(Duration::from_secs(2)).await;

                if is_recording.load(std::sync::atomic::Ordering::SeqCst) {
                    continue;
                }

                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                let startup = startup_time.load(std::sync::atomic::Ordering::SeqCst);
                if now.saturating_sub(startup) < 6 {
                    continue;
                }

                let video_app = tokio::task::spawn_blocking(Self::get_running_video_app)
                    .await
                    .unwrap_or(None);

                println!("[DETECTION] Cycle — résultat: {:?}", video_app);

                if let Some(ref app_name) = video_app {
                    // Notifier si : (1) nouvelle réunion (prev=None) ou (2) changement d'app (Teams→Meet)
                    let is_new = prev_app.is_none();
                    let is_switch = prev_app.as_deref() != Some(app_name.as_str());
                    let cooldown_secs = if is_switch { 15 } else { 60 };
                    let last_meeting = last_notif_meeting.load(std::sync::atomic::Ordering::SeqCst);
                    let cooldown_ok = now.saturating_sub(last_meeting) >= cooldown_secs;

                    if (is_new || is_switch) && cooldown_ok {
                        println!("[DETECTION] 🎙️ {} détecté: {} — envoi notification", if is_switch { "Changement" } else { "Nouvelle visio" }, app_name);
                        let notif_app = app_name.clone();
                        std::thread::spawn(move || {
                            send_meeting_native_notification(&notif_app);
                        });
                        last_notif_meeting.store(now, std::sync::atomic::Ordering::SeqCst);
                    }
                    prev_app = Some(app_name.clone());
                } else {
                    prev_app = None;
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
                        .title("Toujours là ?")
                        .body("Enregistrement en cours depuis 1h — Pensez à sauvegarder.")
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

/// Notification macOS interactive avec icône Gilbert — clic "Enregistrer" → mode compact + enregistrement
/// Utilise display alert avec l'icône du bundle Gilbert pour une présentation personnalisée.
/// Envoie une notification native macOS via UNUserNotificationCenter (non-bloquante).
/// L'icône est celle de Gilbert.app, avec boutons "Enregistrer" / "Ignorer".
/// La réponse est capturée par le delegate Swift → callback Rust notification_record_callback.
#[cfg(target_os = "macos")]
fn send_meeting_native_notification(app_name: &str) {
    extern "C" {
        fn send_meeting_notification(app_name: *const std::os::raw::c_char);
    }
    use std::ffi::CString;
    if let Ok(cname) = CString::new(app_name) {
        unsafe { send_meeting_notification(cname.as_ptr()); }
    }
}

#[cfg(not(target_os = "macos"))]
fn send_meeting_native_notification(_app_name: &str) {}
