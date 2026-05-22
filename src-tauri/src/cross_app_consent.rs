//! Cross-app consent gating for macOS.
//!
//! ReDD Block is an unsandboxed parent app that has to write into
//! other apps' Application Support trees (native-messaging manifests
//! for Chrome/Brave/Edge/Firefox) and read from Safari's sandbox
//! container (`~/Library/Containers/com.apple.Safari/Data/…`) to
//! detect extension state. Each such cross-app touch on macOS
//! Sonoma+/Sequoia can fire the "ReDD Block would like to access
//! data from other apps" TCC prompt. The per-prompt consent for that
//! TCC service is — empirically, on Sequoia — *not* reliably
//! persistent across launches even after Allow, so users see the
//! prompt repeatedly even after granting it. The one consent gesture
//! that *is* reliably persistent and covers all the resources we
//! touch is **Full Disk Access**.
//!
//! This module owns the policy for "are we allowed to do startup
//! cross-app touches yet?" with two signals:
//!
//! 1. [`has_full_disk_access`] — canonical FDA probe via the system
//!    TCC database. No prompt risk; clean EPERM if not granted.
//!
//! 2. [`has_user_been_through_fda_onboarding`] — true once the user
//!    has been shown the FDA onboarding screen and made a deliberate
//!    choice (Grant or Continue without). Marker file lives in our
//!    own app-data dir, so checking/writing it never touches another
//!    app's territory.
//!
//! [`should_run_cross_app_installs`] combines the two: we run our
//! startup cross-app writes when either FDA is granted (silent) or
//! the user has explicitly chosen to proceed without it (so prompts
//! are at least an expected consequence of their choice). Before
//! either of those holds, `lib.rs::run` defers the install — the
//! frontend invokes [`crate::commands::fda::complete_fda_onboarding`]
//! after the user dismisses the onboarding overlay, which sets the
//! marker and force-runs the deferred install in one step.

#[cfg(target_os = "macos")]
use std::path::PathBuf;

/// True when ReDD Block has Full Disk Access on macOS.
///
/// We probe by reading `/Library/Application Support/com.apple.TCC/TCC.db`.
/// That path is owned by root, lives at a fixed system location, and
/// is unambiguously FDA-protected — reading it without FDA returns
/// EPERM cleanly *without* triggering the "data from other apps"
/// TCC prompt that an unsandboxed app gets when poking around in
/// `~/Library/Containers/<some-other-app>/` or
/// `~/Library/Application Support/<some-other-app>/`. So this is the
/// safe FDA-detection primitive — calling it has no UX side effects.
///
/// On non-macOS targets this returns `true` (FDA is a macOS concept;
/// callers on other platforms shouldn't gate on it).
#[cfg(target_os = "macos")]
pub fn has_full_disk_access() -> bool {
    let path = PathBuf::from("/Library/Application Support/com.apple.TCC/TCC.db");
    let granted = std::fs::read(&path).is_ok();
    log::debug!("cross_app_consent: has_full_disk_access -> {granted}");
    granted
}

#[cfg(not(target_os = "macos"))]
pub fn has_full_disk_access() -> bool {
    true
}

/// Marker file written when the user has been shown the FDA
/// onboarding screen and made an explicit Grant / Continue-without
/// choice. Lives under our own app-data dir so reading or writing it
/// never touches another app's data — no TCC prompt risk.
///
/// Bumping the filename suffix (`v1` → `v2`) lets us re-onboard
/// everyone if we ever need to (e.g. major change to the explanation,
/// new permission required).
#[cfg(target_os = "macos")]
fn fda_onboarded_marker_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(base.join("com.reddblock").join("fda-onboarded.v1"))
}

/// True when the user has been through the FDA onboarding screen
/// (regardless of whether they granted or skipped). Used as a
/// "don't show the screen again" check from the frontend, and as
/// half of the gate for [`should_run_cross_app_installs`].
#[cfg(target_os = "macos")]
pub fn has_user_been_through_fda_onboarding() -> bool {
    let Some(path) = fda_onboarded_marker_path() else { return false };
    path.exists()
}

#[cfg(not(target_os = "macos"))]
pub fn has_user_been_through_fda_onboarding() -> bool {
    true
}

/// Drop the marker file. Best-effort — if the write fails (read-only
/// filesystem, permissions, etc.) the next launch just re-shows the
/// onboarding screen, which is harmless.
#[cfg(target_os = "macos")]
pub fn mark_user_through_fda_onboarding() {
    let Some(path) = fda_onboarded_marker_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, b"");
}

#[cfg(not(target_os = "macos"))]
pub fn mark_user_through_fda_onboarding() {}

/// True when we're allowed to run startup cross-app writes
/// (native-messaging manifest install, extension-install hints).
/// Either:
///   - Full Disk Access is granted (writes silent → great UX), or
///   - the user has been through the FDA onboarding and explicitly
///     chose to continue without it (prompts will fire, but they're
///     expected — the user made the call).
///
/// Until one of those holds, `lib.rs::run` skips startup installs
/// and waits for the frontend to invoke `complete_fda_onboarding`,
/// which writes the marker and force-runs the install in one step.
///
/// On non-macOS targets this always returns `true` — FDA is a macOS
/// concept and the cross-app-touch UX problem we're guarding against
/// doesn't exist on Windows or Linux.
#[cfg(target_os = "macos")]
pub fn should_run_cross_app_installs() -> bool {
    has_full_disk_access() || has_user_been_through_fda_onboarding()
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_cross_app_installs() -> bool {
    true
}
