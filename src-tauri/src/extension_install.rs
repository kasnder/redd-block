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
// - **Firefox** (macOS only): write an `ExtensionSettings` entry to
//   `/Applications/Firefox.app/Contents/Resources/distribution/policies.json`.
//   Firefox treats this as a managed enterprise policy: on next launch
//   it silently force-installs the extension from AMO; the user sees
//   "Managed by your administrator" in `about:addons` and can't
//   disable / remove it from the UI. On uninstall we strip our entry
//   from the policy and Firefox auto-uninstalls the extension on its
//   next launch — full install + uninstall hygiene.
//
//   Earlier versions of this module sideloaded the signed XPI into
//   `~/Library/Application Support/Mozilla/Extensions/{guid}/`, but
//   Mozilla removed that mechanism in Firefox 74 (Oct 2019); the
//   directory still exists but Firefox no longer reads it.
//
//   On Windows, the equivalent path
//   (`C:\Program Files\Mozilla Firefox\distribution\policies.json`)
//   requires admin elevation, so the Firefox auto-install is currently
//   macOS-only. Windows / Linux Firefox falls back to the existing
//   onboarding "Install in Firefox" link.
//
// Mirrors the structure of `native_host_install.rs` so the install /
// uninstall lifecycle hooks are symmetric.
//
// Safari is out of scope (native bundle handles its own extension).

use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;

use crate::native_host_install::{CHROMIUM_EXT_ID, FIREFOX_EXT_ID};

/// Update URL the browser fetches the extension `.crx` from. The Chrome
/// Web Store URL works for Chrome and Brave directly; Edge accepts it
/// when the user has "Allow extensions from other stores" toggled
/// on. Worst case for Edge users without that toggle: nothing happens
/// and the existing per-browser onboarding step still runs.
pub const CHROMIUM_UPDATE_URL: &str = "https://clients2.google.com/service/update2/crx";

/// AMO URL Firefox fetches the XPI from when the policy is in place.
/// Always-redirects to the latest signed release.
pub const FIREFOX_AMO_XPI_URL: &str =
    "https://addons.mozilla.org/firefox/downloads/latest/reddfocus/latest.xpi";

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
    /// Linux. On Windows the registry path is the install surface (see
    /// `registry_extension_key`).
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
            // Linux Chromium-family: External Extensions dir lives
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

/// `policies.json` path inside the Firefox app bundle on macOS. We
/// only target the standard `/Applications/Firefox.app` location —
/// users with Firefox in a non-standard place fall back to the
/// existing onboarding "Install in Firefox" link.
#[cfg(target_os = "macos")]
fn firefox_policies_json_path() -> PathBuf {
    PathBuf::from("/Applications/Firefox.app/Contents/Resources/distribution/policies.json")
}

