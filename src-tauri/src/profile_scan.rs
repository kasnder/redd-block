// Rust port of the MVP profile-scanner prototype (see git history
// for browser-ext-mvp/profile-scan/scan.mjs).
//
// Detects whether the ReDD Focus browser extension is installed,
// enabled, and allowed in private/incognito mode across every user
// profile of Firefox / Chrome / Brave / Edge, plus Safari on macOS.
// Reads the browsers' on-disk preference files directly — no admin,
// no policy install, no native messaging required.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ReDD Focus extension IDs. Keep in sync with the MVP script.
const FIREFOX_ID: &str = "mindshield@example.com";
const CHROMIUM_ID: &str = "hhblkhfdjijdinijakbmcpkmdfhoadcd";
#[cfg(target_os = "macos")]
const SAFARI_BUNDLE_ID: &str = "com.ulriklyngs.mind-shield.mind-shield";

/// Chromium IDs the scanner will accept as "ReDD Focus is here".
/// Production ID is always included. In debug builds, comma-separated
/// IDs from `REDD_DEV_EXT_ID` are appended so an unpacked dev extension
/// (path-derived ID, ≠ production) is recognised by the compliance
/// scan. The env var is ignored in release builds.
fn chromium_ids() -> Vec<String> {
    let mut ids = vec![CHROMIUM_ID.to_string()];
    if cfg!(debug_assertions) {
        if let Ok(extra) = std::env::var("REDD_DEV_EXT_ID") {
            for id in extra.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()) {
                ids.push(id.to_string());
            }
        }
    }
    ids
}

/// Result for a single browser profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileStatus {
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    pub installed: bool,
    /// `None` when we can't determine the state (e.g. Safari sandbox).
    pub enabled: Option<bool>,
    #[serde(rename = "privateBrowsing")]
    pub private_browsing: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// Result for a browser vendor across all profiles.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserStatus {
    /// True when the browser process is currently running. Used by
    /// the enforcer's compliance check (no nag for browsers the user
    /// doesn't have open) and by the in-session compliance banner.
    pub present: bool,
    /// True when the browser appears to be installed on disk (profile
    /// directory or app bundle exists), regardless of whether it's
    /// running. Used by the migration onboarding screen so we can
    /// show install buttons for every browser the user has, not just
    /// the ones currently open.
    #[serde(default)]
    pub installed: bool,
    pub profiles: Vec<ProfileStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub firefox: BrowserStatus,
    pub chrome: BrowserStatus,
    pub brave: BrowserStatus,
    pub edge: BrowserStatus,
    pub safari: BrowserStatus,
}

/// Scan every supported browser on the current platform.
pub fn scan() -> ScanResult {
    ScanResult {
        firefox: scan_firefox().unwrap_or_else(|| empty("firefox")),
        chrome: scan_chromium(ChromiumBrowser::Chrome).unwrap_or_else(|| empty("chrome")),
        brave: scan_chromium(ChromiumBrowser::Brave).unwrap_or_else(|| empty("brave")),
        edge: scan_chromium(ChromiumBrowser::Edge).unwrap_or_else(|| empty("edge")),
        safari: scan_safari(),
    }
}

fn empty(_label: &str) -> BrowserStatus {
    BrowserStatus { present: false, installed: false, profiles: vec![], error: None }
}

// ---- Firefox ---------------------------------------------------------------

fn firefox_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        Some(dirs::home_dir()?.join("Library/Application Support/Firefox"))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var_os("APPDATA").map(PathBuf::from)?;
        Some(appdata.join(r"Mozilla\Firefox"))
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Some(dirs::home_dir()?.join(".mozilla/firefox"))
    }
}

