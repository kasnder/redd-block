//! System diagnostics — single command that returns a structured
//! snapshot of the app's runtime state. Replaces the v1.x-era
//! `get_helper_diagnostics` which only reported `{version, "extension"}`.
//!
//! Surface area kept *small*: things a user or support engineer
//! would actually want to see when the app is misbehaving. We
//! deliberately avoid putting tray-state, window-position, or
//! other internals in here — they're noise.

use serde::Serialize;

use crate::native_host;
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
    /// Human-readable list of v1.x leftover items found on disk
    /// right now. Empty when fully clean.
    pub residue_items: Vec<String>,
    /// True if /etc/hosts.redd-backup (or Windows equivalent) exists,
    /// signalling this install ever ran v1.x. Kept around as a
    /// recovery copy by design — does NOT count as residue.
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

/// Snapshot of what's actually being enforced right now. The
/// `domains` / `blocks` fields are produced by reusing
/// `native_host::derive_payload` — i.e. literally the same function
/// that pushes the blocklist to the browser extension on every
/// frame. The `apps` list is read straight out of the in-process
/// app watcher's effective set. Both fields are derived data, never
/// recomputed from scratch in this module.
#[derive(Debug, Clone, Serialize)]
pub struct CurrentBlocking {
    /// Flat, deduped, lowercase domain list — what the extension
    /// receives in `{ "blocklist": [...] }`.
    pub domains: Vec<String>,
    /// Per-block breakdown: which blocklist contributed the domains,
    /// whether the source is an `activeBlock` (one-off) or a
    /// `schedule`, and the segment's start/end timestamps. Sorted
    /// ascending by `endsAt`.
    pub blocks: Vec<native_host::BlockInfo>,
    /// Effective blocked-app set the in-process watcher will kill on
    /// its next poll tick. Empty when no blocked apps are active or
    /// the watcher has not been started.
    pub apps: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppDataInfo {
    /// Canonical path of redd-block-data.json (for display).
    pub path: Option<String>,
    /// File contents reformatted via serde_json so the user sees a
    /// pretty, deterministic view (helps eyeball schedules / active
    /// blocks / pause state). Falls back to the raw file content if
    /// the file is not parseable JSON, and is None if the file could
    /// not be read.
    pub pretty_json: Option<String>,
    /// Populated only when reading the file failed.
    pub error: Option<String>,
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
    /// What's *actually* being enforced at the time this struct is
    /// built — domains pushed to the browser extension and apps
    /// loaded into the watcher.
    pub current_blocking: CurrentBlocking,
    /// Snapshot of the on-disk app-data file. Surfaced so the user
    /// (or a support engineer) can sanity-check what blocklists,
    /// active blocks, schedules, and pause state are persisted right
    /// now without poking around in the filesystem.
    pub app_data: AppDataInfo,
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
    let current_blocking = collect_current_blocking(&app);
    let app_data = collect_app_data_info(&app);

    SystemDiagnostics {
        app: app_info,
        migration,
        browsers,
        enforcer,
        autostart,
        #[cfg(target_os = "windows")]
        watchdog,
        recent_log,
        current_blocking,
        app_data,
    }
}

/// Build a snapshot of what's currently being enforced. Reuses
/// `native_host::derive_payload` for domains (single source of truth
/// for the extension push) and reads the in-memory app-watcher set
/// for apps — no re-derivation is done here.
fn collect_current_blocking(app: &tauri::AppHandle) -> CurrentBlocking {
    let (domains, blocks) = match super::canonical_data_path(app) {
        Some(p) => native_host::derive_payload(&p),
        None => (Vec::new(), Vec::new()),
    };
    let apps = collect_current_blocked_apps(app);
    CurrentBlocking { domains, blocks, apps }
}

/// Read the watcher's currently effective blocked-app set. Returns
/// empty when the watcher has not been started yet (no app blocks
/// have ever been activated this session).
fn collect_current_blocked_apps(app: &tauri::AppHandle) -> Vec<String> {
    use tauri::Manager;
    let state = app.state::<super::app_blocking::AppWatcherState>();
    let slot = match state.0.lock() {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    slot.as_ref().map(|h| h.current_apps()).unwrap_or_default()
}

/// Read the canonical redd-block-data.json and return a pretty-
/// printed copy plus its path, for display in the diagnostics modal.
fn collect_app_data_info(app: &tauri::AppHandle) -> AppDataInfo {
    let path = super::canonical_data_path(app);
    let path_str = path.as_ref().map(|p| p.display().to_string());

    let p = match path {
        Some(p) => p,
        None => {
            return AppDataInfo {
                path: path_str,
                pretty_json: None,
                error: Some("canonical app-data path unavailable".to_string()),
            };
        }
    };

    let raw = match std::fs::read_to_string(&p) {
        Ok(s) => s,
        Err(e) => {
            return AppDataInfo {
                path: path_str,
                pretty_json: None,
                error: Some(format!("failed to read {}: {e}", p.display())),
            };
        }
    };

    let pretty = serde_json::from_str::<serde_json::Value>(&raw)
        .ok()
        .and_then(|v| serde_json::to_string_pretty(&v).ok())
        .unwrap_or(raw);

    AppDataInfo {
        path: path_str,
        pretty_json: Some(pretty),
        error: None,
    }
}

fn collect_migration_info(app: &tauri::AppHandle) -> MigrationInfo {
    let residue_items = current_residue_items();
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
        residue_items,
        came_from_v1x,
        ran_at_version,
        ran_at_ms,
    }
}

/// Enumerate what v1.x leftovers are on disk RIGHT NOW. Returns a
/// list of human-readable item descriptions; empty when fully clean.
/// Mirrors the checks `migration::migration_pending_sync` makes but
/// reports specifics so the diagnostics UI can show the user exactly
/// what's still around.
fn current_residue_items() -> Vec<String> {
    let mut items = vec![];

    let hosts_path = if cfg!(target_os = "windows") {
        r"C:\Windows\System32\drivers\etc\hosts"
    } else {
        "/etc/hosts"
    };
    if let Ok(raw) = std::fs::read_to_string(hosts_path) {
        let has_markers = raw.lines().any(|l| {
            let t = l.trim();
            t == "# === BEGIN REDD BLOCK (reddfocus.org) ==="
                || t == "# === END REDD BLOCK (reddfocus.org) ==="
                || t == "# ReDD Block Start"
                || t == "# ReDD Block End"
        });
        if has_markers {
            items.push(format!("v1.x markers in {hosts_path}"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        for path in [
            "/Library/LaunchDaemons/com.redd.block.helper.plist",
            "/Library/LaunchDaemons/org.reddfocus.redd-block-helper.plist",
            "/Library/PrivilegedHelperTools/com.redd.block.helper",
            "/var/lib/redd-block/helper-state.json",
        ] {
            if std::path::Path::new(path).exists() {
                items.push(path.to_string());
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        let p = r"C:\ProgramData\ReDD Block\helper-state.json";
        if std::path::Path::new(p).exists() {
            items.push(p.to_string());
        }
    }

    items
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
