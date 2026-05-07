// In-process app watcher.
//
// Replaces the helper-daemon's privileged watcher. Runs as the user
// and works without elevation, AppleScript, or Accessibility/Automation
// TCC. The previous AppleScript-based NSWorkspace observer was unable
// to actually deliver activate-notifications because AppleScript's
// `delay` doesn't pump the Cocoa run loop — observers never fired.
// Polling sysinfo is dumber but reliable.
//
// Behaviour (per blocked-app PID):
//
//   1. **Graceful quit.** First sighting fires the platform's polite
//      quit primitive — `[NSRunningApplication terminate]` on macOS,
//      `taskkill /PID <pid>` (no `/F`) on Windows. Both run the
//      target app's normal terminate path, including the
//      "save changes?" sheet for any dirty documents. Before that
//      quit we call `activateWithOptions:` / `SetForegroundWindow`
//      so that app is visibly in front and easy to find. We never use
//      POSIX SIGTERM here: it bypasses Cocoa's
//      `applicationShouldTerminate:` and would silently destroy
//      unsaved work — the exact scenario this design exists to avoid.
//
//   2. **Grace, then warning.** If the PID is still alive after
//      `QUIT_TO_WARNING_GRACE`, we do **not** send another polite quit —
//      we surface the warning overlay and 60-second countdown. One
//      prior quit is enough; a second nudge was removed as redundant.
//
//   3. **Warning overlay.** We transition into a warning phase: emit
//      `app-blocking://warning-show` so the frontend renders a big
//      red countdown modal. The compact ReDD Block window stays
//      `always_on_top` but we avoid `activateIgnoringOtherApps` and
//      `set_focus` so the blocked app usually remains the key
//      application while the user tends to save dialogs. We also
//      foreground the blocked app when entering this phase so its
//      windows stay easy to spot. The countdown ticks down only while
//      the user is *active* (system input within the last
//      `IDLE_THRESHOLD_SECS`). Idle pauses the countdown; returning
//      from idle resumes it where it left off (we deliberately do NOT
//      reset, so stepping away mid-countdown can't be used to extend
//      the deadline indefinitely). The pause guarantees that the
//      countdown only burns through conscious wall-clock time.
//
//   4. **Force-quit.** When the countdown reaches zero with the user
//      still active, we SIGKILL the process. This is the *only* path
//      that can destroy unsaved work from the watcher. The warning
//      modal offers only a batch "foreground + quit again" gesture;
//      there is no in-UI immediate-kill button.
//
// `is_protected` keeps us from ever quitting ReDD Block, the OS
// loginwindow, Finder, etc.

use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub type BlockedApps = Arc<RwLock<HashSet<String>>>;

const POLL_INTERVAL: Duration = Duration::from_millis(1000);
/// After the sole polite quit, wait this long (while the PID stays
/// alive) before raising the warning — gives time to answer a save
/// sheet without a second quit signal.
const QUIT_TO_WARNING_GRACE: Duration = Duration::from_secs(15);
/// Fully-conscious time the warning overlay is shown before we
/// SIGKILL. Pauses while the user is idle, but resumes from where it
/// left off when they come back — AFK time never counts toward this,
/// but stepping away can't extend it either.
const WARNING_COUNTDOWN: Duration = Duration::from_secs(60);
/// Anything with no input activity for this long counts as AFK; the
/// countdown pauses while idle and resumes (does not reset) the
/// instant the user becomes active again. Five seconds is short
/// enough that "user is reading the warning" still ticks down the
/// countdown but long enough that "user stepped away to grab water"
/// reliably pauses it.
const IDLE_THRESHOLD_SECS: f64 = 5.0;

const PROTECTED: &[&str] = &[
    "ReDD Block", "redd-block", "ReddBlock",
    "System Events", "Finder", "loginwindow", "WindowServer",
    "explorer.exe", "dwm.exe", "winlogon.exe", "svchost.exe",
];

fn is_protected(name: &str) -> bool {
    PROTECTED.iter().any(|p| name.eq_ignore_ascii_case(p))
}

