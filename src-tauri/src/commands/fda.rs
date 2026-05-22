//! Tauri commands exposed to the frontend for the macOS Full Disk
//! Access onboarding flow.
//!
//! The frontend uses [`check_full_disk_access`] to poll FDA status
//! while the onboarding overlay is visible (auto-advance once granted)
//! and from the persistent banner on the main UI (decide whether to
//! show it). [`complete_fda_onboarding`] is invoked exactly once per
//! user — when they dismiss the onboarding overlay either by granting
//! FDA or by explicitly choosing to skip — and it does two things in
//! one transaction:
//!
//!   1. Writes the `fda-onboarded.v1` marker so the overlay never
//!      shows again on that machine.
//!   2. Force-runs `native_host_install::install` so the deferred
//!      cross-app writes happen now, with the consent gesture (FDA or
//!      acknowledged-skip) already resolved. If FDA is granted these
//!      writes are silent; if the user chose to skip, the per-prompt
//!      dialogs fire here — at a moment the user is expecting them
//!      rather than ambushing them at the next launch.
//!
//! See [`crate::cross_app_consent`] for the gating policy these
//! commands plug into.

use crate::cross_app_consent;

/// Returns `true` when ReDD Block currently has Full Disk Access on
/// macOS. Cheap and side-effect-free — see
/// [`cross_app_consent::has_full_disk_access`] for the probe
/// mechanics. On non-macOS targets this returns `true` (FDA is a
/// macOS concept).
#[tauri::command]
pub fn check_full_disk_access() -> bool {
    cross_app_consent::has_full_disk_access()
}

/// Returns `true` when the user has previously been through the FDA
/// onboarding screen and made a deliberate choice (Grant or Continue
/// without). Used by the frontend on startup to decide whether to
/// show the overlay this launch.
#[tauri::command]
pub fn check_fda_onboarded() -> bool {
    cross_app_consent::has_user_been_through_fda_onboarding()
}

/// Called by the frontend when the user dismisses the FDA onboarding
/// overlay. Records that the user has been through the flow (so it
/// won't show again) and force-runs the cross-app installs that
/// `lib.rs::run` deferred at startup. Returns once those installs
/// complete — the frontend can then proceed to the next screen.
///
/// The `_choice` parameter is recorded only in logs at the moment;
/// the behavioural difference between "granted" and "skipped" is
/// already encoded in whether FDA actually shows as granted on the
/// next [`check_full_disk_access`] call. Keeping the parameter in the
/// signature lets us add per-choice telemetry or differentiated
/// post-onboarding behaviour later without a frontend change.
#[tauri::command]
pub fn complete_fda_onboarding(_choice: String) -> Result<(), String> {
    log::info!(
        "tcc-probe: complete_fda_onboarding called (choice={_choice}, fda_granted={})",
        cross_app_consent::has_full_disk_access()
    );
    #[cfg(target_os = "macos")]
    {
        cross_app_consent::mark_user_through_fda_onboarding();
        // Run the cross-app installs that `lib.rs::run` skipped at
        // startup. We use `install_force` rather than `install`
        // because the marker from Fix A might already exist from a
        // prior run; the user has explicitly asked us to set things
        // up now, so we should actually do the writes.
        if let Err(e) = crate::native_host_install::install_force() {
            log::warn!("post-FDA-onboarding native-host install failed: {e}");
        }
    }
    Ok(())
}