/// Bundle (or equivalent) on disk, regardless of running state.
fn firefox_app_installed() -> bool {
    #[cfg(target_os = "macos")]
    {
        let candidates = [
            PathBuf::from("/Applications/Firefox.app"),
            dirs::home_dir().map(|h| h.join("Applications/Firefox.app")).unwrap_or_default(),
        ];
        candidates.iter().any(|p| p.exists())
    }
    #[cfg(target_os = "windows")]
    {
        // Check standard Firefox install locations. Profile-dir
        // existence alone is a false positive (uninstall leaves the
        // profile dir behind by default).
        let mut roots = vec![];
        if let Some(pf) = std::env::var_os("ProgramFiles") {
            roots.push(PathBuf::from(pf).join(r"Mozilla Firefox\firefox.exe"));
        }
        if let Some(pf86) = std::env::var_os("ProgramFiles(x86)") {
            roots.push(PathBuf::from(pf86).join(r"Mozilla Firefox\firefox.exe"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            roots.push(PathBuf::from(local).join(r"Mozilla Firefox\firefox.exe"));
        }
        roots.iter().any(|p| p.exists())
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        firefox_root().map(|p| p.exists()).unwrap_or(false)
    }
}

fn firefox_app_present() -> bool {
    #[cfg(target_os = "macos")]
    {
        is_process_running(&["firefox", "firefox-bin"])
    }
    #[cfg(target_os = "windows")]
    {
        is_process_running(&["firefox.exe"])
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        is_process_running(&["firefox", "firefox-esr"])
    }
}

fn scan_firefox() -> Option<BrowserStatus> {
    let running = firefox_app_present();
    let installed = firefox_app_installed();
    let root = firefox_root()?;
    if !installed || !root.exists() {
        return Some(BrowserStatus { present: running, installed, profiles: vec![], error: None });
    }

    let (profile_dirs, defaults) = read_firefox_profiles(&root);
    let mut profiles = vec![];
    for rel in profile_dirs {
        let dir = root.join(&rel);
        if !dir.is_dir() {
            continue;
        }
        let mut s = ProfileStatus {
            name: rel.clone(),
            is_default: defaults.contains(&rel),
            installed: false,
            enabled: Some(false),
            private_browsing: Some(false),
            note: None,
        };

        if let Ok(raw) = std::fs::read_to_string(dir.join("extensions.json")) {
            if let Ok(data) = serde_json::from_str::<Value>(&raw) {
                if let Some(addons) = data.get("addons").and_then(|v| v.as_array()) {
                    if let Some(addon) = addons
                        .iter()
                        .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(FIREFOX_ID))
                    {
                        s.installed = true;
                        let active = addon.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
                        let user_disabled = addon.get("userDisabled").and_then(|v| v.as_bool()).unwrap_or(false);
                        let app_disabled = addon.get("appDisabled").and_then(|v| v.as_bool()).unwrap_or(false);
                        s.enabled = Some(active && !user_disabled && !app_disabled);
                    }
                }
            }
        }

        if let Ok(raw) = std::fs::read_to_string(dir.join("extension-preferences.json")) {
            if let Ok(data) = serde_json::from_str::<Value>(&raw) {
                let allowed = data
                    .get(FIREFOX_ID)
                    .and_then(|v| v.get("permissions"))
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .any(|v| v.as_str() == Some("internal:privateBrowsingAllowed"))
                    })
                    .unwrap_or(false);
                s.private_browsing = Some(allowed);
            }
        }

        profiles.push(s);
    }

    Some(BrowserStatus { present: running, installed: true, profiles, error: None })
}

fn read_firefox_profiles(root: &Path) -> (Vec<String>, Vec<String>) {
    let ini_path = root.join("profiles.ini");
    let mut defaults = vec![];
    let mut profile_dirs = vec![];

    if let Ok(ini) = std::fs::read_to_string(&ini_path) {
        // [InstallXXXX] Default=<path> is authoritative for modern Firefox.
        let mut in_install_block = false;
        for line in ini.lines() {
            let line = line.trim();
            if line.starts_with('[') && line.ends_with(']') {
                in_install_block = line.starts_with("[Install");
            } else if in_install_block {
                if let Some(rest) = line.strip_prefix("Default=") {
                    defaults.push(rest.trim().to_string());
                }
            }
            if let Some(rest) = line.strip_prefix("Path=") {
                profile_dirs.push(rest.trim().to_string());
            }
        }
    } else {
        // Fallback: list the Profiles/ subdir if present.
        let profiles_dir = root.join("Profiles");
        if let Ok(rd) = std::fs::read_dir(&profiles_dir) {
            for entry in rd.flatten() {
                profile_dirs.push(format!("Profiles/{}", entry.file_name().to_string_lossy()));
            }
        }
    }
    (profile_dirs, defaults)
}

// ---- Chromium (Chrome / Brave / Edge) --------------------------------------

#[derive(Copy, Clone)]
enum ChromiumBrowser { Chrome, Brave, Edge }

