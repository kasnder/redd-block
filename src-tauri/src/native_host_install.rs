// Install the native-messaging manifest(s) so the browser knows to
// spawn this binary when the extension calls `connectNative`.
//
// - macOS / Linux: write a JSON manifest into each browser's
//   NativeMessagingHosts directory. All user-scope; no admin needed.
// - Windows: write a JSON manifest to a user-scoped directory and
//   register its path in `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\<name>`.
//
// Safari is not covered here — Safari routes native messaging
// directly to `SafariWebExtensionHandler.swift` inside the signed app
// bundle; there is no manifest file.

use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;

pub const HOST_NAME: &str = "com.ulriklyngs.mindshield";
pub const FIREFOX_EXT_ID: &str = "mindshield@example.com";
pub const CHROMIUM_EXT_ID: &str = "hhblkhfdjijdinijakbmcpkmdfhoadcd";
/// Microsoft Edge Add-ons listing ID — differs from the Chrome Web
/// Store ID when the user installs manually from edge://extensions.
pub const EDGE_ADDONS_EXT_ID: &str = "gmjfgjdhnhcegfelcddbdljdffiaepam";
/// Bundle identifier of the legacy bundled Safari Web Extension (no longer
/// shipped). Still referenced for duplicate-extension detection when a
/// user has both the App Store ReDD Focus and an old embedded copy.
pub const SAFARI_EXT_ID: &str = "com.reddblock.SafariExtension";

/// Every Chromium-family extension ID ReDD Block treats as ReDD Focus.
/// Includes both the Chrome Web Store ID (auto-install hint) and the
/// Edge Add-ons ID (manual install from Microsoft's store).
pub fn chromium_extension_ids() -> Vec<String> {
    let mut ids = vec![CHROMIUM_EXT_ID.to_string(), EDGE_ADDONS_EXT_ID.to_string()];
    if cfg!(debug_assertions) {
        if let Ok(extra) = std::env::var("REDD_DEV_EXT_ID") {
            for id in extra.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
                ids.push(id.to_string());
            }
        }
    }
    ids.sort();
    ids.dedup();
    ids
}

#[derive(Debug, Clone, Copy, Serialize)]
pub enum BrowserTarget { Chrome, Brave, Edge, Firefox }

impl BrowserTarget {
    fn all() -> [BrowserTarget; 4] {
        [BrowserTarget::Chrome, BrowserTarget::Brave, BrowserTarget::Edge, BrowserTarget::Firefox]
    }

    /// Directory where the browser expects to find native-messaging
    /// host manifests. User-scope only.
    fn manifest_dir(self) -> Option<PathBuf> {
        let home = dirs::home_dir()?;
        #[cfg(target_os = "macos")]
        {
            let p = match self {
                BrowserTarget::Chrome => "Library/Application Support/Google/Chrome/NativeMessagingHosts",
                BrowserTarget::Brave => "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
                BrowserTarget::Edge => "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
                BrowserTarget::Firefox => "Library/Application Support/Mozilla/NativeMessagingHosts",
            };
            Some(home.join(p))
        }
        #[cfg(target_os = "windows")]
        {
            // Windows doesn't use a per-browser directory; the manifest
            // lives wherever we want and is referenced by registry key.
            let _ = self;
            let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
            Some(local.join("ReDD Block").join("native-host"))
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            let p = match self {
                BrowserTarget::Chrome => ".config/google-chrome/NativeMessagingHosts",
                BrowserTarget::Brave => ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
                BrowserTarget::Edge => ".config/microsoft-edge/NativeMessagingHosts",
                BrowserTarget::Firefox => ".mozilla/native-messaging-hosts",
            };
            Some(home.join(p))
        }
    }
}

/// Build the JSON manifest body for a given browser. Chromium and
/// Firefox have slightly different schemas:
///   - Chromium uses `allowed_origins` with chrome-extension://<id>/
///   - Firefox uses `allowed_extensions` with <addon@id>
///
/// In debug builds, comma-separated IDs from `REDD_DEV_EXT_ID` are
/// appended to `allowed_origins` so an unpacked dev extension can
/// connect alongside the production-store one. The env var is ignored
/// in release builds so production users only ever trust the store ID.
fn manifest_body(browser: BrowserTarget, binary_path: &str) -> serde_json::Value {
    let mut obj = json!({
        "name": HOST_NAME,
        "description": "ReDD Block native messaging host",
        "path": binary_path,
        "type": "stdio",
    });
    match browser {
        BrowserTarget::Firefox => {
            obj["allowed_extensions"] = json!([FIREFOX_EXT_ID]);
        }
        _ => {
            let origins: Vec<String> = chromium_extension_ids()
                .into_iter()
                .map(|id| format!("chrome-extension://{id}/"))
                .collect();
            obj["allowed_origins"] = json!(origins);
        }
    }
    obj
}

