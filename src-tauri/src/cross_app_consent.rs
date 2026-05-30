//! Cross-app consent gating for macOS.
//!
//! Safari and Chromium website blocking uses **Automation** (Apple
//! Events). Firefox uses the ReDD Focus extension with **manual**
//! install on macOS — no Full Disk Access onboarding and no silent
//! native-host / enterprise-policy writes.

#[cfg(target_os = "macos")]
use std::path::PathBuf;

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

/// True when we can read Firefox's profile metadata (optional signal for
/// diagnostics; not a consent gate).
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

/// macOS: never auto-install Firefox native-host manifests or policy.
#[cfg(target_os = "macos")]
pub fn should_run_firefox_cross_app_installs() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_firefox_cross_app_installs() -> bool {
    true
}

/// macOS: no silent cross-app installs (Firefox is manual).
#[cfg(target_os = "macos")]
pub fn should_run_cross_app_installs() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_cross_app_installs() -> bool {
    true
}

/// True when the in-process enforcer loop may run (EULA on macOS).
#[cfg(target_os = "macos")]
pub fn should_run_enforcer() -> bool {
    should_run_web_automation()
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_enforcer() -> bool {
    true
}

/// True when the macOS website-automation watcher may run (EULA only).
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

/// Whether profile scans may run for the setup banner and onboarding UI.
#[cfg(target_os = "macos")]
pub fn should_run_profile_scans() -> bool {
    has_accepted_eula_in_data()
}

#[cfg(not(target_os = "macos"))]
pub fn should_run_profile_scans() -> bool {
    true
}
