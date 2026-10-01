//! Network policy reporting. Release macOS builds install a process sandbox;
//! other platforms currently rely on application policy and webview CSP.
//! A dependency scan is a regression check, not proof that sockets cannot open.

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct AirlockStatus {
    pub os_enforced: bool,
    pub mode: &'static str,
    pub detail: &'static str,
}

/// Called before the Tauri builder. Release macOS builds fail startup if their
/// network sandbox cannot be installed. Debug builds need the local Vite server.
pub fn engage() -> anyhow::Result<AirlockStatus> {
    #[cfg(all(target_os = "macos", not(debug_assertions)))]
    {
        macos::deny_network()?;
        log::info!("macOS process network sandbox installed");
        Ok(AirlockStatus {
            os_enforced: true,
            mode: "macos_sandbox",
            detail: "The macOS process sandbox denies network access. Webview content also uses a local-only CSP.",
        })
    }

    #[cfg(any(not(target_os = "macos"), debug_assertions))]
    {
        let status = if cfg!(debug_assertions) {
            AirlockStatus {
                os_enforced: false,
                mode: "development",
                detail: "Development permits the local frontend server; OS network blocking is not enabled.",
            }
        } else {
            AirlockStatus {
                os_enforced: false,
                mode: "application_policy",
                detail: "The app has no upload feature and restricts webview connections. OS network blocking is not implemented on this platform.",
            }
        };
        log::warn!("{}", status.detail);
        Ok(status)
    }
}

#[cfg(all(target_os = "macos", any(not(debug_assertions), test)))]
mod macos {
    use std::ffi::{c_char, c_void, CString};

    #[link(name = "Security", kind = "framework")]
    extern "C" {
        fn SecTaskCreateFromSelf(allocator: *const c_void) -> *const c_void;
        fn SecTaskCopyValueForEntitlement(
            task: *const c_void,
            name: *const c_void,
            error: *mut *const c_void,
        ) -> *const c_void;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            value: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFGetTypeID(value: *const c_void) -> usize;
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(value: *const c_void) -> u8;
        fn CFRelease(value: *const c_void);
    }

    struct OwnedCf(*const c_void);

    impl Drop for OwnedCf {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: only retained Create/Copy API results are wrapped.
                unsafe { CFRelease(self.0) };
            }
        }
    }

    fn entitlement_enabled(name: &str) -> anyhow::Result<bool> {
        let name = CString::new(name)?;
        // SAFETY: null allocator selects the system default; the name is valid
        // UTF-8, NUL-terminated, and alive for the call. All retained CF objects
        // are released by OwnedCf, including any returned error.
        let task = OwnedCf(unsafe { SecTaskCreateFromSelf(std::ptr::null()) });
        let key = OwnedCf(unsafe {
            CFStringCreateWithCString(std::ptr::null(), name.as_ptr(), 0x0800_0100)
        });
        anyhow::ensure!(
            !task.0.is_null() && !key.0.is_null(),
            "Cannot inspect application sandbox entitlements"
        );
        let mut error = std::ptr::null();
        let value = OwnedCf(unsafe { SecTaskCopyValueForEntitlement(task.0, key.0, &mut error) });
        let error = OwnedCf(error);
        anyhow::ensure!(
            error.0.is_null(),
            "Cannot read application sandbox entitlements"
        );
        if value.0.is_null() {
            return Ok(false);
        }
        // SAFETY: the non-null returned object is retained; check its type
        // before using the CFBoolean accessor.
        anyhow::ensure!(
            unsafe { CFGetTypeID(value.0) == CFBooleanGetTypeID() },
            "Unexpected sandbox entitlement type"
        );
        Ok(unsafe { CFBooleanGetValue(value.0) != 0 })
    }

    pub(super) fn deny_network() -> anyhow::Result<()> {
        use std::ffi::{c_int, CStr};
        // sandbox_init cannot replace a sandbox that signing already enabled.
        // Accept that existing boundary only when its effective entitlements
        // contain neither inbound nor outbound network access.
        if entitlement_enabled("com.apple.security.app-sandbox")? {
            anyhow::ensure!(
                !entitlement_enabled("com.apple.security.network.client")?
                    && !entitlement_enabled("com.apple.security.network.server")?,
                "The signed application unexpectedly has network entitlements"
            );
            return Ok(());
        }
        extern "C" {
            fn sandbox_init(profile: *const c_char, flags: u64, error: *mut *mut c_char) -> c_int;
            fn sandbox_free_error(error: *mut c_char);
        }
        let profile = CString::new("(version 1)(allow default)(deny network*)")?;
        let mut error: *mut c_char = std::ptr::null_mut();
        // SAFETY: profile is NUL-terminated and lives through the call; error is
        // an out pointer owned by libsandbox and freed with sandbox_free_error.
        let result = unsafe { sandbox_init(profile.as_ptr(), 0, &mut error) };
        let detail = if error.is_null() {
            String::from("no platform error supplied")
        } else {
            let detail = unsafe { CStr::from_ptr(error) }
                .to_string_lossy()
                .into_owned();
            unsafe { sandbox_free_error(error) };
            detail
        };
        anyhow::ensure!(result == 0, "Cannot install the network sandbox: {detail}");
        Ok(())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use std::net::{TcpListener, TcpStream};
    use std::process::Command;
    use std::time::Duration;

    // Isolate irreversible sandbox installation in a child test process. The
    // parent first proves that the exact local endpoint is reachable, avoiding
    // false positives from an offline machine or unreachable public DNS host.
    #[test]
    fn sandbox_denies_reachable_loopback_in_child() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        TcpStream::connect_timeout(&address, Duration::from_secs(2)).unwrap();
        let output = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "airlock::tests::sandbox_child_probe",
                "--nocapture",
            ])
            .env("OPEN_GRANOLA_SANDBOX_PROBE", address.to_string())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "sandbox probe failed: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn sandbox_child_probe() {
        let Ok(address) = std::env::var("OPEN_GRANOLA_SANDBOX_PROBE") else {
            return;
        };
        super::macos::deny_network().unwrap();
        let error = TcpStream::connect_timeout(&address.parse().unwrap(), Duration::from_secs(2))
            .unwrap_err();
        assert_eq!(
            error.kind(),
            std::io::ErrorKind::PermissionDenied,
            "expected an OS denial: {error}"
        );
        let output = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "airlock::tests::sandbox_inherited_probe",
                "--nocapture",
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "exec child failed to inherit the network sandbox: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn sandbox_inherited_probe() {
        let Ok(address) = std::env::var("OPEN_GRANOLA_SANDBOX_PROBE") else {
            return;
        };
        // Deliberately do not call sandbox_init: an exec'd worker must inherit
        // the already-sandboxed parent's policy without reinstalling it.
        let error = TcpStream::connect_timeout(&address.parse().unwrap(), Duration::from_secs(2))
            .unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::PermissionDenied);
    }
}
