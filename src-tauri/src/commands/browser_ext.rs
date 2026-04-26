// Tauri commands for browser-extension-based blocking (Windows path).
//
// The UI calls these during onboarding and background enforcement. All
// commands are desktop-only; on iOS the Screen Time API handles
// enforcement and these commands aren't registered.

use crate::profile_scan;

/// Scan every supported browser profile for ReDD Focus extension
/// compliance. Returns the raw scan result so the UI can render a
/// per-browser status.
#[tauri::command]
pub async fn scan_browser_profiles() -> Result<profile_scan::ScanResult, String> {
    // Spawn on a blocking worker so the synchronous filesystem scan
    // doesn't block the Tauri async runtime.
    tauri::async_runtime::spawn_blocking(profile_scan::scan)
        .await
        .map_err(|e| format!("join error: {e}"))
}

/// True when every running-and-present browser is compliant. Shortcut
/// for the onboarding gate; the UI can also derive this itself from
/// `scan_browser_profiles`.
#[tauri::command]
pub async fn browser_profiles_compliant() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let r = profile_scan::scan();
        profile_scan::compliant(&r)
    })
    .await
    .map_err(|e| format!("join error: {e}"))
}

/// Open a URL specifically in the named browser (rather than the
/// system default). Used by the migration onboarding so clicking
/// "Install" on the Brave row opens Brave's view of the Chrome Web
/// Store, not whatever the user has set as default.
///
/// `browser` keys: "chrome", "brave", "edge", "firefox", "safari".
/// Falls back to opening in the default handler if the browser
/// isn't recognised or the spawn fails — better one ugly default-
/// browser open than a silent no-op.
#[tauri::command]
pub fn open_url_in_browser(browser: String, url: String) -> Result<(), String> {
    // Validate URL scheme up front so we don't pass arbitrary args
    // to the shell. Only http(s) and the App Store macappstore:
    // scheme should reach this command.
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("macappstore://")) {
        return Err("invalid url scheme".into());
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let app_name = match browser.as_str() {
            "chrome" => Some("Google Chrome"),
            "brave" => Some("Brave Browser"),
            "edge" => Some("Microsoft Edge"),
            "firefox" => Some("Firefox"),
            "safari" => Some("Safari"),
            _ => None,
        };
        if let Some(name) = app_name {
            // `open -a <App> <url>` launches the URL in that browser.
            let status = Command::new("/usr/bin/open").args(["-a", name, &url]).status();
            if matches!(status, Ok(s) if s.success()) {
                return Ok(());
            }
        }
        // Fallback: default handler.
        let _ = Command::new("/usr/bin/open").arg(&url).status();
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        // Most Chromium-family browsers register a custom command-line
        // switch and you can launch them by exe name. We fall back to
        // the default handler for anything we can't resolve.
        let exe = match browser.as_str() {
            "chrome" => Some("chrome.exe"),
            "brave" => Some("brave.exe"),
            "edge" => Some("msedge.exe"),
            "firefox" => Some("firefox.exe"),
            _ => None,
        };
        if let Some(exe_name) = exe {
            // `cmd /c start "" "<exe>" "<url>"` lets Windows resolve
            // the exe via App Paths even when not on PATH.
            let status = Command::new("cmd")
                .args(["/c", "start", "", exe_name, &url])
                .status();
            if matches!(status, Ok(s) if s.success()) {
                return Ok(());
            }
        }
        let _ = Command::new("cmd").args(["/c", "start", "", &url]).status();
        return Ok(());
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = browser; // unused
        let _ = url;
        Ok(())
    }
}
