// Tauri commands for browser-extension-based blocking (Windows path).
//
// The UI calls these during onboarding and background enforcement. All
// commands are desktop-only; on iOS the Screen Time API handles
// enforcement and these commands aren't registered.

use tauri::{AppHandle, Manager};

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

/// Force the app to the foreground after a focus-stealing modal
/// (osascript admin prompt, file picker, etc.). Tauri's
/// `window.set_focus` from JS calls `makeKeyAndOrderFront` but does
/// NOT call `NSApp.activate(ignoringOtherApps:)` — required when
/// the app is sitting in Accessory mode (no Dock icon) so there's
/// no Dock click to bring the process back to the front.
#[tauri::command]
pub fn activate_app(window: tauri::Window) {
    reveal_app(&window.app_handle());
}

/// Show the main window and put the app in Regular activation
/// policy (Dock icon + menu bar visible). Used by the tray click,
/// the dock-icon Reopen handler, the "Reopen Main Window" menu
/// item, and the enforcer when it surfaces compliance alerts.
pub fn reveal_app(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        // Promote to Regular *before* showing so the window comes up
        // alongside the Dock icon / app menu instead of flashing
        // without them.
        crate::set_macos_activation_policy(true);
        use cocoa::appkit::NSApp;
        use cocoa::base::YES;
        use objc::{msg_send, sel, sel_impl};
        unsafe {
            #[allow(unexpected_cfgs)]
            let app = NSApp();
            let _: () = msg_send![app, activateIgnoringOtherApps: YES];
        }
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Hide the main window to the tray and drop the macOS Dock icon /
/// menu bar (Accessory activation policy). Invoked from the
/// custom title-bar close button in the frontend; the Cmd-Q and
/// red-X paths go through `should_terminate` and the
/// `CloseRequested` handler respectively, both of which apply the
/// same policy flip directly.
#[tauri::command]
pub fn hide_main_window(window: tauri::Window) {
    let app = window.app_handle().clone();
    let app_for_main = app.clone();
    // Both `NSWindow.orderOut` and `setActivationPolicy:` should
    // happen on the AppKit main thread, so dispatch there.
    let _ = app.run_on_main_thread(move || {
        if let Some(main) = app_for_main.get_webview_window("main") {
            let _ = main.hide();
        }
        #[cfg(target_os = "macos")]
        crate::set_macos_activation_policy(false);
    });
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

/// Open the browser's extension-management UI so the user can enable
/// ReDD Focus or allow it in private/incognito windows.
#[tauri::command]
pub fn open_browser_extension_settings(browser: String) -> Result<(), String> {
    let browser = browser.trim();
    let normalized = browser.to_ascii_lowercase();
    let chromium_id = crate::native_host_install::CHROMIUM_EXT_ID;
    let url = match normalized.as_str() {
        "firefox" => "about:addons".to_string(),
        _ => format!("chrome://extensions/?id={chromium_id}"),
    };

    #[cfg(target_os = "macos")]
    {
        if normalized == "safari" {
            // Safari extensions are managed in Safari > Settings > Extensions.
            // Use osascript to open the Extensions pane directly.
            let script = concat!(
                "tell application \"Safari\" to activate\n",
                "delay 0.3\n",
                "tell application \"System Events\"\n",
                "  tell process \"Safari\"\n",
                "    keystroke \",\" using command down\n",
                "    delay 0.5\n",
                "    click button \"Extensions\" of toolbar 1 of window 1\n",
                "  end tell\n",
                "end tell\n",
            );
            let out = std::process::Command::new("osascript")
                .args(["-e", script])
                .output()
                .map_err(|e| format!("osascript: {e}"))?;
            if !out.status.success() {
                // If AppleScript failed (e.g. no accessibility permission),
                // fall back to just activating Safari.
                log::warn!(
                    "osascript for Safari settings failed ({}), activating Safari",
                    String::from_utf8_lossy(&out.stderr).trim()
                );
                let _ = std::process::Command::new("/usr/bin/open")
                    .args(["-a", "Safari"])
                    .output();
            }
            return Ok(());
        }

        let app_name = match normalized.as_str() {
            "brave" => "Brave Browser",
            "edge" => "Microsoft Edge",
            "firefox" => "Firefox",
            _ => "Google Chrome",
        };
        let out = std::process::Command::new("/usr/bin/open")
            .args(["-a", app_name, &url])
            .output()
            .map_err(|e| format!("spawn /usr/bin/open: {e}"))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(format!(
                "`open -a {app_name}` exited with {}: {}",
                out.status,
                stderr.trim()
            ));
        }
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        // Reuse the same exe-path lookup that profile_scan uses for
        // install detection.  Launching the browser directly (instead
        // of `cmd /c start`) avoids slow PATH searches and ensures
        // chrome:// URLs aren't mangled by cmd's argument parser.
        let exe = profile_scan::find_browser_exe(&normalized)
            .ok_or_else(|| format!("Could not find {browser} executable"))?;
        std::process::Command::new(&exe)
            .arg(&url)
            .spawn()
            .map_err(|e| format!("launch {}: {e}", exe.display()))?;
        Ok(())
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = url;
        Err("open_browser_extension_settings unsupported on this platform".into())
    }
}

/// Open a specific URL in a specific browser.  Used by the enforcer
/// "Install ReDD Focus" button so the store page opens in the correct
/// browser instead of triggering the OS "choose an app" dialog.
#[tauri::command]
pub fn open_url_in_browser(browser: String, url: String) -> Result<(), String> {
    let normalized = browser.trim().to_ascii_lowercase();

    #[cfg(target_os = "macos")]
    {
        let app_name = match normalized.as_str() {
            "brave" => "Brave Browser",
            "edge" => "Microsoft Edge",
            "firefox" => "Firefox",
            "safari" => "Safari",
            _ => "Google Chrome",
        };
        std::process::Command::new("/usr/bin/open")
            .args(["-a", app_name, &url])
            .output()
            .map_err(|e| format!("open -a {app_name}: {e}"))?;
        Ok(())
    }

    #[cfg(target_os = "windows")]
    {
        let exe = profile_scan::find_browser_exe(&normalized)
            .ok_or_else(|| format!("Could not find {browser} executable"))?;
        std::process::Command::new(&exe)
            .arg(&url)
            .spawn()
            .map_err(|e| format!("launch {}: {e}", exe.display()))?;
        Ok(())
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = (url, normalized);
        Err("open_url_in_browser unsupported on this platform".into())
    }
}
