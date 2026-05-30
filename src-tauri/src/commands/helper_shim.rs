// Compatibility shim preserving the old helper-based command names.
//
// The frontend (`src/app.js`) calls things like `start_block_via_helper`
// and `set_blocked_apps_via_helper`. Rather than re-wiring the whole
// frontend in a single pass, we keep those command names and route
// them to the new backends:
//
//   - Website blocking (both OSes) → browser extension via the
//     native messaging host. On Chromium/Firefox the host is this
//     binary in `--native-host` mode; on Safari (macOS) the host is
//     SafariWebExtensionHandler.swift inside the signed .app. Either
//     way the host re-reads redd-block-data.json and re-derives the
//     blocklist when the file changes — the app just has to have
//     persisted via `save_data`, which the frontend already did
//     before calling this command.
//   - App blocking (both OSes) → in-process app watcher.
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

/// Website blocking entry point.
///
/// No synchronous action is required — the native-messaging host
/// running alongside the extension (and SafariWebExtensionHandler on
/// Safari) re-reads `redd-block-data.json` and re-derives the
/// blocklist whenever the file changes. The frontend has already
/// called `save_data` before invoking this, so we just acknowledge.
#[tauri::command]
pub async fn start_block_via_helper(_app: tauri::AppHandle) -> HelperResult {
    HelperResult::ok()
}

#[tauri::command]
pub async fn clear_block_via_helper(_app: tauri::AppHandle) -> HelperResult {
    HelperResult::ok()
}

#[tauri::command]
pub async fn block_websites(app: tauri::AppHandle) -> HelperResult {
    start_block_via_helper(app).await
}

// ---- App blocking ---------------------------------------------------------

#[tauri::command]
pub fn set_blocked_apps_via_helper(
    app: tauri::AppHandle,
    apps: Vec<String>,
    newly_added: Vec<String>,
    state: State<AppWatcherState>,
) -> HelperResult {
    super::app_blocking::set_blocked_apps(app, apps, newly_added, state);
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
    // macOS drives Safari + Chromium through Automation (Apple Events);
    // Firefox alone still rides the extension + enforcer. Windows keeps
    // every browser on the extension.
    let backend = if cfg!(target_os = "macos") {
        "automation"
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
