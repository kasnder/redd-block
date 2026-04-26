// In-process enforcement loop for the browser-extension backend.
//
// Every `TICK` seconds, scan each supported browser's default profile.
// If a browser is running but its scan fails (missing / disabled / not
// allowed in private browsing), start a grace countdown, emit events
// the UI turns into a persistent toast + "Fix now" deep-link, and
// quit the browser if the grace expires without the user fixing it.
//
// Originally ported from the MVP enforcer prototype (see git history
// for browser-ext-mvp/enforcer/enforce.mjs).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
#[cfg(any(target_os = "macos", target_os = "windows"))]
use tauri_plugin_notification::NotificationExt;

use crate::profile_scan::{self, BrowserStatus, ProfileStatus};

const TICK: Duration = Duration::from_secs(5);
const HARD_KILL_AFTER: Duration = Duration::from_secs(10);

// User-configurable grace period before a non-compliant browser is
// quit. Read from settings.extensionGraceSeconds on every grace-start
// so changes take effect on the *next* timer (active timers keep
// their original deadline). Defaults to 60s; clamped to a sane range
// so a typo can't disable enforcement entirely or starve the user
// of any chance to fix things.
const GRACE_DEFAULT_SECS: u64 = 60;
pub const GRACE_MIN_SECS: u64 = 5;
pub const GRACE_MAX_SECS: u64 = 300;

fn current_grace(app: &AppHandle) -> Duration {
    let secs = crate::commands::canonical_data_path(app)
        .and_then(|p| std::fs::read_to_string(&p).ok())
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
        .and_then(|v| v.get("settings").and_then(|s| s.get("extensionGraceSeconds")).and_then(|n| n.as_u64()))
        .unwrap_or(GRACE_DEFAULT_SECS)
        .clamp(GRACE_MIN_SECS, GRACE_MAX_SECS);
    Duration::from_secs(secs)
}

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
                let offenses = {
                    let c = s.offenses.entry(key).and_modify(|c| *c += 1).or_insert(1);
                    *c
                };
                // Single user-configured grace for both first and
                // repeat offenses. The previous "30s for repeats"
                // distinction was anti-user once the grace became
                // configurable — a 5s setting still gave 5s on
                // repeats, a 300s setting still gave 300s.
                let grace = current_grace(app);
                s.timers.insert(
                    key,
                    TimerState {
                        deadline: Instant::now() + grace,
                        total: grace,
                        offense_count: offenses,
                    },
                );
                (false, true)
            }
        };

        if fresh {
            emit_update(app, state, key);
            notify_grace_started(app, key);
            continue;
        }

        if expired {
            // Pop the timer before killing so a concurrent tick doesn't
            // re-enter this branch.
            if let Ok(mut s) = state.lock() {
                s.timers.remove(&key);
            }
            quit_browser(key);
            notify_killed(app, key);
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
    let pair = state.lock().ok().and_then(|s| {
        s.timers.get(&key).map(|t| {
            let remaining = t.deadline.saturating_duration_since(Instant::now());
            (remaining, t.total)
        })
    });
    let (remaining, total) = match pair {
        Some(p) => p,
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

fn notify_grace_started(app: &AppHandle, key: BrowserKey) {
    let secs = current_grace(app).as_secs();
    notify(
        app,
        "ReDD Block: action required",
        &format!(
            "{} extension is missing or disabled. Re-enable within {}s or {} will be closed.",
            key.label(),
            secs,
            key.label()
        ),
    );
}

fn notify_killed(app: &AppHandle, key: BrowserKey) {
    notify(
        app,
        "ReDD Block",
        &format!(
            "{} was closed because the ReDD Block extension was missing or disabled.",
            key.label()
        ),
    );
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn notify(app: &AppHandle, title: &str, body: &str) {
    if let Err(e) = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        log::warn!("notification failed: {e}");
    } else {
        log::info!("notification: {title} - {body}");
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn notify(_app: &AppHandle, _title: &str, _body: &str) {}

// ---- Process detection + quit -----------------------------------------

fn running_browsers() -> std::collections::HashSet<BrowserKey> {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
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

#[cfg(target_os = "macos")]
fn quit_browser(key: BrowserKey) {
    // SIGTERM all matching processes, give them HARD_KILL_AFTER to
    // shut down (browsers persist session/cookies on graceful quit),
    // then SIGKILL anything still alive. Same primitive as the app
    // watcher — no AppleScript and no Automation TCC dependency.
    use sysinfo::{ProcessesToUpdate, Signal, System};

    let names = key.process_names();
    let matches = |name: &str| -> bool {
        let lower = name.to_ascii_lowercase();
        names.iter().any(|n| lower.ends_with(&n.to_ascii_lowercase()))
    };

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    for proc_ in sys.processes().values() {
        let name = proc_.name().to_string_lossy().to_string();
        if !matches(&name) {
            continue;
        }
        if let Some(false) = proc_.kill_with(Signal::Term) {
            log::warn!("enforcer: SIGTERM failed for pid={} name='{}'", proc_.pid(), name);
        }
    }

    std::thread::sleep(HARD_KILL_AFTER);

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    for proc_ in sys.processes().values() {
        let name = proc_.name().to_string_lossy().to_string();
        if !matches(&name) {
            continue;
        }
        log::info!("enforcer: SIGKILL pid={} name='{}'", proc_.pid(), name);
        if !proc_.kill() {
            log::warn!("enforcer: SIGKILL failed for pid={} name='{}'", proc_.pid(), name);
        }
    }
}

#[cfg(target_os = "windows")]
fn quit_browser(key: BrowserKey) {
    // Windows has no SIGTERM. The closest graceful primitive is
    // posting WM_CLOSE to the browser's top-level window — that's
    // what `taskkill` (no /F) does, which lets Chromium run its
    // normal exit path and persist session/cookies. After
    // HARD_KILL_AFTER we escalate to forced termination on the whole
    // process tree.
    use std::process::Command;

    for name in key.process_names() {
        log::info!("enforcer: requesting graceful close of {name} (taskkill /T)");
        match Command::new("taskkill").args(["/IM", name, "/T"]).output() {
            Ok(out) => log::debug!(
                "enforcer: taskkill /IM {name} /T -> exit {:?}",
                out.status.code()
            ),
            Err(e) => log::warn!("enforcer: taskkill /IM {name} /T spawn failed: {e}"),
        }
    }

    std::thread::sleep(HARD_KILL_AFTER);

    for name in key.process_names() {
        log::info!("enforcer: forcing close of {name} (taskkill /F /T)");
        if let Err(e) = Command::new("taskkill")
            .args(["/F", "/IM", name, "/T"])
            .output()
        {
            log::warn!("enforcer: taskkill /F /IM {name} /T spawn failed: {e}");
        }
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn quit_browser(_key: BrowserKey) {
    // No enforcer support on Linux yet.
}