/// True if any process with one of the given names is currently
/// running. We treat "present" as "running" rather than "installed"
/// because install paths vary widely (Setapp, manual relocations,
/// portable installs, etc.) and stale profile dirs remain after
/// uninstall. The compliance banner only matters when the user has
/// the browser open; if it's closed, no nag.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn is_process_running(names: &[&str]) -> bool {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes().values().any(|p| {
        let pname = p.name().to_string_lossy().to_string();
        names.iter().any(|n| pname.eq_ignore_ascii_case(n))
    })
}
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn is_process_running(_names: &[&str]) -> bool { false }

impl ChromiumBrowser {
    /// True when the browser app appears to be present on disk
    /// (bundle in /Applications or ~/Applications on macOS, the
    /// profile-data dir on Windows/Linux). Used by the migration
    /// onboarding to decide whether to surface a row.
    ///
    /// We only consider the profile-dir alone insufficient on macOS
    /// because empty/stub Chrome profile dirs sometimes exist on
    /// systems that never had Chrome installed (e.g. via a Google
    /// Updater leftover or a one-off Cast/Drive integration). The
    /// actual .app bundle existing is the firmer signal.
    fn app_installed(self) -> bool {
        #[cfg(target_os = "macos")]
        {
            let bundle = match self {
                ChromiumBrowser::Chrome => "Google Chrome.app",
                ChromiumBrowser::Brave => "Brave Browser.app",
                ChromiumBrowser::Edge => "Microsoft Edge.app",
            };
            let candidates = [
                PathBuf::from("/Applications").join(bundle),
                dirs::home_dir().map(|h| h.join("Applications").join(bundle)).unwrap_or_default(),
            ];
            candidates.iter().any(|p| p.exists())
        }
        #[cfg(target_os = "windows")]
        {
            // Check standard install locations for the actual exe.
            // Profile-dir existence alone is a false positive — Chrome
            // sometimes leaves %LOCALAPPDATA%\Google\Chrome\User Data
            // behind after uninstall, and other Google products can
            // create stub paths there too.
            let (subpath, _exe) = match self {
                ChromiumBrowser::Chrome => (r"Google\Chrome\Application\chrome.exe", "chrome.exe"),
                ChromiumBrowser::Brave => (r"BraveSoftware\Brave-Browser\Application\brave.exe", "brave.exe"),
                ChromiumBrowser::Edge => (r"Microsoft\Edge\Application\msedge.exe", "msedge.exe"),
            };
            let mut roots = vec![];
            if let Some(pf) = std::env::var_os("ProgramFiles") {
                roots.push(PathBuf::from(pf));
            }
            if let Some(pf86) = std::env::var_os("ProgramFiles(x86)") {
                roots.push(PathBuf::from(pf86));
            }
            // Per-user install on Windows lives under %LOCALAPPDATA%.
            if let Some(local) = std::env::var_os("LOCALAPPDATA") {
                roots.push(PathBuf::from(local));
            }
            roots.iter().any(|r| r.join(subpath).exists())
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            self.root().map(|p| p.exists()).unwrap_or(false)
        }
    }

    fn app_present(self) -> bool {
        // Process names as reported by `sysinfo` (which mirrors what
        // /bin/ps and tasklist see on each platform).
        #[cfg(target_os = "macos")]
        let names: &[&str] = match self {
            ChromiumBrowser::Chrome => &["Google Chrome", "Google Chrome Helper"],
            ChromiumBrowser::Brave => &["Brave Browser", "Brave Browser Helper"],
            ChromiumBrowser::Edge => &["Microsoft Edge", "Microsoft Edge Helper"],
        };
        #[cfg(target_os = "windows")]
        let names: &[&str] = match self {
            ChromiumBrowser::Chrome => &["chrome.exe"],
            ChromiumBrowser::Brave => &["brave.exe"],
            ChromiumBrowser::Edge => &["msedge.exe"],
        };
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        let names: &[&str] = match self {
            ChromiumBrowser::Chrome => &["chrome", "google-chrome"],
            ChromiumBrowser::Brave => &["brave", "brave-browser"],
            ChromiumBrowser::Edge => &["microsoft-edge", "msedge"],
        };
        is_process_running(names)
    }