/// Drop the install hint for every supported browser. Idempotent —
/// running it on every app launch keeps the hints in place and
/// re-creates them if the user removed any manually.
pub fn install() -> std::io::Result<()> {
    for browser in BrowserTarget::all() {
        if let Err(e) = install_chromium(browser) {
            // Don't fail the whole operation for a single browser
            // (e.g. browser not installed at all). Log + continue.
            log::warn!("extension-install hint for {browser:?} failed: {e}");
        }
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = install_firefox_policy() {
        log::warn!("extension-install Firefox policy failed: {e}");
    }
    Ok(())
}

/// Remove the install hint for every supported browser. Safe to call
/// even if the hint was never written.
pub fn uninstall() -> std::io::Result<()> {
    for browser in BrowserTarget::all() {
        if let Err(e) = uninstall_chromium(browser) {
            log::warn!("extension-uninstall hint for {browser:?} failed: {e}");
        }
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = uninstall_firefox_policy() {
        log::warn!("extension-uninstall Firefox policy failed: {e}");
    }
    Ok(())
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
    let key_path = browser.registry_extension_key(CHROMIUM_EXT_ID);
    write_hkcu_named_value(&key_path, "update_url", CHROMIUM_UPDATE_URL)?;
    log::info!("extension-install: hint written for {browser:?} at HKCU\\{key_path}");
    Ok(())
}

#[cfg(target_os = "windows")]
fn uninstall_chromium(browser: BrowserTarget) -> std::io::Result<()> {
    let key_path = browser.registry_extension_key(CHROMIUM_EXT_ID);
    let _ = delete_hkcu_key(&key_path);
    Ok(())
}

// ---- Firefox (enterprise policies, macOS only) -----------------------------

/// Force-install the ReDD Focus extension via Firefox enterprise
/// policies. Writes (or merges into) `policies.json` inside the
/// Firefox app bundle's `Resources/distribution/` directory. Firefox
/// reads this file on launch and treats listed extensions as managed
/// — silently auto-installs from AMO, locks them ("Managed by your
/// administrator" badge), and prevents user removal.
///
/// Idempotent: re-running merges our entry into whatever's already
/// there. Preserves any other policies the user / admin has set.
///
/// Skips silently if:
/// - Firefox.app isn't at `/Applications/Firefox.app` (custom-install
///   users fall back to the existing onboarding flow).
/// - We don't have write access to the bundle (e.g. non-admin macOS
///   account).
#[cfg(target_os = "macos")]
fn install_firefox_policy() -> std::io::Result<()> {
    let policies_path = firefox_policies_json_path();
    let Some(distribution_dir) = policies_path.parent() else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "policies.json path has no parent",
        ));
    };
    let Some(resources_dir) = distribution_dir.parent() else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::Other,
            "distribution dir has no parent",
        ));
    };

    if !resources_dir.exists() {
        log::info!(
            "extension-install: Firefox skipped — bundle Resources dir missing at {}",
            resources_dir.display()
        );
        return Ok(());
    }

    // Best-effort `mkdir -p distribution/`. Returns Err if we lack
    // permission (managed Mac, non-admin user) — log + skip rather
    // than fail the whole install round.
    if let Err(e) = std::fs::create_dir_all(distribution_dir) {
        log::warn!(
            "extension-install: Firefox skipped — cannot create {}: {e}",
            distribution_dir.display()
        );
        return Ok(());
    }

    // Read existing policies.json (if any) and merge in our entry.
    // Preserves anything else IT / a previous tool put there.
    let mut data = if policies_path.exists() {
        let raw = std::fs::read_to_string(&policies_path)?;
        serde_json::from_str::<serde_json::Value>(&raw).unwrap_or_else(|e| {
            log::warn!(
                "extension-install: existing policies.json at {} is invalid JSON ({e}); rewriting",
                policies_path.display()
            );
            json!({})
        })
    } else {
        json!({})
    };

    if !data.is_object() {
        data = json!({});
    }
    let root = data.as_object_mut().unwrap();
    let policies = root
        .entry("policies".to_string())
        .or_insert_with(|| json!({}));
    if !policies.is_object() {
        *policies = json!({});
    }
    let policies = policies.as_object_mut().unwrap();
    let extension_settings = policies
        .entry("ExtensionSettings".to_string())
        .or_insert_with(|| json!({}));
    if !extension_settings.is_object() {
        *extension_settings = json!({});
    }
    let extension_settings = extension_settings.as_object_mut().unwrap();
    extension_settings.insert(
        FIREFOX_EXT_ID.to_string(),
        json!({
            "installation_mode": "force_installed",
            "install_url": FIREFOX_AMO_XPI_URL,
            // Auto-grant private-browsing access (and lock the toggle).
            // Without this, the extension installs but users still
            // have to walk through `about:addons` → ReDD Focus →
            // Details → Allow in Private Windows. Same trade as the
            // install itself: more friction up front, but consistent
            // enforcement across normal + private windows.
            "private_browsing": true,
        }),
    );

    let pretty = serde_json::to_string_pretty(&data)?;
    std::fs::write(&policies_path, pretty)?;
    log::info!(
        "extension-install: Firefox policy written at {}",
        policies_path.display()
    );
    Ok(())
}

/// Strip our `ExtensionSettings` entry from `policies.json`. If
/// removing our entry leaves the file empty, delete it (and the
/// `distribution/` directory if empty too) so a clean uninstall
/// leaves no trace.
#[cfg(target_os = "macos")]
fn uninstall_firefox_policy() -> std::io::Result<()> {
    let policies_path = firefox_policies_json_path();
    if !policies_path.exists() {
        return Ok(());
    }

    let raw = std::fs::read_to_string(&policies_path)?;
    let mut data: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => {
            // Not our JSON to clean up. Leave alone.
            return Ok(());
        }
    };

    let mut wrote_empty = false;
    if let Some(root) = data.as_object_mut() {
        if let Some(policies) = root.get_mut("policies").and_then(|v| v.as_object_mut()) {
            if let Some(ext_settings) = policies
                .get_mut("ExtensionSettings")
                .and_then(|v| v.as_object_mut())
            {
                ext_settings.remove(FIREFOX_EXT_ID);
                if ext_settings.is_empty() {
                    policies.remove("ExtensionSettings");
                }
            }
            if policies.is_empty() {
                root.remove("policies");
            }
        }
        wrote_empty = root.is_empty();
    }

    if wrote_empty {
        std::fs::remove_file(&policies_path)?;
        // Try to remove the distribution dir too if we're the only
        // thing in it. `remove_dir` only succeeds when empty, so
        // failure here is silent — anyone else's content stays.
        if let Some(dist_dir) = policies_path.parent() {
            let _ = std::fs::remove_dir(dist_dir);
        }
        log::info!(
            "extension-uninstall: Firefox policy file removed at {}",
            policies_path.display()
        );
    } else {
        let pretty = serde_json::to_string_pretty(&data)?;
        std::fs::write(&policies_path, pretty)?;
        log::info!(
            "extension-uninstall: Firefox policy entry stripped from {}",
            policies_path.display()
        );
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
pub fn install_extension_hints() -> Result<(), String> {
    install().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn uninstall_extension_hints() -> Result<(), String> {
    uninstall().map_err(|e| e.to_string())
}