/// Path the native-messaging manifest will reference. We want the
/// currently-running Tauri binary so that spawning it with the
/// `--native-host` argument enters the stdio loop.
pub fn current_binary_path() -> Option<String> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(String::from))
}

/// Install the native-messaging manifest for every supported browser.
///
/// Marker-gated: if our own bookkeeping file says we already wrote
/// manifests for the current binary path, skip the cross-app writes
/// entirely. Each call to `install_one` does
/// `create_dir_all` + `write` inside another app's data dir, which on
/// macOS Sonoma+ fires the "ReDD Block would like to access data from
/// other apps" TCC prompt — even when the write would be a no-op.
/// Doing this on every launch was the dominant source of repeated
/// prompts during build → install iteration.
///
/// The marker lives at
/// `~/Library/Application Support/com.reddblock/native-host-install.v1`
/// (our own data dir — no cross-app touch to check or write it). It
/// stores the absolute binary path we last wrote manifests for. Any
/// change to the path (.app moved, .pkg installed somewhere else,
/// `tauri dev` vs installed) invalidates the marker and triggers a
/// fresh write pass. The schema-version suffix in the filename
/// (`v1`) lets us re-run for everyone if we ever change the manifest
/// format itself: bump to `v2`.
///
/// For an explicit "reinstall manifests now" affordance (e.g. user
/// hits a Reinstall hints button in the UI), use [`install_force`].
pub fn install() -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        log::info!("native_host_install::install() skipped on macOS — Firefox setup is manual");
        return Ok(());
    }

    let binary = current_binary_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve current exe")
    })?;

    log::info!("tcc-probe: native_host_install::install() entered, binary={binary}");

    if startup_install_already_done_for(&binary) {
        log::info!(
            "tcc-probe: native_host_install::install() marker matches binary path, skipping (no cross-app touches)"
        );
        return Ok(());
    }

    install_inner(&binary);
    mark_startup_install_done_for(&binary);
    log::info!("tcc-probe: native_host_install::install() exited (wrote manifests + dropped marker)");
    Ok(())
}

/// Install the native-messaging manifest for one browser. Used when the
/// user opts into extension mode on macOS Chromium.
pub fn install_native_host_for(browser: BrowserTarget) -> std::io::Result<()> {
    let binary = current_binary_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve current exe")
    })?;
    install_one(browser, &binary)
}

/// `true` when the browser's manifest is missing or points at a different
/// binary (e.g. after `tauri dev` rebuild or .pkg reinstall).
fn manifest_needs_update(browser: BrowserTarget, binary: &str) -> bool {
    let Some(dir) = browser.manifest_dir() else {
        return true;
    };
    let path = dir.join(format!("{HOST_NAME}.json"));
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return true;
    };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return true;
    };
    val.get("path").and_then(|p| p.as_str()) != Some(binary)
}

/// On macOS, ensure every Chromium browser set to extension mode has an
/// up-to-date native-messaging manifest. Skips browsers already pointing
/// at the current binary so startup does not re-touch other apps' data
/// dirs (and re-trigger TCC) on every launch.
#[cfg(target_os = "macos")]
pub fn sync_extension_mode_native_hosts(path: &std::path::Path, force: bool) -> std::io::Result<()> {
    use crate::blocking_method::{self, Method, MAC_CHROMIUM_KEYS};

    let binary = current_binary_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve current exe")
    })?;

    for key in MAC_CHROMIUM_KEYS {
        if blocking_method::method_for_key_at_path(path, key) != Method::Extension {
            continue;
        }
        let Some(target) = blocking_method::native_host_target(key) else {
            continue;
        };
        if !force && !manifest_needs_update(target, &binary) {
            log::debug!("native-host sync: {key} manifest already current, skipping");
            continue;
        }
        log::info!("native-host sync: writing manifest for {key}");
        if let Err(e) = install_one(target, &binary) {
            log::warn!("native-host sync for {key} failed: {e}");
        }
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn sync_extension_mode_native_hosts(_path: &std::path::Path, _force: bool) -> std::io::Result<()> {
    Ok(())
}

/// Remove the native-messaging manifest for one browser.
pub fn uninstall_native_host_for(browser: BrowserTarget) -> std::io::Result<()> {
    uninstall_one(browser)
}

/// Force-write the native-messaging manifest for every supported
/// browser, ignoring the marker. Use for the user-driven "Reinstall
/// hints" command — they're explicitly asking us to refresh, so the
/// TCC prompt is contextually expected. Drops the marker on success
/// so the next startup call stays silent.
pub fn install_force() -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        log::info!("native_host_install::install_force() skipped on macOS — Firefox setup is manual");
        return Ok(());
    }

    let binary = current_binary_path().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve current exe")
    })?;
    log::info!("tcc-probe: native_host_install::install_force() entered, binary={binary}");
    install_inner(&binary);
    mark_startup_install_done_for(&binary);
    log::info!("tcc-probe: native_host_install::install_force() exited");
    Ok(())
}

