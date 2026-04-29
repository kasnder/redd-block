// In-process app watcher.
//
// Replaces the helper-daemon's privileged watcher. Runs as the user
// and works without elevation, AppleScript, or Accessibility/Automation
// TCC. The previous AppleScript-based NSWorkspace observer was unable
// to actually deliver activate-notifications because AppleScript's
// `delay` doesn't pump the Cocoa run loop — observers never fired.
// Polling sysinfo is dumber but reliable, and `process.kill()` works
// without any per-app entitlement.
//
// Behaviour:
//   - Every POLL_INTERVAL we refresh the process table and find any
//     running process whose name matches a blocked app
//     (case-insensitive). On macOS we match the kernel-visible
//     process name (e.g. "Calculator"). On Windows we accept both
//     `name.exe` and `name`.
//   - First sighting of a matching PID gets SIGTERM (graceful — Cocoa
//     apps run `applicationShouldTerminate:`, save state, exit).
//   - If the same PID is still around after KILL_AFTER, we escalate
//     to SIGKILL / TerminateProcess. This handles apps that trap
//     SIGTERM and pop a "save unsaved work?" modal — without the
//     escalation the user could dismiss the modal and keep using the
//     app.
//   - `is_protected` keeps us from ever killing ReDD Block, the OS
//     loginwindow, Finder, etc.

use std::collections::HashMap;
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

pub type BlockedApps = Arc<RwLock<HashSet<String>>>;

const POLL_INTERVAL: Duration = Duration::from_millis(1000);
/// How long a SIGTERMed process is allowed to live before we escalate
/// to SIGKILL. Ten seconds is enough for an app to run its terminate
/// handler and persist any unsaved state — and for the user to click
/// "save" on a "you have unsaved work" modal — before we force.
const KILL_AFTER: Duration = Duration::from_secs(10);

const PROTECTED: &[&str] = &[
    "ReDD Block", "redd-block", "ReddBlock",
    "System Events", "Finder", "loginwindow", "WindowServer",
    "explorer.exe", "dwm.exe", "winlogon.exe", "svchost.exe",
];

fn is_protected(name: &str) -> bool {
    PROTECTED.iter().any(|p| name.eq_ignore_ascii_case(p))
}

/// Public handle returned from `start`. Use `set_apps` to update the
/// effective blocked set; drop-or-call-`stop` to tear down the watcher.
pub struct Handle {
    apps: BlockedApps,
    stop: Arc<AtomicBool>,
    join: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Handle {
    pub fn set_apps(&self, names: Vec<String>) {
        log::info!("app_watcher::set_apps called with {:?}", names);
        if let Ok(mut w) = self.apps.write() {
            w.clear();
            for n in names {
                if is_protected(&n) {
                    continue;
                }
                w.insert(n);
            }
        }
        // The poll loop picks up the new set on its next tick — no
        // need for an immediate sweep here. Skipping the eager pass
        // also keeps SIGTERM/SIGKILL bookkeeping in one place.
    }

    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Ok(mut slot) = self.join.lock() {
            if let Some(j) = slot.take() {
                let _ = j.join();
            }
        }
    }

    /// Snapshot of the currently effective blocked-app set, sorted
    /// alphabetically. Used by the diagnostics surface so the user
    /// can sanity-check what the watcher is actually enforcing right
    /// now.
    pub fn current_apps(&self) -> Vec<String> {
        match self.apps.read() {
            Ok(h) => {
                let mut v: Vec<String> = h.iter().cloned().collect();
                v.sort();
                v
            }
            Err(_) => Vec::new(),
        }
    }
}

/// Start the watcher. One polling thread per Handle.
pub fn start() -> Handle {
    let apps: BlockedApps = Arc::new(RwLock::new(HashSet::new()));
    let stop = Arc::new(AtomicBool::new(false));
    let apps_for_thread = apps.clone();
    let stop_for_thread = stop.clone();
    let join = std::thread::spawn(move || run(apps_for_thread, stop_for_thread));
    Handle {
        apps,
        stop,
        join: Mutex::new(Some(join)),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn run(apps: BlockedApps, stop: Arc<AtomicBool>) {
    use sysinfo::Pid;
    // PID → first time we saw this still-alive blocked process.
    // Used to escalate SIGTERM → SIGKILL after KILL_AFTER.
    let mut first_seen: HashMap<Pid, Instant> = HashMap::new();
    while !stop.load(Ordering::SeqCst) {
        sweep(&apps, &mut first_seen);
        std::thread::sleep(POLL_INTERVAL);
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn run(_apps: BlockedApps, _stop: Arc<AtomicBool>) {
    // Linux has no in-process watcher; blocking apps would need a
    // distro-specific approach (e.g. cgroup freezer) — out of scope.
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn sweep(apps: &BlockedApps, first_seen: &mut HashMap<sysinfo::Pid, Instant>) {
    use sysinfo::{ProcessesToUpdate, Signal, System};

    let blocked: Vec<String> = match apps.read() {
        Ok(g) => g.iter().cloned().collect(),
        Err(_) => return,
    };
    if blocked.is_empty() {
        first_seen.clear();
        return;
    }

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let now = Instant::now();
    let mut still_alive: HashSet<sysinfo::Pid> = HashSet::new();

    for (pid, proc_) in sys.processes() {
        let name = proc_.name().to_string_lossy().to_string();
        if name.is_empty() || is_protected(&name) {
            continue;
        }
        let stem = name.strip_suffix(".exe").unwrap_or(&name);
        let matched = blocked
            .iter()
            .any(|b| b.eq_ignore_ascii_case(&name) || b.eq_ignore_ascii_case(stem));
        if !matched {
            continue;
        }
        still_alive.insert(*pid);

        let first = *first_seen.entry(*pid).or_insert(now);
        let elapsed = now.duration_since(first);

        if elapsed >= KILL_AFTER {
            // App has been clinging on past the grace window — force.
            log::info!("app_watcher: SIGKILL pid={pid} name='{name}' (after {:?})", elapsed);
            if !proc_.kill() {
                log::warn!("app_watcher: SIGKILL failed for pid={pid} name='{name}'");
            }
        } else {
            // First sighting (or still inside grace window): graceful.
            log::info!("app_watcher: SIGTERM pid={pid} name='{name}'");
            let sent = match proc_.kill_with(Signal::Term) {
                Some(ok) => ok,
                // Windows: SIGTERM not supported, only TerminateProcess.
                None => proc_.kill(),
            };
            if !sent {
                log::warn!("app_watcher: terminate failed for pid={pid} name='{name}'");
            }
        }
    }

    // Drop bookkeeping for PIDs that are gone — either they exited or
    // they're no longer in the blocked set. Otherwise the map grows
    // unbounded over a long session.
    first_seen.retain(|pid, _| still_alive.contains(pid));
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn sweep(_apps: &BlockedApps, _first_seen: &mut HashMap<u32, Instant>) {}
