//! System diagnostics — single command that returns a structured
//! snapshot of the app's runtime state. Replaces the v1.x-era
//! `get_helper_diagnostics` which only reported `{version, "extension"}`.
//!
//! Surface area kept *small*: things a user or support engineer
//! would actually want to see when the app is misbehaving. We
//! deliberately avoid putting tray-state, window-position, or
//! other internals in here — they're noise.

use serde::Serialize;

use crate::profile_scan;

#[derive(Debug, Clone, Serialize)]
pub struct AppInfo {
    pub version: String,
    pub build_mode: &'static str,
    pub os: &'static str,
    pub arch: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct MigrationInfo {
    /// True if residue (hosts markers or daemon-specific files) is
    /// still on disk RIGHT NOW.
    pub residue_present: bool,
    /// True if residue was on disk when the app launched (snapshot).
    pub residue_at_launch: bool,
    /// True if /etc/hosts.redd-backup (or Windows equivalent) exists,
    /// signalling this install ever ran v1.x.
    pub came_from_v1x: bool,
    /// Last value the in-app migration stamped into settings.
    pub ran_at_version: Option<String>,
    /// Unix-millis of the last in-app migration completion. None
    /// when the .pkg preinstall did the cleanup (no in-app run).
    pub ran_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnforcerInfo {
    pub grace_seconds: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AutostartInfo {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[cfg(target_os = "windows")]
pub struct WatchdogInfo {
    pub task_present: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemDiagnostics {
    pub app: AppInfo,
    pub migration: MigrationInfo,
    pub browsers: profile_scan::ScanResult,
    pub enforcer: EnforcerInfo,
    pub autostart: AutostartInfo,
    #[cfg(target_os = "windows")]
    pub watchdog: WatchdogInfo,
    /// Last N lines of the rolling app log, newest last. Empty in
    /// release builds (we only enable tauri-plugin-log in debug).
    pub recent_log: Vec<String>,
}

#[tauri::command]
pub fn get_system_diagnostics(app: tauri::AppHandle) -> SystemDiagnostics {
    let app_info = AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        build_mode: if cfg!(debug_assertions) { "debug" } else { "release" },
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    };

    let migration = collect_migration_info(&app);
    let browsers = profile_scan::scan();
    let enforcer = EnforcerInfo {
        grace_seconds: super::grace::get_extension_grace_seconds(app.clone()),
    };
    let autostart = AutostartInfo {
        enabled: autostart_enabled(&app),
    };

    #[cfg(target_os = "windows")]
    let watchdog = WatchdogInfo {
        task_present: crate::watchdog::is_registered(),
    };

    let recent_log = read_recent_log_lines(50);

    SystemDiagnostics {
        app: app_info,
        migration,
        browsers,
        enforcer,
        autostart,
        #[cfg(target_os = "windows")]
        watchdog,
        recent_log,
    }
}

fn collect_migration_info(app: &tauri::AppHandle) -> MigrationInfo {
    let residue_present = super::migration::migration_pending_sync();
    let residue_at_launch = super::migration::migration_was_pending_at_launch();
    let came_from_v1x = super::migration::user_came_from_v1x();

    let settings_json = super::canonical_data_path(app)
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|j| j.get("settings").cloned());
    let ran_at_version = settings_json
        .as_ref()
        .and_then(|s| s.get("migrationRanAtVersion"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let ran_at_ms = settings_json
        .as_ref()
        .and_then(|s| s.get("migrationRanAt"))
        .and_then(|v| v.as_u64());

    MigrationInfo {
        residue_present,
        residue_at_launch,
        came_from_v1x,
        ran_at_version,
        ran_at_ms,
    }
}

fn autostart_enabled(app: &tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Read up to `max_lines` lines from the back of the tauri-plugin-log
/// rolling file. Path conventions vary slightly per platform; we
/// query a few candidate dirs and take the newest .log file.
fn read_recent_log_lines(max_lines: usize) -> Vec<String> {
    let candidates = log_dir_candidates();
    let mut log_files: Vec<std::path::PathBuf> = candidates
        .iter()
        .filter_map(|d| std::fs::read_dir(d).ok())
        .flat_map(|rd| rd.flatten())
        .map(|e| e.path())
        .filter(|p| p.extension().map(|e| e == "log").unwrap_or(false))
        .collect();

    log_files.sort_by_key(|p| {
        std::fs::metadata(p)
            .and_then(|m| m.modified())
            .ok()
            .unwrap_or(std::time::UNIX_EPOCH)
    });

    let newest = match log_files.last() {
        Some(p) => p.clone(),
        None => return Vec::new(),
    };

    let raw = match std::fs::read_to_string(&newest) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let lines: Vec<&str> = raw.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].iter().map(|s| s.to_string()).collect()
}

fn log_dir_candidates() -> Vec<std::path::PathBuf> {
    let mut out = vec![];
    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "macos")]
        out.push(home.join("Library/Logs/com.reddblock"));
        #[cfg(target_os = "windows")]
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            out.push(std::path::PathBuf::from(local).join(r"com.reddblock\logs"));
        }
        let _ = &home;
    }
    out
}
