//! Safari extension settings deep-link.
//!
//! Opens Safari → Settings → Extensions for the bundled ReDD Focus
//! extension via SafariServices (no Full Disk Access required).

/// Deep-link Safari to the row for the bundled ReDD Focus extension
/// in Settings → Extensions, via SafariServices'
/// `SFSafariApplication.showPreferencesForExtension`.
///
/// Used in place of the older AppleScript-driven approach
/// (`commands::browser_ext::open_browser_extension_settings`'s
/// Safari branch), which sends Cmd+, plus a UI-element click and
/// therefore needs Accessibility permission. SafariServices needs
/// neither Accessibility nor Full Disk Access — it's the API Apple
/// designed for host apps to surface their own extension's prefs.
///
/// Only works when called from the registered main executable of
/// the host bundle (i.e. the `redd-block` binary inside the bundled
/// `.app`). Running outside an installed `.app` (e.g. `cargo tauri
/// dev`) returns `extensionNotFound` — the frontend falls back to
/// the AppleScript path in that case.
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
        super::browser_ext::open_safari_extensions_settings_applescript()
            .map_err(|e| {
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
