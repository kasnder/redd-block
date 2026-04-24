// In-process enforcement loop for the browser-extension backend.
//
// Every `TICK` seconds, scan each supported browser's default profile.
// If a browser is running but its scan fails (missing / disabled / not
// allowed in private browsing), start a grace countdown, emit events
// the UI turns into a persistent toast + "Fix now" deep-link, and
// quit the browser if the grace expires without the user fixing it.
//
// Ported from browser-ext-mvp/enforcer/enforce.mjs.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::profile_scan::{self, BrowserStatus, ProfileStatus};

const TICK: Duration = Duration::from_secs(5);
const GRACE_FIRST_OFFENSE: Duration = Duration::from_secs(60);
const GRACE_REPEAT: Duration = Duration::from_secs(30);
const HARD_KILL_AFTER: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BrowserKey { Firefox, Chrome, Brave, Edge }

impl BrowserKey {
    fn label(self) -> &'static str {
        match self {
            BrowserKey::Firefox => "Firefox",
            BrowserKey::Chrome => "Chrome",
            BrowserKey::Brave => "Brave",
            BrowserKey::Edge => "Edge",
        }
    }

    /// Process name as reported by sysinfo. Exact match on Windows
    /// (with extension), suffix match on macOS (bundle binary).
    fn process_names(self) -> &'static [&'static str] {
        #[cfg(target_os = "windows")]
        match self {
            BrowserKey::Firefox => &["firefox.exe"],
            BrowserKey::Chrome => &["chrome.exe"],
            BrowserKey::Brave => &["brave.exe"],
            BrowserKey::Edge => &["msedge.exe"],
        }
        #[cfg(target_os = "macos")]
        match self {
            BrowserKey::Firefox => &["firefox"],
            BrowserKey::Chrome => &["Google Chrome"],
            BrowserKey::Brave => &["Brave Browser"],
            BrowserKey::Edge => &["Microsoft Edge"],
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        match self {
            _ => &[],
        }
    }

    fn all() -> [BrowserKey; 4] {
        [BrowserKey::Firefox, BrowserKey::Chrome, BrowserKey::Brave, BrowserKey::Edge]
    }

    fn for_status<'a>(self, r: &'a profile_scan::ScanResult) -> &'a BrowserStatus {
        match self {
            BrowserKey::Firefox => &r.firefox,
            BrowserKey::Chrome => &r.chrome,
            BrowserKey::Brave => &r.brave,
            BrowserKey::Edge => &r.edge,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GraceEvent {
    pub browser: BrowserKey,
    pub label: &'static str,
    pub remaining_secs: u64,
    pub total_secs: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResolvedEvent {
    pub browser: BrowserKey,
    pub label: &'static str,
}

#[derive(Debug)]
struct TimerState {
    deadline: Instant,
    total: Duration,
    offense_count: u32,
}

#[derive(Default)]
struct EnforcerState {
    timers: HashMap<BrowserKey, TimerState>,
    offenses: HashMap<BrowserKey, u32>,
    enabled: bool,
}

/// Handle returned from `start`. Drop it to stop the loop.
pub struct EnforcerHandle {
    state: Arc<Mutex<EnforcerState>>,
}

impl EnforcerHandle {
    pub fn set_enabled(&self, enabled: bool) {
        if let Ok(mut s) = self.state.lock() {
            s.enabled = enabled;
            if !enabled {
                s.timers.clear();
            }
        }
    }
}

/// Spawn the enforcer loop. Emits `enforcer://grace-update` and
/// `enforcer://grace-resolved` events the UI can subscribe to.
pub fn start(app: AppHandle) -> EnforcerHandle {
    let state = Arc::new(Mutex::new(EnforcerState::default()));
    let state_clone = state.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);
        let enabled = state_clone.lock().map(|s| s.enabled).unwrap_or(false);
        if !enabled {
            continue;
        }
        tick(&app, &state_clone);
    });
    EnforcerHandle { state }
}

