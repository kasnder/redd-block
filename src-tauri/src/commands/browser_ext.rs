// Tauri commands for browser-extension-based blocking (Windows path).
//
// The UI calls these during onboarding and background enforcement. All
// commands are desktop-only; on iOS the Screen Time API handles
// enforcement and these commands aren't registered.

use crate::profile_scan;

/// Scan every supported browser profile for ReDD Focus extension
/// compliance. Returns the raw scan result so the UI can render a
/// per-browser status.
#[tauri::command]
pub async fn scan_browser_profiles() -> Result<profile_scan::ScanResult, String> {
    // Spawn on a blocking worker so the synchronous filesystem scan
    // doesn't block the Tauri async runtime.
    tauri::async_runtime::spawn_blocking(profile_scan::scan)
        .await
        .map_err(|e| format!("join error: {e}"))
}

/// True when every running-and-present browser is compliant. Shortcut
/// for the onboarding gate; the UI can also derive this itself from
/// `scan_browser_profiles`.
#[tauri::command]
pub async fn browser_profiles_compliant() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let r = profile_scan::scan();
        profile_scan::compliant(&r)
    })
    .await
    .map_err(|e| format!("join error: {e}"))
}

