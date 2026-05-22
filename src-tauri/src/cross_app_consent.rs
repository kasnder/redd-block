//! Cross-app consent gating for macOS.
//!
//! ReDD Block writes into other apps' Application Support trees
//! (native-messaging manifests, extension-install hints) and reads
//! Safari's sandboxed container to detect extension state. On macOS
//! Sonoma+/Sequoia those touches require **Full Disk Access**.
//!
//! Policy: FDA is required. The onboarding overlay blocks until the
//! user grants FDA; we record that as `granted` in `fda-onboarded.v1`.
//! Cross-app work (installs, profile scans, enforcer) runs only after
//! that marker exists **and** the EULA is accepted in the canonical
//! data file. There is no "continue without FDA" path.

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

/// True when cross-app installs, profile scans, and the enforcer may run.
#[cfg(target_os = "macos")]
pub fn should_run_cross_app_installs() -> bool {
    if !user_chose_to_grant_fda() {
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

#[cfg(target_os = "macos")]
pub fn user_chose_to_grant_fda() -> bool {
    matches!(user_fda_choice(), Some(FdaOnboardingChoice::Granted))
}

#[cfg(not(target_os = "macos"))]
pub fn user_chose_to_grant_fda() -> bool {
    true
}
