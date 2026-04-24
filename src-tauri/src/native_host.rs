// Native-messaging host mode for the ReDD Focus browser extension.
//
// The main binary is registered as the native-messaging host for the
// patched ReDD Focus extension on Chrome / Brave / Edge / Firefox (and
// on macOS, the Safari extension uses SafariWebExtensionHandler.swift
// directly — this file is not involved there).
//
// When the browser spawns this binary, it passes arguments like
// `--native-host chrome-extension://<id>/` (Chromium) or the extension
// id (Firefox). We detect the flag early in `main()` and branch into
// `run()` instead of starting the Tauri UI.
//
// Wire protocol (Chromium / Firefox):
//   each message is a 4-byte little-endian length followed by a
//   UTF-8 JSON payload. stdin = extension -> host, stdout = host ->
//   extension, stderr = free for logging.
//
// Responsibilities:
//   - read redd-block-data.json from the app-data dir,
//   - derive the current blocklist (active-blocks ∩ blocklists.websites
//     at time `now()`),
//   - push `{ "blocklist": [...] }` on connect,
//   - re-derive + re-push on file change (via notify) and every 30 s
//     (for time-only schedule transitions),
//   - drop the empty list when nothing is active so the extension
//     clears cleanly.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;

const POLL_INTERVAL: Duration = Duration::from_secs(30);

/// Return true if argv contains the native-host flag.
pub fn is_native_host_invocation() -> bool {
    std::env::args().any(|a| a == "--native-host")
}

/// Entry point. Blocks until stdin closes.
pub fn run() -> ! {
    log_to_file(&format!(
        "spawned pid={} argv={:?}",
        std::process::id(),
        std::env::args().collect::<Vec<_>>()
    ));

    let data_path = match resolve_data_path() {
        Some(p) => p,
        None => {
            log_to_file("resolve_data_path returned None; exiting");
            std::process::exit(1);
        }
    };

    // Push once on connect.
    send_blocklist(&derive_blocklist(&data_path));

    // Background refresh: file-watch + 30 s poll.
    let (tx, rx) = mpsc::channel::<()>();
    spawn_file_watcher(&data_path, tx.clone());
    spawn_poller(tx);

    // Read incoming stdin frames in this thread; on any change signal
    // (file-watch or poll tick), re-derive and push.
    let stdin = std::io::stdin();
    let mut stdin_lock = stdin.lock();
    loop {
        // Drain any pending change signals before blocking on stdin.
        while let Ok(()) = rx.try_recv() {
            send_blocklist(&derive_blocklist(&data_path));
        }

        let mut len_buf = [0u8; 4];
        match stdin_lock.read_exact(&mut len_buf) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                log_to_file("stdin EOF; exiting");
                std::process::exit(0);
            }
            Err(e) => {
                log_to_file(&format!("stdin read error: {e}; exiting"));
                std::process::exit(1);
            }
        }
        let len = u32::from_le_bytes(len_buf) as usize;
        let mut payload = vec![0u8; len];
        if let Err(e) = stdin_lock.read_exact(&mut payload) {
            log_to_file(&format!("stdin read payload error: {e}; exiting"));
            std::process::exit(1);
        }

        // We accept but don't currently act on extension -> host
        // messages beyond logging. Heartbeats from the extension could
        // live here later.
        if let Ok(s) = std::str::from_utf8(&payload) {
            log_to_file(&format!("recv: {s}"));
        }
    }
}

/// Send a blocklist payload to the extension over stdout.
fn send_blocklist(domains: &[String]) {
    #[derive(Serialize)]
    struct Msg<'a> {
        blocklist: &'a [String],
    }
    let msg = Msg { blocklist: domains };
    let body = match serde_json::to_vec(&msg) {
        Ok(b) => b,
        Err(e) => {
            log_to_file(&format!("serialize error: {e}"));
            return;
        }
    };
    let len = (body.len() as u32).to_le_bytes();
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    if lock.write_all(&len).and_then(|_| lock.write_all(&body)).is_err() {
        // The browser likely closed the pipe; exit cleanly.
        std::process::exit(0);
    }
    let _ = lock.flush();
}