// ---- Public handle --------------------------------------------------------

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
        // also keeps quit/escalation bookkeeping in one place.
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
///
/// `app` is `Option` so the standalone `examples/test_watcher`
/// exerciser — which has no Tauri context — can still spin up the
/// watcher. In production the `set_blocked_apps` command always
/// passes `Some(app_handle)`, which the worker uses to emit warning
/// events to the frontend. With `app == None`, the watcher still
/// runs the full state machine but events are dropped on the floor
/// (no frontend to render them anyway).
pub fn start(app: Option<AppHandle>) -> Handle {
    let apps: BlockedApps = Arc::new(RwLock::new(HashSet::new()));
    let stop = Arc::new(AtomicBool::new(false));
    let apps_for_thread = apps.clone();
    let stop_for_thread = stop.clone();
    let join = std::thread::spawn(move || run(app, apps_for_thread, stop_for_thread));
    Handle {
        apps,
        stop,
        join: Mutex::new(Some(join)),
    }
}

// ---- Event payloads -------------------------------------------------------

/// Emitted once when a PID transitions into the warning phase.
#[derive(Clone, Debug, Serialize)]
struct WarningShow {
    pid: u32,
    name: String,
    total_secs: u64,
}

/// Emitted every poll tick while a PID is in the warning phase. The
/// frontend renders `remaining_secs` directly; `paused` flips the UI
/// into "(paused — you're idle)" mode without changing the number.
#[derive(Clone, Debug, Serialize)]
struct WarningUpdate {
    pid: u32,
    name: String,
    remaining_secs: u64,
    total_secs: u64,
    paused: bool,
}

/// Emitted when a PID leaves the warning phase, regardless of cause.
/// `reason` lets the UI distinguish "the user saved + quit" (stop
/// showing the warning silently) from "we force-killed" (show a
/// post-mortem toast so they know their work is gone).
#[derive(Clone, Debug, Serialize)]
struct WarningHide {
    pid: u32,
    name: String,
    reason: HideReason,
}

#[derive(Clone, Debug, Serialize, Copy)]
#[serde(rename_all = "snake_case")]
enum HideReason {
    /// App exited cleanly (user saved or discarded, OR user clicked
    /// the explicit "Force-quit" button) before the countdown
    /// elapsed. Watcher discovered the PID is gone.
    Resolved,
    /// Countdown elapsed with user active; we SIGKILLed.
    ForceKilled,
}

/// How many blocked apps are currently in the warning phase —
/// drives `set_blocking_warning_attention` ref-counting.
static BLOCKING_WARNING_LAYERS: AtomicU32 = AtomicU32::new(0);

pub(crate) fn blocking_warning_begin(app: Option<&AppHandle>) {
    let prev = BLOCKING_WARNING_LAYERS.fetch_add(1, Ordering::SeqCst);
    if prev == 0 {
        #[cfg(target_os = "macos")]
        {
            // Dock + app menu appear when the countdown is visible, but we avoid
            // `NSApplication activateIgnoringOtherApps` so the blocked app can
            // remain the key app while the warning floats on top.
            crate::set_macos_activation_policy(true);
        }
        if let Some(a) = app {
            crate::commands::set_blocking_warning_attention(a, true);
            crate::commands::enter_blocking_warning_compact_window(a);
        }
    }
}

pub(crate) fn blocking_warning_end(app: Option<&AppHandle>) {
    let prev = BLOCKING_WARNING_LAYERS.fetch_sub(1, Ordering::SeqCst);
    if prev == 1 {
        if let Some(a) = app {
            crate::commands::leave_blocking_warning_compact_window(a);
            crate::commands::set_blocking_warning_attention(a, false);
        }
    }
}

fn emit_warning_show(app: Option<&AppHandle>, pid: u32, name: &str, total_secs: u64) {
    blocking_warning_begin(app);
    if let Some(a) = app {
        crate::commands::show_blocking_warning_shell_without_stealing_focus(a);
        crate::commands::activate_external_process_by_pid(pid);
    }
    if let Some(app) = app {
        let _ = app.emit(
            "app-blocking://warning-show",
            WarningShow {
                pid,
                name: name.to_string(),
                total_secs,
            },
        );
    }
}

