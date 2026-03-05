use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use sysinfo::System;

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream,
};
use tauri::{api::notification::Notification, Manager};
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
    app_identifier: String,
    app_handle: Option<tauri::AppHandle>,
}

// cpal streams are not marked Send/Sync on all platforms
unsafe impl Send for MicMonitor {}
unsafe impl Sync for MicMonitor {}

impl MicMonitor {
    pub fn new(app_identifier: String) -> Self {
        Self {
            monitoring: Arc::new(AtomicBool::new(false)),
            stream: None,
            last_notification: Arc::new(AtomicU64::new(0)),
            app_identifier,
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
        let app_id = self.app_identifier.clone();
        let app_handle = self.app_handle.clone();

        // Seuil RMS pour détecter l'activité (ajustable)
        const RMS_THRESHOLD: f32 = 0.001; // Seuil plus sensible
        const ACTIVITY_DURATION_MS: u64 = 300; // Détecter activité pendant 300ms
        const COOLDOWN_SECONDS: u64 = 20; // Cooldown 20s pour tester plus vite
        
        // Apps de visio à détecter
        let video_apps = vec!["Microsoft Teams", "Zoom", "zoom", "Google Chrome", "Google Meet", "Slack", "Discord"];

        let activity_start: Arc<parking_lot::Mutex<Option<Instant>>> = Arc::new(parking_lot::Mutex::new(None));

        let stream = match config.sample_format() {
            SampleFormat::F32 => {
                let activity = activity_start.clone();
                let video_apps_clone = video_apps.clone();
                Self::build_monitor_stream_f32(
                    &device,
                    config.into(),
                    monitoring_flag.clone(),
                    move |rms| {
                        let now = Instant::now();
                        let now_system = SystemTime::now();
                        let last_notif_time = last_notif.load(Ordering::SeqCst);
                        let elapsed = if last_notif_time > 0 {
                            let last_notif_system = UNIX_EPOCH + Duration::from_secs(last_notif_time);
                            now_system.duration_since(last_notif_system).unwrap_or(Duration::ZERO).as_secs()
                        } else {
                            COOLDOWN_SECONDS + 1 // Force la première notification
                        };

                        // Vérifier si une app de visio est active
                        let mut sys = System::new();
                        sys.refresh_processes();
                        let has_video_app = sys.processes().values().any(|process| {
                            let name = process.name().to_lowercase();
                            video_apps_clone.iter().any(|app| name.contains(&app.to_lowercase()))
                        });
                        
                        // Si app de visio active ET activité micro détectée
                        if has_video_app && rms > RMS_THRESHOLD {
                            let mut activity_guard = activity.lock();
                            if let Some(start) = *activity_guard {
                                if now.duration_since(start).as_millis() as u64 >= ACTIVITY_DURATION_MS {
                                    // Activité détectée pendant assez longtemps
                                    if elapsed >= COOLDOWN_SECONDS {
                                        // Envoyer notification
                                        println!("🔔 Notification envoyée - RMS: {:.4}, Durée: {}ms, App visio détectée", rms, now.duration_since(start).as_millis());
                                        let _ = Notification::new(&app_id)
                                            .title("Gilbert Desktop")
                                            .body("Réunion détectée - Démarrer l'enregistrement ?")
                                            .show();
                                        
                                        // Envoyer aussi un event Tauri pour afficher un toast dans l'UI
                                        if let Some(ref handle) = app_handle {
                                            let _ = handle.emit_all("mic-activity-detected", ());
                                        }
                                        
                                        let timestamp = now_system.duration_since(UNIX_EPOCH).unwrap().as_secs();
                                        last_notif.store(timestamp, Ordering::SeqCst);
                                        *activity_guard = None; // Reset pour éviter spam
                                    } else {
                                        println!("⏳ Cooldown actif - {}s restants", COOLDOWN_SECONDS - elapsed);
                                    }
                                }
                            } else {
                                *activity_guard = Some(now);
                            }
                        } else if !has_video_app {
                            // Pas d'app de visio, reset l'activité
                            *activity.lock() = None;
                        } else {
                            // App de visio mais pas d'activité audio encore
                            *activity.lock() = None;
                        }
                    },
                )
            },
            SampleFormat::I16 => {
                let activity = activity_start.clone();
                let video_apps_clone = video_apps.clone();
                Self::build_monitor_stream_i16(
                    &device,
                    config.into(),
                    monitoring_flag.clone(),
                    move |rms| {
                        let now = Instant::now();
                        let now_system = SystemTime::now();
                        let last_notif_time = last_notif.load(Ordering::SeqCst);
                        let elapsed = if last_notif_time > 0 {
                            let last_notif_system = UNIX_EPOCH + Duration::from_secs(last_notif_time);
                            now_system.duration_since(last_notif_system).unwrap_or(Duration::ZERO).as_secs()
                        } else {
                            COOLDOWN_SECONDS + 1
                        };

                        // Vérifier si une app de visio est active
                        let mut sys = System::new();
                        sys.refresh_processes();
                        let has_video_app = sys.processes().values().any(|process| {
                            let name = process.name().to_lowercase();
                            video_apps_clone.iter().any(|app| name.contains(&app.to_lowercase()))
                        });
                        
                        if has_video_app && rms > RMS_THRESHOLD {
                            let mut activity_guard = activity.lock();
                            if let Some(start) = *activity_guard {
                                if now.duration_since(start).as_millis() as u64 >= ACTIVITY_DURATION_MS {
                                    if elapsed >= COOLDOWN_SECONDS {
                                        println!("🔔 Notification envoyée - RMS: {:.4}, Durée: {}ms, App visio détectée", rms, now.duration_since(start).as_millis());
                                        let _ = Notification::new(&app_id)
                                            .title("Gilbert Desktop")
                                            .body("Réunion détectée - Démarrer l'enregistrement ?")
                                            .show();
                                        if let Some(ref handle) = app_handle {
                                            let _ = handle.emit_all("mic-activity-detected", ());
                                        }
                                        let timestamp = now_system.duration_since(UNIX_EPOCH).unwrap().as_secs();
                                        last_notif.store(timestamp, Ordering::SeqCst);
                                        *activity_guard = None;
                                    }
                                }
                            } else {
                                *activity_guard = Some(now);
                            }
                        } else {
                            *activity.lock() = None;
                        }
                    },
                )
            },
            SampleFormat::U16 => {
                let activity = activity_start.clone();
                let video_apps_clone = video_apps.clone();
                Self::build_monitor_stream_u16(
                    &device,
                    config.into(),
                    monitoring_flag.clone(),
                    move |rms| {
                        let now = Instant::now();
                        let now_system = SystemTime::now();
                        let last_notif_time = last_notif.load(Ordering::SeqCst);
                        let elapsed = if last_notif_time > 0 {
                            let last_notif_system = UNIX_EPOCH + Duration::from_secs(last_notif_time);
                            now_system.duration_since(last_notif_system).unwrap_or(Duration::ZERO).as_secs()
                        } else {
                            COOLDOWN_SECONDS + 1
                        };

                        // Vérifier si une app de visio est active
                        let mut sys = System::new();
                        sys.refresh_processes();
                        let has_video_app = sys.processes().values().any(|process| {
                            let name = process.name().to_lowercase();
                            video_apps_clone.iter().any(|app| name.contains(&app.to_lowercase()))
                        });
                        
                        if has_video_app && rms > RMS_THRESHOLD {
                            let mut activity_guard = activity.lock();
                            if let Some(start) = *activity_guard {
                                if now.duration_since(start).as_millis() as u64 >= ACTIVITY_DURATION_MS {
                                    if elapsed >= COOLDOWN_SECONDS {
                                        println!("🔔 Notification envoyée - RMS: {:.4}, Durée: {}ms, App visio détectée", rms, now.duration_since(start).as_millis());
                                        let _ = Notification::new(&app_id)
                                            .title("Gilbert Desktop")
                                            .body("Réunion détectée - Démarrer l'enregistrement ?")
                                            .show();
                                        if let Some(ref handle) = app_handle {
                                            let _ = handle.emit_all("mic-activity-detected", ());
                                        }
                                        let timestamp = now_system.duration_since(UNIX_EPOCH).unwrap().as_secs();
                                        last_notif.store(timestamp, Ordering::SeqCst);
                                        *activity_guard = None;
                                    }
                                }
                            } else {
                                *activity_guard = Some(now);
                            }
                        } else {
                            *activity.lock() = None;
                        }
                    },
                )
            },
            _ => Err(MonitorError::Audio("unsupported sample format".into())),
        }?;

        stream
            .play()
            .map_err(|e| MonitorError::Audio(e.to_string()))?;

        self.monitoring.store(true, Ordering::SeqCst);
        self.stream = Some(stream);
        println!("✅ Monitor micro actif - écoute en cours...");
        Ok(())
    }

    fn build_monitor_stream_f32<F>(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        monitoring_flag: Arc<AtomicBool>,
        mut on_rms: F,
    ) -> Result<Stream, MonitorError>
    where
        F: FnMut(f32) + Send + 'static,
    {
        let err_fn = |err| eprintln!("mic monitor error: {}", err);
        device
            .build_input_stream(
                &config,
                move |data: &[f32], _| {
                    if !monitoring_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    // Calculer RMS (Root Mean Square)
                    let sum_squares: f32 = data.iter().map(|&x| x * x).sum();
                    let rms = (sum_squares / data.len() as f32).sqrt();
                    on_rms(rms);
                },
                err_fn,
                None,
            )
            .map_err(|e| MonitorError::Audio(e.to_string()))
    }

    fn build_monitor_stream_i16<F>(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        monitoring_flag: Arc<AtomicBool>,
        mut on_rms: F,
    ) -> Result<Stream, MonitorError>
    where
        F: FnMut(f32) + Send + 'static,
    {
        let err_fn = |err| eprintln!("mic monitor error: {}", err);
        device
            .build_input_stream(
                &config,
                move |data: &[i16], _| {
                    if !monitoring_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    // Convertir i16 en f32 puis calculer RMS
                    let sum_squares: f32 = data
                        .iter()
                        .map(|&x| {
                            let normalized = x as f32 / i16::MAX as f32;
                            normalized * normalized
                        })
                        .sum();
                    let rms = (sum_squares / data.len() as f32).sqrt();
                    on_rms(rms);
                },
                err_fn,
                None,
            )
            .map_err(|e| MonitorError::Audio(e.to_string()))
    }

    fn build_monitor_stream_u16<F>(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        monitoring_flag: Arc<AtomicBool>,
        mut on_rms: F,
    ) -> Result<Stream, MonitorError>
    where
        F: FnMut(f32) + Send + 'static,
    {
        let err_fn = |err| eprintln!("mic monitor error: {}", err);
        device
            .build_input_stream(
                &config,
                move |data: &[u16], _| {
                    if !monitoring_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    // Convertir u16 en f32 puis calculer RMS
                    let sum_squares: f32 = data
                        .iter()
                        .map(|&x| {
                            let centered = x as i32 - i16::MAX as i32;
                            let normalized = centered as f32 / i16::MAX as f32;
                            normalized * normalized
                        })
                        .sum();
                    let rms = (sum_squares / data.len() as f32).sqrt();
                    on_rms(rms);
                },
                err_fn,
                None,
            )
            .map_err(|e| MonitorError::Audio(e.to_string()))
    }

    pub fn stop(&mut self) {
        if !self.is_monitoring() {
            return;
        }
        self.monitoring.store(false, Ordering::SeqCst);
        self.stream = None;
    }
}

