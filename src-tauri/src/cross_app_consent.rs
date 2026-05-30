//! Cross-app consent gating for macOS.
//!
//! ReDD Block writes into Firefox's Application Support tree and
//! `/Applications/Firefox.app` for native-messaging manifests and
//! enterprise policy. Those touches require **Full Disk Access** on
//! Sonoma+/Sequoia.
//!
//! Safari and Chromium website blocking uses **Automation** (Apple
//! Events) instead — no extension scans, no native-host manifests, and
//! no FDA on that path.
//!
//! Policy: FDA is required only for the **Firefox extension** path.
//! The marker `fda-onboarded.v1` records that the user granted FDA;
//! Firefox cross-app installs run after that marker exists and the EULA
//! is accepted. Automation and the enforcer's Safari/Chromium checks
//! need only EULA acceptance.

#[cfg(target_os = "macos")]
use std::path::PathBuf;

/// True when ReDD Block has Full Disk Access on macOS.
///
/// Probes by opening `/Library/Application Support/com.apple.TCC/TCC.db`.
/// On Sequoia this open can surface a TCC prompt for apps without FDA,
/// so call this only from the user-initiated FDA onboarding flow.
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

#[cfg(target_os = "macos")]
fn fda_onboarded_marker_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(base.join("com.reddblock").join("fda-onboarded.v1"))
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FdaOnboardingChoice {
    Granted,
    /// User completed FDA onboarding but later revoked access in
    /// System Settings. Distinct from a missing marker so the UI can
    /// keep nagging without re-running the blocking first-run overlay.
    Revoked,
    Skipped,
    Unknown,
}

#[cfg(target_os = "macos")]
impl FdaOnboardingChoice {
    fn as_str(&self) -> &'static str {
        match self {
            FdaOnboardingChoice::Granted => "granted",
            FdaOnboardingChoice::Revoked => "revoked",
            FdaOnboardingChoice::Skipped => "skipped",
            FdaOnboardingChoice::Unknown => "",
        }
    }
    fn parse(raw: &str) -> Self {
        match raw.trim() {
            "granted" | "granted-already" => FdaOnboardingChoice::Granted,
            "revoked" => FdaOnboardingChoice::Revoked,
            "skipped" => FdaOnboardingChoice::Skipped,
            _ => FdaOnboardingChoice::Unknown,
        }
    }
}

#[cfg(target_os = "macos")]
pub fn has_user_been_through_fda_onboarding() -> bool {
    user_chose_to_grant_fda()
}

#[cfg(not(target_os = "macos"))]
pub fn has_user_been_through_fda_onboarding() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn user_fda_choice() -> Option<FdaOnboardingChoice> {
    let path = fda_onboarded_marker_path()?;
    let raw = std::fs::read_to_string(&path).ok()?;
    Some(FdaOnboardingChoice::parse(&raw))
}

#[cfg(target_os = "macos")]
pub fn mark_user_through_fda_onboarding(choice: FdaOnboardingChoice) {
    let Some(path) = fda_onboarded_marker_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, choice.as_str().as_bytes());
}

#[cfg(target_os = "macos")]
fn mark_fda_onboarding_revoked() {
    mark_user_through_fda_onboarding(FdaOnboardingChoice::Revoked);
}

#[cfg(target_os = "macos")]
pub fn user_fda_was_revoked() -> bool {
    matches!(user_fda_choice(), Some(FdaOnboardingChoice::Revoked))
}

#[cfg(target_os = "macos")]
static FDA_MARKER_RECONCILED: std::sync::Once = std::sync::Once::new();

/// If the marker says FDA was granted but live access is gone, mark it
/// revoked. Shared by the once-per-process startup path and the
/// user-initiated FDA onboarding screen (which may open many times).
#[cfg(target_os = "macos")]
fn reconcile_stale_fda_marker_if_needed() {
    if !matches!(user_fda_choice(), Some(FdaOnboardingChoice::Granted)) {
        return;
    }
    if has_full_disk_access() {
        log::info!("fda-onboarding: marker granted and live FDA probe OK");
        return;
    }
    log::warn!(
        "fda-onboarding: marker says granted but live FDA missing — marking revoked"
    );
    mark_fda_onboarding_revoked();
}

/// If the marker says FDA was granted but System Settings no longer
/// grants it (common after reinstall/rebuild while Application Support
/// persists), drop the stale marker once per process via a live TCC
/// probe. Runtime revocation while the app stays open is handled
/// separately when Safari plist reads return PermissionDenied.
#[cfg(target_os = "macos")]
fn reconcile_stale_fda_marker_once() {
    FDA_MARKER_RECONCILED.call_once(reconcile_stale_fda_marker_if_needed);
}

/// Called when the FDA onboarding overlay opens. Re-runs the marker
/// reconcile + live probe (user-initiated; safe to hit TCC.db).
#[cfg(target_os = "macos")]
pub fn sync_fda_onboarding_access() -> bool {
    reconcile_stale_fda_marker_if_needed();
    has_full_disk_access()
}

