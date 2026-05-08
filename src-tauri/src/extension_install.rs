// Force-install hints for the ReDD Focus browser extension.
//
// Two install surfaces, one per browser family:
//
// - **Chromium-family** (Chrome / Brave / Edge): drop a per-user
//   External-Extensions hint pointing at the Chrome Web Store. Browser
//   auto-installs on next launch. macOS / Linux: a one-line JSON file
//   under the browser's user data dir. Windows: `HKCU\Software\<vendor>\<browser>\Extensions\<ext-id>`
//   registry key with an `update_url` value.
//
// - **Firefox**: sideload the signed `.xpi` (bundled with ReDD Block as
//   a Tauri resource — see `src-tauri/resources/README.md` for how to
//   refresh it from AMO) into the user-level Firefox Extensions dir.
//   Firefox shows a one-time "Allow this extension?" prompt on next
//   launch. As light-touch as Firefox supports without admin.
//
// Mirrors the structure of `native_host_install.rs` so the install /
// uninstall lifecycle hooks are symmetric.
//
// Safari is out of scope (native bundle handles its own extension).

use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

use crate::native_host_install::{CHROMIUM_EXT_ID, FIREFOX_EXT_ID};

/// Update URL the browser fetches the extension `.crx` from. The Chrome
/// Web Store URL works for Chrome and Brave directly; Edge accepts it
/// when the user has "Allow extensions from other stores" toggled
/// on. Worst case for Edge users without that toggle: nothing happens
/// and the existing per-browser onboarding step still runs.
pub const CHROMIUM_UPDATE_URL: &str = "https://clients2.google.com/service/update2/crx";

/// Firefox's app GUID — constant. The user-level Extensions sideload
/// directory for Firefox is keyed on this GUID; any signed XPI dropped
/// in there gets picked up on next Firefox launch (with a one-time
/// "Allow this extension?" prompt).
const FIREFOX_APP_GUID: &str = "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}";

/// Filename of the bundled Firefox extension under
/// `src-tauri/resources/`. Refresh by downloading the latest signed
/// XPI from AMO — see `src-tauri/resources/README.md`.
const FIREFOX_BUNDLED_XPI: &str = "redd-focus.xpi";

#[derive(Debug, Clone, Copy, Serialize)]
pub enum BrowserTarget {
    Chrome,
    Brave,
    Edge,
    Firefox,
}

impl BrowserTarget {
    fn all() -> [BrowserTarget; 4] {
        [
            BrowserTarget::Chrome,
            BrowserTarget::Brave,
            BrowserTarget::Edge,
            BrowserTarget::Firefox,
        ]
    }

    /// User-data-dir-relative External Extensions directory for the
    /// Chromium-family entries on macOS / Linux. Firefox uses a
    /// different mechanism — see `firefox_extensions_dir`. Returns
    /// `None` for Firefox (caller must dispatch).
    #[cfg(not(target_os = "windows"))]
    fn external_extensions_dir(self) -> Option<PathBuf> {
        let home = dirs::home_dir()?;
        #[cfg(target_os = "macos")]
        {
            let p = match self {
                BrowserTarget::Chrome => "Library/Application Support/Google/Chrome/External Extensions",
                BrowserTarget::Brave => "Library/Application Support/BraveSoftware/Brave-Browser/External Extensions",
                BrowserTarget::Edge => "Library/Application Support/Microsoft Edge/External Extensions",
                BrowserTarget::Firefox => return None,
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
                BrowserTarget::Firefox => return None,
            };
            Some(home.join(p))
        }
    }

    /// HKCU registry key path for the browser's per-extension hint on
    /// Windows (Chromium-family only). The browser reads `update_url`
    /// from this key on launch and, if absent, fetches + installs the
    /// extension from the store. Returns `None` for Firefox.
    #[cfg(target_os = "windows")]
    fn registry_extension_key(self, ext_id: &str) -> Option<String> {
        match self {
            BrowserTarget::Chrome => Some(format!(r"Software\Google\Chrome\Extensions\{ext_id}")),
            BrowserTarget::Brave => Some(format!(r"Software\BraveSoftware\Brave-Browser\Extensions\{ext_id}")),
            BrowserTarget::Edge => Some(format!(r"Software\Microsoft\Edge\Extensions\{ext_id}")),
            BrowserTarget::Firefox => None,
        }
    }
}

/// User-level Firefox Extensions directory — Firefox watches this on
/// startup and offers to install any signed XPI keyed under the
/// browser's app GUID. Same shape on macOS / Linux / Windows; only
/// the prefix differs.
fn firefox_extensions_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let home = dirs::home_dir()?;
        Some(
            home.join("Library/Application Support/Mozilla/Extensions")
                .join(FIREFOX_APP_GUID),
        )
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var_os("APPDATA").map(PathBuf::from)?;
        Some(appdata.join("Mozilla/Firefox/Extensions").join(FIREFOX_APP_GUID))
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let home = dirs::home_dir()?;
        Some(
            home.join(".mozilla/firefox/extensions")
                .join(FIREFOX_APP_GUID),
        )
    }
}

