//! ReDD Block Helper Daemon
//!
//! This privileged helper runs as root and manages website blocking.
//! It communicates with the main Tauri app via Unix socket (macOS/Linux)
//! or TCP port (Windows).

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
#[cfg(not(target_os = "windows"))]
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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
    #[serde(rename = "ping")]
    Ping,
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
}

fn log(message: &str) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    println!("[{}] {}", now, message);
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

fn load_state() -> Option<BlockState> {
    let path = get_data_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(state) = serde_json::from_str::<HelperState>(&content) {
            if let Some(block) = state.current_block {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64;
                if block.end_time > now {
                    log(&format!("Restored active block: {} domains", block.domains.len()));
                    return Some(block);
                }
            }
        }
    }
    None
}

fn save_state(block: &Option<BlockState>) {
    let path = get_data_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let state = HelperState {
        current_block: block.clone(),
    };
    if let Ok(json) = serde_json::to_string_pretty(&state) {
        let _ = fs::write(&path, json);
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
        fs::write(HOSTS_BACKUP_PATH, &content)
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
    
    fs::write(HOSTS_PATH, &backup_content)
        .map_err(|e| format!("Failed to restore hosts file: {}", e))?;
    
    flush_dns_cache();
    log("Hosts file restored successfully");
    Ok(())
}

fn write_hosts_file(content: &str) -> bool {
    // Ensure we have a backup before any modification
    if let Err(e) = ensure_backup_exists() {
        log(&format!("Warning: {}", e));
    }
    
    fs::write(HOSTS_PATH, content).is_ok()
}

fn remove_block_from_hosts(content: &str) -> String {
    if let Some(start_idx) = content.find(BLOCK_MARKER_START) {
        let before = content[..start_idx].trim_end();
        let after = if let Some(end_idx) = content.find(BLOCK_MARKER_END) {
            content[end_idx + BLOCK_MARKER_END.len()..].trim_start()
        } else {
            ""
        };
        if after.is_empty() {
            before.to_string()
        } else {
            format!("{}\n{}", before, after)
        }
    } else {
        content.to_string()
    }
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
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("dscacheutil").arg("-flushcache").output();
        let _ = Command::new("killall").args(["-HUP", "mDNSResponder"]).output();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("ipconfig").arg("/flushdns").output();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("systemd-resolve").arg("--flush-caches").output();
    }
}

fn start_block(
    state: &Arc<Mutex<Option<BlockState>>>,
    domains: Vec<String>,
    end_time: u64,
    blocklist_id: String,
) -> IpcResponse {
    log(&format!("Starting block: {} domains", domains.len()));
    
    let content = read_hosts_file();
    let new_content = add_block_to_hosts(&content, &domains);
    
    if !write_hosts_file(&new_content) {
        return IpcResponse {
            success: false,
            error: Some("Failed to write hosts file".to_string()),
            ..Default::default()
        };
    }
    
    flush_dns_cache();
    
    let block = BlockState {
        domains,
        end_time,
        blocklist_id,
    };
    
    *state.lock().unwrap() = Some(block.clone());
    save_state(&Some(block));
    
    log("Block started successfully");
    IpcResponse {
        success: true,
        ..Default::default()
    }
}

fn clear_block(state: &Arc<Mutex<Option<BlockState>>>) -> IpcResponse {
    log("Clearing block...");
    
    let content = read_hosts_file();
    let clean = remove_block_from_hosts(&content);
    
    if !write_hosts_file(&clean) {
        return IpcResponse {
            success: false,
            error: Some("Failed to clear hosts file".to_string()),
            ..Default::default()
        };
    }
    
    flush_dns_cache();
    
    *state.lock().unwrap() = None;
    save_state(&None);
    
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

fn handle_command(state: &Arc<Mutex<Option<BlockState>>>, cmd: IpcCommand) -> IpcResponse {
    match cmd {
        IpcCommand::StartBlock { domains, end_time, blocklist_id } => {
            start_block(state, domains, end_time, blocklist_id)
        }
        IpcCommand::ClearBlock => clear_block(state),
        IpcCommand::GetStatus => get_status(state),
        IpcCommand::RestoreHosts => {
            // Clear any active block state first
            *state.lock().unwrap() = None;
            save_state(&None);
            
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
        IpcCommand::Ping => IpcResponse {
            success: true,
            message: Some("pong".to_string()),
            ..Default::default()
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
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn handle_client(state: Arc<Mutex<Option<BlockState>>>, stream: UnixStream) {
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
                    handle_command(&state, cmd)
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
fn handle_client(state: Arc<Mutex<Option<BlockState>>>, stream: TcpStream) {
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
                    handle_command(&state, cmd)
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

fn expiry_checker(state: Arc<Mutex<Option<BlockState>>>) {
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
            clear_block(&state);
        }
    }
}

fn main() {
    log("ReDD Block Helper Daemon starting...");
    log(&format!("Platform: {}", std::env::consts::OS));
    
    // Load persisted state
    let initial_state = load_state();
    let state = Arc::new(Mutex::new(initial_state));
    
    // Start expiry checker thread
    let state_clone = Arc::clone(&state);
    thread::spawn(move || expiry_checker(state_clone));
    
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
                thread::spawn(move || handle_client(state_clone, stream));
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        let listener = TcpListener::bind(SOCKET_PATH).expect("Failed to bind TCP port");
        
        log(&format!("Listening on {}", SOCKET_PATH));
        
        for stream in listener.incoming() {
            if let Ok(stream) = stream {
                log("Client connected");
                let state_clone = Arc::clone(&state);
                thread::spawn(move || handle_client(state_clone, stream));
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
use std::os::unix::fs::PermissionsExt;
