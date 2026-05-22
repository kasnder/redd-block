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
//! [`should_run_cross_app_installs`] is true only once BOTH hold:
//!   - the user has completed the FDA onboarding overlay (marker file), AND
//!   - the EULA has been accepted in the canonical data file.
//!
//! The EULA check prevents a stale FDA marker (left over from a prior
//! session while re-testing with `--eula`) from firing cross-app reads
//! during the welcome / EULA screens.

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
/// Probe Full Disk Access by attempting to open the system TCC
/// database. Returns true iff we successfully opened the file
/// descriptor (we never read the bytes).
///
/// **Important caveat on macOS Sequoia:** the open call itself
/// surfaces a "ReDD Block would like to access data from other
/// apps" TCC prompt for a non-FDA-granted unsandboxed app. So this
/// function is now ONLY called from the user-initiated FDA grant
/// flow — specifically the polling loop in
/// `showFdaOnboardingOverlay` after the user clicks
/// "Open Full Disk Access settings". In that context the user has
/// already opted into permissions interactions, so the additional
/// prompt is acceptable. Background paths (install gates, profile
/// scans, banner refresh) MUST NOT call this — they use
/// [`user_fda_choice`] instead.
#[cfg(target_os = "macos")]
pub fn has_full_disk_access() -> bool {
    let path = PathBuf::from("/Library/Application Support/com.apple.TCC/TCC.db");
    log::info!(
        "tcc-probe: about to open (FDA probe; consent-flow only) {}",
        path.display()
    );
    let granted = std::fs::File::open(&path).is_ok();
    log::info!("tcc-probe: FDA probe -> granted={granted}");
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

/// The choice the user made when dismissing the FDA onboarding
/// overlay. Stored as the body of the marker file so it survives
/// across launches without needing JSON parsing.
///
///   - `Granted`  → user opened System Settings and toggled FDA on
///                  (detected by our polling). Cross-app reads will
///                  be silent for them.
///   - `Skipped`  → user explicitly clicked "Continue without". They
///                  accepted the per-prompt UX as a deliberate
///                  trade-off. Background paths should be CONSERVATIVE
///                  and avoid cross-app touches except where strictly
///                  necessary.
///   - `Unknown`  → legacy marker (zero-byte file from an earlier
///                  build, before we recorded the choice). Treat as
///                  Skipped — conservative default.
#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FdaOnboardingChoice {
    Granted,
    Skipped,
    Unknown,
}

#[cfg(target_os = "macos")]
impl FdaOnboardingChoice {
    fn as_str(&self) -> &'static str {
        match self {
            FdaOnboardingChoice::Granted => "granted",
            FdaOnboardingChoice::Skipped => "skipped",
            FdaOnboardingChoice::Unknown => "",
        }
    }
    fn parse(raw: &str) -> Self {
        match raw.trim() {
            "granted" | "granted-already" => FdaOnboardingChoice::Granted,
            "skipped" => FdaOnboardingChoice::Skipped,
            _ => FdaOnboardingChoice::Unknown,
        }
    }
}

/// True when the marker file exists (regardless of the recorded
/// choice). Used as the gate for "don't show the FDA screen again"
/// and for [`should_run_cross_app_installs`].
#[cfg(target_os = "macos")]
pub fn has_user_been_through_fda_onboarding() -> bool {
    let Some(path) = fda_onboarded_marker_path() else { return false };
    path.exists()
}

#[cfg(not(target_os = "macos"))]
pub fn has_user_been_through_fda_onboarding() -> bool {
    true
}

/// Returns the user's recorded onboarding choice, or `None` when the
/// marker file is absent. Cheap, reads our own data dir — never
/// triggers TCC.
#[cfg(target_os = "macos")]
pub fn user_fda_choice() -> Option<FdaOnboardingChoice> {
    let path = fda_onboarded_marker_path()?;
    let raw = std::fs::read_to_string(&path).ok()?;
    Some(FdaOnboardingChoice::parse(&raw))
}

/// Drop the marker file with the user's recorded choice. Best-effort
/// — if the write fails (read-only filesystem, permissions, etc.)
/// the next launch just re-shows the onboarding screen, which is
/// harmless.
#[cfg(target_os = "macos")]
pub fn mark_user_through_fda_onboarding(choice: FdaOnboardingChoice) {
    let Some(path) = fda_onboarded_marker_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, choice.as_str().as_bytes());
}

#[cfg(not(target_os = "macos"))]
pub fn mark_user_through_fda_onboarding(_choice: ()) {}

/// True when the canonical data file records EULA acceptance. Reads
/// our own JSON only — never touches another app's data.
///
/// Uses the same path resolver as `commands::data::load_data` so a
/// stale EULA flag in a legacy bundle-id file cannot unlock cross-app
/// work while the UI is showing the welcome / EULA screens.
#[cfg(target_os = "macos")]
fn has_accepted_eula_in_data() -> bool {
    let path = crate::commands::canonical_data_path_static();
    if !path.exists() {
        return false;
    }
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    let Some(settings) = json.get("settings") else {
        return false;
    };
    if settings
        .get("eulaAcceptedRevision")
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64)))
        .map(|n| n > 0)
        .unwrap_or(false)
    {
        return true;
    }
    settings
        .get("eulaAccepted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[cfg(not(target_os = "macos"))]
fn has_accepted_eula_in_data() -> bool {
    true
}

/// True when we're allowed to run startup cross-app writes
/// (native-messaging manifest install, extension-install hints).
/// Also gates browser profile scans and the enforcer tick loop.
///
/// We deliberately do NOT probe Full Disk Access here, because the
/// probe itself (opening
/// `/Library/Application Support/com.apple.TCC/TCC.db`) triggers the
/// macOS Sequoia "ReDD Block would like to access data from other
/// apps" TCC prompt for a non-FDA-granted app — i.e. the very
/// prompt this whole module exists to avoid. Background paths use
/// the marker; the actual FDA detection only runs from the user-
/// initiated FDA polling on the onboarding overlay, where the user
/// has already opted into permissions interactions.
///
/// On non-macOS targets this always returns `true`.
#[cfg(target_os = "macos")]
pub fn should_run_cross_app_installs() -> bool {
    if !has_user_been_through_fda_onboarding() {
        return false;
    }
    if !has_accepted_eula_in_data() {
        log::info!("tcc-probe: deferring cross-app work — EULA not accepted in data file");
        return false;
    }
    true
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_cross_app_installs() -> bool {
    true
}

/// True when the user chose "Grant" during FDA onboarding (i.e. they
/// indicated they want the FDA-granted experience). Used by
/// `scan_safari` to decide whether to read Safari's sandboxed
/// container (silent under FDA, prompt-firing otherwise) and by the
/// reminder banner to decide whether to surface the "Grant Full
/// Disk Access" CTA.
///
/// Note: this reflects the user's RECORDED CHOICE, not the OS's
/// current FDA grant state. If the user originally chose Grant but
/// has since revoked FDA in System Settings, this still returns
/// true. We can't redetect without re-introducing the very probe
/// this design avoids. The trade-off is acceptable: revoking FDA
/// is rare, and users who do it can re-trigger onboarding from a
/// Settings affordance (future work).
#[cfg(target_os = "macos")]
pub fn user_chose_to_grant_fda() -> bool {
    matches!(user_fda_choice(), Some(FdaOnboardingChoice::Granted))
}

#[cfg(not(target_os = "macos"))]
pub fn user_chose_to_grant_fda() -> bool {
    true
}
