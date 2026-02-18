//! ReDD Block Helper Daemon
//!
//! This privileged helper runs as root and manages website and app blocking.
//! It communicates with the main Tauri app via Unix socket (macOS/Linux)
//! or TCP port (Windows).

// Hide the console window on Windows
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, Write};
#[cfg(target_os = "windows")]
use std::net::{TcpListener, TcpStream};
#[cfg(not(target_os = "windows"))]
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
#[cfg(target_os = "windows")]
use std::sync::atomic::{AtomicPtr, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

// Configuration
#[cfg(target_os = "windows")]
const SOCKET_PATH: &str = "127.0.0.1:62222";

#[cfg(not(target_os = "windows"))]
const SOCKET_PATH: &str = "/tmp/redd-block-helper.sock";

const BLOCK_MARKER_START: &str = "# === BEGIN REDD BLOCK (reddfocus.org) ===";
const BLOCK_MARKER_END: &str = "# === END REDD BLOCK (reddfocus.org) ===";



#[cfg(target_os = "windows")]
const HOSTS_PATH: &str = "C:\\Windows\\System32\\drivers\\etc\\hosts";

#[cfg(not(target_os = "windows"))]
const HOSTS_PATH: &str = "/etc/hosts";

// State types
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BlockState {
    domains: Vec<String>,
    end_time: u64, // Unix timestamp ms
    blocklist_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HelperState {
    current_block: Option<BlockState>,
    #[serde(default)]
    blocked_apps: Vec<String>,
    #[serde(default)]
    schedules: Vec<HelperSchedule>,
}

// Schedule types
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ScheduleSegment {
    #[serde(rename = "startHour")]
    start_hour: u8,
    #[serde(rename = "startMinute")]
    start_minute: u8,
    #[serde(rename = "endHour")]
    end_hour: u8,
    #[serde(rename = "endMinute")]
    end_minute: u8,
    days: Vec<u8>, // Mon=0..Sun=6
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HelperSchedule {
    id: String,
    domains: Vec<String>,
    #[serde(default)]
    apps: Vec<String>,
    segments: Vec<ScheduleSegment>,
}

// IPC messages
#[derive(Debug, Deserialize)]
#[serde(tag = "action")]
enum IpcCommand {
    #[serde(rename = "start-block")]
    StartBlock {
        domains: Vec<String>,
        #[serde(rename = "endTime")]
        end_time: u64,
        #[serde(rename = "blocklistId")]
        blocklist_id: String,
    },
    #[serde(rename = "clear-block")]
    ClearBlock,
    #[serde(rename = "get-status")]
    GetStatus,
    #[serde(rename = "restore-hosts")]
    RestoreHosts,
    #[serde(rename = "set-blocked-apps")]
    SetBlockedApps {
        apps: Vec<String>,
    },
    #[serde(rename = "get-blocked-apps")]
    GetBlockedApps,
    #[serde(rename = "set-schedules")]
    SetSchedules {
        schedules: Vec<HelperSchedule>,
    },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "get-version")]
    GetVersion,
    #[serde(rename = "uninstall")]
    Uninstall,
}

#[derive(Debug, Serialize)]
struct IpcResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    domains: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "endTime")]
    end_time: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "blocklistId")]
    blocklist_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "remainingMs")]
    remaining_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "blockedApps")]
    blocked_apps: Option<Vec<String>>,
}

fn log(message: &str) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let line = format!("[{}] {}", now, message);
    println!("{}", line);
    
    // On Windows, also write to a log file since the console window is hidden
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let log_dir = PathBuf::from(&program_data).join("ReDD Block");
        let _ = fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("helper.log");
        
        // Rotate log file if it exceeds 5MB
        const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024;
        if let Ok(metadata) = fs::metadata(&log_path) {
            if metadata.len() > MAX_LOG_SIZE {
                let old_path = log_dir.join("helper.log.old");
                let _ = fs::rename(&log_path, &old_path);
            }
        }
        
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = writeln!(file, "{}", line);
        }
    }
}

fn get_data_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string()))
            .join("ReDD Block")
            .join("helper-state.json")
    }
    #[cfg(not(target_os = "windows"))]
    {
        PathBuf::from("/var/lib/redd-block/helper-state.json")
    }
}

fn load_state() -> (Option<BlockState>, Vec<String>, Vec<HelperSchedule>) {
    let path = get_data_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(state) = serde_json::from_str::<HelperState>(&content) {
            let block = if let Some(block) = state.current_block {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                if block.end_time > now {
                    log(&format!("Restored active block: {} domains", block.domains.len()));
                    Some(block)
                } else {
                    None
                }
            } else {
                None
            };
            if !state.blocked_apps.is_empty() {
                log(&format!("Restored {} blocked apps", state.blocked_apps.len()));
            }
            if !state.schedules.is_empty() {
                log(&format!("Restored {} schedules", state.schedules.len()));
            }
            return (block, state.blocked_apps, state.schedules);
        }
    }
    (None, Vec::new(), Vec::new())
}

fn save_full_state(block: &Option<BlockState>, apps: &[String], schedules: &[HelperSchedule]) {
    let path = get_data_path();
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            log(&format!("Warning: failed to create state directory: {}", e));
            return;
        }
    }
    let state = HelperState {
        current_block: block.clone(),
        blocked_apps: apps.to_vec(),
        schedules: schedules.to_vec(),
    };
    match serde_json::to_string_pretty(&state) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, json) {
                log(&format!("Warning: failed to persist state: {}", e));
            }
        }
        Err(e) => log(&format!("Warning: failed to serialize state: {}", e)),
    }
}

// Hosts file management
const HOSTS_BACKUP_PATH: &str = if cfg!(target_os = "windows") {
    "C:\\Windows\\System32\\drivers\\etc\\hosts.redd-backup"
} else {
    "/etc/hosts.redd-backup"
};

fn read_hosts_file() -> String {
    fs::read_to_string(HOSTS_PATH).unwrap_or_default()
}

/// Create a backup of the original hosts file if one doesn't exist
fn ensure_backup_exists() -> Result<(), String> {
    let backup_path = std::path::Path::new(HOSTS_BACKUP_PATH);
    
    if !backup_path.exists() {
        log("Creating backup of original hosts file");
        let content = read_hosts_file();
        // Strip any existing block entries so the backup is clean
        let clean = remove_block_from_hosts(&content);
        fs::write(HOSTS_BACKUP_PATH, &clean)
            .map_err(|e| format!("Failed to create hosts backup: {}", e))?;
        log(&format!("Backup created at {}", HOSTS_BACKUP_PATH));
    }
    
    Ok(())
}

/// Restore hosts file from backup
fn restore_hosts_from_backup() -> Result<(), String> {
    let backup_path = std::path::Path::new(HOSTS_BACKUP_PATH);
    
    if !backup_path.exists() {
        return Err("No backup file exists to restore from".to_string());
    }
    
    log("Restoring hosts file from backup");
    let backup_content = fs::read_to_string(HOSTS_BACKUP_PATH)
        .map_err(|e| format!("Failed to read backup: {}", e))?;
    
    // Clean any stale block entries from the backup (e.g., old-format markers)
    let clean = remove_block_from_hosts(&backup_content);
    
    // Validate the backup has essential entries
    if !clean.contains("localhost") {
        return Err("Backup file is invalid (missing localhost entry)".to_string());
    }
    
    fs::write(HOSTS_PATH, &clean)
        .map_err(|e| format!("Failed to restore hosts file: {}", e))?;
    
    flush_dns_cache();
    log("Hosts file restored successfully");
    Ok(())
}

