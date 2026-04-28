//! Safari Full Disk Access onboarding.
//!
//! ReDD Block verifies Safari's extension state by reading Safari's
//! `Extensions.plist`. macOS protects Safari's container with Full
//! Disk Access, so the UI uses these commands to check whether the
//! file is readable and to open the right System Settings pane.

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
