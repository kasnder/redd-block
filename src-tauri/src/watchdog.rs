// Per-user Scheduled Task that respawns the app if the user kills it
// from Task Manager. Closes the bypass window to ~60 s without needing
// admin or a Windows Service.
//
// Layout (three files next to the exe):
//   - `redd-block-watchdog.cmd` — `tasklist` + `start ""`, only spawns
//     redd-block.exe if it isn't already running. Avoids duplicate
//     instances without needing tauri-plugin-single-instance.
//   - `redd-block-watchdog.vbs` — runs the .cmd with WScript.Shell.Run
//     `intWindowStyle = 0` (SW_HIDE). Routing through wscript.exe is
//     the canonical way to suppress the cmd-window flash when a
//     Scheduled Task fires a console action — `cmd.exe` (or even
//     `powershell -WindowStyle Hidden`) flashes a console because the
//     window is created before any hide flag is applied. wscript.exe
//     has no console at all, and SW_HIDE keeps the spawned cmd hidden.
//   - `\ReDD Block Watchdog` Scheduled Task: action is
//     `wscript.exe "<path>\redd-block-watchdog.vbs"`, every minute,
//     current user, no admin.
//
// The app calls `register()` at every startup so a tampered-with task
// (deleted by the user, stale path after manual relocation) gets
// reinstated. `unregister()` is called on `redd-block.exe --uninstall`
// and from the NSIS pre-uninstall hook, and removes both wrapper
// files plus the task.
//
// Limits: a determined user with Task Scheduler open can disable this
// task too. Real tamper-proofing requires kernel-mode protection,
// which the migration deliberately moved away from.

use std::path::PathBuf;

use crate::windows_process::hidden_command;

pub const TASK_NAME: &str = "ReDD Block Watchdog";
const WRAPPER_CMD_FILENAME: &str = "redd-block-watchdog.cmd";
const WRAPPER_VBS_FILENAME: &str = "redd-block-watchdog.vbs";

fn install_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.to_path_buf())
}

fn write_wrappers(exe_name: &str, dir: &PathBuf) -> std::io::Result<PathBuf> {
    // %~dp0 expands to the directory of the .cmd, so the script is
    // path-independent — survives a manual move of the install dir.
    let cmd_body = format!(
        "@echo off\r\n\
         tasklist /FI \"IMAGENAME eq {exe}\" /NH | find /I \"{exe}\" >nul\r\n\
         if errorlevel 1 start \"\" \"%~dp0{exe}\"\r\n",
        exe = exe_name
    );
    std::fs::write(dir.join(WRAPPER_CMD_FILENAME), cmd_body)?;

    // VBS resolves its own dir + invokes the sibling .cmd hidden.
    // The four-double-quote sequence `""""` is a VBS literal for a
    // single `"` — used to wrap the .cmd path in case it contains
    // spaces (e.g. `C:\Program Files\ReDD Block\`).
    let vbs_body: String = [
        r#"dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)"#,
        &format!(
            r#"CreateObject("WScript.Shell").Run """" & dir & "\{cmd}""", 0, False"#,
            cmd = WRAPPER_CMD_FILENAME
        ),
        "",
    ]
    .join("\r\n");
    let vbs_path = dir.join(WRAPPER_VBS_FILENAME);
    std::fs::write(&vbs_path, vbs_body)?;
    Ok(vbs_path)
}

/// Idempotent: writes the wrapper scripts and (re)registers the task.
/// Best-effort — failures are logged but never propagated, since a
/// missing watchdog shouldn't block the app from running.
pub fn register() {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            log::warn!("watchdog: cannot resolve current_exe: {e}");
            return;
        }
    };
    let exe_name = match exe.file_name().and_then(|n| n.to_str()) {
        Some(n) => n.to_string(),
        None => {
            log::warn!("watchdog: exe has no file name");
            return;
        }
    };
    let dir = match install_dir() {
        Some(d) => d,
        None => {
            log::warn!("watchdog: cannot derive install dir");
            return;
        }
    };

    let vbs_path = match write_wrappers(&exe_name, &dir) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("watchdog: failed to write wrappers under {}: {}", dir.display(), e);
            return;
        }
    };

    // Task action invokes wscript.exe with the .vbs — no console flash.
    let task_run = format!("wscript.exe \"{}\"", vbs_path.display());
    let out = hidden_command("schtasks")
        .args([
            "/Create",
            "/TN",
            TASK_NAME,
            "/TR",
            &task_run,
            "/SC",
            "MINUTE",
            "/MO",
            "1",
            "/RL",
            "LIMITED",
            "/F",
        ])
        .output();
    match out {
        Ok(o) if o.status.success() => log::info!("watchdog: task registered ({task_run})"),
        Ok(o) => log::warn!(
            "watchdog: schtasks /Create exit {:?}: {}",
            o.status.code(),
            String::from_utf8_lossy(&o.stderr).trim()
        ),
        Err(e) => log::warn!("watchdog: schtasks failed to spawn: {e}"),
    }
}

/// True if the per-user Scheduled Task is currently registered with
/// the Task Scheduler. Best-effort — failures (schtasks not found,
/// permission denied) are treated as "not present" rather than
/// crashing the diagnostics readout.
pub fn is_registered() -> bool {
    hidden_command("schtasks")
        .args(["/Query", "/TN", TASK_NAME])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Idempotent: removes the task and both wrapper scripts if present.
pub fn unregister() {
    let _ = hidden_command("schtasks")
        .args(["/Delete", "/TN", TASK_NAME, "/F"])
        .output();
    if let Some(dir) = install_dir() {
        let _ = std::fs::remove_file(dir.join(WRAPPER_CMD_FILENAME));
        let _ = std::fs::remove_file(dir.join(WRAPPER_VBS_FILENAME));
    }
}