fn spawn_file_watcher(path: &std::path::Path, tx: mpsc::Sender<()>) {
    let path = path.to_path_buf();
    // We poll mtime rather than depend on the `notify` crate so this
    // module stays dependency-light and works identically on every OS.
    // 2 s cadence is fine — blocklist changes are user-driven and not
    // latency-sensitive at the second level.
    std::thread::spawn(move || {
        let mut last = mtime(&path);
        loop {
            std::thread::sleep(Duration::from_secs(2));
            let current = mtime(&path);
            if current != last {
                last = current;
                let _ = tx.send(());
            }
        }
    });
}

fn spawn_poller(tx: mpsc::Sender<()>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(POLL_INTERVAL);
        let _ = tx.send(());
    });
}

fn mtime(path: &std::path::Path) -> Option<SystemTime> {
    std::fs::metadata(path).and_then(|m| m.modified()).ok()
}

/// Derive the blocklist that should be enforced right now by
/// intersecting `activeBlocks` whose `[startTime, endTime)` contains
/// now() with their blocklists' `websites`, plus any schedule window
/// that's currently active.
pub fn derive_blocklist(data_path: &std::path::Path) -> Vec<String> {
    let raw = match std::fs::read_to_string(data_path) {
        Ok(s) => s,
        Err(_) => return vec![],
    };
    let data: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return vec![],
    };
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let blocklists = data.get("blocklists").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let active = data.get("activeBlocks").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let schedules = data.get("schedules").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let websites_for = |id: &str| -> Vec<String> {
        blocklists
            .iter()
            .find(|b| b.get("id").and_then(|v| v.as_str()) == Some(id))
            .and_then(|b| b.get("websites").and_then(|v| v.as_array()))
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase())).collect())
            .unwrap_or_default()
    };

    let mut out: std::collections::BTreeSet<String> = Default::default();

    for ab in &active {
        let start = ab.get("startTime").and_then(|v| v.as_u64()).unwrap_or(0);
        let end = ab.get("endTime").and_then(|v| v.as_u64()).unwrap_or(0);
        let paused = ab.get("isPaused").and_then(|v| v.as_bool()).unwrap_or(false);
        if paused {
            continue;
        }
        if now_ms < start || now_ms >= end {
            continue;
        }
        if let Some(id) = ab.get("blocklistId").and_then(|v| v.as_str()) {
            for w in websites_for(id) {
                out.insert(w);
            }
        }
    }

    for sch in &schedules {
        if !is_schedule_active_now(sch, now_ms) {
            continue;
        }
        if let Some(id) = sch.get("blocklistId").and_then(|v| v.as_str()) {
            for w in websites_for(id) {
                out.insert(w);
            }
        }
    }

    out.into_iter().collect()
}

/// True if any segment of `schedule` is active at `now_ms` local time.
/// Mirrors the frontend `isScheduleSegmentActiveNow` behaviour
/// including cross-midnight, all-day, and pause-aware rules.
fn is_schedule_active_now(schedule: &Value, now_ms: u64) -> bool {
    let paused = schedule.get("isPaused").and_then(|v| v.as_bool()).unwrap_or(false);
    let pause_end = schedule.get("pauseEndTime").and_then(|v| v.as_u64()).unwrap_or(0);
    if paused && pause_end > now_ms {
        return false;
    }
    let segments = match schedule.get("segments").and_then(|v| v.as_array()) {
        Some(s) => s,
        None => return false,
    };
    let (wd, hour, minute) = match local_time_components(now_ms) {
        Some(t) => t,
        None => return false,
    };
    let now_min = hour as u32 * 60 + minute as u32;

    for seg in segments {
        let sh = seg.get("startHour").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let sm = seg.get("startMinute").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let eh = seg.get("endHour").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let em = seg.get("endMinute").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let start_min = sh * 60 + sm;
        let end_min = eh * 60 + em;
        let days: Vec<u8> = seg
            .get("days")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_u64().map(|x| x as u8)).collect())
            .unwrap_or_default();

        let all_day = start_min == end_min;
        if all_day {
            if days.contains(&wd) {
                return true;
            }
            continue;
        }

        if start_min < end_min {
            if days.contains(&wd) && now_min >= start_min && now_min < end_min {
                return true;
            }
        } else {
            // Cross-midnight: active today after start, or active
            // yesterday after start + before today's end.
            let yesterday = (wd + 6) % 7;
            if days.contains(&wd) && now_min >= start_min {
                return true;
            }
            if days.contains(&yesterday) && now_min < end_min {
                return true;
            }
        }
    }
    false
}

