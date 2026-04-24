// Rust port of browser-ext-mvp/profile-scan/scan.mjs.
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
    pub present: bool,
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
    BrowserStatus { present: false, profiles: vec![], error: None }
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

fn scan_firefox() -> Option<BrowserStatus> {
    let root = firefox_root()?;
    if !root.exists() {
        return Some(BrowserStatus { present: false, profiles: vec![], error: None });
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

    Some(BrowserStatus { present: true, profiles, error: None })
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

impl ChromiumBrowser {
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
    let root = b.root()?;
    if !root.exists() {
        return Some(BrowserStatus { present: false, profiles: vec![], error: None });
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

        if let Some(ext) = merged_settings.get(CHROMIUM_ID) {
            s.installed = true;
            let state = ext.get("state").and_then(|v| v.as_i64());
            let has_disable_reasons = match ext.get("disable_reasons") {
                Some(Value::Array(a)) => !a.is_empty(),
                Some(Value::Number(n)) => n.as_i64().map(|x| x != 0).unwrap_or(false),
                _ => false,
            };
            s.enabled = Some(state == Some(1) || (state.is_none() && !has_disable_reasons));
            s.private_browsing = Some(ext.get("incognito").and_then(|v| v.as_bool()).unwrap_or(false));
        }

        profiles.push(s);
    }

    Some(BrowserStatus { present: true, profiles, error: None })
}

// ---- Safari (macOS only) --------------------------------------------------

#[cfg(target_os = "macos")]
fn scan_safari() -> BrowserStatus {
    use std::process::Command;
    let output = Command::new("/usr/bin/pluginkit")
        .args(["-m", "-A", "-vvv", "-p", "com.apple.Safari.web-extension"])
        .output();
    let output = match output {
        Ok(o) => o,
        Err(e) => {
            return BrowserStatus { present: false, profiles: vec![], error: Some(e.to_string()) };
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
        present: true,
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
        profiles: vec![],
        error: Some("Safari is macOS-only".to_string()),
    }
}

/// True if every running-and-present browser has at least one profile
/// that reports installed+enabled+privateBrowsing=true on the default
/// profile. Used by onboarding to gate the backend switch.
pub fn compliant(result: &ScanResult) -> bool {
    let browsers = [&result.firefox, &result.chrome, &result.brave, &result.edge];
    browsers.iter().all(|b| {
        !b.present || {
            let def = b.profiles.iter().find(|p| p.is_default).or_else(|| b.profiles.first());
            matches!(
                def,
                Some(p) if p.installed
                    && p.enabled == Some(true)
                    && p.private_browsing == Some(true)
            )
        }
    })
}
