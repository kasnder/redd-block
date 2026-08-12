//! Safari extension setup: Full Disk Access probe and settings deep-links.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SafariFdaAccess {
    pub granted: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn check_safari_fda_access() -> SafariFdaAccess {
    #[cfg(target_os = "macos")]
    {
        let path = crate::profile_scan::safari_extensions_plist_path();
        let Some(path) = path else {
            return SafariFdaAccess {
                granted: false,
                path: None,
                error: Some("Could not resolve Safari extension settings path".to_string()),
            };
        };
        match std::fs::read(&path) {
            Ok(_) => SafariFdaAccess {
                granted: true,
                path: Some(path.display().to_string()),
                error: None,
            },
            Err(e) => SafariFdaAccess {
                granted: false,
                path: Some(path.display().to_string()),
                error: Some(e.to_string()),
            },
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        SafariFdaAccess {
            granted: true,
            path: None,
            error: None,
        }
    }
}

#[tauri::command]
pub fn sync_safari_fda_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        crate::cross_app_consent::sync_safari_fda_access()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
pub fn complete_safari_fda_onboarding() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if !crate::cross_app_consent::safari_extensions_plist_readable() {
            return Err("Full Disk Access is not granted yet".to_string());
        }
        crate::cross_app_consent::mark_safari_fda_granted();
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub fn open_safari_fda_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
            .output()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(())
    }
}

/// Deep-link Safari → Settings → Extensions (best-effort; App Store
/// extension may need manual navigation).
#[tauri::command]
pub fn open_safari_extension_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if crate::safari_services::open_extension_settings(
            crate::native_host_install::SAFARI_EXT_ID,
        )
        .is_ok()
        {
            return Ok(());
        }

        log::warn!(
            "SafariServices showPreferencesForExtension failed, trying AppleScript fallback"
        );
        super::browser_ext::open_safari_extensions_settings_applescript().map_err(|e| {
            format!(
                "Could not open Safari extension settings automatically ({e}). \
                     Open Safari → Settings → Extensions manually."
            )
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Safari is macOS-only".to_string())
    }
}
