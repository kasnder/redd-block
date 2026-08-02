//! Remove the HKCU Run entry written by `tauri-plugin-autostart`.
//! Used from `redd-block.exe --uninstall` where there is no AppHandle.

use crate::windows_process::hidden_command;

fn delete_run_value(name: &str) {
    let _ = hidden_command("reg")
        .args([
            "delete",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            name,
            "/f",
        ])
        .output();
}

/// Best-effort: delete the launch-at-login registry value(s), including
/// legacy product names from prior rebrands.
pub fn disable_autostart() {
    delete_run_value(crate::product_identity::AUTOSTART_RUN_VALUE);
    scrub_legacy_autostart_run_values();
}

/// Best-effort: delete only the legacy-name Run values left behind by a
/// prior rebrand. The current value is rewritten by the autostart
/// self-heal on every launch, but nothing else removes the old-name
/// entry — after an update it lingers in Task Manager → Startup as a
/// broken "ReDD Blocker" item pointing at a deleted exe path.
pub fn scrub_legacy_autostart_run_values() {
    for name in crate::product_identity::LEGACY_AUTOSTART_RUN_VALUES {
        delete_run_value(name);
    }
}
