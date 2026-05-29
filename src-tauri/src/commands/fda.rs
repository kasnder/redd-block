//! Tauri commands for the macOS Full Disk Access onboarding flow.
//!
//! FDA is required on macOS. The frontend blocks on the overlay until
//! [`check_full_disk_access`] returns true, then calls
//! [`complete_fda_onboarding`] once to write the marker and run the
//! deferred cross-app installs.

use crate::cross_app_consent;

#[tauri::command]
pub fn check_full_disk_access() -> bool {
    cross_app_consent::has_full_disk_access()
}

/// True when the user completed FDA onboarding **and** live Full Disk
/// Access is still granted. Stale markers from a prior install are
/// cleared automatically when the live probe fails.
#[tauri::command]
pub fn check_fda_onboarded() -> bool {
    cross_app_consent::user_chose_to_grant_fda()
}

/// True when completing FDA onboarding will run the deferred ReDD Focus
/// browser install (extension hints). False on revisit once
/// `extension-hints-installed.v1` exists — native-host manifest refresh
/// may still run but is not what the FDA status line describes.
#[tauri::command]
pub fn fda_deferred_focus_install_pending() -> bool {
    #[cfg(target_os = "macos")]
    {
        !crate::extension_install::startup_install_already_done()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Recorded onboarding choice — kept for diagnostics; only `granted`
/// unlocks cross-app work.
#[tauri::command]
pub fn get_fda_user_choice() -> String {
    #[cfg(target_os = "macos")]
    {
        match cross_app_consent::user_fda_choice() {
            Some(cross_app_consent::FdaOnboardingChoice::Granted) => "granted".to_string(),
            Some(cross_app_consent::FdaOnboardingChoice::Revoked) => "revoked".to_string(),
            Some(cross_app_consent::FdaOnboardingChoice::Skipped) => "skipped".to_string(),
            Some(cross_app_consent::FdaOnboardingChoice::Unknown) => String::new(),
            None => String::new(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "granted".to_string()
    }
}

/// Called once FDA is granted during onboarding. Writes the marker and
/// runs deferred native-host + extension-install work.
#[tauri::command]
pub fn complete_fda_onboarding(choice: String) -> Result<(), String> {
    log::info!("tcc-probe: complete_fda_onboarding called (choice={choice})");
    #[cfg(target_os = "macos")]
    {
        if choice != "granted" && choice != "granted-already" {
            return Err("Full Disk Access is required on macOS".to_string());
        }
        if !cross_app_consent::has_full_disk_access() {
            return Err("Full Disk Access is not granted yet".to_string());
        }
        cross_app_consent::mark_user_through_fda_onboarding(
            cross_app_consent::FdaOnboardingChoice::Granted,
        );
        if let Err(e) = crate::native_host_install::install_force() {
            log::warn!("post-FDA-onboarding native-host install failed: {e}");
        }
        if !crate::extension_install::startup_install_already_done() {
            if let Err(e) = crate::extension_install::install() {
                log::warn!("post-FDA-onboarding extension-install hint failed: {e}");
            } else {
                crate::extension_install::mark_startup_install_done();
            }
        }
    }
    Ok(())
}
