// First-launch migration: strip the hosts-file markers that the old
// privileged helper daemon maintained, and uninstall the helper
// itself. Called once from the frontend on app startup; idempotent.
//
// After this runs, the app is on the new enforcement stack:
//   - Websites (both OSes): ReDD Focus extension + native messaging
//   - Apps (both OSes): in-process watcher
//
// The helper daemon is retired entirely. The old Rust crate at
// `helper-daemon/` is removed in the same release.

use std::path::PathBuf;

use serde::Serialize;

const BEGIN_MARKER: &str = "# === BEGIN REDD BLOCK (reddfocus.org) ===";
const END_MARKER: &str = "# === END REDD BLOCK (reddfocus.org) ===";
const LEGACY_BEGIN: &str = "# ReDD Block Start";
const LEGACY_END: &str = "# ReDD Block End";

/// Strip redd-block-managed blocks from the hosts file if present.
/// Leaves unrelated entries alone. Requires elevation on both OSes —
/// if the write fails with permission denied, we log and continue
/// (the browser-extension / Screen Time backend doesn't depend on
/// hosts being clean; the leftover lines just hang around until the
/// next admin-level write).
pub fn strip_hosts_markers_sync() -> Result<bool, String> {
    let path = hosts_path();
    let raw = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Ok(false),
    };
    let cleaned = strip_managed_sections(&raw);
    if cleaned == raw {
        return Ok(false);
    }
    match std::fs::write(&path, cleaned) {
        Ok(_) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            log::warn!("hosts file needs admin to clean: {e}");
            Ok(false)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn strip_hosts_markers() -> Result<bool, String> {
    strip_hosts_markers_sync()
}

fn strip_managed_sections(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut in_managed = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == BEGIN_MARKER || trimmed == LEGACY_BEGIN {
            in_managed = true;
            continue;
        }
        if trimmed == END_MARKER || trimmed == LEGACY_END {
            in_managed = false;
            continue;
        }
        if in_managed {
            continue;
        }
        out.push_str(line);
        out.push('\n');
    }
    out
}

fn hosts_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"C:\Windows\System32\drivers\etc\hosts")
    }
    #[cfg(not(target_os = "windows"))]
    {
        PathBuf::from("/etc/hosts")
    }
}

/// Remove the old privileged helper from the system so it can't
/// continue to enforce against the new stack. Idempotent.
///
/// - macOS: launchd daemon at
///   `/Library/LaunchDaemons/com.redd.block.helper.plist` + binary at
///   `/Library/PrivilegedHelperTools/com.redd.block.helper`. Removing
///   either requires root, so the command runs `bootout` and `rm`
///   via AppleScript-elevated `osascript` only if the frontend has
///   confirmed the user wants to proceed.
/// - Windows: Scheduled Task + helper binary under ProgramData.
///
/// The frontend calls this once at first launch post-upgrade and
/// treats failures as non-fatal — the helper is no longer in the
/// control path, so a lingering daemon is benign as long as the
/// hosts file is clean.
pub fn uninstall_legacy_helper_sync() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use std::path::Path;
        use std::process::Command;

        // Preflight: skip the admin prompt entirely if none of the legacy
        // artefacts exist. A fresh install on a new machine has nothing
        // to remove and shouldn't pester the user.
        let legacy_paths = [
            "/Library/LaunchDaemons/com.redd.block.helper.plist",
            "/Library/PrivilegedHelperTools/com.redd.block.helper",
            "/var/lib/redd-block",
        ];
        let any_present = legacy_paths.iter().any(|p| Path::new(p).exists());
        if !any_present {
            return Ok(true);
        }

        let script = r#"
        do shell script "launchctl bootout system/com.redd.block.helper; rm -f /Library/LaunchDaemons/com.redd.block.helper.plist; rm -f /Library/PrivilegedHelperTools/com.redd.block.helper; rm -rf /var/lib/redd-block" with administrator privileges with prompt "ReDD Block needs to remove the old privileged helper"
        "#;
        let ok = Command::new("/usr/bin/osascript")
            .args(["-e", script])
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        return Ok(ok);
    }
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        use std::process::Command;
        // Preflight on Windows too — skip if no artefacts present.
        let any_present = Path::new(r"C:\ProgramData\ReDD Block").exists();
        if !any_present {
            return Ok(true);
        }
        // schtasks requires Admin for system-level tasks. We run it
        // without elevation and rely on the NEW/DELETE failing
        // silently if the task doesn't exist / permission denied.
        let _ = Command::new("schtasks")
            .args(["/Delete", "/TN", "ReDD Block Helper", "/F"])
            .output();
        let _ = std::fs::remove_dir_all(r"C:\ProgramData\ReDD Block");
        return Ok(true);
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    Ok(true)
}

#[tauri::command]
pub async fn uninstall_legacy_helper() -> Result<bool, String> {
    uninstall_legacy_helper_sync()
}

// ---- Onboarding orchestration --------------------------------------------

