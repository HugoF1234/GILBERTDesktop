use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
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
}

pub struct Recorder {
    recording: Arc<AtomicBool>,
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
            mic_stream: None,
            mic_output_path: None,
            system_audio_path: None,
            output_path: None,
        }
    }

    pub fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
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
        Self::log(&format!("[RECORDER] start() called with audio_dir: {:?}", audio_dir));

        if self.is_recording() {
            Self::log("[RECORDER] ERROR: Already recording!");
            return Err(RecorderError::AlreadyRecording);
        }

        // Use timestamp for human-readable filenames
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let short_id = &Uuid::new_v4().to_string()[..8]; // Keep short UUID for uniqueness
        let recording_name = format!("{}_{}", timestamp, short_id);
        Self::log(&format!("[RECORDER] Recording name: {}", recording_name));

        // Start microphone recording
        let mic_path = audio_dir.join(format!("mic-{}.wav", recording_name));
        Self::log(&format!("[RECORDER] Starting microphone recording to: {:?}", mic_path));

        match self.start_microphone_recording(&mic_path) {
            Ok(_) => Self::log("[RECORDER] Microphone recording started successfully"),
            Err(e) => {
                Self::log(&format!("[RECORDER] ERROR starting microphone: {:?}", e));
                return Err(e);
            }
        }
        self.mic_output_path = Some(mic_path.clone());

        // Start system audio recording (macOS via ScreenCaptureKit)
        #[cfg(target_os = "macos")]
        {
            let system_path = audio_dir.join(format!("system-{}.wav", recording_name));
            Self::log(&format!("[RECORDER] Starting system audio recording to: {:?}", system_path));
            Self::log("[RECORDER] Checking SCK availability...");
            let sck_available = unsafe { sck_is_available() };
            Self::log(&format!("[RECORDER] SCK available: {}", sck_available));

            if sck_available {
                let has_perm = unsafe { sck_has_permission() };
                Self::log(&format!("[RECORDER] SCK permission: {}", has_perm));
            }

            if let Err(e) = self.start_system_audio_recording(&system_path) {
                Self::log(&format!("[RECORDER] WARNING: System audio capture failed: {:?}", e));
                Self::log("[RECORDER] Recording microphone only.");
            } else {
                Self::log("[RECORDER] System audio recording started successfully");
                self.system_audio_path = Some(system_path.clone());
            }
        }

        // The main output path (we'll merge later or use mic if system audio fails)
        self.output_path = Some(mic_path.clone());
        self.recording.store(true, Ordering::SeqCst);

        Self::log(&format!("[RECORDER] Recording started successfully! Output: {:?}", mic_path));
        Ok(mic_path)
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

        let spec = hound::WavSpec {
            channels: config.channels(),
            sample_rate: config.sample_rate().0,
            bits_per_sample: 16,
            sample_format: WavSampleFormat::Int,
        };
        let writer =
            WavWriter::create(path, spec).map_err(|e| RecorderError::Audio(e.to_string()))?;
        let writer = Arc::new(parking_lot::Mutex::new(writer));
        let recording_flag = self.recording.clone();

        let stream = match config.sample_format() {
            SampleFormat::F32 => {
                Self::build_stream_f32(&device, config.into(), writer, recording_flag)
            }
            SampleFormat::I16 => {
                Self::build_stream_i16(&device, config.into(), writer, recording_flag)
            }
            SampleFormat::U16 => {
                Self::build_stream_u16(&device, config.into(), writer, recording_flag)
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

        if !unsafe { sck_has_permission() } {
            // Try to request permission
            println!("Screen Recording permission not granted, requesting...");
            let _ = unsafe { sck_request_permission() };

            // Check again after request
            if !unsafe { sck_has_permission() } {
                return Err(RecorderError::PermissionDenied(
                    "Screen Recording permission required. Please grant in System Preferences.".into()
                ));
            }
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
    ) -> Result<Stream, RecorderError> {
        let err_fn = |err| eprintln!("audio stream error: {}", err);
        device
            .build_input_stream(
                &config,
                move |data: &[f32], _| {
                    if !recording_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    if let Some(mut guard) = writer.try_lock() {
                        for &sample in data {
                            let s = (sample * i16::MAX as f32) as i16;
                            let _ = guard.write_sample(s);
                        }
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
    ) -> Result<Stream, RecorderError> {
        let err_fn = |err| eprintln!("audio stream error: {}", err);
        device
            .build_input_stream(
                &config,
                move |data: &[i16], _| {
                    if !recording_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    if let Some(mut guard) = writer.try_lock() {
                        for &sample in data {
                            let _ = guard.write_sample(sample);
                        }
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
    ) -> Result<Stream, RecorderError> {
        let err_fn = |err| eprintln!("audio stream error: {}", err);
        device
            .build_input_stream(
                &config,
                move |data: &[u16], _| {
                    if !recording_flag.load(Ordering::SeqCst) {
                        return;
                    }
                    if let Some(mut guard) = writer.try_lock() {
                        for &sample in data {
                            let centered = sample as i32 - i16::MAX as i32;
                            let _ = guard.write_sample(centered as i16);
                        }
                    }
                },
                err_fn,
                None,
            )
            .map_err(|e| RecorderError::Audio(e.to_string()))
    }

    pub fn stop(&mut self) -> Option<PathBuf> {
        Self::log("[RECORDER] stop() called");
        if !self.is_recording() {
            Self::log("[RECORDER] Not recording, returning None");
            return None;
        }
        self.recording.store(false, Ordering::SeqCst);
        thread::sleep(Duration::from_millis(120));

        // Stop microphone
        self.mic_stream = None;
        Self::log("[RECORDER] Microphone recording stopped");

        // Stop system audio (macOS)
        #[cfg(target_os = "macos")]
        {
            Self::log(&format!("[RECORDER] system_audio_path: {:?}", self.system_audio_path));
            if self.system_audio_path.is_some() {
                Self::log("[RECORDER] Calling sck_stop_capture()...");
                let _ = unsafe { sck_stop_capture() };
                Self::log("[RECORDER] System audio recording stopped");
                // Give ScreenCaptureKit time to finish writing
                thread::sleep(Duration::from_millis(500));
            }
        }

        let mic_path = self.mic_output_path.take();
        let system_path = self.system_audio_path.take();

        Self::log(&format!("[RECORDER] mic_path: {:?}", mic_path));
        Self::log(&format!("[RECORDER] system_path: {:?}", system_path));

        // If we have both files, merge them
        if let (Some(mic), Some(system)) = (&mic_path, &system_path) {
            // Check if files exist and their sizes
            let mic_size = std::fs::metadata(&mic).map(|m| m.len()).unwrap_or(0);
            let system_size = std::fs::metadata(&system).map(|m| m.len()).unwrap_or(0);
            Self::log(&format!("[RECORDER] mic file size: {} bytes", mic_size));
            Self::log(&format!("[RECORDER] system file size: {} bytes", system_size));

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
                    Self::log(&format!("[RECORDER] Audio merged successfully: {:?}", merged_path));
                    // DEBUG: Keep original files for debugging
                    // let _ = std::fs::remove_file(mic);
                    // let _ = std::fs::remove_file(system);
                    Self::log(&format!("[RECORDER] DEBUG: Keeping original files: mic={:?}, system={:?}", mic, system));
                    return Some(merged_path);
                }
                Err(e) => {
                    Self::log(&format!("[RECORDER] WARNING: Failed to merge audio: {}", e));
                    Self::log("[RECORDER] Using mic-only audio");
                    // DEBUG: Keep system file for debugging
                    // let _ = std::fs::remove_file(system);
                }
            }
        } else if let Some(system) = &system_path {
            Self::log(&format!("[RECORDER] System audio saved to: {:?}", system));
        } else {
            Self::log("[RECORDER] No system audio path - mic only recording");
        }

        mic_path.or(self.output_path.take())
    }

    /// Merge two WAV files into one, mixing the audio together
    fn merge_audio_files(mic_path: &PathBuf, system_path: &PathBuf, output_path: &PathBuf) -> Result<(), String> {
        println!("[MERGE] Reading mic file: {:?}", mic_path);
        let mic_reader = WavReader::open(mic_path)
            .map_err(|e| format!("Failed to open mic file: {}", e))?;
        let mic_spec = mic_reader.spec();

        println!("[MERGE] Reading system file: {:?}", system_path);
        let system_reader = WavReader::open(system_path)
            .map_err(|e| format!("Failed to open system file: {}", e))?;
        let system_spec = system_reader.spec();

        println!("[MERGE] Mic spec: {} Hz, {} ch, {} bits",
                 mic_spec.sample_rate, mic_spec.channels, mic_spec.bits_per_sample);
        println!("[MERGE] System spec: {} Hz, {} ch, {} bits",
                 system_spec.sample_rate, system_spec.channels, system_spec.bits_per_sample);

        // Read samples from both files
        let mic_samples: Vec<i32> = mic_reader
            .into_samples::<i16>()
            .filter_map(|s| s.ok())
            .map(|s| s as i32)
            .collect();

        let system_samples: Vec<i32> = system_reader
            .into_samples::<i16>()
            .filter_map(|s| s.ok())
            .map(|s| s as i32)
            .collect();

        println!("[MERGE] Mic samples: {}, System samples: {}",
                 mic_samples.len(), system_samples.len());

        // Use mic spec for output (it's typically the reference)
        let output_spec = hound::WavSpec {
            channels: mic_spec.channels,
            sample_rate: mic_spec.sample_rate,
            bits_per_sample: 16,
            sample_format: WavSampleFormat::Int,
        };

        let mut writer = WavWriter::create(output_path, output_spec)
            .map_err(|e| format!("Failed to create output file: {}", e))?;

        // Handle different sample rates by simple resampling
        let mic_len = mic_samples.len();
        let system_len = system_samples.len();

        // Calculate how to resample system audio if needed
        let mic_channels = mic_spec.channels as usize;
        let system_channels = system_spec.channels as usize;

        // Calculate number of frames
        let mic_frames = mic_len / mic_channels;
        let system_frames = system_len / system_channels;

        // Mix the audio - iterate through mic frames and mix with corresponding system frames
        let system_ratio = if system_frames > 0 {
            system_frames as f64 / mic_frames as f64
        } else {
            0.0
        };

        for frame_idx in 0..mic_frames {
            for ch in 0..mic_channels {
                let mic_sample_idx = frame_idx * mic_channels + ch;
                let mic_sample = mic_samples.get(mic_sample_idx).copied().unwrap_or(0);

                // Get corresponding system sample (with resampling if needed)
                let system_frame_idx = (frame_idx as f64 * system_ratio) as usize;
                let system_ch = ch % system_channels; // Handle channel mismatch
                let system_sample_idx = system_frame_idx * system_channels + system_ch;
                let system_sample = system_samples.get(system_sample_idx).copied().unwrap_or(0);

                // Mix: average the two sources with slight boost for system audio
                // System audio is often quieter, so we boost it a bit
                let mixed = (mic_sample + (system_sample * 3 / 2)) / 2;

                // Clamp to i16 range
                let clamped = mixed.clamp(i16::MIN as i32, i16::MAX as i32) as i16;

                writer.write_sample(clamped)
                    .map_err(|e| format!("Failed to write sample: {}", e))?;
            }
        }

        // If system audio is longer than mic, append the remaining system audio
        if system_frames > mic_frames {
            let start_frame = (mic_frames as f64 * system_ratio) as usize;
            for frame_idx in start_frame..system_frames {
                for ch in 0..mic_channels {
                    let system_ch = ch % system_channels;
                    let system_sample_idx = frame_idx * system_channels + system_ch;
                    let system_sample = system_samples.get(system_sample_idx).copied().unwrap_or(0);
                    let clamped = (system_sample * 3 / 4).clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                    writer.write_sample(clamped)
                        .map_err(|e| format!("Failed to write sample: {}", e))?;
                }
            }
        }

        writer.finalize()
            .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

        println!("[MERGE] Audio merge complete");
        Ok(())
    }

    /// Get paths to both recordings
    pub fn get_recording_paths(&self) -> (Option<&PathBuf>, Option<&PathBuf>) {
        (self.mic_output_path.as_ref(), self.system_audio_path.as_ref())
    }
}