fn tick(app: &AppHandle, state: &Arc<Mutex<EnforcerState>>) {
    let scan_result = profile_scan::scan();
    let running = running_browsers();

    for key in BrowserKey::all() {
        let browser_status = key.for_status(&scan_result);
        let is_running = running.contains(&key);

        if !is_running {
            cancel_timer(app, state, key, false);
            continue;
        }

        if default_profile_passes(browser_status) {
            cancel_timer(app, state, key, true);
            continue;
        }

        // Failing. Either start a timer or check if it expired.
        let (expired, fresh) = {
            let mut s = match state.lock() {
                Ok(g) => g,
                Err(_) => continue,
            };
            if let Some(t) = s.timers.get(&key) {
                (Instant::now() >= t.deadline, false)
            } else {
                let offenses = s.offenses.entry(key).and_modify(|c| *c += 1).or_insert(1);
                let grace = if *offenses > 1 { GRACE_REPEAT } else { GRACE_FIRST_OFFENSE };
                s.timers.insert(
                    key,
                    TimerState {
                        deadline: Instant::now() + grace,
                        total: grace,
                        offense_count: *offenses,
                    },
                );
                (false, true)
            }
        };

        if fresh {
            emit_update(app, state, key);
            continue;
        }

        if expired {
            // Pop the timer before killing so a concurrent tick doesn't
            // re-enter this branch.
            if let Ok(mut s) = state.lock() {
                s.timers.remove(&key);
            }
            quit_browser(key);
        } else {
            emit_update(app, state, key);
        }
    }
}

fn default_profile_passes(b: &BrowserStatus) -> bool {
    if !b.present {
        return true; // Nothing to check.
    }
    let def: Option<&ProfileStatus> =
        b.profiles.iter().find(|p| p.is_default).or_else(|| b.profiles.first());
    match def {
        Some(p) => p.installed && p.enabled == Some(true) && p.private_browsing == Some(true),
        None => false,
    }
}

fn cancel_timer(app: &AppHandle, state: &Arc<Mutex<EnforcerState>>, key: BrowserKey, emit: bool) {
    let removed = state
        .lock()
        .map(|mut s| s.timers.remove(&key).is_some())
        .unwrap_or(false);
    if removed && emit {
        let _ = app.emit(
            "enforcer://grace-resolved",
            ResolvedEvent { browser: key, label: key.label() },
        );
    }
}

fn emit_update(app: &AppHandle, state: &Arc<Mutex<EnforcerState>>, key: BrowserKey) {
    let (remaining, total) = match state.lock().ok().and_then(|s| s.timers.get(&key).cloned_pair()) {
        Some(pair) => pair,
        None => return,
    };
    let _ = app.emit(
        "enforcer://grace-update",
        GraceEvent {
            browser: key,
            label: key.label(),
            remaining_secs: remaining.as_secs(),
            total_secs: total.as_secs(),
        },
    );
}

// Helper trait to extract (remaining, total) without holding the lock
// across the emit call.
trait TimerPair {
    fn cloned_pair(&self) -> Option<(Duration, Duration)>;
}
impl TimerPair for &TimerState {
    fn cloned_pair(&self) -> Option<(Duration, Duration)> {
        let remaining = self.deadline.saturating_duration_since(Instant::now());
        Some((remaining, self.total))
    }
}

// ---- Process detection + quit -----------------------------------------

fn running_browsers() -> std::collections::HashSet<BrowserKey> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_processes();
    let mut out = std::collections::HashSet::new();
    for key in BrowserKey::all() {
        for name in key.process_names() {
            let lowered = name.to_ascii_lowercase();
            if sys
                .processes()
                .values()
                .any(|p| p.name().to_string_lossy().to_ascii_lowercase().ends_with(&lowered))
            {
                out.insert(key);
                break;
            }
        }
    }
    out
}

#[cfg(target_os = "windows")]
fn quit_browser(key: BrowserKey) {
    use std::process::Command;
    for name in key.process_names() {
        // Graceful first.
        let _ = Command::new("taskkill").args(["/IM", name]).output();
    }
    std::thread::sleep(HARD_KILL_AFTER);
    for name in key.process_names() {
        let _ = Command::new("taskkill").args(["/IM", name, "/F"]).output();
    }
}

#[cfg(target_os = "macos")]
fn quit_browser(key: BrowserKey) {
    use std::process::Command;
    let app = match key {
        BrowserKey::Firefox => "Firefox",
        BrowserKey::Chrome => "Google Chrome",
        BrowserKey::Brave => "Brave Browser",
        BrowserKey::Edge => "Microsoft Edge",
    };
    let script = format!("tell application \"{app}\" to quit");
    let _ = Command::new("/usr/bin/osascript").args(["-e", &script]).output();
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn quit_browser(_key: BrowserKey) {
    // No enforcer support on Linux yet.
}