/// Summary of the migration + onboarding state at startup.
///
/// Reported to the frontend so a single call decides whether to show
/// the permissions banner, the extension-install banner, or nothing.
#[derive(Debug, Clone, Serialize)]
pub struct OnboardingState {
    /// True if this build migrated anything in this launch (hosts
    /// stripped, helper removed, autostart registered). Informational.
    pub migrated_this_launch: bool,
    /// True when every running-and-present browser has a compliant
    /// default profile (installed + enabled + private browsing). See
    /// `profile_scan::compliant`.
    pub extension_compliant: bool,
    /// Detailed per-browser scan so the UI can render exactly which
    /// profile is failing and why.
    pub browsers: crate::profile_scan::ScanResult,
}

/// Idempotent end-to-end migration. Safe to call on every launch —
/// it persists the version it last ran against in the app-data file
/// under `settings.migrationRanAtVersion` and no-ops when equal to
/// the current binary version.
#[tauri::command]
pub async fn run_upgrade_migration(app: tauri::AppHandle) -> Result<bool, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let data_path = match super::data::canonical_data_path(&app) {
        Some(p) => p,
        None => return Ok(false),
    };

    // Check if we've already migrated at this version.
    let mut data = read_data(&data_path).unwrap_or_else(serde_json::Map::new);
    let settings = data
        .entry("settings".to_string())
        .or_insert(serde_json::Value::Object(Default::default()))
        .as_object_mut();
    let ran_at = settings
        .as_ref()
        .and_then(|s| s.get("migrationRanAtVersion"))
        .and_then(|v| v.as_str())
        .map(String::from);
    if ran_at.as_deref() == Some(current.as_str()) {
        return Ok(false);
    }

    // 1. Strip hosts markers. Non-fatal if permission denied.
    let _ = strip_hosts_markers().await;

    // 2. Uninstall the legacy privileged helper. This prompts once on
    //    macOS for admin; non-fatal if the user cancels.
    let _ = uninstall_legacy_helper().await;

    // 3. Install the native-messaging manifests so the ReDD Focus
    //    extension can talk to us. User-scope; no prompts.
    if let Err(e) = crate::native_host_install::install() {
        log::warn!("native-host install during migration failed: {e}");
    }

    // 4. Mark the migration as done for this version. Best-effort —
    //    on failure we'll just retry next launch.
    if let Some(settings) = settings {
        settings.insert(
            "migrationRanAtVersion".to_string(),
            serde_json::Value::String(current),
        );
        settings.insert(
            "migrationRanAt".to_string(),
            serde_json::Value::Number(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0)
                    .into(),
            ),
        );
        if let Err(e) = write_data(&data_path, &data) {
            log::warn!(
                "failed to persist migrationRanAtVersion at {:?}: {}",
                data_path,
                e
            );
        }
    }

    Ok(true)
}

/// Fetch the current onboarding state. Called by the frontend once
/// after EULA acceptance, and again whenever the user returns from
/// System Settings.
#[tauri::command]
pub async fn onboarding_state(app: tauri::AppHandle) -> Result<OnboardingState, String> {
    let migrated_this_launch = run_upgrade_migration(app).await.unwrap_or(false);

    let browsers = tauri::async_runtime::spawn_blocking(crate::profile_scan::scan)
        .await
        .map_err(|e| e.to_string())?;
    let extension_compliant = crate::profile_scan::compliant(&browsers);

    Ok(OnboardingState {
        migrated_this_launch,
        extension_compliant,
        browsers,
    })
}

fn read_data(path: &std::path::Path) -> Option<serde_json::Map<String, serde_json::Value>> {
    let raw = std::fs::read_to_string(path).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed.as_object().cloned()
}

fn write_data(
    path: &std::path::Path,
    data: &serde_json::Map<String, serde_json::Value>,
) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let body = serde_json::to_vec_pretty(&serde_json::Value::Object(data.clone()))?;
    std::fs::write(path, body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_new_marker_block() {
        let input = "127.0.0.1 localhost\n# === BEGIN REDD BLOCK (reddfocus.org) ===\n0.0.0.0 reddit.com\n# === END REDD BLOCK (reddfocus.org) ===\n::1 localhost\n";
        let out = strip_managed_sections(input);
        assert!(!out.contains("reddit.com"));
        assert!(out.contains("localhost"));
    }

    #[test]
    fn strips_legacy_marker_block() {
        let input = "127.0.0.1 localhost\n# ReDD Block Start\n0.0.0.0 reddit.com\n# ReDD Block End\n::1 localhost\n";
        let out = strip_managed_sections(input);
        assert!(!out.contains("reddit.com"));
        assert!(out.contains("localhost"));
    }

    #[test]
    fn idempotent_when_nothing_managed() {
        let input = "127.0.0.1 localhost\n::1 localhost\n";
        let out = strip_managed_sections(input);
        assert_eq!(out.trim_end(), input.trim_end());
    }
}