fn write_hosts_file(content: &str) -> bool {
    // Safety check: never write an empty or near-empty hosts file
    // A valid hosts file must at least contain a localhost entry
    if !content.contains("localhost") {
        log("SAFETY: Refusing to write hosts file without localhost entry - would break DNS");
        // Attempt to restore from backup instead
        if let Err(e) = restore_hosts_from_backup() {
            log(&format!("SAFETY: Could not restore from backup either: {}", e));
            // Last resort: write a minimal valid hosts file
            let minimal = "##\n# Host Database\n##\n127.0.0.1       localhost\n255.255.255.255 broadcasthost\n::1             localhost\n";
            return fs::write(HOSTS_PATH, minimal).is_ok();
        }
        return true;
    }

    // Ensure we have a backup before any modification
    if let Err(e) = ensure_backup_exists() {
        log(&format!("Warning: {}", e));
    }
    
    // On Windows, fs::rename() often fails because the hosts file may be locked
    // by other processes (antivirus, DNS client service). Use direct write instead.
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = fs::write(HOSTS_PATH, content) {
            log(&format!("Failed to write hosts file: {}", e));
            return false;
        }
        return true;
    }
    
    // On macOS/Linux: atomic write via temp file + rename to avoid truncation on crash
    #[cfg(not(target_os = "windows"))]
    {
        let tmp_path = format!("{}.tmp", HOSTS_PATH);
        if let Err(e) = fs::write(&tmp_path, content) {
            log(&format!("Failed to write temp hosts file: {}", e));
            return false;
        }
        if let Err(e) = fs::rename(&tmp_path, HOSTS_PATH) {
            log(&format!("Failed to rename temp hosts file: {}", e));
            // Fallback: try direct write
            let _ = fs::remove_file(&tmp_path);
            return fs::write(HOSTS_PATH, content).is_ok();
        }
        true
    }
}

fn remove_block_from_hosts(content: &str) -> String {
    let mut result = content.to_string();
    
    // Remove current-format markers
    if let Some(start_idx) = result.find(BLOCK_MARKER_START) {
        let before = result[..start_idx].trim_end();
        let after = if let Some(end_idx) = result.find(BLOCK_MARKER_END) {
            result[end_idx + BLOCK_MARKER_END.len()..].trim_start()
        } else {
            ""
        };
        result = if after.is_empty() {
            before.to_string()
        } else {
            format!("{}\n{}", before, after)
        };
    }
    
    // Also clean up old-format markers (from legacy versions)
    // These used "# ReDD Block Start" / "# ReDD Block End" format
    let old_markers = [
        "# ReDD Block Start",
        "# ReDD Block End",
    ];
    for marker in &old_markers {
        result = result.lines()
            .filter(|line| line.trim() != *marker)
            .collect::<Vec<_>>()
            .join("\n");
    }
    
    result
}

fn add_block_to_hosts(content: &str, domains: &[String]) -> String {
    let mut clean = remove_block_from_hosts(content);
    
    let mut block_lines = vec![
        String::new(),
        BLOCK_MARKER_START.to_string(),
        "# Managed by ReDD Block - DO NOT EDIT".to_string(),
    ];
    
    for domain in domains {
        let clean_domain = domain
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .split('/')
            .next()
            .unwrap_or(domain)
            .to_lowercase();
        
        // Safety net: never block localhost/loopback/reserved domains
        if is_protected_domain(&clean_domain) {
            log(&format!("Skipping protected domain in hosts file: {}", clean_domain));
            continue;
        }
        
        // IPv4 entries
        block_lines.push(format!("0.0.0.0 {}", clean_domain));
        block_lines.push(format!("0.0.0.0 www.{}", clean_domain));
        // IPv6 entries
        block_lines.push(format!(":: {}", clean_domain));
        block_lines.push(format!(":: www.{}", clean_domain));
    }
    
    block_lines.push(BLOCK_MARKER_END.to_string());
    block_lines.push(String::new());
    
    clean.push('\n');
    clean.push_str(&block_lines.join("\n"));
    clean
}

fn flush_dns_cache() {
    log("Flushing DNS cache...");
    
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("dscacheutil").arg("-flushcache").output();
        let _ = Command::new("killall").args(["-HUP", "mDNSResponder"]).output();
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        // Flush Windows DNS cache (hidden, no console window)
        match Command::new("ipconfig")
            .arg("/flushdns")
            .creation_flags(CREATE_NO_WINDOW)
            .output() 
        {
            Ok(output) => {
                if output.status.success() {
                    log("DNS cache flushed successfully");
                } else {
                    log(&format!("DNS flush warning: {}", String::from_utf8_lossy(&output.stderr)));
                }
            }
            Err(e) => log(&format!("Failed to flush DNS: {}", e)),
        }
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("systemd-resolve").arg("--flush-caches").output();
    }
}

/// Compute currently active schedule domains
fn get_active_schedule_domains(schedules: &[HelperSchedule]) -> Vec<String> {
    let now = chrono_now();
    let current_day = now.weekday_mon0(); // Mon=0..Sun=6
    let current_mins = now.hour() * 60 + now.minute();
    
    let mut seen = HashSet::new();
    let mut domains = Vec::new();
    for schedule in schedules {
        let is_active = schedule.segments.iter().any(|seg| {
            let start_mins = seg.start_hour as u32 * 60 + seg.start_minute as u32;
            let end_mins = seg.end_hour as u32 * 60 + seg.end_minute as u32;
            
            if start_mins == end_mins {
                // Same start and end (e.g., 00:00 - 00:00) means "all day"
                seg.days.contains(&(current_day as u8))
            } else if end_mins > start_mins {
                // Same-day segment (e.g., 00:00 - 10:00)
                seg.days.contains(&(current_day as u8))
                    && current_mins >= start_mins
                    && current_mins < end_mins
            } else {
                // Cross-midnight segment (e.g., 22:00 - 04:00)
                let yesterday = if current_day == 0 { 6 } else { current_day - 1 };
                let in_evening = seg.days.contains(&(current_day as u8)) && current_mins >= start_mins;
                let in_morning = seg.days.contains(&(yesterday as u8)) && current_mins < end_mins;
                in_evening || in_morning
            }
        });
        
        if is_active {
            for d in &schedule.domains {
                if seen.insert(d.clone()) {
                    domains.push(d.clone());
                }
            }
        }
    }
    domains
}

/// Compute currently active schedule apps
fn get_active_schedule_apps(schedules: &[HelperSchedule]) -> Vec<String> {
    let now = chrono_now();
    let current_day = now.weekday_mon0();
    let current_mins = now.hour() * 60 + now.minute();
    
    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    for schedule in schedules {
        let is_active = schedule.segments.iter().any(|seg| {
            let start_mins = seg.start_hour as u32 * 60 + seg.start_minute as u32;
            let end_mins = seg.end_hour as u32 * 60 + seg.end_minute as u32;
            
            if start_mins == end_mins {
                // Same start and end (e.g., 00:00 - 00:00) means "all day"
                seg.days.contains(&(current_day as u8))
            } else if end_mins > start_mins {
                seg.days.contains(&(current_day as u8))
                    && current_mins >= start_mins
                    && current_mins < end_mins
            } else {
                let yesterday = if current_day == 0 { 6 } else { current_day - 1 };
                let in_evening = seg.days.contains(&(current_day as u8)) && current_mins >= start_mins;
                let in_morning = seg.days.contains(&(yesterday as u8)) && current_mins < end_mins;
                in_evening || in_morning
            }
        });
        
        if is_active {
            for a in &schedule.apps {
                if seen.insert(a.clone()) {
                    apps.push(a.clone());
                }
            }
        }
    }
    apps
}

/// Helper to get current local time components without chrono dependency
struct LocalTimeInfo {
    hour: u32,
    minute: u32,
    weekday_mon0: u32, // Mon=0..Sun=6
}

impl LocalTimeInfo {
    fn hour(&self) -> u32 { self.hour }
    fn minute(&self) -> u32 { self.minute }
    fn weekday_mon0(&self) -> u32 { self.weekday_mon0 }
}

