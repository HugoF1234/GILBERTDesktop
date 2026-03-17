use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use sysinfo::System;
use tauri::Manager;

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream,
};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MonitorError {
    #[error("no input device available")]
    NoInput,
    #[error("audio error: {0}")]
    Audio(String),
    #[error("already monitoring")]
    AlreadyMonitoring,
}

pub struct MicMonitor {
    monitoring: Arc<AtomicBool>,
    stream: Option<Stream>,
    last_notification: Arc<AtomicU64>,
    _app_identifier: String,
    app_handle: Option<tauri::AppHandle>,
}

// cpal streams are not marked Send/Sync on all platforms
unsafe impl Send for MicMonitor {}
unsafe impl Sync for MicMonitor {}

const VIDEO_APPS: &[&str] = &[
    "discord", "zoom", "msteams", "microsoft teams", "teams2",
    "slack", "webex", "facetime", "skype", "whereby",
    "around", "loom", "riverside", "jitsi",
];

impl MicMonitor {
    pub fn new(app_identifier: String) -> Self {
        Self {
            monitoring: Arc::new(AtomicBool::new(false)),
            stream: None,
            last_notification: Arc::new(AtomicU64::new(0)),
            _app_identifier: app_identifier,
            app_handle: None,
        }
    }

    pub fn start_with_app_handle(&mut self, app_handle: tauri::AppHandle) -> Result<(), MonitorError> {
        self.app_handle = Some(app_handle);
        self.start()
    }

    pub fn is_monitoring(&self) -> bool {
        self.monitoring.load(Ordering::SeqCst)
    }

    pub fn start(&mut self) -> Result<(), MonitorError> {
        if self.is_monitoring() {
            return Err(MonitorError::AlreadyMonitoring);
        }

        let host = cpal::default_host();
        let device = host.default_input_device().ok_or(MonitorError::NoInput)?;
        let config = device
            .default_input_config()
            .map_err(|e| MonitorError::Audio(e.to_string()))?;

        let monitoring_flag = self.monitoring.clone();
        let last_notif = self.last_notification.clone();
        let app_handle_opt = self.app_handle.clone();

        // Seuil RMS : détecte une vraie activité vocale (pas juste le bruit de fond)
        const RMS_THRESHOLD: f32 = 0.008;
        // Durée minimale d'activité avant de notifier — 3 secondes pour éviter les faux positifs
        const ACTIVITY_DURATION_MS: u64 = 3000;
        // Cooldown entre deux notifications : 30 minutes pour ne pas être agressif
        const COOLDOWN_SECS: u64 = 1800;

        let activity_start: Arc<parking_lot::Mutex<Option<Instant>>> =
            Arc::new(parking_lot::Mutex::new(None));

        let on_rms = {
            let activity = activity_start.clone();
            move |rms: f32| {
                let now = Instant::now();
                let now_sys = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                if rms > RMS_THRESHOLD {
                    let mut guard = activity.lock();
                    match *guard {
                        None => {
                            *guard = Some(now);
                        }
                        Some(start) => {
                            let active_ms = now.duration_since(start).as_millis() as u64;
                            if active_ms >= ACTIVITY_DURATION_MS {
                                // Vérifier cooldown
                                let last = last_notif.load(Ordering::SeqCst);
                                if now_sys.saturating_sub(last) >= COOLDOWN_SECS {
                                    // Détecter si c'est une app de visio via sysinfo
                                    let mut sys = System::new();
                                    sys.refresh_processes();
                                    let video_app = sys.processes().values().find_map(|p| {
                                        let name = p.name().to_lowercase();
                                        VIDEO_APPS.iter().find(|&&v| name.contains(v))
                                            .map(|v| v.to_string())
                                    });

                                    let video_app_name = video_app.clone();
                                    let app_handle_clone = app_handle_opt.clone();
                                    println!("🔔 MicMonitor: activité détectée, app={:?} | RMS={:.4}", video_app_name, rms);

                                    // N'envoyer la notification que si une app de visio connue est détectée
                                    // Si video_app = None (activité micro système/inconnue), on ignore
                                    // Cela évite les faux positifs "audio compte" / processus système macOS
                                    if video_app_name.is_none() {
                                        println!("🔇 MicMonitor: pas d'app de visio détectée, notification ignorée");
                                        last_notif.store(now_sys, Ordering::SeqCst);
                                        *guard = None;
                                        return;
                                    }

                                    // 1. Notification macOS native cliquable (Centre de notifications)
                                    // Un clic dessus → l'app se lève et démarre l'enregistrement
                                    let notif_app = video_app_name.clone();
                                    let handle_notif = app_handle_clone.clone();
                                    std::thread::spawn(move || {
                                        send_native_notification(notif_app, handle_notif);
                                    });

                                    // 2. Aussi émettre l'événement in-app (bannière si l'app est au premier plan)
                                    if let Some(handle) = &app_handle_clone {
                                        let payload = video_app_name.unwrap_or_default();
                                        let _ = handle.emit_all("mic-activity-detected", payload);
                                    }

                                    last_notif.store(now_sys, Ordering::SeqCst);
                                    *guard = None; // reset pour éviter le spam
                                }
                            }
                        }
                    }
                } else {
                    // Silence → reset l'activité
                    *activity.lock() = None;
                }
            }
        };

        let stream = Self::build_stream(&device, config, monitoring_flag.clone(), on_rms)?;

        stream
            .play()
            .map_err(|e| MonitorError::Audio(e.to_string()))?;

        self.monitoring.store(true, Ordering::SeqCst);
        self.stream = Some(stream);
        println!("✅ MicMonitor actif — seuil RMS={}, cooldown={}min", RMS_THRESHOLD, COOLDOWN_SECS / 60);
        Ok(())
    }

