//! Safari App Group bridge consent — minimal recovery API.
//!
//! On macOS Sequoia, accessing a shared App Group container fires a
//! TCC prompt under the `kTCCServiceSystemPolicyAppData` class. Once
//! the user clicks "Don't Allow", macOS caches the denial and
//! refuses to re-prompt — the only programmatic recovery is
//! `tccutil reset SystemPolicyAppData <bundle-id>`, which is an
//! unprivileged user-scoped operation.
//!
//! We don't try to defer the first prompt or persist consent
//! ourselves: macOS already remembers the answer. We just expose two
//! commands the UI uses:
//!
//!   - `check_safari_bridge_access`: probe via `read_dir` on the
//!     App Group container; returns whether access works right now.
//!     If the user has never been asked, this *is* the first probe
//!     and the prompt fires here.
//!   - `request_safari_bridge_access`: clear any cached denial via
//!     `tccutil reset` and probe again — fires a fresh prompt for
//!     users who previously clicked "Don't Allow".
//!
//! The JS side calls `check_safari_bridge_access` periodically.
//! When it returns false, a banner appears with a "Grant" button
//! that calls `request_safari_bridge_access`.

#[tauri::command]
pub fn check_safari_bridge_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        match crate::app_group::path() {
            Some(p) => std::fs::read_dir(&p).is_ok(),
            None => false,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn request_safari_bridge_access() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        // Clear any cached denial. Unprivileged for user-scoped TCC
        // services like SystemPolicyAppData. Failure is logged but
        // not surfaced — the probe below tells us the real state.
        if let Err(e) = std::process::Command::new("/usr/bin/tccutil")
            .args(["reset", "SystemPolicyAppData", "com.reddblock"])
            .output()
        {
            log::warn!("tccutil reset failed: {e}");
        }
        Ok(check_safari_bridge_access())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}