fn chrono_now() -> LocalTimeInfo {
    // Use libc::localtime_r for zero-overhead local time without shelling out
    #[cfg(not(target_os = "windows"))]
    {
        use std::mem::MaybeUninit;
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as libc::time_t;
        let mut tm = MaybeUninit::<libc::tm>::uninit();
        let result = unsafe { libc::localtime_r(&timestamp, tm.as_mut_ptr()) };
        if !result.is_null() {
            let tm = unsafe { tm.assume_init() };
            // tm_wday: Sun=0..Sat=6 -> convert to Mon=0..Sun=6
            let weekday_mon0 = if tm.tm_wday == 0 { 6 } else { (tm.tm_wday - 1) as u32 };
            return LocalTimeInfo {
                hour: tm.tm_hour as u32,
                minute: tm.tm_min as u32,
                weekday_mon0,
            };
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // Use GetLocalTime from kernel32.dll directly — zero overhead, no process spawning.
        // Previously used wmic + powershell which spawned 2 processes every 30 seconds.
        #[repr(C)]
        struct SYSTEMTIME {
            w_year: u16,
            w_month: u16,
            w_day_of_week: u16,
            w_day: u16,
            w_hour: u16,
            w_minute: u16,
            w_second: u16,
            w_milliseconds: u16,
        }
        
        extern "system" {
            fn GetLocalTime(lp_system_time: *mut SYSTEMTIME);
        }
        
        let mut st = SYSTEMTIME {
            w_year: 0, w_month: 0, w_day_of_week: 0, w_day: 0,
            w_hour: 0, w_minute: 0, w_second: 0, w_milliseconds: 0,
        };
        unsafe { GetLocalTime(&mut st) };
        
        // wDayOfWeek: Sun=0..Sat=6 -> convert to Mon=0..Sun=6
        let weekday_mon0 = if st.w_day_of_week == 0 { 6 } else { st.w_day_of_week as u32 - 1 };
        return LocalTimeInfo {
            hour: st.w_hour as u32,
            minute: st.w_minute as u32,
            weekday_mon0,
        };
    }
    
    // Fallback: use UTC (not ideal but won't crash)
    log("Warning: using UTC fallback for time - schedule evaluation may be incorrect");
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let day_secs = secs % 86400;
    let hour = (day_secs / 3600) as u32;
    let minute = ((day_secs % 3600) / 60) as u32;
    // Thursday = epoch day 0, so: (days_since_epoch + 3) % 7 = Mon=0
    let days = secs / 86400;
    let weekday_mon0 = ((days + 3) % 7) as u32;
    LocalTimeInfo { hour, minute, weekday_mon0 }
}

/// Sync hosts file: writes the union of manual block domains + active schedule domains
fn sync_hosts_file(
    state: &Arc<Mutex<Option<BlockState>>>,
    schedule_state: &Arc<Mutex<Vec<HelperSchedule>>>,
) {
    let mut seen = HashSet::new();
    let mut all_domains: Vec<String> = Vec::new();
    
    // Add domains from current manual block
    if let Some(block) = &*state.lock().unwrap() {
        for d in &block.domains {
            if seen.insert(d.clone()) {
                all_domains.push(d.clone());
            }
        }
    }
    
    // Add domains from active schedule segments
    let schedules = schedule_state.lock().unwrap().clone();
    let schedule_domains = get_active_schedule_domains(&schedules);
    for d in schedule_domains {
        if seen.insert(d.clone()) {
            all_domains.push(d);
        }
    }
    
    let content = read_hosts_file();
    
    if all_domains.is_empty() {
        // Remove block from hosts
        let clean = remove_block_from_hosts(&content);
        if clean != content {
            write_hosts_file(&clean);
            flush_dns_cache();
            log("Hosts file cleared (no active domains)");
        }
    } else {
        // Write merged domains to hosts
        let new_content = add_block_to_hosts(&content, &all_domains);
        if new_content != content {
            write_hosts_file(&new_content);
            flush_dns_cache();
            log(&format!("Hosts file updated: {} domains", all_domains.len()));
        }
    }
}

fn start_block(
    state: &Arc<Mutex<Option<BlockState>>>,
    app_state: &Arc<Mutex<Vec<String>>>,
    schedule_state: &Arc<Mutex<Vec<HelperSchedule>>>,
    domains: Vec<String>,
    end_time: u64,
    blocklist_id: String,
) -> IpcResponse {
    log(&format!("Starting block: {} domains", domains.len()));
    
    let block = BlockState {
        domains,
        end_time,
        blocklist_id,
    };
    
    *state.lock().unwrap() = Some(block);
    
    // Sync hosts file (merges with active schedules)
    sync_hosts_file(state, schedule_state);
    
    // Persist
    let current_block = state.lock().unwrap().clone();
    let apps = app_state.lock().unwrap().clone();
    let schedules = schedule_state.lock().unwrap().clone();
    save_full_state(&current_block, &apps, &schedules);
    
    log("Block started successfully");
    IpcResponse {
        success: true,
        ..Default::default()
    }
}

fn clear_block(
    state: &Arc<Mutex<Option<BlockState>>>,
    app_state: &Arc<Mutex<Vec<String>>>,
    schedule_state: &Arc<Mutex<Vec<HelperSchedule>>>,
) -> IpcResponse {
    log("Clearing block...");
    
    *state.lock().unwrap() = None;
    
    // Sync hosts file (will keep any schedule-based domains)
    sync_hosts_file(state, schedule_state);
    
    // Persist
    let apps = app_state.lock().unwrap().clone();
    let schedules = schedule_state.lock().unwrap().clone();
    save_full_state(&None, &apps, &schedules);
    
    log("Block cleared successfully");
    IpcResponse {
        success: true,
        ..Default::default()
    }
}

fn get_status(state: &Arc<Mutex<Option<BlockState>>>) -> IpcResponse {
    let guard = state.lock().unwrap();
    match &*guard {
        None => IpcResponse {
            success: true,
            active: Some(false),
            ..Default::default()
        },
        Some(block) => {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;
            let remaining = block.end_time.saturating_sub(now);
            
            IpcResponse {
                success: true,
                active: Some(true),
                domains: Some(block.domains.clone()),
                end_time: Some(block.end_time),
                blocklist_id: Some(block.blocklist_id.clone()),
                remaining_ms: Some(remaining),
                ..Default::default()
            }
        }
    }
}

// ===== App Blocking =====

/// Handle for the app watcher background thread
struct AppWatcherHandle {
    watcher_process: Option<Child>,
    running: bool,
    /// Last detection time per app (for debouncing)
    last_detection: HashMap<String, Instant>,
    /// Thread ID of the watcher thread (Windows: for posting WM_QUIT)
    thread_id: Option<u32>,
}

impl AppWatcherHandle {
    fn new() -> Self {
        AppWatcherHandle {
            watcher_process: None,
            running: false,
            last_detection: HashMap::new(),
            thread_id: None,
        }
    }
}

/// Check if an app name is protected (i.e., is ReDD Block itself).
/// Protected apps must never be blocked — this is a safety net in case
/// the frontend validation is bypassed.
fn is_protected_app(name: &str) -> bool {
    let lower = name.trim().to_lowercase();
    matches!(lower.as_str(), "redd block" | "redd-block" | "redd-block-helper")
}

/// Check if a domain is protected (localhost, loopback, reserved).
/// These must never be added to the hosts file block list.
fn is_protected_domain(domain: &str) -> bool {
    let lower = domain.trim().to_lowercase();
    matches!(lower.as_str(),
        "localhost" | "localhost.localdomain"
        | "127.0.0.1" | "0.0.0.0" | "::1"
        | "broadcasthost" | "local"
        | "reddfocus.org" | "www.reddfocus.org"
        | "ulyngs.github.io"
    )
}

/// Hide a specific app
fn hide_app(app_name: &str) {
    // Safety net: never hide ReDD Block itself
    if is_protected_app(app_name) {
        log(&format!("Skipping hide_app: '{}' is a protected app (self-block prevention)", app_name));
        return;
    }
    #[cfg(target_os = "macos")]
    {
        // Sanitize app_name to prevent osascript injection.
        // Same allowlist approach as the Windows PowerShell fix.
        let safe_name: String = app_name.chars()
            .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_' || *c == '.')
            .collect();
        
        if safe_name.is_empty() {
            log(&format!("Skipping hide_app: sanitized name is empty (original: {})", app_name));
            return;
        }
        
        let script = format!(
            r#"tell application "System Events" to set visible of application process "{}" to false"#,
            safe_name
        );
        
        // Try up to 3 times with small delays
        for attempt in 1..=3 {
            let result = Command::new("osascript")
                .arg("-e")
                .arg(&script)
                .output();
            
            match result {
                Ok(output) if output.status.success() => {
                    log(&format!("Hidden app: {} (attempt {})", app_name, attempt));
                    return;
                }
                Ok(_) | Err(_) => {
                    if attempt < 3 {
                        thread::sleep(Duration::from_millis(100));
                    }
                }
            }
        }
        log(&format!("Failed to hide app after 3 attempts: {}", app_name));
    }
    
    #[cfg(target_os = "windows")]
    {
        // Sanitize app_name for safety
        let safe_name: String = app_name.chars()
            .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_' || *c == '.')
            .collect();
        
        if safe_name.is_empty() {
            log(&format!("Skipping hide_app: sanitized name is empty (original: {})", app_name));
            return;
        }
        
        // Native Windows API for near-instant minimization (no PowerShell overhead)
        struct MinimizeData {
            target_name: String,
            minimized_count: u32,
        }
        
        extern "system" fn minimize_callback(hwnd: isize, lparam: isize) -> i32 {
            unsafe {
                #[link(name = "user32")]
                extern "system" {
                    fn IsWindowVisible(hwnd: isize) -> i32;
                    fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
                    fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
                }
                #[link(name = "kernel32")]
                extern "system" {
                    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
                    fn CloseHandle(h: isize) -> i32;
                    fn QueryFullProcessImageNameW(h: isize, flags: u32, buf: *mut u16, size: *mut u32) -> i32;
                }
                
                let data = &mut *(lparam as *mut MinimizeData);
                
                // Skip invisible windows
                if IsWindowVisible(hwnd) == 0 {
                    return 1;
                }
                
                // Get process ID for this window
                let mut pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, &mut pid);
                if pid == 0 { return 1; }
                
                // Open process to query its name
                let handle = OpenProcess(0x1000, 0, pid); // PROCESS_QUERY_LIMITED_INFORMATION
                if handle == 0 { return 1; }
                
                let mut buf = [0u16; 260];
                let mut size = 260u32;
                let matched = if QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size) != 0 {
                    let path = String::from_utf16_lossy(&buf[..size as usize]);
                    if let Some(filename) = path.rsplit('\\').next() {
                        let name = filename.strip_suffix(".exe").unwrap_or(filename);
                        name.eq_ignore_ascii_case(&data.target_name)
                    } else {
                        false
                    }
                } else {
                    false
                };
                
                CloseHandle(handle);
                
                if matched {
                    ShowWindow(hwnd, 6); // SW_MINIMIZE
                    data.minimized_count += 1;
                }
                
                1 // continue enumeration
            }
        }
        
        #[link(name = "user32")]
        extern "system" {
            fn EnumWindows(cb: extern "system" fn(isize, isize) -> i32, lp: isize) -> i32;
        }
        
        let mut data = MinimizeData {
            target_name: safe_name.clone(),
            minimized_count: 0,
        };
        
        unsafe {
            EnumWindows(minimize_callback, &mut data as *mut MinimizeData as isize);
        }
        
        if data.minimized_count > 0 {
            log(&format!("Minimized {} window(s) for app (native): {}", data.minimized_count, safe_name));
        }
    }
}

