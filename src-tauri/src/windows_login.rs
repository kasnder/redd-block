//! Remove the HKCU Run entry written by `tauri-plugin-autostart`.
//! Used from `redd-block.exe --uninstall` where there is no AppHandle.

use crate::windows_process::hidden_command;

/// Default Run value name from `app.package_info().name` ("ReDD Block").
const AUTOSTART_RUN_VALUE: &str = "ReDD Block";

/// Best-effort: delete the launch-at-login registry value.
pub fn disable_autostart() {
    let _ = hidden_command("reg")
        .args([
            "delete",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            AUTOSTART_RUN_VALUE,
            "/f",
        ])
        .output();
}