    fn build_stream<F>(
        device: &cpal::Device,
        config: cpal::SupportedStreamConfig,
        monitoring_flag: Arc<AtomicBool>,
        mut on_rms: F,
    ) -> Result<Stream, MonitorError>
    where
        F: FnMut(f32) + Send + 'static,
    {
        let err_fn = |err| eprintln!("mic monitor stream error: {}", err);

        match config.sample_format() {
            SampleFormat::F32 => {
                let cfg: cpal::StreamConfig = config.into();
                device
                    .build_input_stream(
                        &cfg,
                        move |data: &[f32], _| {
                            if !monitoring_flag.load(Ordering::SeqCst) { return; }
                            let rms = compute_rms_f32(data);
                            on_rms(rms);
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| MonitorError::Audio(e.to_string()))
            }
            SampleFormat::I16 => {
                let cfg: cpal::StreamConfig = config.into();
                device
                    .build_input_stream(
                        &cfg,
                        move |data: &[i16], _| {
                            if !monitoring_flag.load(Ordering::SeqCst) { return; }
                            let rms = compute_rms_i16(data);
                            on_rms(rms);
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| MonitorError::Audio(e.to_string()))
            }
            SampleFormat::U16 => {
                let cfg: cpal::StreamConfig = config.into();
                device
                    .build_input_stream(
                        &cfg,
                        move |data: &[u16], _| {
                            if !monitoring_flag.load(Ordering::SeqCst) { return; }
                            let rms = compute_rms_u16(data);
                            on_rms(rms);
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| MonitorError::Audio(e.to_string()))
            }
            _ => Err(MonitorError::Audio("unsupported sample format".into())),
        }
    }

    pub fn stop(&mut self) {
        if !self.is_monitoring() {
            return;
        }
        self.monitoring.store(false, Ordering::SeqCst);
        self.stream = None;
    }
}

// ── Fonctions utilitaires ────────────────────────────────────────────────────

fn compute_rms_f32(data: &[f32]) -> f32 {
    if data.is_empty() { return 0.0; }
    let sum: f32 = data.iter().map(|&x| x * x).sum();
    (sum / data.len() as f32).sqrt()
}

fn compute_rms_i16(data: &[i16]) -> f32 {
    if data.is_empty() { return 0.0; }
    let sum: f32 = data.iter().map(|&x| {
        let n = x as f32 / i16::MAX as f32;
        n * n
    }).sum();
    (sum / data.len() as f32).sqrt()
}

/// Envoie une notification native macOS via UNUserNotificationCenter (non-bloquante).
/// Clic "Enregistrer" → callback Rust notification_record_callback → compact + start.
#[cfg(target_os = "macos")]
fn send_native_notification(
    video_app: Option<String>,
    _app_handle: Option<tauri::AppHandle>,
) {
    let app_name = video_app
        .as_deref()
        .unwrap_or("une application")
        .to_string();

    extern "C" {
        fn send_meeting_notification(app_name: *const std::os::raw::c_char);
    }
    use std::ffi::CString;
    if let Ok(cname) = CString::new(app_name.as_str()) {
        unsafe { send_meeting_notification(cname.as_ptr()); }
    }
}

#[cfg(not(target_os = "macos"))]
fn send_native_notification(
    _video_app: Option<String>,
    _app_handle: Option<tauri::AppHandle>,
) {
    // Sur Linux/Windows : pas d'implémentation osascript, rien à faire
}

fn compute_rms_u16(data: &[u16]) -> f32 {
    if data.is_empty() { return 0.0; }
    let sum: f32 = data.iter().map(|&x| {
        let n = (x as i32 - i16::MAX as i32) as f32 / i16::MAX as f32;
        n * n
    }).sum();
    (sum / data.len() as f32).sqrt()
}