fn install_inner(binary: &str) {
    for browser in install_targets() {
        log::info!("tcc-probe: native_host_install::install_one({browser:?}) start");
        if let Err(e) = install_one(browser, binary) {
            // Don't fail the whole operation for a single browser
            // (e.g. Firefox not installed). Log and continue.
            log::warn!("native-host install for {browser:?} failed: {e}");
        }
        log::info!("tcc-probe: native_host_install::install_one({browser:?}) done");
    }
}

/// Browsers that receive a native-messaging manifest on this platform.
fn install_targets() -> Vec<BrowserTarget> {
    #[cfg(target_os = "macos")]
    {
        vec![BrowserTarget::Firefox]
    }
    #[cfg(not(target_os = "macos"))]
    {
        BrowserTarget::all().to_vec()
    }
}

/// Remove the manifest for every supported browser. Safe to call even
/// if install never ran. Also clears the install marker so the next
/// `install()` call definitely re-writes (uninstall is rare and the
/// re-write cost on the next install is acceptable).
pub fn uninstall() -> std::io::Result<()> {
    for browser in install_targets() {
        if let Err(e) = uninstall_one(browser) {
            log::warn!("native-host uninstall for {browser:?} failed: {e}");
        }
    }
    clear_startup_install_marker();
    Ok(())
}

// ---- Marker bookkeeping ---------------------------------------------------

