//! Private macOS microphone + system-audio aggregate. Never opens a recorder on
//! other platforms and never falls back to microphone-only after an opt-in.
use anyhow::{bail, Result};

pub const SUPPORTED: bool = cfg!(target_os = "macos");

pub struct SystemAudio {
    #[cfg(target_os = "macos")]
    handle: std::ptr::NonNull<std::ffi::c_void>,
    pub device_name: String,
}

impl SystemAudio {
    pub fn open() -> Result<Self> {
        #[cfg(target_os = "macos")]
        {
            let mut name = [0i8; 128];
            let mut error = 0;
            // The bridge writes a terminated name and owns a private aggregate
            // and tap. This handle stays on the capture worker (not Send/Sync).
            let handle = unsafe { og_audio_create(name.as_mut_ptr(), name.len(), &mut error) };
            let Some(handle) = std::ptr::NonNull::new(handle) else {
                bail!("Could not start system audio (Core Audio {error}). Check System Settings > Privacy & Security > Screen & System Audio Recording, then retry. No microphone-only fallback was started.");
            };
            let device_name = unsafe { std::ffi::CStr::from_ptr(name.as_ptr()) }
                .to_string_lossy()
                .into_owned();
            Ok(Self {
                handle,
                device_name,
            })
        }
        #[cfg(not(target_os = "macos"))]
        bail!("System audio capture is available only on macOS 14.4 or later.")
    }

    pub fn check(&self) -> Result<()> {
        #[cfg(target_os = "macos")]
        if unsafe { og_audio_health(self.handle.as_ptr()) } != 0 {
            bail!("Audio devices or system-audio format changed. Stop to save the recovered transcript, then start a new recording.");
        }
        Ok(())
    }
}

impl Drop for SystemAudio {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        unsafe {
            og_audio_destroy(self.handle.as_ptr())
        };
    }
}

#[cfg(target_os = "macos")]
extern "C" {
    fn og_audio_create(name: *mut i8, capacity: usize, error: *mut i32) -> *mut std::ffi::c_void;
    fn og_audio_health(handle: *const std::ffi::c_void) -> i32;
    fn og_audio_destroy(handle: *mut std::ffi::c_void);
}

#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    #[test]
    fn unsupported_platform_rejects_system_audio() {
        assert!(super::SystemAudio::open().is_err());
    }
}
