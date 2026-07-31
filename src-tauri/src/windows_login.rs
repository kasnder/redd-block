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
    for name in crate::product_identity::LEGACY_AUTOSTART_RUN_VALUES {
        delete_run_value(name);
    }
}