/// Absolute path of the per-machine "we already wrote manifests for
/// this binary path" marker. Lives in our own app-data dir so the
/// stat/read/write to maintain it never touches another app's
/// territory. Returns `None` when `dirs::data_local_dir` can't
/// resolve (extremely rare; would imply a broken `$HOME`).
fn startup_install_marker_path() -> Option<PathBuf> {
    let base = dirs::data_local_dir()?;
    Some(base.join("com.reddblock").join("native-host-install.v1"))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct StartupInstallMarker {
    binary_path: String,
}

/// `true` when the marker exists AND records the same binary path
/// we're about to write for. Any mismatch — missing marker, parse
/// failure, different binary path — returns `false` so we re-run the
/// install. The asymmetric "default to re-run on any uncertainty"
/// is deliberate: the failure mode for a needless re-run is at most
/// one extra TCC prompt, but the failure mode for a wrongly-skipped
/// install is broken native messaging until the user notices.
fn startup_install_already_done_for(binary: &str) -> bool {
    let Some(path) = startup_install_marker_path() else { return false };
    let Ok(raw) = std::fs::read_to_string(&path) else { return false };
    let Ok(marker) = serde_json::from_str::<StartupInstallMarker>(&raw) else { return false };
    marker.binary_path == binary
}

fn mark_startup_install_done_for(binary: &str) {
    let Some(path) = startup_install_marker_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let payload = StartupInstallMarker { binary_path: binary.to_string() };
    let Ok(bytes) = serde_json::to_vec(&payload) else { return };
    let _ = std::fs::write(&path, bytes);
}

fn clear_startup_install_marker() {
    let Some(path) = startup_install_marker_path() else { return };
    let _ = std::fs::remove_file(&path);
}

#[cfg(not(target_os = "windows"))]
fn install_one(browser: BrowserTarget, binary: &str) -> std::io::Result<()> {
    let dir = browser.manifest_dir().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve manifest dir")
    })?;
    log::info!(
        "tcc-probe: about to create_dir_all (cross-app) {} [browser={browser:?}]",
        dir.display()
    );
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{HOST_NAME}.json"));
    let body = manifest_body(browser, binary);
    log::info!(
        "tcc-probe: about to write (cross-app) {} [browser={browser:?}]",
        path.display()
    );
    std::fs::write(path, serde_json::to_vec_pretty(&body)?)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn uninstall_one(browser: BrowserTarget) -> std::io::Result<()> {
    let dir = browser.manifest_dir().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve manifest dir")
    })?;
    let path = dir.join(format!("{HOST_NAME}.json"));
    if path.exists() {
        std::fs::remove_file(&path)?;
    }
    // Remove the dir only if we created it and it's now empty.
    if let Ok(mut rd) = std::fs::read_dir(&dir) {
        if rd.next().is_none() {
            let _ = std::fs::remove_dir(&dir);
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn install_one(browser: BrowserTarget, binary: &str) -> std::io::Result<()> {
    // 1. Write the manifest to %LOCALAPPDATA%\ReDD Block\native-host\.
    let dir = browser.manifest_dir().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::Other, "cannot resolve manifest dir")
    })?;
    std::fs::create_dir_all(&dir)?;
    let manifest_path = dir.join(format!("{HOST_NAME}-{}.json", browser_slug(browser)));
    let body = manifest_body(browser, binary);
    std::fs::write(&manifest_path, serde_json::to_vec_pretty(&body)?)?;

    // 2. Register the manifest path in HKCU.
    let registry_key = registry_key_path(browser);
    let manifest_str = manifest_path
        .to_str()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::Other, "non-utf8 manifest path"))?;
    write_hkcu_default(&registry_key, manifest_str)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn uninstall_one(browser: BrowserTarget) -> std::io::Result<()> {
    // Remove registry key + manifest file.
    let _ = delete_hkcu_key(&registry_key_path(browser));
    if let Some(dir) = browser.manifest_dir() {
        let manifest_path = dir.join(format!("{HOST_NAME}-{}.json", browser_slug(browser)));
        if manifest_path.exists() {
            let _ = std::fs::remove_file(&manifest_path);
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn browser_slug(browser: BrowserTarget) -> &'static str {
    match browser {
        BrowserTarget::Chrome => "chrome",
        BrowserTarget::Brave => "brave",
        BrowserTarget::Edge => "edge",
        BrowserTarget::Firefox => "firefox",
    }
}

#[cfg(target_os = "windows")]
fn registry_key_path(browser: BrowserTarget) -> String {
    // All HKCU — no UAC. Chrome/Brave/Edge use the same schema under
    // their vendor key; Firefox uses Mozilla\NativeMessagingHosts.
    match browser {
        BrowserTarget::Chrome => format!(r"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"),
        BrowserTarget::Brave => format!(r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{HOST_NAME}"),
        BrowserTarget::Edge => format!(r"Software\Microsoft\Edge\NativeMessagingHosts\{HOST_NAME}"),
        BrowserTarget::Firefox => format!(r"Software\Mozilla\NativeMessagingHosts\{HOST_NAME}"),
    }
}

#[cfg(target_os = "windows")]
fn write_hkcu_default(path: &str, value: &str) -> std::io::Result<()> {
    use windows::core::{w, PCWSTR};
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
        let data_wide = to_wide(value);
        let bytes_len = (data_wide.len() * 2) as u32;
        let data_bytes = std::slice::from_raw_parts(
            data_wide.as_ptr() as *const u8,
            bytes_len as usize,
        );
        let _ = w!("");
        let status = RegSetValueExW(hkey, PCWSTR::null(), Some(0), REG_SZ, Some(data_bytes));
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

/// Tauri command wrappers.
///
/// `install_native_host` is the explicit "Reinstall hints" affordance,
/// so it bypasses the startup-install marker — the user clicked a
/// button asking us to refresh, and they'll accept the TCC prompt
/// (or have already granted it) as part of that action. The startup
/// auto-install path in `lib.rs::run` uses [`install`] (marker-gated)
/// instead.
#[tauri::command]
pub fn install_native_host(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let path = crate::commands::canonical_data_path(&app)
            .ok_or_else(|| "no app data path".to_string())?;
        sync_extension_mode_native_hosts(&path, true).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        install_force().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn uninstall_native_host() -> Result<(), String> {
    uninstall().map_err(|e| e.to_string())
}