#[cfg(not(target_os = "macos"))]
pub fn sync_fda_onboarding_access() -> bool {
    true
}

/// Called from the Safari profile scan when the extension plist is
/// unreadable despite a granted marker — e.g. the user revoked Full
/// Disk Access in System Settings while ReDD Block stayed open.
/// Avoids probing TCC.db on every enforcer tick (which can re-prompt
/// on Sequoia); a PermissionDenied plist read is a safe signal.
#[cfg(target_os = "macos")]
pub fn clear_fda_marker_on_safari_plist_denied() {
    if !matches!(user_fda_choice(), Some(FdaOnboardingChoice::Granted)) {
        return;
    }
    log::warn!(
        "fda-onboarding: Safari extension plist PermissionDenied — marking FDA revoked"
    );
    mark_fda_onboarding_revoked();
}

#[cfg(not(target_os = "macos"))]
pub fn mark_user_through_fda_onboarding(_choice: ()) {}

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

/// True when we can read Firefox's profile metadata — the practical
/// signal that Full Disk Access is working for the Firefox extension
/// path. Unlike opening TCC.db this reflects real cross-app access and
/// works in dev when FDA is granted to Cursor/Terminal rather than the
/// packaged `.app` or debug binary.
#[cfg(target_os = "macos")]
pub fn firefox_profile_data_accessible() -> bool {
    let Some(home) = dirs::home_dir() else {
        return false;
    };
    let root = home.join("Library/Application Support/Firefox");
    root.is_dir() && std::fs::read(root.join("profiles.ini")).is_ok()
}

#[cfg(not(target_os = "macos"))]
pub fn firefox_profile_data_accessible() -> bool {
    true
}

/// True when Firefox profile scans / cross-app installs may run: the
/// onboarding marker says granted, or a live read of `profiles.ini`
/// succeeds right now.
#[cfg(target_os = "macos")]
pub fn firefox_fda_effective() -> bool {
    user_chose_to_grant_fda() || firefox_profile_data_accessible()
}

#[cfg(not(target_os = "macos"))]
pub fn firefox_fda_effective() -> bool {
    true
}

/// True when Firefox native-host / policy installs may run (FDA marker
/// + EULA). On macOS this is the only cross-app install path left —
/// Chromium/Safari use Automation instead of extension manifests.
#[cfg(target_os = "macos")]
pub fn should_run_firefox_cross_app_installs() -> bool {
    if !has_accepted_eula_in_data() {
        log::info!("tcc-probe: deferring Firefox cross-app work — EULA not accepted in data file");
        return false;
    }
    firefox_fda_effective()
}

/// True when cross-app installs may run. On macOS this is Firefox-only
/// ([`should_run_firefox_cross_app_installs`]); other platforms install
/// for every supported browser.
#[cfg(target_os = "macos")]
pub fn should_run_cross_app_installs() -> bool {
    should_run_firefox_cross_app_installs()
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_cross_app_installs() -> bool {
    true
}

/// True when the in-process enforcer loop may run (EULA only on macOS).
/// Safari/Chromium are judged via Automation; Firefox extension scans
/// are skipped until FDA is granted (see enforcer tick).
#[cfg(target_os = "macos")]
pub fn should_run_enforcer() -> bool {
    should_run_web_automation()
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_enforcer() -> bool {
    true
}

/// True when the macOS website-automation watcher may run.
///
/// Unlike `should_run_cross_app_installs`, this deliberately does NOT
/// require Full Disk Access: driving Safari/Chromium via Apple Events
/// needs only the per-browser Automation TCC grant, which the watcher
/// itself surfaces on the first event during an active block — never
/// FDA. Gating the automation backend behind FDA would silently break
/// website blocking for exactly the users who decline FDA, which is the
/// opposite of the point (automation is the FDA-free replacement for the
/// Safari/Chromium extension). We still defer until the EULA is accepted
/// so we never script browsers before the user has agreed to anything.
#[cfg(target_os = "macos")]
pub fn should_run_web_automation() -> bool {
    if !has_accepted_eula_in_data() {
        log::info!("tcc-probe: deferring web automation — EULA not accepted in data file");
        return false;
    }
    true
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_web_automation() -> bool {
    true
}

#[cfg(target_os = "macos")]
pub fn user_chose_to_grant_fda() -> bool {
    reconcile_stale_fda_marker_once();
    matches!(user_fda_choice(), Some(FdaOnboardingChoice::Granted))
}

#[cfg(not(target_os = "macos"))]
pub fn user_chose_to_grant_fda() -> bool {
    true
}

/// Whether profile scans may run for the setup banner and onboarding UI.
///
/// After EULA acceptance we run lightweight presence scans for
/// Safari/Chromium (Automation path) without FDA. Full Firefox profile
/// reads still require FDA — see `scan_for_onboarding`. If the user
/// completed FDA onboarding but later revoked access, we still scan
/// so the banner can nag.
#[cfg(target_os = "macos")]
pub fn should_run_profile_scans() -> bool {
    if has_accepted_eula_in_data() {
        return true;
    }
    user_fda_was_revoked()
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_profile_scans() -> bool {
    true
}
