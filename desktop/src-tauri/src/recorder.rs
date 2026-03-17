use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};

use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    SampleFormat, Stream,
};
use hound::{SampleFormat as WavSampleFormat, WavReader, WavWriter};
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum RecorderError {
    #[error("no input device available")]
    NoInput,
    #[error("audio error: {0}")]
    Audio(String),
    #[error("already recording")]
    AlreadyRecording,
    #[error("permission denied: {0}")]
    PermissionDenied(String),
    #[error("system audio not available: {0}")]
    SystemAudioNotAvailable(String),
}

// FFI bindings to Swift ScreenCaptureKit bridge (macOS only)
#[cfg(target_os = "macos")]
extern "C" {
    fn sck_is_available() -> bool;
    fn sck_has_permission() -> bool;
    fn sck_request_permission() -> bool;
    fn sck_start_capture(output_path: *const std::os::raw::c_char) -> bool;
    fn sck_stop_capture() -> bool;
    fn sck_is_recording() -> bool;
    fn sck_get_current_audio_level() -> f32;
}

/// Get the current system audio level (0.0 to 1.0)
/// Returns 0.0 if not recording or on non-macOS platforms
#[cfg(target_os = "macos")]
pub fn get_system_audio_level() -> f32 {
    unsafe { sck_get_current_audio_level() }
}

#[cfg(not(target_os = "macos"))]
pub fn get_system_audio_level() -> f32 {
    0.0
}

// Static for mic audio level (shared between stream callback and getter)
static MIC_AUDIO_LEVEL: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// Get the current microphone audio level (0.0 to 1.0)
pub fn get_mic_audio_level() -> f32 {
    f32::from_bits(MIC_AUDIO_LEVEL.load(Ordering::Relaxed))
}

/// Set the current microphone audio level
fn set_mic_audio_level(level: f32) {
    MIC_AUDIO_LEVEL.store(level.to_bits(), Ordering::Relaxed);
}

/// Recording mode options
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RecordingMode {
    MicOnly,
    SystemOnly,
    Both,
}

pub struct Recorder {
    recording: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    // Recording mode
    mode: RecordingMode,
    // Microphone stream (cpal)
    mic_stream: Option<Stream>,
    mic_output_path: Option<PathBuf>,
    // System audio path (ScreenCaptureKit on macOS)
    system_audio_path: Option<PathBuf>,
    // Combined output path
    output_path: Option<PathBuf>,
}

// cpal streams are not marked Send/Sync on all platforms; for this POC we
// guard access through the Mutex in AppState.
unsafe impl Send for Recorder {}
unsafe impl Sync for Recorder {}

impl Recorder {
    pub fn new() -> Self {
        Self {
            recording: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            mode: RecordingMode::Both,
            mic_stream: None,
            mic_output_path: None,
            system_audio_path: None,
            output_path: None,
        }
    }

    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Pause the recording - audio will be replaced with silence
    pub fn pause(&self) {
        if self.is_recording() && !self.is_paused() {
            self.paused.store(true, Ordering::SeqCst);
            println!("[RECORDER] ⏸️ Recording paused");
        }
    }

    /// Resume the recording
    pub fn resume(&self) {
        if self.is_recording() && self.is_paused() {
            self.paused.store(false, Ordering::SeqCst);
            println!("[RECORDER] ▶️ Recording resumed");
        }
    }

