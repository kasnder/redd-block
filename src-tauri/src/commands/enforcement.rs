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
    #[cfg(target_os = "macos")]
    let cross_app_ok = crate::cross_app_consent::should_run_cross_app_installs();
    #[cfg(not(target_os = "macos"))]
    let cross_app_ok = true;
    if let Some(h) = slot.as_ref() {
        h.set_enabled(cross_app_ok);
        if !cross_app_ok {
            log::info!("enforcer: enforcer_start ignored — onboarding not complete");
        }
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
/// IMPORTANT: we start the enforcer **paused** when either:
///   - a v1.x → 2.0 migration is pending (same rationale as before), or
///   - on macOS, the user has not yet completed FDA onboarding.
///
/// The enforcer's tick loop reads each running browser's profile data
/// to detect disabled extensions — every read can fire the macOS
/// "access data from other apps" TCC prompt. Defer until the frontend
/// has walked the user through welcome / EULA / FDA and calls
/// `enforcer_start`. See migration UX and `runPostAcceptanceStartup`
/// in app.js.
pub fn auto_start(app: &tauri::AppHandle) {
    use tauri::Manager;
    let h = enforcer::start(app.clone());

    let pending = crate::commands::migration::migration_pending_sync();
    #[cfg(target_os = "macos")]
    let cross_app_ok = crate::cross_app_consent::should_run_cross_app_installs();
    #[cfg(not(target_os = "macos"))]
    let cross_app_ok = true;

    let enabled = !pending && cross_app_ok;
    h.set_enabled(enabled);
    if pending {
        log::info!("enforcer: starting paused (migration onboarding pending)");
    } else if !cross_app_ok {
        log::info!("enforcer: starting paused (FDA onboarding not completed)");
    }

    let state = app.state::<EnforcerState>();
    if let Ok(mut slot) = state.0.lock() {
        *slot = Some(h);
    };
}
