// Force-install hints for the ReDD Focus browser extension.
//
// Drops a per-user External-Extensions hint that tells each Chromium-
// family browser to auto-install the ReDD Focus extension from the
// Chrome Web Store on next launch. No admin / UAC, no policy lock-in
// (extension is removable from `chrome://extensions` like any other
// store install).
//
// macOS / Linux: a one-line JSON file under the browser's user data dir.
// Windows: a `HKCU\Software\<vendor>\<browser>\Extensions\<ext-id>` registry
// key with an `update_url` value.
//
// Mirrors the structure of `native_host_install.rs` so the install /
// uninstall lifecycle hooks are symmetric.
//
// Firefox sideload (`.xpi` to `~/Library/.../Mozilla/Extensions/...`)
// is *not* in this module yet — see `browser-ext-migration/FORCE_INSTALL_EXTENSIONS.md`
// for the deferred plan; needs a bundled signed XPI.
//
// Safari is out of scope (native bundle handles its own extension).

use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;

use crate::native_host_install::CHROMIUM_EXT_ID;

/// Update URL the browser fetches the extension `.crx` from. The Chrome
/// Web Store URL works for Chrome and Brave directly; Edge accepts it
/// when the user has "Allow extensions from other stores" toggled
/// on. Worst case for Edge users without that toggle: nothing happens
/// and the existing per-browser onboarding step still runs.
pub const CHROMIUM_UPDATE_URL: &str = "https://clients2.google.com/service/update2/crx";

#[derive(Debug, Clone, Copy, Serialize)]
pub enum BrowserTarget {
    Chrome,
    Brave,
    Edge,
}

impl BrowserTarget {
    fn all() -> [BrowserTarget; 3] {
        [BrowserTarget::Chrome, BrowserTarget::Brave, BrowserTarget::Edge]
    }

    /// User-data-dir-relative External Extensions directory on macOS /
    /// Linux. Returns `None` if we can't resolve the user's home dir.
    /// On Windows this is unused — the registry path is the install
    /// surface there.
    #[cfg(not(target_os = "windows"))]
    fn external_extensions_dir(self) -> Option<PathBuf> {
        let home = dirs::home_dir()?;
        #[cfg(target_os = "macos")]
        {
            let p = match self {
                BrowserTarget::Chrome => "Library/Application Support/Google/Chrome/External Extensions",
                BrowserTarget::Brave => "Library/Application Support/BraveSoftware/Brave-Browser/External Extensions",
                BrowserTarget::Edge => "Library/Application Support/Microsoft Edge/External Extensions",
            };
            Some(home.join(p))
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            // Linux Chromium-family: the External Extensions dir lives
            // alongside the user-data-dir at `~/.config/<browser>/External Extensions/`.
            // Not officially supported (no helper / no in-process
            // watcher on Linux either), but we fill the matching path
            // to keep the cfg surface honest.
            let p = match self {
                BrowserTarget::Chrome => ".config/google-chrome/External Extensions",
                BrowserTarget::Brave => ".config/BraveSoftware/Brave-Browser/External Extensions",
                BrowserTarget::Edge => ".config/microsoft-edge/External Extensions",
            };
            Some(home.join(p))
        }
    }

    /// HKCU registry key path for the browser's per-extension hint on
    /// Windows. The browser reads `update_url` from this key on launch
    /// and, if absent, fetches + installs the extension from the store.
    #[cfg(target_os = "windows")]
    fn registry_extension_key(self, ext_id: &str) -> String {
        match self {
            BrowserTarget::Chrome => format!(r"Software\Google\Chrome\Extensions\{ext_id}"),
            BrowserTarget::Brave => format!(r"Software\BraveSoftware\Brave-Browser\Extensions\{ext_id}"),
            BrowserTarget::Edge => format!(r"Software\Microsoft\Edge\Extensions\{ext_id}"),
        }
    }
}

/// Drop the External-Extensions hint for every supported browser.
/// Idempotent — running it on every app launch keeps the hint
/// in place and re-creates it if the user removed it manually.
pub fn install() -> std::io::Result<()> {
    for browser in BrowserTarget::all() {
        if let Err(e) = install_one(browser) {
            // Don't fail the whole operation for a single browser
            // (e.g. browser not installed at all). Log + continue.
            log::warn!("extension-install hint for {browser:?} failed: {e}");
        }
    }
    Ok(())
}

