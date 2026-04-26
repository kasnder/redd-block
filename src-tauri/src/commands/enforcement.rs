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
/// the user doesn't fix it within the grace window.
///
/// IMPORTANT: when a v1.x → 2.0 migration is pending or just completed,
/// we start the enforcer **paused**. Otherwise the user upgrades, gets
/// an admin prompt, accepts, hasn't yet installed the browser
/// extension — and 30-60 s later the enforcer kills their browser with
/// no context. The frontend resumes the enforcer (via
/// `enforcer_start`) once the user has dismissed the post-migration
/// onboarding screen. See migration UX in app.js.
pub fn auto_start(app: &tauri::AppHandle) {
    use tauri::Manager;
    let h = enforcer::start(app.clone());

    // If there's v1.x residue on disk at startup, hold the enforcer
    // until the frontend's migration onboarding completes and calls
    // enforcer_start. Migration runs in-process during the same
    // launch, so even after residue is cleaned the enforcer stays
    // paused until the user dismisses the post-cleanup welcome
    // screen.
    let pending = crate::commands::migration::migration_pending_sync();
    h.set_enabled(!pending);
    if pending {
        log::info!("enforcer: starting paused (migration onboarding pending)");
    }

    let state = app.state::<EnforcerState>();
    if let Ok(mut slot) = state.0.lock() {
        *slot = Some(h);
    };
}