    fn root(self) -> Option<PathBuf> {
        #[cfg(target_os = "macos")]
        {
            let home = dirs::home_dir()?;
            let p = match self {
                ChromiumBrowser::Chrome => "Library/Application Support/Google/Chrome",
                ChromiumBrowser::Brave => "Library/Application Support/BraveSoftware/Brave-Browser",
                ChromiumBrowser::Edge => "Library/Application Support/Microsoft Edge",
            };
            Some(home.join(p))
        }
        #[cfg(target_os = "windows")]
        {
            let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
            let p = match self {
                ChromiumBrowser::Chrome => r"Google\Chrome\User Data",
                ChromiumBrowser::Brave => r"BraveSoftware\Brave-Browser\User Data",
                ChromiumBrowser::Edge => r"Microsoft\Edge\User Data",
            };
            Some(local.join(p))
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        {
            let home = dirs::home_dir()?;
            let p = match self {
                ChromiumBrowser::Chrome => ".config/google-chrome",
                ChromiumBrowser::Brave => ".config/BraveSoftware/Brave-Browser",
                ChromiumBrowser::Edge => ".config/microsoft-edge",
            };
            Some(home.join(p))
        }
    }
}

fn scan_chromium(b: ChromiumBrowser) -> Option<BrowserStatus> {
    let running = b.app_present();
    let installed = b.app_installed();
    let root = b.root()?;
    if !installed || !root.exists() {
        return Some(BrowserStatus { present: running, installed, profiles: vec![], error: None });
    }

    // Discover profiles via "Local State" first, dir scan as fallback.
    let mut profile_names: Vec<String> = vec![];
    let mut last_used: Option<String> = None;
    if let Ok(raw) = std::fs::read_to_string(root.join("Local State")) {
        if let Ok(data) = serde_json::from_str::<Value>(&raw) {
            if let Some(cache) = data
                .get("profile")
                .and_then(|p| p.get("info_cache"))
                .and_then(|v| v.as_object())
            {
                profile_names = cache.keys().cloned().collect();
            }
            last_used = data
                .get("profile")
                .and_then(|p| p.get("last_used"))
                .and_then(|v| v.as_str())
                .map(String::from);
        }
    }
    if profile_names.is_empty() {
        if let Ok(rd) = std::fs::read_dir(&root) {
            for entry in rd.flatten() {
                if entry.path().is_dir() && entry.path().join("Preferences").exists() {
                    profile_names.push(entry.file_name().to_string_lossy().to_string());
                }
            }
        }
    }

    let mut profiles = vec![];
    for name in profile_names {
        let dir = root.join(&name);
        let is_default = Some(name.as_str()) == last_used.as_deref()
            || (last_used.is_none() && name == "Default");

        let mut merged_settings = serde_json::Map::new();
        for filename in ["Preferences", "Secure Preferences"] {
            if let Ok(raw) = std::fs::read_to_string(dir.join(filename)) {
                if let Ok(data) = serde_json::from_str::<Value>(&raw) {
                    if let Some(settings) = data
                        .get("extensions")
                        .and_then(|e| e.get("settings"))
                        .and_then(|v| v.as_object())
                    {
                        for (k, v) in settings {
                            merged_settings.insert(k.clone(), v.clone());
                        }
                    }
                }
            }
        }

        let mut s = ProfileStatus {
            name,
            is_default,
            installed: false,
            enabled: Some(false),
            private_browsing: Some(false),
            note: None,
        };

        // A profile can hold *multiple* matching entries — typically a
        // stale stub from a previous Web-Store install sitting next to
        // an unpacked dev extension. `find_map` would silently pick
        // the first one, which is usually the empty stub: installed=
        // true with everything else null. That makes the compliance
        // check fail and the enforcer kill the browser even when the
        // real extension is loaded and configured correctly. Score
        // every matching entry and keep the best.
        //
        // ALSO: Brave (and Edge) keep a webstore-allowlist stub for
        // extensions the user has merely *seen* in the store (e.g.,
        // hovered over the install button) — `{ "active_bit": false,
        // "allowlist": 1 }` with no `state`, `manifest`, or `path`.
        // Treating that as "installed" makes the migration UI show
        // "Allow in private browsing" for browsers that don't actually
        // have the extension. Require a real install signal.
        let is_real_install = |ext: &Value| -> bool {
            // Most reliable: a manifest object means Chrome wrote
            // metadata about an actual on-disk extension.
            if ext.get("manifest").and_then(|v| v.as_object()).is_some() {
                return true;
            }
            // path is set when an unpacked or store install resolved
            // to a directory on disk.
            if ext.get("path").and_then(|v| v.as_str()).is_some() {
                return true;
            }
            // Explicit state field also indicates Chrome made a real
            // install/disable decision (state 0 = disabled, 1 =
            // enabled, etc). Allowlist-only stubs have no state.
            if ext.get("state").and_then(|v| v.as_i64()).is_some() {
                return true;
            }
            false
        };

        let view = |ext: &Value| {
            let state = ext.get("state").and_then(|v| v.as_i64());
            let has_disable_reasons = match ext.get("disable_reasons") {
                Some(Value::Array(a)) => !a.is_empty(),
                Some(Value::Number(n)) => n.as_i64().map(|x| x != 0).unwrap_or(false),
                _ => false,
            };
            let enabled = state == Some(1) || (state.is_none() && !has_disable_reasons);
            let incognito = ext.get("incognito").and_then(|v| v.as_bool()).unwrap_or(false);
            (enabled, incognito)
        };

        let best = chromium_ids()
            .iter()
            .filter_map(|id| merged_settings.get(id))
            .filter(|ext| is_real_install(ext))
            .map(|ext| {
                let (enabled, incognito) = view(ext);
                (enabled, incognito, ext)
            })
            .max_by_key(|(enabled, incognito, _)| (*enabled as u8, *incognito as u8));

        if let Some((enabled, incognito, _ext)) = best {
            s.installed = true;
            s.enabled = Some(enabled);
            s.private_browsing = Some(incognito);
        }

        profiles.push(s);
    }

    Some(BrowserStatus { present: running, installed: true, profiles, error: None })
}

// ---- Safari (macOS only) --------------------------------------------------

#[cfg(target_os = "macos")]
fn scan_safari() -> BrowserStatus {
    use std::process::Command;
    let running = is_process_running(&["Safari"]);
    // Safari is a system app — always installed on macOS.
    let output = Command::new("/usr/bin/pluginkit")
        .args(["-m", "-A", "-vvv", "-p", "com.apple.Safari.web-extension"])
        .output();
    let output = match output {
        Ok(o) => o,
        Err(e) => {
            return BrowserStatus { present: running, installed: true, profiles: vec![], error: Some(e.to_string()) };
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().find(|l| l.contains(SAFARI_BUNDLE_ID));
    let (found, enabled) = match line {
        Some(l) => {
            let first = l.chars().next();
            let en = match first {
                Some('+') => Some(true),
                Some('-') => Some(false),
                _ => None,
            };
            (true, en)
        }
        None => (false, None),
    };
    BrowserStatus {
        present: running,
        installed: true,
        profiles: vec![ProfileStatus {
            name: "(Safari has no profiles)".to_string(),
            is_default: true,
            installed: found,
            enabled,
            private_browsing: None, // Not reachable; see MVP profile-scan TODO.
            note: None,
        }],
        error: None,
    }
}

#[cfg(not(target_os = "macos"))]
fn scan_safari() -> BrowserStatus {
    BrowserStatus {
        present: false,
        installed: false,
        profiles: vec![],
        error: Some("Safari is macOS-only".to_string()),
    }
}

/// True if every running-and-present browser has at least one profile
/// that reports installed+enabled+privateBrowsing=true on the default
/// profile. Used by onboarding to gate the backend switch.
///
/// Safari is a special case: "Allow in Private Browsing" lives inside
/// Safari's sandboxed extension container, which we can't read
/// without Full Disk Access. Instead of demanding FDA, we let the
/// Safari extension report its own state over the native-messaging
/// channel. The scanner here
/// accepts `private_browsing == None` on Safari as "trust the
/// extension's self-report" rather than treating it as a failure.
pub fn compliant(result: &ScanResult) -> bool {
    let chromium_or_firefox = [&result.firefox, &result.chrome, &result.brave, &result.edge];
    let chromium_ok = chromium_or_firefox.iter().all(|b| {
        !b.present || {
            let def = b.profiles.iter().find(|p| p.is_default).or_else(|| b.profiles.first());
            matches!(
                def,
                Some(p) if p.installed
                    && p.enabled == Some(true)
                    && p.private_browsing == Some(true)
            )
        }
    });
    let safari_ok = !result.safari.present || {
        let def = result.safari.profiles.iter().find(|p| p.is_default).or_else(|| result.safari.profiles.first());
        // Safari: only require installed + enabled; private-browsing
        // is reported separately by the extension.
        matches!(def, Some(p) if p.installed && p.enabled != Some(false))
    };
    chromium_ok && safari_ok
}
