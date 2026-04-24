// Compatibility shim preserving the old helper-based command names.
//
// The frontend (`src/app.js`) calls things like `start_block_via_helper`
// and `set_blocked_apps_via_helper`. Rather than re-wiring the whole
// frontend in a single pass, we keep those command names and route
// them to the new backends:
//
//   - Website blocking on macOS → Screen Time plugin
//   - Website blocking on Windows → native host + extension (the app
//     doesn't need to do anything synchronously; the native host reads
//     the data file directly and reacts)
//   - App blocking (both OSes) → in-process app watcher
//
// The frontend can be migrated piecemeal away from these shims in a
// follow-up; in the meantime the old call sites keep working.

use serde::{Deserialize, Serialize};
use tauri::State;

use super::app_blocking::AppWatcherState;

// ---- Status / lifecycle ---------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperStatus {
    pub installed: bool,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub version_ok: bool,
}

/// Reports the app itself as "the helper" now. Always "installed and
/// running" while the app is alive. Returned `version_ok: true` so
/// the frontend's helper-ready gate passes.
#[tauri::command]
pub fn check_helper_status() -> HelperStatus {
    HelperStatus {
        installed: true,
        running: true,
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        version_ok: true,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl HelperResult {
    fn ok() -> Self { Self { success: true, error: None } }
    #[allow(dead_code)]
    fn err(msg: impl Into<String>) -> Self {
        Self { success: false, error: Some(msg.into()) }
    }
}

/// Legacy helper-install prompt. No longer needed — the app is
/// self-contained. Kept as a no-op so the onboarding UI doesn't error.
#[tauri::command]
pub fn install_helper() -> HelperResult { HelperResult::ok() }

/// Legacy helper-uninstall. Routed to `uninstall_legacy_helper` in
/// `migration.rs` when frontend calls this during cleanup.
#[tauri::command]
pub async fn uninstall_helper() -> HelperResult {
    match super::migration::uninstall_legacy_helper().await {
        Ok(_) => HelperResult::ok(),
        Err(e) => HelperResult::err(e),
    }
}

// ---- Website blocking -----------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[allow(non_snake_case)]
pub struct StartBlockArgs {
    pub domains: Vec<String>,
    #[serde(default)]
    pub endTime: Option<u64>,
    #[serde(default)]
    pub blocklistId: Option<String>,
}

/// Website blocking entry point.
///
/// macOS: push into Screen Time via the plugin.
/// Windows: no synchronous action required — the native host running
///          alongside the extension reads redd-block-data.json and
///          derives the blocklist directly. The app just needs to have
///          persisted the active block (which `save_data` already did
///          before this call).
#[tauri::command]
pub async fn start_block_via_helper(
    args: StartBlockArgs,
    #[allow(unused_variables)] app: tauri::AppHandle,
) -> HelperResult {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_screentime::ScreentimeExt;
        let screentime = app.screentime();
        let req = tauri_plugin_screentime::BlockWebsitesRequest {
            domains: args.domains.clone(),
        };
        match screentime.block_websites(req) {
            Ok(r) if r.success => return HelperResult::ok(),
            Ok(r) => return HelperResult { success: false, error: Some(format!("Screen Time reported {} blocked", r.blocked_count)) },
            Err(e) => return HelperResult::err(e.to_string()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = args;
        HelperResult::ok()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[allow(non_snake_case)]
pub struct ClearBlockArgs {
    #[serde(default)]
    pub blocklistId: Option<String>,
}

#[tauri::command]
pub async fn clear_block_via_helper(
    args: ClearBlockArgs,
    #[allow(unused_variables)] app: tauri::AppHandle,
) -> HelperResult {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_screentime::ScreentimeExt;
        let screentime = app.screentime();
        match screentime.unblock_websites() {
            Ok(_) => return HelperResult::ok(),
            Err(e) => return HelperResult::err(e.to_string()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = args;
        HelperResult::ok()
    }
}

#[tauri::command]
pub async fn block_websites(
    args: StartBlockArgs,
    app: tauri::AppHandle,
) -> HelperResult {
    start_block_via_helper(args, app).await
}

// ---- App blocking ---------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct SetAppsArgs {
    pub apps: Vec<String>,
}

#[tauri::command]
pub fn set_blocked_apps_via_helper(args: SetAppsArgs, state: State<AppWatcherState>) -> HelperResult {
    super::app_blocking::set_blocked_apps(args.apps, state);
    HelperResult::ok()
}

// ---- Schedules + blocks broadcast ---------------------------------------

/// The frontend pushes the full `schedules` array here after every
/// edit. The helper used to persist and evaluate them server-side.
/// Now the frontend (or the native-host / Screen Time plugin) is the
/// evaluator. This shim just acknowledges.
#[tauri::command]
pub fn set_schedules_via_helper(_schedules: serde_json::Value) -> HelperResult { HelperResult::ok() }

#[tauri::command]
pub fn set_blocks_via_helper(_blocks: serde_json::Value) -> HelperResult { HelperResult::ok() }

#[tauri::command]
pub fn set_keep_blocking_on_uninstall_via_helper(_value: bool) -> HelperResult {
    // Feature dropped in this release (see MIGRATION_PLAN.md).
    HelperResult::ok()
}

#[tauri::command]
pub fn set_log_pings_via_helper(_value: bool) -> HelperResult { HelperResult::ok() }

// ---- Hosts-file cleanup / diagnostics ----------------------------------

#[tauri::command]
pub async fn clean_hosts_file() -> HelperResult {
    match super::migration::strip_hosts_markers().await {
        Ok(_) => HelperResult::ok(),
        Err(e) => HelperResult::err(e),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct HelperDiagnostics {
    pub app_version: String,
    pub backend: &'static str,
}

#[tauri::command]
pub fn get_helper_diagnostics() -> HelperDiagnostics {
    let backend = if cfg!(target_os = "macos") {
        "screentime"
    } else if cfg!(target_os = "windows") {
        "extension"
    } else {
        "unsupported"
    };
    HelperDiagnostics {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        backend,
    }
}
