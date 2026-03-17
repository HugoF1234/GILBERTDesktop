//! macOS System Audio Capture using ScreenCaptureKit
//!
//! Uses Apple's native ScreenCaptureKit API (macOS 13.0+) to capture system audio.
//! No additional drivers or virtual audio devices required.
//!
//! Requires Screen Recording permission (even for audio-only capture).

use std::ffi::CString;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use super::{SystemAudioCapture, SystemAudioError};

// FFI bindings to Swift ScreenCaptureKit bridge
extern "C" {
    fn sck_is_available() -> bool;
    fn sck_has_permission() -> bool;
    fn sck_request_permission() -> bool;
    fn sck_start_capture(output_path: *const std::os::raw::c_char) -> bool;
    fn sck_stop_capture() -> bool;
    fn sck_is_recording() -> bool;
}

/// macOS system audio capturer using ScreenCaptureKit
pub struct MacOSSystemAudio {
    recording: Arc<AtomicBool>,
    output_path: Option<PathBuf>,
    sck_available: bool,
}

impl MacOSSystemAudio {
    pub fn new() -> Result<Self, SystemAudioError> {
        let sck_available = unsafe { sck_is_available() };

        if sck_available {
            println!("ScreenCaptureKit available - native system audio capture enabled");
        } else {
            println!("ScreenCaptureKit not available (requires macOS 12.3+)");
        }

        Ok(Self {
            recording: Arc::new(AtomicBool::new(false)),
            output_path: None,
            sck_available,
        })
    }

    /// Check if ScreenCaptureKit is available on this system
    pub fn is_sck_available() -> bool {
        unsafe { sck_is_available() }
    }
}

impl SystemAudioCapture for MacOSSystemAudio {
    fn has_permission(&self) -> bool {
        if !self.sck_available {
            return false;
        }
        unsafe { sck_has_permission() }
    }

    fn request_permission(&self) -> Result<bool, SystemAudioError> {
        if !self.sck_available {
            return Err(SystemAudioError::InitError(
                "ScreenCaptureKit audio capture requires macOS 13.0 (Ventura) or later".into(),
            ));
        }

        println!("Requesting Screen Recording permission...");
        let granted = unsafe { sck_request_permission() };

        if granted {
            println!("Screen Recording permission granted");
            Ok(true)
        } else {
            println!("Screen Recording permission denied or pending");
            Err(SystemAudioError::PermissionDenied)
        }
    }

    fn start_recording(&mut self, output_path: PathBuf) -> Result<(), SystemAudioError> {
        if !self.sck_available {
            return Err(SystemAudioError::InitError(
                "ScreenCaptureKit audio capture requires macOS 13.0 (Ventura) or later".into(),
            ));
        }

        if self.recording.load(Ordering::SeqCst) {
            return Err(SystemAudioError::AlreadyRecording);
        }

        // Si permission non accordée → la demander maintenant (popup système une seule fois)
        if !unsafe { sck_has_permission() } {
            println!("[SYSTEM-AUDIO] Permission Screen Recording non accordée → demande...");
            let granted = unsafe { sck_request_permission() };
            if !granted {
                println!("[SYSTEM-AUDIO] ⚠️ Permission refusée — son système désactivé");
                return Err(SystemAudioError::PermissionDenied);
            }
            println!("[SYSTEM-AUDIO] ✅ Permission accordée");
        }

        // Convert path to C string
        let path_str = output_path
            .to_str()
            .ok_or_else(|| SystemAudioError::IoError("Invalid path encoding".into()))?;
        let c_path = CString::new(path_str)
            .map_err(|_| SystemAudioError::IoError("Path contains null byte".into()))?;

        // Start capture via FFI
        let success = unsafe { sck_start_capture(c_path.as_ptr()) };

        if success {
            self.recording.store(true, Ordering::SeqCst);
            self.output_path = Some(output_path);
            println!("macOS system audio capture started (via ScreenCaptureKit)");
            Ok(())
        } else {
            Err(SystemAudioError::CaptureError(
                "Failed to start ScreenCaptureKit capture".into(),
            ))
        }
    }

    fn stop_recording(&mut self) -> Result<Option<PathBuf>, SystemAudioError> {
        if !self.recording.load(Ordering::SeqCst) {
            return Err(SystemAudioError::NotRecording);
        }

        // Stop capture via FFI
        let success = unsafe { sck_stop_capture() };

        self.recording.store(false, Ordering::SeqCst);

        if success {
            println!("macOS system audio capture stopped");
            Ok(self.output_path.take())
        } else {
            // Still return the path even if stop had issues
            Ok(self.output_path.take())
        }
    }

    fn is_recording(&self) -> bool {
        self.recording.load(Ordering::SeqCst) || unsafe { sck_is_recording() }
    }
}

unsafe impl Send for MacOSSystemAudio {}
unsafe impl Sync for MacOSSystemAudio {}
