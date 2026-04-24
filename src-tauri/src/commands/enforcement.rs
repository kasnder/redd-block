// Tauri commands that control the in-process enforcer loop.

use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::enforcer::{self, EnforcerHandle};

pub struct EnforcerState(pub Mutex<Option<EnforcerHandle>>);

impl Default for EnforcerState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

/// Start the enforcer loop if not already running. Idempotent.
#[tauri::command]
pub fn enforcer_start(app: AppHandle, state: State<EnforcerState>) {
    let mut slot = state.0.lock().expect("enforcer lock");
    if slot.is_none() {
        *slot = Some(enforcer::start(app));
    }
    if let Some(h) = slot.as_ref() {
        h.set_enabled(true);
    }
}

/// Pause the enforcer without tearing it down. Timers reset.
#[tauri::command]
pub fn enforcer_pause(state: State<EnforcerState>) {
    if let Some(h) = state.0.lock().expect("enforcer lock").as_ref() {
        h.set_enabled(false);
    }
}

/// Register the enforcer state on the app so commands can access it.
pub fn register<R: tauri::Runtime>(app: &tauri::App<R>) {
    app.manage(EnforcerState::default());
}
