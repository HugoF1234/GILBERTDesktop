//! Linux System Audio Capture using PulseAudio/PipeWire Monitor
//!
//! Linux supports audio loopback via monitor sources.
//! Works with both PulseAudio and PipeWire (PipeWire provides PulseAudio compatibility).
//!
//! The monitor source captures all audio going to the default sink (speakers).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream};
use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};

use super::{SystemAudioCapture, SystemAudioError};

/// Keywords to identify monitor sources
const MONITOR_KEYWORDS: &[&str] = &[
    "monitor",
    "Monitor",
    ".monitor",
    "loopback",
    "Loopback",
];

/// Linux system audio capturer using PulseAudio/PipeWire monitor
pub struct LinuxSystemAudio {
    recording: Arc<AtomicBool>,
    output_path: Option<PathBuf>,
    stream: Option<Stream>,
    writer: Arc<parking_lot::Mutex<Option<WavWriter<std::io::BufWriter<std::fs::File>>>>>,
    monitor_available: bool,
}

impl LinuxSystemAudio {
    pub fn new() -> Result<Self, SystemAudioError> {
        let monitor_available = Self::find_monitor_device().is_some();

        if !monitor_available {
            println!("⚠️ No monitor source found. System audio capture may not work.");
            println!("   Ensure PulseAudio or PipeWire is running with monitor sources enabled.");
        } else {
            println!("✅ Monitor source found - system audio capture available");
        }

        Ok(Self {
            recording: Arc::new(AtomicBool::new(false)),
            output_path: None,
            stream: None,
            writer: Arc::new(parking_lot::Mutex::new(None)),
            monitor_available,
        })
    }

    /// Find the monitor source (loopback device)
    fn find_monitor_device() -> Option<cpal::Device> {
        let host = cpal::default_host();

        // List all input devices and find a monitor source
        if let Ok(devices) = host.input_devices() {
            for device in devices {
                if let Ok(name) = device.name() {
                    for keyword in MONITOR_KEYWORDS {
                        if name.contains(keyword) {
                            println!("Found monitor source: {}", name);
                            return Some(device);
                        }
                    }
                }
            }
        }

        // If no explicit monitor found, try default input
        // On some systems, the monitor is the default input
        None
    }

    /// List all available audio input devices (for debugging/UI)
    pub fn list_input_devices() -> Vec<String> {
        let host = cpal::default_host();
        let mut devices = Vec::new();

        if let Ok(input_devices) = host.input_devices() {
            for device in input_devices {
                if let Ok(name) = device.name() {
                    devices.push(name);
                }
            }
        }

        devices
    }

    /// Check if PipeWire is running
    fn is_pipewire() -> bool {
        std::process::Command::new("pgrep")
            .args(["-x", "pipewire"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Check if PulseAudio is running
    fn is_pulseaudio() -> bool {
        std::process::Command::new("pgrep")
            .args(["-x", "pulseaudio"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

impl SystemAudioCapture for LinuxSystemAudio {
    fn has_permission(&self) -> bool {
        // Linux typically doesn't require special permissions for audio
        let host = cpal::default_host();
        host.default_input_device().is_some() && self.monitor_available
    }

    fn request_permission(&self) -> Result<bool, SystemAudioError> {
        if !self.monitor_available {
            // Check what's running
            let audio_server = if Self::is_pipewire() {
                "PipeWire"
            } else if Self::is_pulseaudio() {
                "PulseAudio"
            } else {
                "unknown"
            };

            return Err(SystemAudioError::InitError(format!(
                "No monitor source found. Audio server: {}. \
                 Try: pactl load-module module-loopback",
                audio_server
            )));
        }

        Ok(true)
    }

    fn start_recording(&mut self, output_path: PathBuf) -> Result<(), SystemAudioError> {
        if self.recording.load(Ordering::SeqCst) {
            return Err(SystemAudioError::AlreadyRecording);
        }

        // Find monitor device
        let device = Self::find_monitor_device()
            .ok_or_else(|| SystemAudioError::InitError(
                "Monitor source not found. Ensure PulseAudio/PipeWire is running.".into()
            ))?;

        // Get default config
        let config = device
            .default_input_config()
            .map_err(|e| SystemAudioError::InitError(format!("Failed to get device config: {:?}", e)))?;

        let sample_rate = config.sample_rate().0;
        let channels = config.channels();

        println!("Monitor config: {}Hz, {} channels, {:?}", sample_rate, channels, config.sample_format());

        // Create WAV writer
        let spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: WavSampleFormat::Int,
        };

        let writer = WavWriter::create(&output_path, spec)
            .map_err(|e| SystemAudioError::IoError(e.to_string()))?;

        *self.writer.lock() = Some(writer);
        self.recording.store(true, Ordering::SeqCst);

        let writer = self.writer.clone();
        let recording = self.recording.clone();
        let err_fn = |err| eprintln!("Audio stream error: {:?}", err);

        // Build stream based on sample format
        let stream = match config.sample_format() {
            SampleFormat::F32 => {
                device.build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &_| {
                        if !recording.load(Ordering::SeqCst) {
                            return;
                        }
                        if let Some(ref mut w) = *writer.lock() {
                            for &sample in data {
                                let s = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                                let _ = w.write_sample(s);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::I16 => {
                device.build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &_| {
                        if !recording.load(Ordering::SeqCst) {
                            return;
                        }
                        if let Some(ref mut w) = *writer.lock() {
                            for &sample in data {
                                let _ = w.write_sample(sample);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            SampleFormat::U16 => {
                device.build_input_stream(
                    &config.into(),
                    move |data: &[u16], _: &_| {
                        if !recording.load(Ordering::SeqCst) {
                            return;
                        }
                        if let Some(ref mut w) = *writer.lock() {
                            for &sample in data {
                                let s = (sample as i32 - i16::MAX as i32) as i16;
                                let _ = w.write_sample(s);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
            }
            _ => return Err(SystemAudioError::InitError("Unsupported sample format".into())),
        }.map_err(|e| SystemAudioError::InitError(format!("Failed to build stream: {:?}", e)))?;

        stream.play().map_err(|e| SystemAudioError::CaptureError(format!("Failed to start stream: {:?}", e)))?;

        self.stream = Some(stream);
        self.output_path = Some(output_path);

        println!("Linux system audio capture started (via PulseAudio/PipeWire monitor)");
        Ok(())
    }

    fn stop_recording(&mut self) -> Result<Option<PathBuf>, SystemAudioError> {
        if !self.recording.load(Ordering::SeqCst) {
            return Err(SystemAudioError::NotRecording);
        }

        self.recording.store(false, Ordering::SeqCst);

        // Stop stream
        self.stream.take();

        // Small delay to ensure all samples are written
        thread::sleep(std::time::Duration::from_millis(100));

        // Finalize WAV
        if let Some(writer) = self.writer.lock().take() {
            let _ = writer.finalize();
        }

        println!("Linux system audio capture stopped");
        Ok(self.output_path.take())
    }

    fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
    }
}

unsafe impl Send for LinuxSystemAudio {}
unsafe impl Sync for LinuxSystemAudio {}