/// Hide all currently blocked apps
fn hide_all_blocked_apps(app_state: &Arc<Mutex<Vec<String>>>) {
    let apps = app_state.lock().unwrap().clone();
    log(&format!("Hiding {} blocked apps", apps.len()));
    for app in apps {
        hide_app(&app);
    }
}

/// Start the app watcher background thread
fn start_app_watcher(
    app_state: &Arc<Mutex<Vec<String>>>,
    app_watcher_handle: &Arc<Mutex<Option<AppWatcherHandle>>>,
) {
    // Check if already running
    {
        let handle = app_watcher_handle.lock().unwrap();
        if let Some(ref h) = *handle {
            if h.running {
                log("App watcher already running, skipping start");
                return;
            }
        }
    }
    
    // Set up handle
    {
        let mut handle = app_watcher_handle.lock().unwrap();
        *handle = Some(AppWatcherHandle::new());
        if let Some(ref mut h) = *handle {
            h.running = true;
        }
    }
    
    let app_state_clone = Arc::clone(app_state);
    let handle_clone = Arc::clone(app_watcher_handle);
    
    thread::spawn(move || {
        #[cfg(target_os = "macos")]
        run_macos_app_watcher(app_state_clone, handle_clone);
        
        #[cfg(target_os = "windows")]
        run_windows_app_watcher(app_state_clone, handle_clone);
    });
}

/// Stop the app watcher
fn stop_app_watcher(app_watcher_handle: &Arc<Mutex<Option<AppWatcherHandle>>>) {
    let mut handle = app_watcher_handle.lock().unwrap();
    if let Some(ref mut h) = *handle {
        h.running = false;
        // On Windows, post WM_QUIT to the watcher thread's message loop
        #[cfg(target_os = "windows")]
        if let Some(tid) = h.thread_id {
            #[link(name = "user32")]
            extern "system" {
                fn PostThreadMessageW(thread_id: u32, msg: u32, wparam: usize, lparam: isize) -> i32;
            }
            unsafe { PostThreadMessageW(tid, 0x0012, 0, 0); } // WM_QUIT
        }
        if let Some(mut process) = h.watcher_process.take() {
            let _ = process.kill();
        }
        log("App watcher stopped");
    }
    *handle = None;
}

/// Set blocked apps, starting/stopping watcher as needed
fn set_blocked_apps(
    state: &Arc<Mutex<Option<BlockState>>>,
    app_state: &Arc<Mutex<Vec<String>>>,
    schedule_state: &Arc<Mutex<Vec<HelperSchedule>>>,
    app_watcher_handle: &Arc<Mutex<Option<AppWatcherHandle>>>,
    apps: Vec<String>,
) -> IpcResponse {
    log(&format!("Setting blocked apps: {:?}", apps));
    
    // Safety net: filter out protected apps (ReDD Block must never block itself)
    let apps: Vec<String> = apps.into_iter().filter(|a| {
        if is_protected_app(a) {
            log(&format!("Filtered protected app from blocked list: {}", a));
            false
        } else {
            true
        }
    }).collect();
    
    let had_apps = !app_state.lock().unwrap().is_empty();
    let has_apps = !apps.is_empty();
    
    // Update state
    *app_state.lock().unwrap() = apps;
    
    // Persist
    let block = state.lock().unwrap().clone();
    let apps_for_save = app_state.lock().unwrap().clone();
    let schedules = schedule_state.lock().unwrap().clone();
    save_full_state(&block, &apps_for_save, &schedules);
    
    // Update the effective blocked-apps list (manual + schedule)
    #[cfg(target_os = "windows")]
    update_effective_blocked_apps();

    if has_apps {
        // Start watcher if not running
        start_app_watcher(app_state, app_watcher_handle);
        // Hide any currently open blocked apps
        hide_all_blocked_apps(app_state);
    } else if had_apps {
        // Check if schedule apps still need the watcher
        #[cfg(target_os = "windows")]
        {
            let still_need = read_effective_blocked_apps()
                .map(|apps| !apps.is_empty())
                .unwrap_or(false);
            if !still_need {
                stop_app_watcher(app_watcher_handle);
            }
        }
        #[cfg(not(target_os = "windows"))]
        stop_app_watcher(app_watcher_handle);
    }
    
    IpcResponse {
        success: true,
        ..Default::default()
    }
}

