//! Windows System Audio Capture using WASAPI Loopback
//!
//! Uses Windows Audio Session API (WASAPI) to capture system audio.
//! No additional drivers required - native loopback support.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
#[allow(unused_imports)]
use windows::core::HSTRING;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;

use super::{SystemAudioCapture, SystemAudioError};

/// Windows system audio capturer using WASAPI Loopback
pub struct WindowsSystemAudio {
    recording: Arc<AtomicBool>,
    output_path: Option<PathBuf>,
    capture_thread: Option<JoinHandle<Result<(), String>>>,
}

impl WindowsSystemAudio {
    pub fn new() -> Result<Self, SystemAudioError> {
        // Initialize COM
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(|e| SystemAudioError::InitError(format!("COM init failed: {:?}", e)))?;
        }

        Ok(Self {
            recording: Arc::new(AtomicBool::new(false)),
            output_path: None,
            capture_thread: None,
        })
    }

    /// Get the default audio render device (speakers/headphones)
    fn get_default_render_device() -> Result<IMMDevice, SystemAudioError> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| SystemAudioError::InitError(format!("Failed to create device enumerator: {:?}", e)))?;

            enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| SystemAudioError::InitError(format!("No default render device: {:?}", e)))
        }
    }

    /// Capture audio in a background thread
    fn start_capture_thread(
        output_path: PathBuf,
        recording: Arc<AtomicBool>,
    ) -> JoinHandle<Result<(), String>> {
        thread::spawn(move || {
            unsafe {
                // Re-initialize COM for this thread
                CoInitializeEx(None, COINIT_MULTITHREADED)
                    .ok()
                    .map_err(|e| format!("COM init failed: {:?}", e))?;

                // Get default render device
                let device = Self::get_default_render_device()
                    .map_err(|e| format!("Get device failed: {:?}", e))?;

                // Activate audio client
                let audio_client: IAudioClient = device
                    .Activate(CLSCTX_ALL, None)
                    .map_err(|e| format!("Activate audio client failed: {:?}", e))?;

                // Get mix format
                let format_ptr = audio_client
                    .GetMixFormat()
                    .map_err(|e| format!("GetMixFormat failed: {:?}", e))?;

                let format = &*format_ptr;
                let sample_rate = format.nSamplesPerSec;
                let channels = format.nChannels;
                let bits_per_sample = format.wBitsPerSample;

                println!(
                    "WASAPI format: {}Hz, {} channels, {} bits",
                    sample_rate, channels, bits_per_sample
                );

                // Initialize audio client in loopback mode
                // AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000
                const AUDCLNT_STREAMFLAGS_LOOPBACK: u32 = 0x00020000;
                const REFTIMES_PER_SEC: i64 = 10_000_000;
                let buffer_duration = REFTIMES_PER_SEC / 10; // 100ms buffer

                audio_client
                    .Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_LOOPBACK,
                        buffer_duration,
                        0,
                        format_ptr,
                        None,
                    )
                    .map_err(|e| format!("Initialize failed: {:?}", e))?;

                // Get capture client
                let capture_client: IAudioCaptureClient = audio_client
                    .GetService()
                    .map_err(|e| format!("GetService failed: {:?}", e))?;

                // Create WAV writer
                let spec = WavSpec {
                    channels: channels as u16,
                    sample_rate,
                    bits_per_sample: 16, // We'll convert to 16-bit
                    sample_format: WavSampleFormat::Int,
                };

                let mut writer = WavWriter::create(&output_path, spec)
                    .map_err(|e| format!("Create WAV failed: {:?}", e))?;

                // Start capture
                audio_client
                    .Start()
                    .map_err(|e| format!("Start failed: {:?}", e))?;

                println!("WASAPI loopback capture started");

                // Capture loop
                while recording.load(Ordering::SeqCst) {
                    let mut packet_length = capture_client
                        .GetNextPacketSize()
                        .map_err(|e| format!("GetNextPacketSize failed: {:?}", e))?;

                    while packet_length > 0 {
                        let mut data_ptr = std::ptr::null_mut();
                        let mut num_frames = 0u32;
                        let mut flags = 0u32;

                        capture_client
                            .GetBuffer(&mut data_ptr, &mut num_frames, &mut flags, None, None)
                            .map_err(|e| format!("GetBuffer failed: {:?}", e))?;

                        if !data_ptr.is_null() && num_frames > 0 {
                            // Check if silent
                            const AUDCLNT_BUFFERFLAGS_SILENT: u32 = 0x2;
                            if (flags & AUDCLNT_BUFFERFLAGS_SILENT) == 0 {
                                // Process audio data
                                let frame_size = (channels * bits_per_sample / 8) as usize;
                                let total_bytes = num_frames as usize * frame_size;
                                let data = std::slice::from_raw_parts(data_ptr, total_bytes);

                                // Convert float32 to i16
                                if bits_per_sample == 32 {
                                    for chunk in data.chunks(4) {
                                        if chunk.len() == 4 {
                                            let float_sample = f32::from_le_bytes([
                                                chunk[0], chunk[1], chunk[2], chunk[3],
                                            ]);
                                            let int_sample =
                                                (float_sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                                            let _ = writer.write_sample(int_sample);
                                        }
                                    }
                                } else if bits_per_sample == 16 {
                                    for chunk in data.chunks(2) {
                                        if chunk.len() == 2 {
                                            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                                            let _ = writer.write_sample(sample);
                                        }
                                    }
                                }
                            }
                        }

                        capture_client
                            .ReleaseBuffer(num_frames)
                            .map_err(|e| format!("ReleaseBuffer failed: {:?}", e))?;

                        packet_length = capture_client
                            .GetNextPacketSize()
                            .map_err(|e| format!("GetNextPacketSize failed: {:?}", e))?;
                    }

                    // Small sleep to prevent busy loop
                    thread::sleep(std::time::Duration::from_millis(10));
                }

                // Stop capture
                audio_client.Stop().map_err(|e| format!("Stop failed: {:?}", e))?;

                // Finalize WAV
                writer.finalize().map_err(|e| format!("Finalize failed: {:?}", e))?;

                println!("WASAPI loopback capture stopped");
                CoUninitialize();

                Ok(())
            }
        })
    }
}

