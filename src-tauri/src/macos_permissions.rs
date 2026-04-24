// macOS TCC permission helpers.
//
// The in-process app watcher drives AppleScript `System Events` to
// hide blocked apps. That needs the Automation TCC permission to be
// granted by the user. We don't need elevated privileges or a helper
// daemon — Automation is a per-app, user-granted runtime permission.
//
// Flow:
//   1. During onboarding, call `check_automation_permission()`.
//   2. If not granted, `request_automation_permission()` triggers a
//      real Apple Event so macOS shows the TCC dialog.
//   3. If the user denies, `open_automation_settings()` deep-links
//      into System Settings → Privacy & Security → Automation.

#![cfg(target_os = "macos")]

use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionStatus {
    /// We've confirmed we can send Apple Events to System Events.
    Granted,
    /// The user has denied Automation access for System Events.
    Denied,
    /// Haven't been prompted yet — status is unknown.
    NotDetermined,
}

/// Probe whether we have Automation access to `System Events` without
/// triggering the TCC prompt. Runs a harmless AppleScript; if it
/// succeeds we're granted, if it errors with an authorization failure
/// we're denied, if it fails some other way we treat it as unknown.
#[tauri::command]
pub fn check_automation_permission() -> PermissionStatus {
    let script = r#"tell application "System Events" to get (count of application processes)"#;
    match Command::new("/usr/bin/osascript")
        .args(["-e", script])
        .output()
    {
        Ok(o) if o.status.success() => PermissionStatus::Granted,
        Ok(o) => {
            let err = String::from_utf8_lossy(&o.stderr);
            // macOS surfaces denial as "Not authorized to send Apple
            // events to System Events." (errAEEventNotPermitted = -1743).
            if err.contains("not authorized")
                || err.contains("Not authorized")
                || err.contains("-1743")
            {
                PermissionStatus::Denied
            } else {
                PermissionStatus::NotDetermined
            }
        }
        Err(_) => PermissionStatus::NotDetermined,
    }
}

/// Trigger the Automation TCC prompt. macOS shows the prompt on the
/// first Apple Event to `System Events` per app; this call forces
/// that first event. If the user previously denied, the prompt does
/// not re-appear — they must go into System Settings. Use
/// `open_automation_settings` as the fallback.
#[tauri::command]
pub fn request_automation_permission() -> PermissionStatus {
    let _ = Command::new("/usr/bin/osascript")
        .args(["-e", r#"tell application "System Events" to get (count of application processes)"#])
        .output();
    check_automation_permission()
}

/// Open System Settings → Privacy & Security → Automation.
#[tauri::command]
pub fn open_automation_settings() {
    // The x-apple.systempreferences URL opens the panel directly.
    // On macOS 13+ it lands in the correct subsection; on older
    // macOS it lands one level up, which is acceptable.
    let _ = Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Automation")
        .output();
}

/// Open System Settings → Privacy & Security → Accessibility. Some
/// users want to toggle Accessibility even though we primarily need
/// Automation; Accessibility is the related panel and deep-linking
/// there is a useful fallback.
#[tauri::command]
pub fn open_accessibility_settings() {
    let _ = Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .output();
}