#[cfg(target_os = "macos")]
fn run_macos_app_watcher(
    app_state: Arc<Mutex<Vec<String>>>,
    handle: Arc<Mutex<Option<AppWatcherHandle>>>,
) {
    let script = r#"
use framework "Foundation"
use framework "AppKit"

on appEvent_(theNotification)
    set appName to (theNotification's userInfo()'s objectForKey: (current application's NSWorkspaceApplicationKey))'s localizedName() as text
    log appName
end appEvent_

set theWorkspace to current application's NSWorkspace's sharedWorkspace()
set notifCenter to theWorkspace's notificationCenter()

-- Listen for app launches
notifCenter's addObserver:me selector:"appEvent:" |name|:(current application's NSWorkspaceDidLaunchApplicationNotification) object:(missing value)

-- Listen for app activations (when user clicks to bring app forward)
notifCenter's addObserver:me selector:"appEvent:" |name|:(current application's NSWorkspaceDidActivateApplicationNotification) object:(missing value)

repeat
    delay 60
end repeat
"#;

    // Write script to temp file
    let temp_path = std::env::temp_dir().join("redd-helper-app-watcher.applescript");
    if std::fs::write(&temp_path, script).is_err() {
        log("Failed to write AppleScript file for app watcher");
        let mut h = handle.lock().unwrap();
        *h = None;
        return;
    }

    let mut process = match Command::new("osascript")
        .arg(&temp_path)
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(p) => p,
        Err(e) => {
            log(&format!("Failed to start macOS app watcher: {}", e));
            let mut h = handle.lock().unwrap();
            *h = None;
            return;
        }
    };

    log("macOS app watcher started in helper daemon");
    
    // Store the process handle
    {
        let mut h = handle.lock().unwrap();
        if let Some(ref mut _wh) = *h {
            // We can't store the process directly since we need stderr
            // The process handle will be managed via the running flag
        }
    }

    // Read stderr (AppleScript 'log' outputs to stderr)
    if let Some(stderr) = process.stderr.take() {
        let reader = BufReader::new(stderr);
        
        for line in reader.lines() {
            // Check if we should stop
            {
                let h = handle.lock().unwrap();
                match &*h {
                    Some(wh) if wh.running => {},
                    _ => break,
                }
            }
            
            if let Ok(app_name) = line {
                let app_name = app_name.trim();
                if app_name.is_empty() {
                    continue;
                }
                
                // Check if this app is blocked
                let is_blocked = {
                    let apps = app_state.lock().unwrap();
                    apps.iter().any(|a| a.eq_ignore_ascii_case(app_name))
                };
                
                if is_blocked {
                    // Debounce: skip if we detected this app within the last 500ms
                    let should_process = {
                        let mut h = handle.lock().unwrap();
                        if let Some(ref mut wh) = *h {
                            let app_lower = app_name.to_lowercase();
                            let now = Instant::now();
                            
                            if let Some(last_time) = wh.last_detection.get(&app_lower) {
                                if now.duration_since(*last_time) < Duration::from_millis(500) {
                                    false
                                } else {
                                    wh.last_detection.insert(app_lower, now);
                                    true
                                }
                            } else {
                                wh.last_detection.insert(app_lower, now);
                                true
                            }
                        } else {
                            false
                        }
                    };
                    
                    if !should_process {
                        continue;
                    }
                    
                    log(&format!("Blocked app detected: {}", app_name));
                    hide_app(app_name);
                }
            }
        }
    }

    // Clean up
    let _ = process.kill();
    let _ = std::fs::remove_file(&temp_path);
    
    {
        let mut h = handle.lock().unwrap();
        *h = None;
    }
    
    log("macOS app watcher stopped in helper daemon");
}

// Global effective blocked-apps list for the WinEvent callback.
// Uses AtomicPtr so it can be updated whenever manual apps or schedules change.
// The callback reads it lock-free for near-zero latency.
#[cfg(target_os = "windows")]
static EFFECTIVE_BLOCKED_APPS: AtomicPtr<Vec<String>> = AtomicPtr::new(std::ptr::null_mut());

// Global references so update_effective_blocked_apps() can recompute the merged list.
#[cfg(target_os = "windows")]
static GLOBAL_APP_STATE: std::sync::OnceLock<Arc<Mutex<Vec<String>>>> = std::sync::OnceLock::new();
#[cfg(target_os = "windows")]
static GLOBAL_SCHEDULE_STATE: std::sync::OnceLock<Arc<Mutex<Vec<HelperSchedule>>>> = std::sync::OnceLock::new();

/// Recompute the effective blocked-apps list (manual apps ∪ active schedule apps)
/// and store it in EFFECTIVE_BLOCKED_APPS so the WinEvent callback can read it.
#[cfg(target_os = "windows")]
fn update_effective_blocked_apps() {
    let mut merged = HashSet::new();

    if let Some(app_state) = GLOBAL_APP_STATE.get() {
        for a in app_state.lock().unwrap().iter() {
            merged.insert(a.to_lowercase());
        }
    }
    if let Some(sched_state) = GLOBAL_SCHEDULE_STATE.get() {
        let schedules = sched_state.lock().unwrap().clone();
        for a in get_active_schedule_apps(&schedules) {
            merged.insert(a.to_lowercase());
        }
    }

    let list: Vec<String> = merged.into_iter().collect();
    log(&format!("Effective blocked apps updated: {:?}", list));
    let boxed = Box::new(list);
    let old = EFFECTIVE_BLOCKED_APPS.swap(Box::into_raw(boxed), Ordering::SeqCst);
    // Free the previous list
    if !old.is_null() {
        unsafe { drop(Box::from_raw(old)); }
    }
}

/// Read the current effective blocked-apps list (lock-free, safe from callback).
#[cfg(target_os = "windows")]
fn read_effective_blocked_apps() -> Option<&'static Vec<String>> {
    let ptr = EFFECTIVE_BLOCKED_APPS.load(Ordering::SeqCst);
    if ptr.is_null() {
        None
    } else {
        // SAFETY: The pointer is only replaced via swap (old one freed after),
        // and the new one lives until the next swap. The callback runs on the
        // same thread that pumps messages, so no concurrent free can happen
        // mid-read.
        Some(unsafe { &*ptr })
    }
}