    /// Check if system audio capture is available
    #[cfg(target_os = "macos")]
    pub fn is_system_audio_available() -> bool {
        unsafe { sck_is_available() }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn is_system_audio_available() -> bool {
        // Windows and Linux have native loopback
        true
    }

    /// Request system audio permission (macOS only)
    #[cfg(target_os = "macos")]
    pub fn request_system_audio_permission() -> Result<bool, RecorderError> {
        if !unsafe { sck_is_available() } {
            return Err(RecorderError::SystemAudioNotAvailable(
                "ScreenCaptureKit requires macOS 13.0+".into()
            ));
        }

        println!("Requesting Screen Recording permission for system audio...");
        let granted = unsafe { sck_request_permission() };

        if granted {
            println!("Screen Recording permission granted");
            Ok(true)
        } else {
            Err(RecorderError::PermissionDenied(
                "Screen Recording permission required for system audio capture".into()
            ))
        }
    }

    #[cfg(not(target_os = "macos"))]
    pub fn request_system_audio_permission() -> Result<bool, RecorderError> {
        Ok(true)
    }

    fn log(msg: &str) {
        println!("{}", msg);
        // Also write to a log file for debugging
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open("/tmp/gilbert_recorder.log")
        {
            let _ = writeln!(file, "{}", msg);
        }
        let _ = std::io::stdout().flush();
    }

    pub fn start(&mut self, audio_dir: PathBuf) -> Result<PathBuf, RecorderError> {
        self.start_with_mode(audio_dir, RecordingMode::Both)
    }

    pub fn start_with_mode(&mut self, audio_dir: PathBuf, mode: RecordingMode) -> Result<PathBuf, RecorderError> {
        Self::log(&format!("[RECORDER] start_with_mode() called with audio_dir: {:?}, mode: {:?}", audio_dir, mode));

        if self.is_recording() {
            Self::log("[RECORDER] ERROR: Already recording!");
            return Err(RecorderError::AlreadyRecording);
        }

        // Reset paused flag when starting a new recording
        self.paused.store(false, Ordering::SeqCst);

        // Store the recording mode
        self.mode = mode;

        // IMPORTANT: Set recording flag to true FIRST before any recording starts
        // Otherwise the stream callbacks will ignore all audio data!
        self.recording.store(true, Ordering::SeqCst);
        Self::log("[RECORDER] Recording flag set to TRUE");

        // Use timestamp for human-readable filenames
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let short_id = &Uuid::new_v4().to_string()[..8]; // Keep short UUID for uniqueness
        let recording_name = format!("{}_{}", timestamp, short_id);
        Self::log(&format!("[RECORDER] Recording name: {}", recording_name));

        let mut primary_path: Option<PathBuf> = None;

        // ============================================================================
        // IMPORTANT: Start system audio FIRST because ScreenCaptureKit needs time
        // to initialize. This ensures both streams are synchronized.
        // ============================================================================
        #[cfg(target_os = "macos")]
        if mode == RecordingMode::SystemOnly || mode == RecordingMode::Both {
            let system_path = audio_dir.join(format!("system-{}.wav", recording_name));
            Self::log(&format!("[RECORDER] Starting system audio FIRST (needs init time): {:?}", system_path));
            Self::log("[RECORDER] Checking SCK availability...");
            let sck_available = unsafe { sck_is_available() };
            Self::log(&format!("[RECORDER] SCK available: {}", sck_available));

            if sck_available {
                let has_perm = unsafe { sck_has_permission() };
                Self::log(&format!("[RECORDER] SCK permission: {}", has_perm));
            }

            match self.start_system_audio_recording(&system_path) {
                Ok(_) => {
                    Self::log("[RECORDER] System audio recording started successfully");
                    self.system_audio_path = Some(system_path.clone());
                    primary_path = Some(system_path);

                    // Wait for ScreenCaptureKit to fully initialize before starting mic
                    if mode == RecordingMode::Both {
                        Self::log("[RECORDER] Waiting 150ms for SCK to stabilize before starting mic...");
                        thread::sleep(Duration::from_millis(150));
                    }
                }
                Err(e) => {
                    Self::log(&format!("[RECORDER] WARNING: System audio capture failed: {:?}", e));
                    if mode == RecordingMode::SystemOnly {
                        // If system-only mode and it fails, that's an error
                        self.recording.store(false, Ordering::SeqCst);
                        return Err(e);
                    }
                    Self::log("[RECORDER] Will continue with microphone only.");
                }
            }
        }

        // Start microphone recording if mode requires it
        if mode == RecordingMode::MicOnly || mode == RecordingMode::Both {
            let mic_path = audio_dir.join(format!("mic-{}.wav", recording_name));
            Self::log(&format!("[RECORDER] Starting microphone recording to: {:?}", mic_path));

            match self.start_microphone_recording(&mic_path) {
                Ok(_) => {
                    Self::log("[RECORDER] Microphone recording started successfully");
                    self.mic_output_path = Some(mic_path.clone());
                    if primary_path.is_none() {
                        primary_path = Some(mic_path);
                    }
                }
                Err(e) => {
                    Self::log(&format!("[RECORDER] ERROR starting microphone: {:?}", e));
                    self.recording.store(false, Ordering::SeqCst); // Reset on error
                    // Stop system audio if it was started
                    #[cfg(target_os = "macos")]
                    {
                        let _ = unsafe { sck_stop_capture() };
                    }
                    return Err(e);
                }
            }
        }

        // The main output path
        let output = primary_path.unwrap_or_else(|| audio_dir.join(format!("recording-{}.wav", recording_name)));
        self.output_path = Some(output.clone());

        Self::log(&format!("[RECORDER] Recording started successfully! Mode: {:?}, Output: {:?}", mode, output));
        Self::log("[RECORDER] Both streams should now be synchronized");
        Ok(output)
    }

    fn start_microphone_recording(&mut self, path: &PathBuf) -> Result<(), RecorderError> {
        println!("[RECORDER-MIC] Getting default audio host...");
        let host = cpal::default_host();
        println!("[RECORDER-MIC] Host: {:?}", host.id());

        println!("[RECORDER-MIC] Getting default input device...");
        let device = host.default_input_device().ok_or_else(|| {
            println!("[RECORDER-MIC] ERROR: No input device found!");
            RecorderError::NoInput
        })?;
        println!("[RECORDER-MIC] Device: {:?}", device.name().unwrap_or_default());

        println!("[RECORDER-MIC] Getting device config...");
        let config = device
            .default_input_config()
            .map_err(|e| {
                println!("[RECORDER-MIC] ERROR: Config error: {}", e);
                RecorderError::Audio(e.to_string())
            })?;
        println!("[RECORDER-MIC] Config: {:?}", config);

        // Force mono output for microphone - the merge expects mono mic
        // Even if device has multiple channels, we'll average them to mono
        let output_channels: u16 = 1;
        println!("[RECORDER-MIC] Input has {} channels, output will be mono ({})", config.channels(), output_channels);

        let spec = hound::WavSpec {
            channels: output_channels,
            sample_rate: config.sample_rate().0,
            bits_per_sample: 16,
            sample_format: WavSampleFormat::Int,
        };
        let writer =
            WavWriter::create(path, spec).map_err(|e| RecorderError::Audio(e.to_string()))?;
        let writer = Arc::new(parking_lot::Mutex::new(writer));
        let recording_flag = self.recording.clone();
        let paused_flag = self.paused.clone();

        let stream = match config.sample_format() {
            SampleFormat::F32 => {
                Self::build_stream_f32(&device, config.into(), writer, recording_flag, paused_flag)
            }
            SampleFormat::I16 => {
                Self::build_stream_i16(&device, config.into(), writer, recording_flag, paused_flag)
            }
            SampleFormat::U16 => {
                Self::build_stream_u16(&device, config.into(), writer, recording_flag, paused_flag)
            }
            _ => Err(RecorderError::Audio("unsupported sample format".into())),
        }?;

        stream
            .play()
            .map_err(|e| RecorderError::Audio(e.to_string()))?;

        self.mic_stream = Some(stream);
        println!("Microphone recording started");
        Ok(())
    }

    #[cfg(target_os = "macos")]
    fn start_system_audio_recording(&mut self, path: &PathBuf) -> Result<(), RecorderError> {
        if !unsafe { sck_is_available() } {
            return Err(RecorderError::SystemAudioNotAvailable(
                "ScreenCaptureKit requires macOS 13.0+".into()
            ));
        }

        // Vérifier la permission — si pas accordée, demander UNE SEULE FOIS
        // puis ne plus jamais re-demander (évite la popup en boucle)
        static PERMISSION_REQUESTED: std::sync::atomic::AtomicBool =
            std::sync::atomic::AtomicBool::new(false);

        // Vérifier la permission — si pas accordée, demander maintenant (au moment où l'user rec)
        if !unsafe { sck_has_permission() } {
            if PERMISSION_REQUESTED.load(std::sync::atomic::Ordering::SeqCst) {
                // Déjà demandé et refusé → l'utilisateur doit aller dans Réglages
                println!("[RECORDER] ⚠️ Permission Screen Recording refusée — enregistrement sans son système");
                // On ne retourne pas d'erreur : on continue sans son système (micro only)
                return Ok(());
            }
            // Première demande : afficher la popup une seule fois
            println!("[RECORDER] Requesting Screen Recording permission (first time only)...");
            PERMISSION_REQUESTED.store(true, std::sync::atomic::Ordering::SeqCst);
            let granted = unsafe { sck_request_permission() };
            if !granted {
                println!("[RECORDER] ⚠️ Permission refusée — enregistrement sans son système");
                // On continue sans son système plutôt que d'échouer complètement
                return Ok(());
            }
            println!("[RECORDER] ✅ Permission accordée");
        }

        let path_str = path.to_str()
            .ok_or_else(|| RecorderError::Audio("Invalid path".into()))?;
        let c_path = std::ffi::CString::new(path_str)
            .map_err(|_| RecorderError::Audio("Path contains null byte".into()))?;

        let success = unsafe { sck_start_capture(c_path.as_ptr()) };

        if success {
            println!("System audio recording started (ScreenCaptureKit)");
            Ok(())
        } else {
            Err(RecorderError::Audio("Failed to start ScreenCaptureKit capture".into()))
        }
    }

    fn build_stream_f32(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        writer: Arc<parking_lot::Mutex<WavWriter<std::io::BufWriter<std::fs::File>>>>,
        recording_flag: Arc<AtomicBool>,
        paused_flag: Arc<AtomicBool>,
    ) -> Result<Stream, RecorderError> {
        let err_fn = |err| eprintln!("[MIC-STREAM] ERROR: {}", err);
        let input_channels = config.channels as usize;
        let callback_count = Arc::new(AtomicUsize::new(0));
        let callback_count_clone = callback_count.clone();
        let total_samples = Arc::new(AtomicUsize::new(0));
        let total_samples_clone = total_samples.clone();

        println!("[MIC-STREAM] Building F32 stream with {} input channels", input_channels);

        device
            .build_input_stream(
                &config,
                move |data: &[f32], _| {
                    let count = callback_count_clone.fetch_add(1, Ordering::Relaxed);

                    // Log first few callbacks and then every 100th
                    if count < 5 || count % 100 == 0 {
                        println!("[MIC-STREAM] Callback #{}, data len: {}, recording: {}, paused: {}",
                            count, data.len(), recording_flag.load(Ordering::SeqCst), paused_flag.load(Ordering::SeqCst));
                    }

                    if !recording_flag.load(Ordering::SeqCst) {
                        set_mic_audio_level(0.0);
                        return;
                    }

                    // Check if paused - write silence instead of actual audio
                    let is_paused = paused_flag.load(Ordering::SeqCst);

                    // Calculate RMS for audio level
                    let mut sum_sq: f32 = 0.0;
                    let mut sample_count = 0;
                    let mut max_sample: f32 = 0.0;

                    if let Some(mut guard) = writer.try_lock() {
                        // Convert multi-channel to mono by averaging
                        for frame in data.chunks(input_channels) {
                            let sum: f32 = frame.iter().sum();
                            let mono_sample = sum / input_channels as f32;
                            // Write silence (0) if paused, otherwise write the actual sample
                            let s = if is_paused { 0i16 } else { (mono_sample * i16::MAX as f32) as i16 };
                            let _ = guard.write_sample(s);

                            // Accumulate for RMS
                            sum_sq += mono_sample * mono_sample;
                            sample_count += 1;
                            max_sample = max_sample.max(mono_sample.abs());
                        }

                        let total = total_samples_clone.fetch_add(sample_count, Ordering::Relaxed);
                        if count < 5 || count % 100 == 0 {
                            println!("[MIC-STREAM] Wrote {} samples, total: {}, max: {:.4}",
                                sample_count, total + sample_count, max_sample);
                        }
                    } else {
                        println!("[MIC-STREAM] WARNING: Could not lock writer!");
                    }

                    // Update mic audio level (RMS)
                    if sample_count > 0 {
                        let rms = (sum_sq / sample_count as f32).sqrt();
                        // Normalize to 0-1 range (assuming max amplitude is 1.0)
                        let level = (rms * 3.0).min(1.0); // Boost for better visualization
                        set_mic_audio_level(level);
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| RecorderError::Audio(e.to_string()))
    }

    fn build_stream_i16(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        writer: Arc<parking_lot::Mutex<WavWriter<std::io::BufWriter<std::fs::File>>>>,
        recording_flag: Arc<AtomicBool>,
        paused_flag: Arc<AtomicBool>,
    ) -> Result<Stream, RecorderError> {
        let err_fn = |err| eprintln!("audio stream error: {}", err);
        let input_channels = config.channels as usize;
        device
            .build_input_stream(
                &config,
                move |data: &[i16], _| {
                    if !recording_flag.load(Ordering::SeqCst) {
                        set_mic_audio_level(0.0);
                        return;
                    }

                    // Check if paused
                    let is_paused = paused_flag.load(Ordering::SeqCst);

                    // Calculate RMS for audio level
                    let mut sum_sq: f64 = 0.0;
                    let mut sample_count = 0;

                    if let Some(mut guard) = writer.try_lock() {
                        // Convert multi-channel to mono by averaging
                        for frame in data.chunks(input_channels) {
                            let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                            let mono_sample = if is_paused { 0i16 } else { (sum / input_channels as i32) as i16 };
                            let _ = guard.write_sample(mono_sample);

                            // Accumulate for RMS
                            let normalized = mono_sample as f64 / i16::MAX as f64;
                            sum_sq += normalized * normalized;
                            sample_count += 1;
                        }
                    }

                    // Update mic audio level (RMS)
                    if sample_count > 0 {
                        let rms = (sum_sq / sample_count as f64).sqrt();
                        let level = (rms * 3.0).min(1.0) as f32; // Boost for better visualization
                        set_mic_audio_level(level);
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| RecorderError::Audio(e.to_string()))
    }

    fn build_stream_u16(
        device: &cpal::Device,
        config: cpal::StreamConfig,
        writer: Arc<parking_lot::Mutex<WavWriter<std::io::BufWriter<std::fs::File>>>>,
        recording_flag: Arc<AtomicBool>,
        paused_flag: Arc<AtomicBool>,
    ) -> Result<Stream, RecorderError> {
        let err_fn = |err| eprintln!("audio stream error: {}", err);
        let input_channels = config.channels as usize;
        device
            .build_input_stream(
                &config,
                move |data: &[u16], _| {
                    if !recording_flag.load(Ordering::SeqCst) {
                        set_mic_audio_level(0.0);
                        return;
                    }

                    // Check if paused
                    let is_paused = paused_flag.load(Ordering::SeqCst);

                    // Calculate RMS for audio level
                    let mut sum_sq: f64 = 0.0;
                    let mut sample_count = 0;

                    if let Some(mut guard) = writer.try_lock() {
                        // Convert multi-channel to mono by averaging
                        for frame in data.chunks(input_channels) {
                            let sum: i32 = frame.iter().map(|&s| (s as i32) - (i16::MAX as i32)).sum();
                            let mono_sample = if is_paused { 0i16 } else { (sum / input_channels as i32) as i16 };
                            let _ = guard.write_sample(mono_sample);

                            // Accumulate for RMS
                            let normalized = mono_sample as f64 / i16::MAX as f64;
                            sum_sq += normalized * normalized;
                            sample_count += 1;
                        }
                    }

                    // Update mic audio level (RMS)
                    if sample_count > 0 {
                        let rms = (sum_sq / sample_count as f64).sqrt();
                        let level = (rms * 3.0).min(1.0) as f32; // Boost for better visualization
                        set_mic_audio_level(level);
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| RecorderError::Audio(e.to_string()))
    }

    pub fn stop(&mut self) -> Option<PathBuf> {
        Self::log(&format!("[RECORDER] stop() called, mode was: {:?}", self.mode));

        // IMPORTANT: Toujours arrêter TOUT, même si pas en train d'enregistrer
        // pour éviter les états incohérents
        let was_recording = self.is_recording();
        let mode = self.mode;

        if !was_recording {
            Self::log("[RECORDER] Not recording, but will cleanup anyway");
        }

        // Arrêter le flag d'enregistrement IMMÉDIATEMENT
        self.recording.store(false, Ordering::SeqCst);
        Self::log("[RECORDER] Recording flag set to FALSE");

        // Petite pause pour que les streams finissent leurs buffers
        thread::sleep(Duration::from_millis(150));

        // Stop microphone stream
        if self.mic_stream.is_some() {
            self.mic_stream = None;
            Self::log("[RECORDER] ✅ Microphone stream stopped");
        }

        // TOUJOURS essayer d'arrêter l'audio système (macOS)
        // même si system_audio_path est None, pour éviter les fuites
        #[cfg(target_os = "macos")]
        {
            Self::log("[RECORDER] Stopping system audio capture...");
            let sck_was_recording = unsafe { sck_is_recording() };
            Self::log(&format!("[RECORDER] SCK was recording: {}", sck_was_recording));

            // Toujours appeler stop, même si sck_is_recording retourne false
            let stop_result = unsafe { sck_stop_capture() };
            Self::log(&format!("[RECORDER] sck_stop_capture() returned: {}", stop_result));

            // Attendre que ScreenCaptureKit finisse d'écrire
            thread::sleep(Duration::from_millis(500));
            Self::log("[RECORDER] ✅ System audio capture stopped");
        }

        // Si pas en train d'enregistrer, on a juste fait le cleanup
        if !was_recording {
            Self::log("[RECORDER] Cleanup done, returning None");
            return None;
        }

        let mic_path = self.mic_output_path.take();
        let system_path = self.system_audio_path.take();

        Self::log(&format!("[RECORDER] mic_path: {:?}", mic_path));
        Self::log(&format!("[RECORDER] system_path: {:?}", system_path));

        // Vérifier que les fichiers existent et leurs tailles
        let mic_exists = mic_path.as_ref().map(|p| p.exists()).unwrap_or(false);
        let system_exists = system_path.as_ref().map(|p| p.exists()).unwrap_or(false);

        let mic_size = mic_path.as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);
        let system_size = system_path.as_ref()
            .and_then(|p| std::fs::metadata(p).ok())
            .map(|m| m.len())
            .unwrap_or(0);

        Self::log(&format!("[RECORDER] mic_exists: {}, size: {} bytes", mic_exists, mic_size));
        Self::log(&format!("[RECORDER] system_exists: {}, size: {} bytes", system_exists, system_size));

        // Handle based on recording mode
        match mode {
            RecordingMode::MicOnly => {
                // Just return the mic file
                if mic_exists {
                    Self::log(&format!("[RECORDER] Returning mic-only file: {:?}", mic_path));
                    return mic_path;
                }
            }
            RecordingMode::SystemOnly => {
                // Just return the system file
                if system_exists {
                    Self::log(&format!("[RECORDER] Returning system-only file: {:?}", system_path));
                    return system_path;
                }
            }
            RecordingMode::Both => {
                // Try to merge both files
                if let (Some(mic), Some(system)) = (&mic_path, &system_path) {
                    if mic_exists && system_exists {
                        // Check file sizes
                        let mic_size = std::fs::metadata(&mic).map(|m| m.len()).unwrap_or(0);
                        let system_size = std::fs::metadata(&system).map(|m| m.len()).unwrap_or(0);
                        Self::log(&format!("[RECORDER] mic file size: {} bytes", mic_size));
                        Self::log(&format!("[RECORDER] system file size: {} bytes", system_size));

                        // Only merge if both files have data
                        if mic_size > 44 && system_size > 44 {  // 44 = WAV header size
                            Self::log("[RECORDER] Merging mic and system audio...");
                            let merged_path = mic.with_file_name(
                                mic.file_name()
                                    .unwrap()
                                    .to_str()
                                    .unwrap()
                                    .replace("mic-", "merged-")
                            );

                            match Self::merge_audio_files(mic, system, &merged_path) {
                                Ok(_) => {
                                    Self::log(&format!("[RECORDER] ✅ Audio merged successfully: {:?}", merged_path));
                                    // Supprimer les fichiers originaux après merge réussi
                                    let _ = std::fs::remove_file(mic);
                                    let _ = std::fs::remove_file(system);
                                    Self::log("[RECORDER] Original files cleaned up");
                                    return Some(merged_path);
                                }
                                Err(e) => {
                                    Self::log(&format!("[RECORDER] ⚠️ Failed to merge audio: {}", e));
                                }
                            }
                        } else {
                            Self::log(&format!("[RECORDER] ⚠️ Files too small for merge: mic={}, system={}", mic_size, system_size));
                        }
                    }
                }

                // Fallback: return whichever file exists
                if mic_exists {
                    Self::log(&format!("[RECORDER] Returning mic-only file as fallback: {:?}", mic_path));
                    return mic_path;
                }
                if system_exists {
                    Self::log(&format!("[RECORDER] Returning system-only file as fallback: {:?}", system_path));
                    return system_path;
                }
            }
        }

        // Dernier recours: retourner output_path
        let fallback = self.output_path.take();
        Self::log(&format!("[RECORDER] Returning fallback: {:?}", fallback));
        fallback
    }

    /// Merge two WAV files into one, mixing the audio together
    fn merge_audio_files(mic_path: &PathBuf, system_path: &PathBuf, output_path: &PathBuf) -> Result<(), String> {
        Self::log("[MERGE] ==========================================");
        Self::log("[MERGE] STARTING AUDIO MERGE");
        Self::log("[MERGE] ==========================================");
        Self::log(&format!("[MERGE] Reading mic file: {:?}", mic_path));

        let mic_reader = WavReader::open(mic_path)
            .map_err(|e| format!("Failed to open mic file: {}", e))?;
        let mic_spec = mic_reader.spec();

        Self::log(&format!("[MERGE] Reading system file: {:?}", system_path));
        let system_reader = WavReader::open(system_path)
            .map_err(|e| format!("Failed to open system file: {}", e))?;
        let system_spec = system_reader.spec();

        Self::log(&format!("[MERGE] Mic spec: {} Hz, {} ch, {} bits",
                 mic_spec.sample_rate, mic_spec.channels, mic_spec.bits_per_sample));
        Self::log(&format!("[MERGE] System spec: {} Hz, {} ch, {} bits",
                 system_spec.sample_rate, system_spec.channels, system_spec.bits_per_sample));

        // Read samples from both files - handle different bit depths
        let mic_samples: Vec<f64> = if mic_spec.bits_per_sample == 16 {
            mic_reader
                .into_samples::<i16>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / 32768.0)  // Normalize to -1.0 to 1.0
                .collect()
        } else if mic_spec.bits_per_sample == 32 {
            WavReader::open(mic_path).unwrap()
                .into_samples::<i32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / 2147483648.0)
                .collect()
        } else {
            WavReader::open(mic_path).unwrap()
                .into_samples::<i16>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / 32768.0)
                .collect()
        };

        let system_samples: Vec<f64> = if system_spec.bits_per_sample == 16 {
            system_reader
                .into_samples::<i16>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / 32768.0)
                .collect()
        } else if system_spec.bits_per_sample == 32 {
            WavReader::open(system_path).unwrap()
                .into_samples::<i32>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / 2147483648.0)
                .collect()
        } else {
            WavReader::open(system_path).unwrap()
                .into_samples::<i16>()
                .filter_map(|s| s.ok())
                .map(|s| s as f64 / 32768.0)
                .collect()
        };

        Self::log(&format!("[MERGE] Mic samples: {}, System samples: {}",
                 mic_samples.len(), system_samples.len()));

        // Calculate RMS for both
        let mic_rms: f64 = if !mic_samples.is_empty() {
            let sum_sq: f64 = mic_samples.iter().map(|s| s * s).sum();
            (sum_sq / mic_samples.len() as f64).sqrt()
        } else {
            0.0
        };

        let system_rms: f64 = if !system_samples.is_empty() {
            let sum_sq: f64 = system_samples.iter().map(|s| s * s).sum();
            (sum_sq / system_samples.len() as f64).sqrt()
        } else {
            0.0
        };

        Self::log(&format!("[MERGE] Mic RMS: {:.6}, System RMS: {:.6}", mic_rms, system_rms));

        // Check if either is empty
        if mic_samples.is_empty() && system_samples.is_empty() {
            return Err("Both audio files are empty".to_string());
        }

        // If mic is empty, use system only
        // Use a very low threshold to avoid skipping legitimate quiet audio
        if mic_samples.is_empty() || mic_rms < 0.00001 {
            Self::log("[MERGE] WARNING: Mic audio is empty/silent - using system only");
            std::fs::copy(system_path, output_path)
                .map_err(|e| format!("Failed to copy system file: {}", e))?;
            return Ok(());
        }

        // If system is empty, use mic only
        // Use a very low threshold to avoid skipping legitimate quiet audio
        if system_samples.is_empty() || system_rms < 0.00001 {
            Self::log("[MERGE] WARNING: System audio is empty/silent - using mic only");
            std::fs::copy(mic_path, output_path)
                .map_err(|e| format!("Failed to copy mic file: {}", e))?;
            return Ok(());
        }

        // Use 48000 Hz mono for output (standard for transcription)
        let output_sample_rate = 48000u32;
        let output_spec = hound::WavSpec {
            channels: 1,  // Mono output for transcription
            sample_rate: output_sample_rate,
            bits_per_sample: 16,
            sample_format: WavSampleFormat::Int,
        };

        let mut writer = WavWriter::create(output_path, output_spec)
            .map_err(|e| format!("Failed to create output file: {}", e))?;

        // Convert both to mono first
        let mic_channels = mic_spec.channels as usize;
        let system_channels = system_spec.channels as usize;

        // Convert mic to mono
        let mic_mono: Vec<f64> = mic_samples
            .chunks(mic_channels)
            .map(|frame| frame.iter().sum::<f64>() / mic_channels as f64)
            .collect();

        // Convert system to mono
        let system_mono: Vec<f64> = system_samples
            .chunks(system_channels)
            .map(|frame| frame.iter().sum::<f64>() / system_channels as f64)
            .collect();

        Self::log(&format!("[MERGE] Mic mono frames: {}, System mono frames: {}",
                 mic_mono.len(), system_mono.len()));

        // Calculate duration in seconds for each
        let mic_duration = mic_mono.len() as f64 / mic_spec.sample_rate as f64;
        let system_duration = system_mono.len() as f64 / system_spec.sample_rate as f64;

        Self::log(&format!("[MERGE] Mic duration: {:.2}s, System duration: {:.2}s",
                 mic_duration, system_duration));

        // Use the longer duration for output
        let output_duration = mic_duration.max(system_duration);
        let output_samples = (output_duration * output_sample_rate as f64) as usize;

        Self::log(&format!("[MERGE] Output: {} samples at {} Hz ({:.2}s)",
                 output_samples, output_sample_rate, output_duration));

        // Track statistics for debugging
        let mut mic_nonzero_count = 0usize;
        let mut system_nonzero_count = 0usize;
        let mut mixed_nonzero_count = 0usize;
        let mut max_mic: f64 = 0.0;
        let mut max_system: f64 = 0.0;
        let mut max_mixed: f64 = 0.0;

        // Mix the audio sample by sample at output sample rate
        for i in 0..output_samples {
            let t = i as f64 / output_sample_rate as f64;  // Time in seconds

            // Get mic sample at this time (with linear interpolation)
            let mic_pos = t * mic_spec.sample_rate as f64;
            let mic_idx = mic_pos as usize;
            let mic_sample = if mic_idx < mic_mono.len() {
                mic_mono[mic_idx]
            } else {
                0.0
            };

            // Get system sample at this time (with linear interpolation)
            let system_pos = t * system_spec.sample_rate as f64;
            let system_idx = system_pos as usize;
            let system_sample = if system_idx < system_mono.len() {
                system_mono[system_idx]
            } else {
                0.0
            };

            // Track statistics
            if mic_sample.abs() > 0.001 { mic_nonzero_count += 1; }
            if system_sample.abs() > 0.001 { system_nonzero_count += 1; }
            if mic_sample.abs() > max_mic { max_mic = mic_sample.abs(); }
            if system_sample.abs() > max_system { max_system = system_sample.abs(); }

            // Mix: SUM both sources (not average!) so each source keeps full volume
            // When only one source has audio, it plays at full volume
            // When both have audio, we sum and hard clip
            let mixed = mic_sample + system_sample;

            if mixed.abs() > 0.001 { mixed_nonzero_count += 1; }
            if mixed.abs() > max_mixed { max_mixed = mixed.abs(); }

            // Hard clip to prevent distortion (simple and predictable)
            let clipped = mixed.clamp(-1.0, 1.0);

            // Convert to i16
            let clamped = (clipped * 32767.0) as i16;

            writer.write_sample(clamped)
                .map_err(|e| format!("Failed to write sample: {}", e))?;
        }

        Self::log(&format!("[MERGE] Successfully mixed {} samples", output_samples));
        Self::log(&format!("[MERGE] Stats - Mic nonzero: {} ({:.1}%), System nonzero: {} ({:.1}%), Mixed nonzero: {} ({:.1}%)",
            mic_nonzero_count,
            mic_nonzero_count as f64 / output_samples as f64 * 100.0,
            system_nonzero_count,
            system_nonzero_count as f64 / output_samples as f64 * 100.0,
            mixed_nonzero_count,
            mixed_nonzero_count as f64 / output_samples as f64 * 100.0));
        Self::log(&format!("[MERGE] Max levels - Mic: {:.4}, System: {:.4}, Mixed: {:.4}",
            max_mic, max_system, max_mixed));

        writer.finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

        Self::log("[MERGE] ==========================================");
        Self::log("[MERGE] Audio merge complete");
        Self::log("[MERGE] ==========================================");
        Ok(())
    }

    /// Get paths to both recordings
    pub fn get_recording_paths(&self) -> (Option<&PathBuf>, Option<&PathBuf>) {
        (self.mic_output_path.as_ref(), self.system_audio_path.as_ref())
    }
}