/// Remove the install hint for every supported browser. Safe to call
/// even if the hint was never written.
pub fn uninstall() -> std::io::Result<()> {
    for browser in BrowserTarget::all() {
        if let Err(e) = uninstall_one(browser) {
            log::warn!("extension-uninstall hint for {browser:?} failed: {e}");
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn install_one(browser: BrowserTarget) -> std::io::Result<()> {
    let dir = browser.external_extensions_dir().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            "cannot resolve external-extensions dir",
        )
    })?;

    // Skip if the parent (user-data-dir) doesn't exist — no point
    // populating a hint for a browser that's never been launched.
    // The browser creates `External Extensions/` lazily on first
    // launch, so we may need to create it here. The parent dir is
    // proxy for "browser has profile state on this machine".
    let Some(parent) = dir.parent() else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "external-extensions dir has no parent",
        ));
    };
    if !parent.exists() {
        log::info!(
            "extension-install: skipping {browser:?} — no profile dir at {}",
            parent.display()
        );
        return Ok(());
    }

    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{CHROMIUM_EXT_ID}.json"));
    let body = json!({ "external_update_url": CHROMIUM_UPDATE_URL });
    std::fs::write(&path, serde_json::to_vec_pretty(&body)?)?;
    log::info!("extension-install: hint written for {browser:?} at {}", path.display());
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn uninstall_one(browser: BrowserTarget) -> std::io::Result<()> {
    let dir = browser.external_extensions_dir().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            "cannot resolve external-extensions dir",
        )
    })?;
    let path = dir.join(format!("{CHROMIUM_EXT_ID}.json"));
    if path.exists() {
        std::fs::remove_file(&path)?;
        log::info!("extension-uninstall: hint removed for {browser:?}");
    }
    // Leave the External Extensions directory itself alone — the
    // browser may have other entries we shouldn't touch.
    Ok(())
}

#[cfg(target_os = "windows")]
fn install_one(browser: BrowserTarget) -> std::io::Result<()> {
    let key_path = browser.registry_extension_key(CHROMIUM_EXT_ID);
    write_hkcu_named_value(&key_path, "update_url", CHROMIUM_UPDATE_URL)?;
    log::info!("extension-install: hint written for {browser:?} at HKCU\\{key_path}");
    Ok(())
}

#[cfg(target_os = "windows")]
fn uninstall_one(browser: BrowserTarget) -> std::io::Result<()> {
    let key_path = browser.registry_extension_key(CHROMIUM_EXT_ID);
    let _ = delete_hkcu_key(&key_path);
    Ok(())
}

#[cfg(target_os = "windows")]
fn write_hkcu_named_value(path: &str, value_name: &str, value: &str) -> std::io::Result<()> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
        REG_OPTION_NON_VOLATILE, REG_SZ,
    };

    unsafe {
        let mut hkey: HKEY = HKEY::default();
        let subkey = to_wide(path);
        let status = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            Some(0),
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut hkey,
            None,
        );
        if status != ERROR_SUCCESS {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("RegCreateKeyExW failed: {status:?}"),
            ));
        }
        let name_wide = to_wide(value_name);
        let data_wide = to_wide(value);
        let bytes_len = (data_wide.len() * 2) as u32;
        let data_bytes = std::slice::from_raw_parts(
            data_wide.as_ptr() as *const u8,
            bytes_len as usize,
        );
        let status = RegSetValueExW(
            hkey,
            PCWSTR(name_wide.as_ptr()),
            Some(0),
            REG_SZ,
            Some(data_bytes),
        );
        let _ = RegCloseKey(hkey);
        if status != ERROR_SUCCESS {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("RegSetValueExW failed: {status:?}"),
            ));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn delete_hkcu_key(path: &str) -> std::io::Result<()> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegDeleteKeyW, HKEY_CURRENT_USER};

    unsafe {
        let wide = to_wide(path);
        let status = RegDeleteKeyW(HKEY_CURRENT_USER, PCWSTR(wide.as_ptr()));
        if status != ERROR_SUCCESS {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("RegDeleteKeyW failed: {status:?}"),
            ));
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn to_wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Tauri command — exposed for manual re-trigger from the UI (e.g. an
/// onboarding "Reinstall hints" button) and for tests. Production
/// install also runs automatically on every app launch (`lib.rs::run`).
#[tauri::command]
pub fn install_extension_hints() -> Result<(), String> {
    install().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn uninstall_extension_hints() -> Result<(), String> {
    uninstall().map_err(|e| e.to_string())
}