#[cfg(target_os = "windows")]
fn run_windows_app_watcher(
    app_state: Arc<Mutex<Vec<String>>>,
    handle: Arc<Mutex<Option<AppWatcherHandle>>>,
) {
    // FFI declarations
    #[link(name = "user32")]
    extern "system" {
        fn SetWinEventHook(
            event_min: u32, event_max: u32, hmod: isize,
            callback: extern "system" fn(isize, u32, isize, i32, i32, u32, u32),
            id_process: u32, id_thread: u32, flags: u32,
        ) -> isize;
        fn UnhookWinEvent(hook: isize) -> i32;
        fn GetMessageW(msg: *mut [u8; 48], hwnd: isize, min: u32, max: u32) -> i32;
        fn TranslateMessage(msg: *const [u8; 48]) -> i32;
        fn DispatchMessageW(msg: *const [u8; 48]) -> isize;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThreadId() -> u32;
    }

    // Store global references so update_effective_blocked_apps() can recompute
    let _ = GLOBAL_APP_STATE.set(app_state);
    // Note: GLOBAL_SCHEDULE_STATE is set separately via init_global_schedule_state()

    // Build the initial effective blocked-apps list
    update_effective_blocked_apps();

    // Store our thread ID so stop_app_watcher can post WM_QUIT
    let thread_id = unsafe { GetCurrentThreadId() };
    {
        let mut h = handle.lock().unwrap();
        if let Some(ref mut wh) = *h {
            wh.thread_id = Some(thread_id);
        }
    }

    // WinEvent callback — fires on foreground changes and window restorations
    extern "system" fn on_foreground(
        _hook: isize, event: u32, hwnd: isize,
        _id_object: i32, _id_child: i32, _thread: u32, _time: u32,
    ) {
        if hwnd == 0 { return; }
        // Only act on EVENT_SYSTEM_FOREGROUND (0x0003) and EVENT_SYSTEM_MINIMIZEEND (0x0017)
        if event != 0x0003 && event != 0x0017 { return; }

        #[link(name = "user32")]
        extern "system" {
            fn ShowWindow(hwnd: isize, cmd: i32) -> i32;
            fn GetWindowThreadProcessId(hwnd: isize, pid: *mut u32) -> u32;
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn OpenProcess(access: u32, inherit: i32, pid: u32) -> isize;
            fn CloseHandle(h: isize) -> i32;
            fn QueryFullProcessImageNameW(h: isize, flags: u32, buf: *mut u16, size: *mut u32) -> i32;
        }

        unsafe {
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 { return; }

            let proc_handle = OpenProcess(0x1000, 0, pid); // PROCESS_QUERY_LIMITED_INFORMATION
            if proc_handle == 0 { return; }

            let mut buf = [0u16; 260];
            let mut size = 260u32;
            if QueryFullProcessImageNameW(proc_handle, 0, buf.as_mut_ptr(), &mut size) != 0 {
                let path = String::from_utf16_lossy(&buf[..size as usize]);
                if let Some(filename) = path.rsplit('\\').next() {
                    let name_lower = filename
                        .strip_suffix(".exe")
                        .unwrap_or(filename)
                        .to_lowercase();

                    // Lock-free read of the effective blocked-apps list
                    let is_blocked = read_effective_blocked_apps()
                        .map(|apps| apps.iter().any(|a| *a == name_lower))
                        .unwrap_or(false);

                    if is_blocked {
                        log(&format!("Blocked app focused, minimizing: {}", name_lower));
                        ShowWindow(hwnd, 11); // SW_FORCEMINIMIZE
                    }
                }
            }

            CloseHandle(proc_handle);
        }
    }

    // Install the hook
    let hook = unsafe {
        SetWinEventHook(
            0x0003, 0x0017, // EVENT_SYSTEM_FOREGROUND through EVENT_SYSTEM_MINIMIZEEND
            0, on_foreground,
            0, 0,
            0x0000 | 0x0002, // WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
        )
    };

    if hook == 0 {
        log("Failed to set WinEvent hook for app watcher");
        let mut h = handle.lock().unwrap();
        *h = None;
        return;
    }

    log("Windows app watcher started (native, event-driven)");

    // Minimize any already-open blocked apps right now
    if let Some(apps) = read_effective_blocked_apps() {
        for app in apps {
            hide_app(app);
        }
    }

    // Run the Windows message loop — blocks with zero CPU until an event arrives
    // The loop exits when WM_QUIT is posted (by stop_app_watcher)
    unsafe {
        let mut msg = [0u8; 48]; // MSG struct
        while GetMessageW(&mut msg, 0, 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    // Cleanup
    unsafe { UnhookWinEvent(hook); }

    {
        let mut h = handle.lock().unwrap();
        *h = None;
    }

    log("Windows app watcher stopped");
}

fn handle_command(
    state: &Arc<Mutex<Option<BlockState>>>,
    app_state: &Arc<Mutex<Vec<String>>>,
    schedule_state: &Arc<Mutex<Vec<HelperSchedule>>>,
    app_watcher_handle: &Arc<Mutex<Option<AppWatcherHandle>>>,
    cmd: IpcCommand,
) -> IpcResponse {
    match cmd {
        IpcCommand::StartBlock { domains, end_time, blocklist_id } => {
            start_block(state, app_state, schedule_state, domains, end_time, blocklist_id)
        }
        IpcCommand::ClearBlock => clear_block(state, app_state, schedule_state),
        IpcCommand::GetStatus => get_status(state),
        IpcCommand::RestoreHosts => {
            // Clear any active block state first
            *state.lock().unwrap() = None;
            let apps = app_state.lock().unwrap().clone();
            let schedules = schedule_state.lock().unwrap().clone();
            save_full_state(&None, &apps, &schedules);
            
            match restore_hosts_from_backup() {
                Ok(()) => IpcResponse {
                    success: true,
                    message: Some("Hosts file restored from backup".to_string()),
                    ..Default::default()
                },
                Err(e) => IpcResponse {
                    success: false,
                    error: Some(e),
                    ..Default::default()
                },
            }
        }
        IpcCommand::SetBlockedApps { apps } => {
            set_blocked_apps(state, app_state, schedule_state, app_watcher_handle, apps)
        }
        IpcCommand::GetBlockedApps => {
            let apps = app_state.lock().unwrap().clone();
            IpcResponse {
                success: true,
                blocked_apps: Some(apps),
                ..Default::default()
            }
        }
        IpcCommand::SetSchedules { schedules } => {
            log(&format!("Setting {} schedules", schedules.len()));
            for s in &schedules {
                log(&format!("  Schedule '{}': {} domains, {} apps, {} segments",
                    s.id, s.domains.len(), s.apps.len(), s.segments.len()));
            }
            
            *schedule_state.lock().unwrap() = schedules;
            
            // Sync hosts file immediately
            sync_hosts_file(state, schedule_state);
            
            // Sync app blocking from schedules
            let sched = schedule_state.lock().unwrap().clone();
            let schedule_apps = get_active_schedule_apps(&sched);
            let manual_apps = app_state.lock().unwrap().clone();
            let mut all_apps: Vec<String> = manual_apps;
            for a in schedule_apps {
                if !all_apps.contains(&a) {
                    all_apps.push(a);
                }
            }
            if !all_apps.is_empty() {
                // Update the effective app list for the watcher
                // (Don't modify app_state — that's for manual apps only)
                start_app_watcher(app_state, app_watcher_handle);
            }
            
            // Persist
            let block = state.lock().unwrap().clone();
            let apps = app_state.lock().unwrap().clone();
            let scheds = schedule_state.lock().unwrap().clone();
            save_full_state(&block, &apps, &scheds);
            
            IpcResponse {
                success: true,
                ..Default::default()
            }
        }
        IpcCommand::Ping => IpcResponse {
            success: true,
            message: Some("pong".to_string()),
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            ..Default::default()
        },
        IpcCommand::GetVersion => IpcResponse {
            success: true,
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            ..Default::default()
        },
        IpcCommand::Uninstall => {
            log("Received uninstall command - cleaning up...");
            
            // Stop app watcher
            stop_app_watcher(app_watcher_handle);
            
            // Clear any active block and restore hosts
            *state.lock().unwrap() = None;
            *app_state.lock().unwrap() = Vec::new();
            *schedule_state.lock().unwrap() = Vec::new();
            save_full_state(&None, &[], &[]);
            let _ = restore_hosts_from_backup();
            
            // Delete state file
            let state_path = get_data_path();
            let _ = fs::remove_file(&state_path);
            
            // Spawn a thread to remove ourselves after responding
            thread::spawn(|| {
                // Give time for response to be sent
                thread::sleep(std::time::Duration::from_millis(500));
                perform_self_cleanup();
            });
            
            IpcResponse {
                success: true,
                message: Some("Helper uninstalling...".to_string()),
                ..Default::default()
            }
        },
    }
}

impl Default for IpcResponse {
    fn default() -> Self {
        IpcResponse {
            success: false,
            error: None,
            message: None,
            active: None,
            domains: None,
            end_time: None,
            blocklist_id: None,
            remaining_ms: None,
            version: None,
            blocked_apps: None,
        }
    }
}

/// Perform self-cleanup - remove the daemon/scheduled task and exit
fn perform_self_cleanup() {
    log("Performing self-cleanup...");
    
    #[cfg(target_os = "macos")]
    {
        // Remove launchd daemon and exit
        log("Removing launchd daemon...");
        let _ = std::process::Command::new("launchctl")
            .args(["remove", "org.reddfocus.block.helper"])
            .output();
        
        // Delete the plist file
        let plist_path = "/Library/LaunchDaemons/org.reddfocus.block.helper.plist";
        let _ = fs::remove_file(plist_path);
        
        // Delete the socket
        let _ = fs::remove_file(SOCKET_PATH);
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        // Remove scheduled task (hidden)
        log("Removing scheduled task...");
        let _ = std::process::Command::new("schtasks")
            .args(["/Delete", "/TN", "ReDD Block Helper", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    
    log("Cleanup complete, exiting...");
    std::process::exit(0);
}

/// Check if the main application still exists
fn check_app_exists() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Check if the app bundle exists
        let app_paths = [
            "/Applications/ReDD Block.app",
            // Also check user Applications folder
            &format!("{}/Applications/ReDD Block.app", 
                std::env::var("HOME").unwrap_or_else(|_| "/".to_string())),
        ];
        app_paths.iter().any(|p| std::path::Path::new(p).exists())
    }
    
    #[cfg(target_os = "windows")]
    {
        // Check common direct-distribution install locations
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "".to_string());
        let program_files = std::env::var("PROGRAMFILES").unwrap_or_else(|_| "C:\\Program Files".to_string());
        
        let paths = [
            format!("{}\\Programs\\redd-block\\ReDD Block.exe", local_app_data),
            format!("{}\\ReDD Block\\ReDD Block.exe", program_files),
        ];
        
        paths.iter().any(|p| std::path::Path::new(p).exists())
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        true // Assume app exists on other platforms
    }
}

/// Read user settings to check keepBlockingOnUninstall preference
fn read_user_setting_keep_blocking() -> bool {
    // The user data file location (same as Tauri app data)
    #[cfg(target_os = "macos")]
    let data_path = {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/".to_string());
        format!("{}/Library/Application Support/com.redd.block/redd-block-data.json", home)
    };
    
    #[cfg(target_os = "windows")]
    let data_path = {
        let app_data = std::env::var("APPDATA").unwrap_or_else(|_| "".to_string());
        format!("{}\\com.redd.block\\redd-block-data.json", app_data)
    };
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let data_path = String::new();
    
    if let Ok(content) = fs::read_to_string(&data_path) {
        // Parse JSON and look for settings.keepBlockingOnUninstall
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(settings) = json.get("settings") {
                if let Some(keep_blocking) = settings.get("keepBlockingOnUninstall") {
                    return keep_blocking.as_bool().unwrap_or(true);
                }
            }
        }
    }
    
    // Default to true (keep blocking running)
    true
}

/// Thread that periodically checks if the main app still exists
fn app_existence_checker(
    state: Arc<Mutex<Option<BlockState>>>,
    app_state: Arc<Mutex<Vec<String>>>,
    schedule_state: Arc<Mutex<Vec<HelperSchedule>>>,
) {
    loop {
        // Check every 5 minutes
        thread::sleep(std::time::Duration::from_secs(300));
        
        if !check_app_exists() {
            log("Main application no longer detected");
            
            let keep_blocking = read_user_setting_keep_blocking();
            let has_active_block = state.lock().unwrap().is_some();
            let has_blocked_apps = !app_state.lock().unwrap().is_empty();
            let has_schedules = !schedule_state.lock().unwrap().is_empty();
            
            if keep_blocking && (has_active_block || has_blocked_apps || has_schedules) {
                // Setting says to keep blocking - schedules are configured (may become active later)
                log("Keep blocking enabled and blocks/schedules are configured - continuing");
                continue;
            }
            
            // Either setting is off, or no active blocks/schedules - clean up
            log("Performing cleanup...");
            
            // Clear state and restore hosts
            *state.lock().unwrap() = None;
            *app_state.lock().unwrap() = Vec::new();
            *schedule_state.lock().unwrap() = Vec::new();
            save_full_state(&None, &[], &[]);
            let _ = restore_hosts_from_backup();
            
            // Delete state file
            let state_path = get_data_path();
            let _ = fs::remove_file(&state_path);
            
            // Self-cleanup
            perform_self_cleanup();
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn handle_client(
    state: Arc<Mutex<Option<BlockState>>>,
    app_state: Arc<Mutex<Vec<String>>>,
    schedule_state: Arc<Mutex<Vec<HelperSchedule>>>,
    app_watcher_handle: Arc<Mutex<Option<AppWatcherHandle>>>,
    stream: UnixStream,
) {
    let reader = BufReader::new(stream.try_clone().unwrap());
    let mut writer = stream;
    
    for line in reader.lines() {
        if let Ok(line) = line {
            if line.trim().is_empty() {
                continue;
            }
            
            let response = match serde_json::from_str::<IpcCommand>(&line) {
                Ok(cmd) => {
                    log(&format!("Received command: {:?}", cmd));
                    handle_command(&state, &app_state, &schedule_state, &app_watcher_handle, cmd)
                }
                Err(e) => IpcResponse {
                    success: false,
                    error: Some(format!("Invalid JSON: {}", e)),
                    ..Default::default()
                },
            };
            
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = writeln!(writer, "{}", json);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn handle_client(
    state: Arc<Mutex<Option<BlockState>>>,
    app_state: Arc<Mutex<Vec<String>>>,
    schedule_state: Arc<Mutex<Vec<HelperSchedule>>>,
    app_watcher_handle: Arc<Mutex<Option<AppWatcherHandle>>>,
    stream: TcpStream,
) {
    let reader = BufReader::new(stream.try_clone().unwrap());
    let mut writer = stream;
    
    for line in reader.lines() {
        if let Ok(line) = line {
            if line.trim().is_empty() {
                continue;
            }
            
            let response = match serde_json::from_str::<IpcCommand>(&line) {
                Ok(cmd) => {
                    log(&format!("Received command: {:?}", cmd));
                    handle_command(&state, &app_state, &schedule_state, &app_watcher_handle, cmd)
                }
                Err(e) => IpcResponse {
                    success: false,
                    error: Some(format!("Invalid command: {}", e)),
                    ..Default::default()
                },
            };
            
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = writeln!(writer, "{}", json);
            }
        }
    }
}

fn expiry_checker(
    state: Arc<Mutex<Option<BlockState>>>,
    app_state: Arc<Mutex<Vec<String>>>,
    schedule_state: Arc<Mutex<Vec<HelperSchedule>>>,
) {
    loop {
        thread::sleep(Duration::from_secs(1));
        
        let should_clear = {
            let guard = state.lock().unwrap();
            if let Some(block) = &*guard {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                now >= block.end_time
            } else {
                false
            }
        };
        
        if should_clear {
            log("Block expired, clearing automatically");
            clear_block(&state, &app_state, &schedule_state);
        }
    }
}

/// Schedule evaluator thread: checks every 30 seconds if schedule state has changed
fn schedule_evaluator(
    state: Arc<Mutex<Option<BlockState>>>,
    schedule_state: Arc<Mutex<Vec<HelperSchedule>>>,
    app_state: Arc<Mutex<Vec<String>>>,
    app_watcher_handle: Arc<Mutex<Option<AppWatcherHandle>>>,
) {
    let mut last_schedule_domains: Vec<String> = Vec::new();
    let mut last_schedule_apps: Vec<String> = Vec::new();
    
    // Initial sync on startup
    {
        let schedules = schedule_state.lock().unwrap().clone();
        if !schedules.is_empty() {
            let domains = get_active_schedule_domains(&schedules);
            let apps = get_active_schedule_apps(&schedules);
            if !domains.is_empty() || !apps.is_empty() {
                log(&format!("Schedule evaluator: initial sync - {} domains, {} apps active",
                    domains.len(), apps.len()));
                sync_hosts_file(&state, &schedule_state);
                last_schedule_domains = domains;
                last_schedule_apps = apps;
            }
        }
    }
    
    loop {
        thread::sleep(Duration::from_secs(30));
        
        let schedules = schedule_state.lock().unwrap().clone();
        if schedules.is_empty() {
            if !last_schedule_domains.is_empty() {
                // Schedules were cleared — sync hosts to remove schedule domains
                log("Schedule evaluator: all schedules removed");
                sync_hosts_file(&state, &schedule_state);
                last_schedule_domains.clear();
                last_schedule_apps.clear();
            }
            continue;
        }
        
        let current_domains = get_active_schedule_domains(&schedules);
        let current_apps = get_active_schedule_apps(&schedules);
        
        // Check if domain set changed
        let mut sorted_current = current_domains.clone();
        sorted_current.sort();
        let mut sorted_last = last_schedule_domains.clone();
        sorted_last.sort();
        
        if sorted_current != sorted_last {
            log(&format!("Schedule evaluator: domain change detected ({} -> {} domains)",
                last_schedule_domains.len(), current_domains.len()));
            sync_hosts_file(&state, &schedule_state);
            
            // Persist updated state
            let block = state.lock().unwrap().clone();
            let apps = app_state.lock().unwrap().clone();
            save_full_state(&block, &apps, &schedules);
            
            last_schedule_domains = current_domains;
        }
        
        // Check if apps set changed
        let mut sorted_current_apps = current_apps.clone();
        sorted_current_apps.sort();
        let mut sorted_last_apps = last_schedule_apps.clone();
        sorted_last_apps.sort();
        
        if sorted_current_apps != sorted_last_apps {
            log(&format!("Schedule evaluator: app change detected ({} -> {} apps)",
                last_schedule_apps.len(), current_apps.len()));
            
            // Update the effective blocked-apps list (manual + schedule)
            #[cfg(target_os = "windows")]
            update_effective_blocked_apps();

            if !current_apps.is_empty() {
                start_app_watcher(&app_state, &app_watcher_handle);
                // Hide any currently open newly-blocked schedule apps
                for app in &current_apps {
                    hide_app(app);
                }
            } else {
                // Check if manual apps still need the watcher
                let manual_apps = app_state.lock().unwrap().clone();
                if manual_apps.is_empty() {
                    stop_app_watcher(&app_watcher_handle);
                }
            }
            
            last_schedule_apps = current_apps;
        }
    }
}

fn main() {
    // Install panic hook so panics are captured to the log file.
    // This is especially important on Windows where windows_subsystem = "windows"
    // hides the console, meaning panics would otherwise be invisible.
    std::panic::set_hook(Box::new(|info| {
        log(&format!("PANIC: {}", info));
    }));
    
    log("ReDD Block Helper Daemon starting...");
    log(&format!("Platform: {}", std::env::consts::OS));
    
    // Rotate macOS log file on startup if it exceeds 5MB.
    // On macOS, launchd captures stdout/stderr to this file — we can only
    // rotate it at startup since we don't control the file handle.
    #[cfg(target_os = "macos")]
    {
        let log_path = "/var/log/redd-block-helper.log";
        const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024;
        if let Ok(metadata) = fs::metadata(log_path) {
            if metadata.len() > MAX_LOG_SIZE {
                let old_path = format!("{}.old", log_path);
                let _ = fs::rename(log_path, &old_path);
                log("Rotated macOS log file (exceeded 5MB)");
            }
        }
    }
    
    // Load persisted state
    let (initial_block, initial_apps, initial_schedules) = load_state();
    let state = Arc::new(Mutex::new(initial_block));
    let app_state = Arc::new(Mutex::new(initial_apps.clone()));
    let schedule_state = Arc::new(Mutex::new(initial_schedules));

    // Store global schedule state reference for update_effective_blocked_apps()
    #[cfg(target_os = "windows")]
    {
        let _ = GLOBAL_SCHEDULE_STATE.set(Arc::clone(&schedule_state));
    }
    let app_watcher_handle: Arc<Mutex<Option<AppWatcherHandle>>> = Arc::new(Mutex::new(None));
    
    // If we have persisted blocked apps, start the app watcher
    if !initial_apps.is_empty() {
        log(&format!("Starting app watcher for {} persisted blocked apps", initial_apps.len()));
        start_app_watcher(&app_state, &app_watcher_handle);
        // Hide any currently open blocked apps
        hide_all_blocked_apps(&app_state);
    }
    
    // Start expiry checker thread
    let state_clone = Arc::clone(&state);
    let app_state_clone = Arc::clone(&app_state);
    let schedule_state_clone = Arc::clone(&schedule_state);
    thread::spawn(move || expiry_checker(state_clone, app_state_clone, schedule_state_clone));
    
    // Start schedule evaluator thread
    let state_clone = Arc::clone(&state);
    let schedule_state_clone = Arc::clone(&schedule_state);
    let app_state_clone = Arc::clone(&app_state);
    let watcher_clone = Arc::clone(&app_watcher_handle);
    thread::spawn(move || schedule_evaluator(state_clone, schedule_state_clone, app_state_clone, watcher_clone));
    
    // Start app existence checker thread (for self-cleanup when app is uninstalled)
    let state_clone = Arc::clone(&state);
    let app_state_clone = Arc::clone(&app_state);
    let schedule_state_clone = Arc::clone(&schedule_state);
    thread::spawn(move || app_existence_checker(state_clone, app_state_clone, schedule_state_clone));
    
    // Start IPC server
    #[cfg(not(target_os = "windows"))]
    {
        // Remove old socket if exists
        let _ = fs::remove_file(SOCKET_PATH);
        
        let listener = UnixListener::bind(SOCKET_PATH).expect("Failed to bind socket");
        
        // Set socket permissions
        let _ = fs::set_permissions(SOCKET_PATH, std::fs::Permissions::from_mode(0o666));
        
        log(&format!("Listening on {}", SOCKET_PATH));
        
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                log("Client connected");
                let state_clone = Arc::clone(&state);
                let app_state_clone = Arc::clone(&app_state);
                let schedule_state_clone = Arc::clone(&schedule_state);
                let watcher_clone = Arc::clone(&app_watcher_handle);
                thread::spawn(move || handle_client(state_clone, app_state_clone, schedule_state_clone, watcher_clone, stream));
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        // Load auth token for TCP IPC authentication
        
        // Try binding to TCP port with retries (handles TIME_WAIT from previous process)
        let mut listener = None;
        for attempt in 1..=5 {
            match TcpListener::bind(SOCKET_PATH) {
                Ok(l) => {
                    log(&format!("Successfully bound to TCP port on attempt {}", attempt));
                    listener = Some(l);
                    break;
                }
                Err(e) => {
                    log(&format!("Failed to bind TCP port (attempt {}): {}", attempt, e));
                    if attempt < 5 {
                        thread::sleep(Duration::from_secs(1));
                    }
                }
            }
        }
        
        let listener = match listener {
            Some(l) => l,
            None => {
                log("Failed to bind TCP port after 5 attempts, exiting");
                std::process::exit(1);
            }
        };
        
        log(&format!("Listening on {}", SOCKET_PATH));
        
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                log("Client connected");
                let state_clone = Arc::clone(&state);
                let app_state_clone = Arc::clone(&app_state);
                let schedule_state_clone = Arc::clone(&schedule_state);
                let watcher_clone = Arc::clone(&app_watcher_handle);
                thread::spawn(move || handle_client(state_clone, app_state_clone, schedule_state_clone, watcher_clone, stream));
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
use std::os::unix::fs::PermissionsExt;
