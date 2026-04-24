// Tauri commands that drive the in-process app watcher.
// These replace the helper-mediated `set_blocked_apps_via_helper`
// path once the migration lands.

use std::sync::Mutex;
use tauri::{Manager, State};

use crate::app_watcher::{self, Handle};

pub struct AppWatcherState(pub Mutex<Option<Handle>>);

impl Default for AppWatcherState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

/// Replace the effective blocked-app set. Starts the watcher on first
/// call; subsequent calls update the set in place.
#[tauri::command]
pub fn set_blocked_apps(apps: Vec<String>, state: State<AppWatcherState>) {
    let mut slot = state.0.lock().expect("app-watcher lock");
    if slot.is_none() {
        *slot = Some(app_watcher::start());
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

pub fn register<R: tauri::Runtime>(app: &tauri::App<R>) {
    app.manage(AppWatcherState::default());
}
