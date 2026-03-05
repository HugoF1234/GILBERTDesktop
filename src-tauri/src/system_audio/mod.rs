//! System Audio Capture Module
//!
//! Cross-platform system audio capture for recording audio from video conferencing apps.
//! - macOS: Uses BlackHole virtual audio device (requires installation)
//! - Windows: Uses WASAPI Loopback (native, no driver needed)
//! - Linux: Uses PulseAudio/PipeWire monitor source (native)

use std::path::PathBuf;
use thiserror::Error;

// Platform-specific implementations
#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod windows;

#[cfg(target_os = "linux")]
pub mod linux;

/// Errors that can occur during system audio capture
#[derive(Debug, Error)]
pub enum SystemAudioError {
    #[error("Permission denied - Screen Recording permission required")]
    PermissionDenied,
    #[error("No audio available to capture")]
    NoAudioAvailable,
    #[error("Already recording")]
    AlreadyRecording,
    #[error("Not recording")]
    NotRecording,
    #[error("Platform not supported")]
    PlatformNotSupported,
    #[error("Failed to initialize: {0}")]
    InitError(String),
    #[error("Capture error: {0}")]
    CaptureError(String),
    #[error("IO error: {0}")]
    IoError(String),
}

/// Common trait for system audio capture across platforms
pub trait SystemAudioCapture: Send + Sync {
    /// Check if the system has permission to capture audio
    fn has_permission(&self) -> bool;

    /// Request permission to capture system audio
    fn request_permission(&self) -> Result<bool, SystemAudioError>;

    /// Start recording system audio to a file
    fn start_recording(&mut self, output_path: PathBuf) -> Result<(), SystemAudioError>;

    /// Stop recording and finalize the audio file
    fn stop_recording(&mut self) -> Result<Option<PathBuf>, SystemAudioError>;

    /// Check if currently recording
    fn is_recording(&self) -> bool;
}

/// Create a platform-specific system audio capturer
pub fn create_capturer() -> Result<Box<dyn SystemAudioCapture>, SystemAudioError> {
    #[cfg(target_os = "macos")]
    {
        Ok(Box::new(macos::MacOSSystemAudio::new()?))
    }

    #[cfg(target_os = "windows")]
    {
        Ok(Box::new(windows::WindowsSystemAudio::new()?))
    }

    #[cfg(target_os = "linux")]
    {
        Ok(Box::new(linux::LinuxSystemAudio::new()?))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Err(SystemAudioError::PlatformNotSupported)
    }
}

/// Platform information for the UI
#[derive(Debug, Clone)]
pub struct PlatformAudioInfo {
    pub platform: &'static str,
    pub method: &'static str,
    pub requires_setup: bool,
    pub setup_instructions: &'static str,
}

/// Get information about the current platform's audio capture method
pub fn get_platform_info() -> PlatformAudioInfo {
    #[cfg(target_os = "macos")]
    {
        PlatformAudioInfo {
            platform: "macOS",
            method: "ScreenCaptureKit (Native)",
            requires_setup: false,
            setup_instructions: "No setup required. System audio capture is natively supported via ScreenCaptureKit.\n\
                                Requires macOS 13.0+ (Ventura) and Screen Recording permission.",
        }
    }

    #[cfg(target_os = "windows")]
    {
        PlatformAudioInfo {
            platform: "Windows",
            method: "WASAPI Loopback",
            requires_setup: false,
            setup_instructions: "No setup required. System audio capture is natively supported.",
        }
    }

    #[cfg(target_os = "linux")]
    {
        PlatformAudioInfo {
            platform: "Linux",
            method: "PulseAudio/PipeWire Monitor",
            requires_setup: false,
            setup_instructions: "Ensure PulseAudio or PipeWire is running.\n\
                                If monitor source is not available, run: pactl load-module module-loopback",
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        PlatformAudioInfo {
            platform: "Unknown",
            method: "Not supported",
            requires_setup: false,
            setup_instructions: "System audio capture is not supported on this platform.",
        }
    }
}