/// Return (weekday 0=Sun..6=Sat, hour 0..23, minute 0..59) in the
/// system local timezone. Uses libc `localtime_r` on unix and
/// `GetLocalTime` on Windows.
fn local_time_components(now_ms: u64) -> Option<(u8, u8, u8)> {
    let secs = (now_ms / 1000) as i64;
    #[cfg(unix)]
    unsafe {
        let time: libc::time_t = secs as libc::time_t;
        let mut tm: libc::tm = std::mem::zeroed();
        if libc::localtime_r(&time, &mut tm).is_null() {
            return None;
        }
        Some((tm.tm_wday as u8, tm.tm_hour as u8, tm.tm_min as u8))
    }
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{FILETIME, SYSTEMTIME};
        use windows::Win32::System::Time::FileTimeToSystemTime;
        // Convert unix seconds to a FILETIME (100ns ticks since 1601-01-01).
        const EPOCH_DIFF_100NS: i64 = 116_444_736_000_000_000;
        let ticks = (secs as i64) * 10_000_000 + EPOCH_DIFF_100NS;
        let ft = FILETIME {
            dwLowDateTime: (ticks as u32),
            dwHighDateTime: ((ticks >> 32) as u32),
        };
        let mut utc = SYSTEMTIME::default();
        let mut local = SYSTEMTIME::default();
        unsafe {
            if FileTimeToSystemTime(&ft, &mut utc).is_err() {
                return None;
            }
            if windows::Win32::System::Time::SystemTimeToTzSpecificLocalTime(
                None,
                &utc,
                &mut local,
            )
            .is_err()
            {
                return None;
            }
        }
        // SYSTEMTIME.wDayOfWeek is already 0=Sunday..6=Saturday.
        Some((local.wDayOfWeek as u8, local.wHour as u8, local.wMinute as u8))
    }
}

/// Canonical app-data path for the running user. Mirrors
/// `commands::data` path selection for the desktop case. We prefer the
/// shared system-wide location when it exists (the main app uses it),
/// and fall back to the per-user legacy path otherwise.
pub fn resolve_data_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let shared = PathBuf::from("/var/lib/redd-block/redd-block-data.json");
        if shared.exists() {
            return Some(shared);
        }
        let home = dirs::home_dir()?;
        Some(
            home.join("Library")
                .join("Application Support")
                .join("com.redd.block")
                .join("redd-block-data.json"),
        )
    }
    #[cfg(target_os = "windows")]
    {
        let shared = PathBuf::from(r"C:\ProgramData\ReDD Block\redd-block-data.json");
        if shared.exists() {
            return Some(shared);
        }
        let appdata = std::env::var_os("APPDATA").map(PathBuf::from)?;
        Some(appdata.join("com.redd.block").join("redd-block-data.json"))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

/// Append a line to a debug log alongside the app-data file. The
/// installed browser also captures stderr into its own log; this file
/// is just so the user (or us) can find out what happened.
fn log_to_file(msg: &str) {
    let Some(mut path) = resolve_data_path() else {
        return;
    };
    path.pop();
    path.push("native-host.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{ts}] {msg}");
    }
    // Also emit to stderr; browsers capture it.
    let _ = writeln!(std::io::stderr(), "{msg}");
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DerivedBlocklist {
    pub domains: Vec<String>,
}
