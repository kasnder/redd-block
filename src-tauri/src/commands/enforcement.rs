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

/// Auto-start the enforcer at app launch. The enforcer scans browsers
/// every 5 s for missing/disabled extensions and quits the browser if
/// the user doesn't fix it within the grace window. There's no reason
/// to gate this behind a frontend opt-in — if ReDD Block is running,
/// blocking is enforced.
pub fn auto_start(app: &tauri::AppHandle) {
    use tauri::Manager;
    let h = enforcer::start(app.clone());
    h.set_enabled(true);
    let state = app.state::<EnforcerState>();
    if let Ok(mut slot) = state.0.lock() {
        *slot = Some(h);
    };
}