impl SystemAudioCapture for WindowsSystemAudio {
    fn has_permission(&self) -> bool {
        // Windows doesn't require special permission for WASAPI loopback
        true
    }

    fn request_permission(&self) -> Result<bool, SystemAudioError> {
        // No permission needed on Windows
        Ok(true)
    }

    fn start_recording(&mut self, output_path: PathBuf) -> Result<(), SystemAudioError> {
        if self.recording.load(Ordering::SeqCst) {
            return Err(SystemAudioError::AlreadyRecording);
        }

        // Verify we can get the render device
        Self::get_default_render_device()?;

        self.recording.store(true, Ordering::SeqCst);
        self.output_path = Some(output_path.clone());

        // Start capture thread
        let recording = self.recording.clone();
        self.capture_thread = Some(Self::start_capture_thread(output_path, recording));

        Ok(())
    }

    fn stop_recording(&mut self) -> Result<Option<PathBuf>, SystemAudioError> {
        if !self.recording.load(Ordering::SeqCst) {
            return Err(SystemAudioError::NotRecording);
        }

        self.recording.store(false, Ordering::SeqCst);

        // Wait for capture thread to finish
        if let Some(handle) = self.capture_thread.take() {
            match handle.join() {
                Ok(Ok(())) => {}
                Ok(Err(e)) => eprintln!("Capture thread error: {}", e),
                Err(_) => eprintln!("Capture thread panicked"),
            }
        }

        Ok(self.output_path.take())
    }

    fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst)
    }
}

impl Drop for WindowsSystemAudio {
    fn drop(&mut self) {
        if self.is_recording() {
            let _ = self.stop_recording();
        }
        unsafe {
            CoUninitialize();
        }
    }
}

unsafe impl Send for WindowsSystemAudio {}
unsafe impl Sync for WindowsSystemAudio {}