/// Drop the install hint for every supported browser. Idempotent —
/// running it on every app launch keeps the hints in place and
/// re-creates them if the user removed any manually.
///
/// Takes an optional `AppHandle` so it can resolve the bundled Firefox
/// XPI from the Tauri resource dir. Pass `None` if you don't want
/// Firefox to be touched (e.g. early test paths) — Chromium browsers
/// install regardless.
pub fn install(app: Option<&AppHandle>) -> std::io::Result<()> {
    for browser in BrowserTarget::all() {
        if let Err(e) = install_one(browser, app) {
            // Don't fail the whole operation for a single browser
            // (e.g. browser not installed at all). Log + continue.
            log::warn!("extension-install hint for {browser:?} failed: {e}");
        }
    }
    Ok(())
}

/// Remove the install hint for every supported browser. Safe to call
/// even if the hint was never written. Doesn't need an `AppHandle` —
/// uninstall just deletes paths we previously wrote.
pub fn uninstall() -> std::io::Result<()> {
    for browser in BrowserTarget::all() {
        if let Err(e) = uninstall_one(browser) {
            log::warn!("extension-uninstall hint for {browser:?} failed: {e}");
        }
    }
    Ok(())
}

fn install_one(browser: BrowserTarget, app: Option<&AppHandle>) -> std::io::Result<()> {
    match browser {
        BrowserTarget::Firefox => install_firefox(app),
        _ => install_chromium(browser),
    }
}

fn uninstall_one(browser: BrowserTarget) -> std::io::Result<()> {
    match browser {
        BrowserTarget::Firefox => uninstall_firefox(),
        _ => uninstall_chromium(browser),
    }
}

// ---- Chromium-family (Chrome / Brave / Edge) -------------------------------

#[cfg(not(target_os = "windows"))]
fn install_chromium(browser: BrowserTarget) -> std::io::Result<()> {
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
fn uninstall_chromium(browser: BrowserTarget) -> std::io::Result<()> {
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
fn install_chromium(browser: BrowserTarget) -> std::io::Result<()> {
    let key_path = browser.registry_extension_key(CHROMIUM_EXT_ID).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "no registry key for browser")
    })?;
    write_hkcu_named_value(&key_path, "update_url", CHROMIUM_UPDATE_URL)?;
    log::info!("extension-install: hint written for {browser:?} at HKCU\\{key_path}");
    Ok(())
}

#[cfg(target_os = "windows")]
fn uninstall_chromium(browser: BrowserTarget) -> std::io::Result<()> {
    if let Some(key_path) = browser.registry_extension_key(CHROMIUM_EXT_ID) {
        let _ = delete_hkcu_key(&key_path);
    }
    Ok(())
}

// ---- Firefox (XPI sideload) ------------------------------------------------

/// Sideload the bundled signed XPI into the user's Firefox Extensions
/// directory. Firefox shows a one-time "Allow this extension?" prompt
/// on next launch — that's the lightest-touch mechanism Firefox
/// supports without admin.
fn install_firefox(app: Option<&AppHandle>) -> std::io::Result<()> {
    let target_dir = firefox_extensions_dir().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            "cannot resolve Firefox extensions dir",
        )
    })?;

    // Skip if Firefox isn't installed (or has never been launched on
    // this machine). The Mozilla parent dir is the most reliable
    // signal — its presence implies Firefox has at least booted once.
    let Some(parent) = target_dir.ancestors().nth(2) else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "firefox dir has no Mozilla parent",
        ));
    };
    if !parent.exists() {
        log::info!(
            "extension-install: skipping Firefox — no Mozilla profile dir at {}",
            parent.display()
        );
        return Ok(());
    }

    let Some(app) = app else {
        // Called without an AppHandle (e.g. early test path) — we
        // can't resolve the bundled XPI's location. Skip silently.
        log::debug!("extension-install: Firefox skipped — no AppHandle to resolve resource dir");
        return Ok(());
    };

    let resource_dir = app.path().resource_dir().map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::Other, format!("resource_dir: {e}"))
    })?;
    let bundled_xpi = resource_dir.join("resources").join(FIREFOX_BUNDLED_XPI);
    let bundled_size = std::fs::metadata(&bundled_xpi).map(|m| m.len()).unwrap_or(0);
    if bundled_size == 0 {
        // The bundled XPI is committed to the repo separately (see
        // `src-tauri/resources/README.md`). The repo ships a zero-byte
        // placeholder so `cargo build` works in clean checkouts; dev
        // builds without a real XPI just skip Firefox sideload —
        // Chromium browsers still get hinted normally, and the
        // existing onboarding "Install in Firefox" step still covers
        // Firefox.
        log::info!(
            "extension-install: Firefox skipped — bundled XPI is empty / missing at {}",
            bundled_xpi.display()
        );
        return Ok(());
    }

    std::fs::create_dir_all(&target_dir)?;
    // The XPI must be named after the gecko id — Firefox keys
    // sideloaded extensions by filename.
    let target = target_dir.join(format!("{FIREFOX_EXT_ID}.xpi"));
    std::fs::copy(&bundled_xpi, &target)?;
    log::info!(
        "extension-install: Firefox XPI sideloaded at {}",
        target.display()
    );
    Ok(())
}

fn uninstall_firefox() -> std::io::Result<()> {
    let Some(target_dir) = firefox_extensions_dir() else {
        return Ok(());
    };
    let target = target_dir.join(format!("{FIREFOX_EXT_ID}.xpi"));
    if target.exists() {
        std::fs::remove_file(&target)?;
        log::info!("extension-uninstall: Firefox XPI removed at {}", target.display());
    }
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
pub fn install_extension_hints(app: AppHandle) -> Result<(), String> {
    install(Some(&app)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn uninstall_extension_hints() -> Result<(), String> {
    uninstall().map_err(|e| e.to_string())
}