fn emit_warning_update(
    app: Option<&AppHandle>,
    pid: u32,
    name: &str,
    remaining_secs: u64,
    total_secs: u64,
    paused: bool,
) {
    if let Some(app) = app {
        let _ = app.emit(
            "app-blocking://warning-update",
            WarningUpdate {
                pid,
                name: name.to_string(),
                remaining_secs,
                total_secs,
                paused,
            },
        );
    }
}

fn emit_warning_hide(app: Option<&AppHandle>, pid: u32, name: &str, reason: HideReason) {
    if let Some(app) = app {
        let _ = app.emit(
            "app-blocking://warning-hide",
            WarningHide {
                pid,
                name: name.to_string(),
                reason,
            },
        );
    }
    blocking_warning_end(app);
}

// ---- Per-PID state machine ------------------------------------------------

#[derive(Debug)]
enum PidPhase {
    /// One polite Cmd-Q-equivalent quit has been sent. If the PID
    /// survives past `QUIT_TO_WARNING_GRACE`, we open the warning overlay
    /// (no second automatic quit — the user may use “Try again” in UI).
    Quitting {
        last_attempt: Instant,
    },
    /// Warning overlay is up; counting down.
    Warning {
        remaining: Duration,
        was_idle_last_tick: bool,
    },
}

#[derive(Debug)]
struct PidEntry {
    /// The user-list name we matched against this process — emitted
    /// to the UI so the warning shows "Microsoft Word" instead of
    /// the kernel binary name. Stays stable across the entry's
    /// lifetime even if the user later removes the app from the
    /// blocklist (we still need to honour the in-flight warning).
    matched_name: String,
    phase: PidPhase,
}

