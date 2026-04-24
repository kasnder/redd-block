// First-launch migration: strip the hosts-file markers that the old
// privileged helper daemon maintained, and uninstall the helper
// itself. Called once from the frontend on app startup; idempotent.
//
// After this runs, the app is on the new enforcement stack:
//   - macOS 14+: Screen Time for websites, in-process watcher for apps
//   - Windows:   browser extension + native host, in-process watcher
//                for apps
//
// The helper daemon is retired entirely. The old Rust crate at
// `helper-daemon/` is removed in the same release.

use std::path::PathBuf;

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
#[tauri::command]
pub async fn strip_hosts_markers() -> Result<bool, String> {
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
            // Expected when the app runs unprivileged and no one has
            // already cleaned the file.
            log::warn!("hosts file needs admin to clean: {e}");
            Ok(false)
        }
        Err(e) => Err(e.to_string()),
    }
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
#[tauri::command]
pub async fn uninstall_legacy_helper() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
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
        use std::process::Command;
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
