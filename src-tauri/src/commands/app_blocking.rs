// Tauri commands that drive the in-process app watcher.
// These replace the helper-mediated `set_blocked_apps_via_helper`
// path once the migration lands.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

use crate::app_watcher::{self, Handle};

pub struct AppWatcherState(pub Mutex<Option<Handle>>);

impl Default for AppWatcherState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

/// Replace the effective blocked-app set. Starts the watcher on first
/// call; subsequent calls update the set in place. The `AppHandle` is
/// captured so the watcher can emit warning events and pin the main
/// window — see `app_watcher::start`.
#[tauri::command]
pub fn set_blocked_apps(app: AppHandle, apps: Vec<String>, state: State<AppWatcherState>) {
    let mut slot = state.0.lock().expect("app-watcher lock");
    if slot.is_none() {
        *slot = Some(app_watcher::start(Some(app)));
    }
    if let Some(h) = slot.as_ref() {
        h.set_apps(apps);
    }
}

/// Stop the watcher and clear the blocked set.
#[tauri::command]
pub fn clear_blocked_apps(state: State<AppWatcherState>) {
    let mut slot = state.0.lock().expect("app-watcher lock");
    if let Some(h) = slot.take() {
        h.stop();
    }
}

/// User clicked the single “bring apps forward & quit again” control.
/// `pids` are the processes currently shown in the warning overlay.
#[tauri::command]
pub fn app_blocking_bring_forward_then_quit_again(pids: Vec<u32>) {
    crate::app_watcher::user_request_activate_then_polite_quit_round(&pids);
}

pub fn register<R: tauri::Runtime>(app: &tauri::App<R>) {
    app.manage(AppWatcherState::default());
}