// ---- Run loop -------------------------------------------------------------

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn run(app: Option<AppHandle>, apps: BlockedApps, stop: Arc<AtomicBool>) {
    let mut entries: HashMap<sysinfo::Pid, PidEntry> = HashMap::new();
    while !stop.load(Ordering::SeqCst) {
        sweep(app.as_ref(), &apps, &mut entries);
        std::thread::sleep(POLL_INTERVAL);
    }
    // On stop: clear any in-flight warnings so the UI doesn't keep
    // showing a stale modal after the watcher's gone.
    for (pid, entry) in entries.drain() {
        if matches!(entry.phase, PidPhase::Warning { .. }) {
            emit_warning_hide(app.as_ref(), pid.as_u32(), &entry.matched_name, HideReason::Resolved);
        }
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn run(_app: Option<AppHandle>, _apps: BlockedApps, _stop: Arc<AtomicBool>) {
    // Linux has no in-process watcher; blocking apps would need a
    // distro-specific approach (e.g. cgroup freezer) — out of scope.
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn sweep(
    app: Option<&AppHandle>,
    apps: &BlockedApps,
    entries: &mut HashMap<sysinfo::Pid, PidEntry>,
) {
    use sysinfo::{ProcessesToUpdate, System};

    let blocked: Vec<String> = match apps.read() {
        Ok(g) => g.iter().cloned().collect(),
        Err(_) => return,
    };
    if blocked.is_empty() {
        if !entries.is_empty() {
            // Block ended (e.g. user paused / cleared) — clear any
            // in-flight warnings so the UI stops showing them.
            for (pid, entry) in entries.drain() {
                if matches!(entry.phase, PidPhase::Warning { .. }) {
                    emit_warning_hide(
                        app,
                        pid.as_u32(),
                        &entry.matched_name,
                        HideReason::Resolved,
                    );
                }
            }
        }
        return;
    }

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let now = Instant::now();
    let idle = system_idle_seconds();
    let mut still_alive: HashSet<sysinfo::Pid> = HashSet::new();

    for (pid, proc_) in sys.processes() {
        let name = proc_.name().to_string_lossy().to_string();
        if name.is_empty() || is_protected(&name) {
            continue;
        }
        let stem = name.strip_suffix(".exe").unwrap_or(&name);
        let matched_name = match blocked
            .iter()
            .find(|b| b.eq_ignore_ascii_case(&name) || b.eq_ignore_ascii_case(stem))
        {
            Some(n) => n.clone(),
            None => continue,
        };
        still_alive.insert(*pid);

        match entries.entry(*pid) {
            Entry::Vacant(slot) => {
                // First sighting — fire the polite Cmd-Q.
                log::info!(
                    "app_watcher: graceful-quit pid={pid} name='{name}' (first sighting)"
                );
                request_graceful_quit(*pid, &name, proc_);
                slot.insert(PidEntry {
                    matched_name,
                    phase: PidPhase::Quitting {
                        last_attempt: now,
                    },
                });
            }
            Entry::Occupied(slot) => {
                // Compute the next phase from the current one. We
                // pull copyable fields out so we don't hold a borrow
                // across `proc_.kill()` / event emits.
                let current = slot.get();
                let next_phase = match &current.phase {
                    PidPhase::Quitting {
                        last_attempt,
                    } => {
                        let last_attempt = *last_attempt;
                        if now.duration_since(last_attempt) < QUIT_TO_WARNING_GRACE {
                            // Inside grace window — let save sheets play out.
                            continue_phase(&slot)
                        } else {
                            log::info!(
                                "app_watcher: pid={pid} name='{name}' still running after polite quit + grace; raising warning overlay"
                            );
                            emit_warning_show(
                                app,
                                pid.as_u32(),
                                &current.matched_name,
                                WARNING_COUNTDOWN.as_secs(),
                            );
                            PidPhase::Warning {
                                remaining: WARNING_COUNTDOWN,
                                was_idle_last_tick: idle >= IDLE_THRESHOLD_SECS,
                            }
                        }
                    }
                    PidPhase::Warning {
                        remaining,
                        was_idle_last_tick,
                    } => {
                        let mut remaining = *remaining;
                        let _ = *was_idle_last_tick; // tracked for emit-paused only
                        let is_idle = idle >= IDLE_THRESHOLD_SECS;
                        if !is_idle {
                            // Countdown only decrements while the user is
                            // active. Returning from idle resumes from
                            // where we paused — we deliberately do NOT
                            // reset back to the full window, so a user
                            // who walks away mid-countdown can't game
                            // the timer by stepping away.
                            remaining = remaining.saturating_sub(POLL_INTERVAL);
                        }
                        emit_warning_update(
                            app,
                            pid.as_u32(),
                            &current.matched_name,
                            remaining.as_secs(),
                            WARNING_COUNTDOWN.as_secs(),
                            is_idle,
                        );
                        if remaining.is_zero() && !is_idle {
                            log::info!(
                                "app_watcher: warning countdown elapsed for pid={pid} name='{}'; SIGKILL",
                                current.matched_name
                            );
                            if proc_.kill() {
                                emit_warning_hide(
                                    app,
                                    pid.as_u32(),
                                    &current.matched_name,
                                    HideReason::ForceKilled,
                                );
                                slot.remove();
                                continue;
                            }
                            log::warn!(
                                "app_watcher: SIGKILL failed for pid={pid} name='{name}' — will retry"
                            );
                        }
                        PidPhase::Warning {
                            remaining,
                            was_idle_last_tick: is_idle,
                        }
                    }
                };
                slot.into_mut().phase = next_phase;
            }
        }
    }

    // PIDs we were tracking that are no longer alive — they exited
    // (cleanly via the user saving + quitting, or watcher SIGKILL when
    // the idle-aware countdown finished). Clear any active warning UI.
    let dropped: Vec<_> = entries
        .keys()
        .filter(|pid| !still_alive.contains(pid))
        .copied()
        .collect();
    for pid in dropped {
        if let Some(entry) = entries.remove(&pid) {
            log::info!(
                "app_watcher: pid={pid} name='{}' is gone",
                entry.matched_name
            );
            if matches!(entry.phase, PidPhase::Warning { .. }) {
                emit_warning_hide(app, pid.as_u32(), &entry.matched_name, HideReason::Resolved);
            }
        }
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn sweep(
    _app: Option<&AppHandle>,
    _apps: &BlockedApps,
    _entries: &mut HashMap<u32, PidEntry>,
) {
}

/// Dummy returned by the "no transition this tick" branch. Cloning
/// out of `slot.get()` would require `PidPhase: Clone`, which is
/// noisy for a single use. We just rebuild the same variant by hand
/// — cheap because `Quitting` holds a `Copy` field.
#[cfg(any(target_os = "macos", target_os = "windows"))]
fn continue_phase(slot: &std::collections::hash_map::OccupiedEntry<sysinfo::Pid, PidEntry>) -> PidPhase {
    match &slot.get().phase {
        PidPhase::Quitting {
            last_attempt,
        } => PidPhase::Quitting {
            last_attempt: *last_attempt,
        },
        PidPhase::Warning {
            remaining,
            was_idle_last_tick,
        } => PidPhase::Warning {
            remaining: *remaining,
            was_idle_last_tick: *was_idle_last_tick,
        },
    }
}

// ---- System idle ----------------------------------------------------------

/// Seconds since the last user input event (mouse / keyboard /
/// trackpad / etc.). Used to gate the warning countdown so AFK time
/// never counts toward force-quit. Returns 0.0 on platforms or
/// failures we can't read — failing closed (treating the user as
/// active) is correct here: it means the countdown ticks, but the
/// user is the one responsible for being there to see the warning.
#[cfg(target_os = "macos")]
fn system_idle_seconds() -> f64 {
    // CGEventSourceSecondsSinceLastEventType is the canonical macOS
    // API for "system-wide idle time". Public, doesn't need any TCC
    // entitlement (unlike Accessibility-based equivalents). Lives in
    // CoreGraphics; we link the framework directly so we don't have
    // to add another crate dep.
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(
            source_state_id: u32,
            event_type: u32,
        ) -> f64;
    }
    // kCGEventSourceStateCombinedSessionState = 0 — covers the whole
    // login session (HID + WindowServer-synthesised events), which is
    // what we want.
    const COMBINED_SESSION_STATE: u32 = 0;
    // kCGAnyInputEventType = ~0u32 — match any input.
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;
    unsafe { CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE) }
}

#[cfg(target_os = "windows")]
fn system_idle_seconds() -> f64 {
    // GetLastInputInfo + GetTickCount is the Win32 equivalent. Both
    // are user32/kernel32 entry points that need no special permissions.
    #[repr(C)]
    struct LastInputInfo {
        cb_size: u32,
        dw_time: u32,
    }
    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount() -> u32;
    }
    let mut info = LastInputInfo {
        cb_size: std::mem::size_of::<LastInputInfo>() as u32,
        dw_time: 0,
    };
    unsafe {
        if GetLastInputInfo(&mut info) != 0 {
            // GetTickCount wraps every ~49.7 days, so use
            // wrapping_sub to stay correct across the wrap.
            let elapsed_ms = GetTickCount().wrapping_sub(info.dw_time);
            f64::from(elapsed_ms) / 1000.0
        } else {
            0.0
        }
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
#[allow(dead_code)]
fn system_idle_seconds() -> f64 {
    0.0
}

// ---- Graceful quit primitive ----------------------------------------------

/// Send the platform's "Cmd-Q equivalent" — the polite quit primitive
/// that runs the target app's own terminate path, including any
/// unsaved-work prompts. Crucially NOT the same as a POSIX signal:
/// SIGTERM bypasses Cocoa's `applicationShouldTerminate:` and would
/// silently destroy unsaved documents.
#[cfg(target_os = "macos")]
fn request_graceful_quit(pid: sysinfo::Pid, name: &str, proc_: &sysinfo::Process) {
    crate::commands::activate_external_process_by_pid(pid.as_u32());
    // -[NSRunningApplication terminate] sends the AppKit quit Apple
    // Event (`'aevt' 'quit'`) — the same event Cmd-Q dispatches.
    // Available without Automation TCC because we're calling the
    // OS-provided API by PID, not asking another app to run a
    // script. If the lookup fails for some reason (process gone,
    // class missing) we fall back to SIGTERM — still better than
    // SIGKILL, even if it bypasses the save sheet for the few apps
    // that do trap SIGTERM.
    use cocoa::base::{id, BOOL, YES};
    use objc::runtime::Class;
    use objc::{msg_send, sel, sel_impl};

    let raw_pid: i32 = pid.as_u32() as i32;
    unsafe {
        let class = match Class::get("NSRunningApplication") {
            Some(c) => c,
            None => {
                log::warn!(
                    "app_watcher: NSRunningApplication class missing; falling back to SIGTERM for pid={pid} '{name}'"
                );
                let _ = proc_.kill_with(sysinfo::Signal::Term);
                return;
            }
        };
        let app: id = msg_send![class, runningApplicationWithProcessIdentifier: raw_pid];
        if app.is_null() {
            log::warn!(
                "app_watcher: NSRunningApplication lookup returned nil for pid={pid} '{name}'; falling back to SIGTERM"
            );
            let _ = proc_.kill_with(sysinfo::Signal::Term);
            return;
        }
        let ok: BOOL = msg_send![app, terminate];
        if ok != YES {
            log::warn!(
                "app_watcher: -[NSRunningApplication terminate] returned NO for pid={pid} '{name}'; falling back to SIGTERM"
            );
            let _ = proc_.kill_with(sysinfo::Signal::Term);
        }
    }
}

#[cfg(target_os = "windows")]
fn request_graceful_quit(pid: sysinfo::Pid, name: &str, _proc: &sysinfo::Process) {
    crate::commands::activate_external_process_by_pid(pid.as_u32());
    // `taskkill /PID <pid>` (without `/F`) posts WM_CLOSE to the
    // process's top-level windows — the closest Win32 primitive to
    // Cmd-Q. Apps that ask "save changes?" on a normal close get
    // to run that prompt instead of being TerminateProcess-ed
    // mid-write. This is the same primitive `enforcer::quit_browser`
    // uses to politely close non-compliant browsers.
    use crate::windows_process::hidden_command;

    let raw_pid = pid.as_u32().to_string();
    log::info!("app_watcher: taskkill /PID {raw_pid} (graceful close of '{name}')");
    match hidden_command("taskkill").args(["/PID", &raw_pid]).output() {
        Ok(out) => log::debug!(
            "app_watcher: taskkill /PID {raw_pid} -> exit {:?}",
            out.status.code()
        ),
        Err(e) => log::warn!("app_watcher: taskkill /PID {raw_pid} spawn failed: {e}"),
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
#[allow(dead_code)]
fn request_graceful_quit(_pid: sysinfo::Pid, _name: &str, _proc: &sysinfo::Process) {}

// ---- Imperative actions for the warning modal ---------------------------
//
// The UI sends warned PIDs from the overlay. We optionally foreground
// each in sequence (short pauses between) so stacks of blocked apps are
// visibly cycled, then re-issue one graceful quit per PID.

#[cfg(any(target_os = "macos", target_os = "windows"))]
const ACTIVATION_STAGGER_MS: u64 = 200;

fn dedupe_nonempty_pids(pids: &[u32]) -> Vec<u32> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for &p in pids {
        if p != 0 && seen.insert(p) {
            out.push(p);
        }
    }
    out
}

/// Foreground pass (staggered) then one graceful quit signal per PID.
pub fn user_request_activate_then_polite_quit_round(pids: &[u32]) {
    let uniq = dedupe_nonempty_pids(pids);
    if uniq.is_empty() {
        return;
    }
    log::info!(
        "app_watcher: batch focus then polite quit for {} processes {:?}",
        uniq.len(),
        uniq
    );

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        for (i, pid) in uniq.iter().enumerate() {
            crate::commands::activate_external_process_by_pid(*pid);
            if i + 1 < uniq.len() {
                std::thread::sleep(Duration::from_millis(ACTIVATION_STAGGER_MS));
            }
        }
    }

    polite_quit_for_pid_list(&uniq);
}

fn polite_quit_for_pid_list(pids: &[u32]) {
    use sysinfo::{ProcessesToUpdate, System};
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    for &pid_u in pids {
        let pid_typed = sysinfo::Pid::from_u32(pid_u);
        match sys.process(pid_typed) {
            Some(proc_) => {
                let name = proc_.name().to_string_lossy().to_string();
                log::info!("app_watcher: polite quit pid={pid_u} name='{name}' (batch)");
                request_graceful_quit(pid_typed, &name, proc_);
            }
            None => log::debug!("app_watcher: polite quit skipped — pid={pid_u} not running"),
        }
    }
}
