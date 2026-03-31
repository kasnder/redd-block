use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::time::Duration;

#[cfg(target_os = "macos")]
use std::os::unix::net::UnixStream;

#[cfg(target_os = "windows")]
use std::net::SocketAddr;

#[cfg(target_os = "windows")]
use std::net::TcpStream;

#[cfg(target_os = "macos")]
const SOCKET_PATH: &str = "/tmp/redd-block-helper.sock";

#[cfg(target_os = "windows")]
const HELPER_TCP_ADDR: &str = "127.0.0.1:62222";

const HELPER_CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const HELPER_IO_TIMEOUT: Duration = Duration::from_secs(5);
const HELPER_UNINSTALL_VERIFY_TIMEOUT: Duration = Duration::from_secs(8);
const HELPER_UNINSTALL_VERIFY_INTERVAL: Duration = Duration::from_millis(400);


/// Helper daemon status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperStatus {
    pub installed: bool,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub version_ok: bool,
}

/// Expected helper version - update this when helper-daemon changes
/// This is separate from the app version to avoid unnecessary reinstalls
const EXPECTED_HELPER_VERSION: &str = "1.0.0";

fn is_helper_version_ok(version: Option<&str>) -> bool {
    match version {
        Some(v) => {
            let parse = |s: &str| -> Vec<u32> {
                s.split('.').filter_map(|p| p.parse().ok()).collect()
            };
            parse(v) >= parse(EXPECTED_HELPER_VERSION)
        }
        None => false,
    }
}

/// Result from helper operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
struct IpcCommand {
    action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    domains: Option<Vec<String>>,
    #[serde(rename = "endTime")]
    #[serde(skip_serializing_if = "Option::is_none")]
    end_time: Option<u64>,
    #[serde(rename = "blocklistId")]
    #[serde(skip_serializing_if = "Option::is_none")]
    blocklist_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    apps: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    schedules: Option<Vec<HelperScheduleData>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blocks: Option<Vec<HelperBlockData>>,
    #[serde(rename = "keepBlockingOnUninstall")]
    #[serde(skip_serializing_if = "Option::is_none")]
    keep_blocking_on_uninstall: Option<bool>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperBlockData {
    pub domains: Vec<String>,
    #[serde(rename = "endTime")]
    pub end_time: u64,
    #[serde(rename = "blocklistId")]
    pub blocklist_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperScheduleSegment {
    #[serde(rename = "startHour")]
    pub start_hour: u8,
    #[serde(rename = "startMinute")]
    pub start_minute: u8,
    #[serde(rename = "endHour")]
    pub end_hour: u8,
    #[serde(rename = "endMinute")]
    pub end_minute: u8,
    pub days: Vec<u8>,
    #[serde(rename = "activeFromTimestampMs", default)]
    pub active_from_timestamp_ms: Option<u64>,
    #[serde(rename = "activeUntilTimestampMs", default)]
    pub active_until_timestamp_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperScheduleData {
    pub id: String,
    pub domains: Vec<String>,
    #[serde(default)]
    pub apps: Vec<String>,
    #[serde(rename = "isPaused", default)]
    pub is_paused: bool,
    #[serde(rename = "pauseEndTime", default)]
    pub pause_end_time: Option<u64>,
    pub segments: Vec<HelperScheduleSegment>,
}

#[derive(Debug, Deserialize)]
struct IpcResponse {
    success: bool,
    #[serde(default)]
    error: Option<String>,
    #[allow(dead_code)]
    #[serde(default)]
    active: Option<bool>,
    #[serde(default)]
    version: Option<String>,
}

#[cfg(target_os = "macos")]
fn send_command(command: &IpcCommand) -> Result<IpcResponse, String> {
    let mut stream = UnixStream::connect(SOCKET_PATH)
        .map_err(|e| format!("Failed to connect to helper: {}", e))?;
    stream
        .set_write_timeout(Some(HELPER_IO_TIMEOUT))
        .map_err(|e| format!("Failed to configure helper write timeout: {}", e))?;
    stream
        .set_read_timeout(Some(HELPER_IO_TIMEOUT))
        .map_err(|e| format!("Failed to configure helper read timeout: {}", e))?;
    
    let json = serde_json::to_string(command)
        .map_err(|e| format!("Failed to serialize command: {}", e))?;
    
    writeln!(stream, "{}", json)
        .map_err(|e| format!("Failed to send command: {}", e))?;
    
    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    reader.read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))
}

#[cfg(target_os = "windows")]
fn send_command(command: &IpcCommand) -> Result<IpcResponse, String> {
    let addr: SocketAddr = HELPER_TCP_ADDR
        .parse()
        .map_err(|e| format!("Failed to parse helper address: {}", e))?;
    let mut stream = TcpStream::connect_timeout(&addr, HELPER_CONNECT_TIMEOUT)
        .map_err(|e| format!("Failed to connect to helper: {}", e))?;
    stream
        .set_write_timeout(Some(HELPER_IO_TIMEOUT))
        .map_err(|e| format!("Failed to configure helper write timeout: {}", e))?;
    stream
        .set_read_timeout(Some(HELPER_IO_TIMEOUT))
        .map_err(|e| format!("Failed to configure helper read timeout: {}", e))?;
    
    let json = serde_json::to_string(command)
        .map_err(|e| format!("Failed to serialize command: {}", e))?;
    
    writeln!(stream, "{}", json)
        .map_err(|e| format!("Failed to send command: {}", e))?;
    
    let mut reader = BufReader::new(stream);
    let mut response_line = String::new();
    reader.read_line(&mut response_line)
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn send_command(_command: &IpcCommand) -> Result<IpcResponse, String> {
    Err("Helper communication not yet implemented for this platform".to_string())
}

#[cfg(target_os = "windows")]
fn helper_status_artifact_path() -> PathBuf {
    let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    PathBuf::from(&program_data).join("ReDD Block").join("redd-block-helper.exe")
}

#[cfg(target_os = "macos")]
fn helper_status_artifact_path() -> PathBuf {
    PathBuf::from(SOCKET_PATH)
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn helper_status_artifact_path() -> PathBuf {
    PathBuf::new()
}

fn helper_status_artifact_exists() -> bool {
    let path = helper_status_artifact_path();
    !path.as_os_str().is_empty() && path.exists()
}

fn is_helper_fully_uninstalled() -> bool {
    let status = check_helper_status();
    !status.running && !helper_status_artifact_exists()
}

fn wait_for_helper_uninstall(timeout: Duration) -> bool {
    let start = std::time::Instant::now();
    loop {
        if is_helper_fully_uninstalled() {
            return true;
        }
        if start.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(HELPER_UNINSTALL_VERIFY_INTERVAL);
    }
}

/// Get path to the bundled helper binary
fn get_helper_path(_app: &tauri::AppHandle) -> Option<PathBuf> {
    // Tauri externalBin bundles the sidecar next to the main executable
    // For universal builds, the suffix is stripped; for arch-specific builds, suffix is kept
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))?;
    
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let candidates = [
        "redd-block-helper-aarch64-apple-darwin",  // Current arch sidecar
        "redd-block-helper-universal-apple-darwin", // Universal with explicit suffix
        "redd-block-helper",  // Universal builds
        "redd-block-helper-x86_64-apple-darwin",   // Fallback
    ];

    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    let candidates = [
        "redd-block-helper-x86_64-apple-darwin",   // Current arch sidecar
        "redd-block-helper-universal-apple-darwin", // Universal with explicit suffix
        "redd-block-helper",  // Universal builds
        "redd-block-helper-aarch64-apple-darwin",  // Fallback
    ];
    
    #[cfg(target_os = "windows")]
    let candidates = [
        "redd-block-helper.exe",
        "redd-block-helper-x86_64-pc-windows-msvc.exe",
        "redd-block-helper-aarch64-pc-windows-msvc.exe",
        "redd-block-helper-i686-pc-windows-msvc.exe",
    ];
    
    #[cfg(target_os = "linux")]
    let candidates = [
        "redd-block-helper",
        "redd-block-helper-x86_64-unknown-linux-gnu",
        "redd-block-helper-aarch64-unknown-linux-gnu",
        "redd-block-helper-i686-unknown-linux-gnu",
    ];
    
    for name in candidates {
        let path = exe_dir.join(name);
        if path.exists() {
            log::info!("Found helper binary at: {:?}", path);
            return Some(path);
        }
    }
    
    log::warn!("Helper binary not found in {:?}, tried: {:?}", exe_dir, candidates);
    None
}

/// Check helper daemon status
#[tauri::command]
pub fn check_helper_status() -> HelperStatus {
    // Try to ping the helper - this works for both platforms
    // The ping response now includes the helper version
    let cmd = IpcCommand {
        action: "ping".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: None,
        schedules: None,
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    let ping_result = send_command(&cmd);
    let (running, helper_version) = match &ping_result {
        Ok(r) if r.success => (true, r.version.clone()),
        _ => (false, None),
    };
    
    // Check if version matches or is newer than expected
    let version_ok = is_helper_version_ok(helper_version.as_deref());
    
    if running {
        log::info!(
            "Helper running, version: {:?}, expected: {}, version_ok: {}",
            helper_version, EXPECTED_HELPER_VERSION, version_ok
        );
    }
    
    // On Windows, check if the helper exe exists in the install location
    #[cfg(target_os = "windows")]
    let installed = {
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let install_path = PathBuf::from(&program_data).join("ReDD Block").join("redd-block-helper.exe");
        install_path.exists() || running
    };
    
    // On macOS, check if socket exists
    #[cfg(target_os = "macos")]
    let installed = std::path::Path::new(SOCKET_PATH).exists() || running;
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let installed = running;
    
    HelperStatus { installed, running, version: helper_version, version_ok }
}

/// Install helper daemon
#[tauri::command]
pub async fn install_helper(app: tauri::AppHandle) -> HelperResult {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let current_status = check_helper_status();
        if current_status.running && current_status.version_ok {
            log::info!("Helper already running with correct version, no installation needed");
            return HelperResult {
                success: true,
                error: None,
            };
        }
        
        // Get the bundled helper binary path
        let helper_path = match get_helper_path(&app) {
            Some(p) if p.exists() => p,
            _ => {
                // Fallback: check in the app's MacOS directory
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()));
                
                match exe_dir {
                    Some(dir) => {
                        let helper = dir.join("redd-block-helper");
                        if helper.exists() {
                            helper
                        } else {
                            return HelperResult {
                                success: false,
                                error: Some(format!("Helper binary not found at {:?}", helper)),
                            };
                        }
                    }
                    None => {
                        return HelperResult {
                            success: false,
                            error: Some("Could not determine app directory".to_string()),
                        };
                    }
                }
            }
        };
        
        // Copy helper to /Library/PrivilegedHelperTools (Apple's recommended location for privileged helpers)
        let install_path = "/Library/PrivilegedHelperTools/com.redd.block.helper";
        
        // Create launchd plist
        let plist_content = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.redd.block.helper</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/redd-block-helper.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/redd-block-helper.log</string>
</dict>
</plist>"#, install_path);
        
        let plist_path = "/Library/LaunchDaemons/com.redd.block.helper.plist";
        let current_label = "com.redd.block.helper";
        
        // Script to copy binary, set permissions, write plist, and load daemon
        // Uses osascript to prompt for admin password
        // Also cleans up old helper location from pre-0.4.4 versions (/usr/local/bin/redd-block-helper)
        let old_helper_path = "/usr/local/bin/redd-block-helper";
        let old_plist_path = "/Library/LaunchDaemons/org.reddfocus.redd-block-helper.plist";
        let old_label = "org.reddfocus.redd-block-helper";
        let script = format!(
            r#"do shell script "launchctl bootout system/{} 2>/dev/null; launchctl unload '{}' 2>/dev/null; launchctl bootout system/{} 2>/dev/null; launchctl unload '{}' 2>/dev/null; rm -f '{}' '{}' '{}' '{}'; cp '{}' '{}' && chmod 755 '{}' && echo '{}' > '{}' && (launchctl bootstrap system '{}' || launchctl load '{}')" with administrator privileges"#,
            current_label,
            plist_path,
            old_label,
            old_plist_path,
            old_helper_path,
            old_plist_path,
            install_path,
            plist_path,
            helper_path.display(),
            install_path,
            install_path,
            plist_content.replace("\"", "\\\"").replace("\n", "\\n"),
            plist_path,
            plist_path,
            plist_path
        );
        
        let result = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output();
        
        match result {
            Ok(output) if output.status.success() => HelperResult {
                success: true,
                error: None,
            },
            Ok(output) => HelperResult {
                success: false,
                error: Some(format!("Installation failed: {}", 
                    String::from_utf8_lossy(&output.stderr))),
            },
            Err(e) => HelperResult {
                success: false,
                error: Some(format!("Failed to run installer: {}", e)),
            },
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::io::Write;
        
        // First, check if helper is already running with correct version
        let current_status = check_helper_status();
        if current_status.running && current_status.version_ok {
            log::info!("Helper already running with correct version, no installation needed");
            return HelperResult {
                success: true,
                error: None,
            };
        }
        
        // Get the bundled helper binary path
        let helper_path = match get_helper_path(&app) {
            Some(p) if p.exists() => p,
            _ => {
                // Fallback: check next to the exe
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()));
                
                match exe_dir {
                    Some(dir) => {
                        // Try both ARM64 and x64 variants
                        let helper_arm = dir.join("redd-block-helper-aarch64-pc-windows-msvc.exe");
                        let helper_x64 = dir.join("redd-block-helper-x86_64-pc-windows-msvc.exe");
                        if helper_arm.exists() {
                            helper_arm
                        } else if helper_x64.exists() {
                            helper_x64
                        } else {
                            return HelperResult {
                                success: false,
                                error: Some(format!("Helper binary not found. Checked: {:?} and {:?}", helper_arm, helper_x64)),
                            };
                        }
                    }
                    None => {
                        return HelperResult {
                            success: false,
                            error: Some("Could not determine app directory".to_string()),
                        };
                    }
                }
            }
        };
        
        // Install to ProgramData
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let install_dir = PathBuf::from(&program_data).join("ReDD Block");
        let install_path = install_dir.join("redd-block-helper.exe");
        
        // Create install directory (this doesn't need admin)
        if let Err(e) = std::fs::create_dir_all(&install_dir) {
            return HelperResult {
                success: false,
                error: Some(format!("Failed to create install directory: {}", e)),
            };
        }
        
        // Create a PowerShell script that does EVERYTHING with elevation:
        // 1. Kill existing helper process (if running)
        // 2. Copy the new binary
        // 3. Create scheduled task for persistence
        // 4. Start the helper
        let script_path = std::env::temp_dir().join("redd-block-install-helper.ps1");
        let task_name = "ReDD Block Helper";
        let helper_path_str = helper_path.to_string_lossy();
        let install_path_str = install_path.to_string_lossy();
        
        let script_content = format!(r#"
$ErrorActionPreference = "Continue"
$taskName = "{}"
$sourcePath = "{}"
$helperPath = "{}"
$installDir = Split-Path -Parent $helperPath
$logPath = Join-Path $installDir "install.log"

# Ensure install directory exists
if (-not (Test-Path $installDir)) {{
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}}

# Start logging
"$(Get-Date) - Install script starting" | Out-File -FilePath $logPath -Encoding UTF8
"Source: $sourcePath" | Out-File -FilePath $logPath -Append -Encoding UTF8
"Target: $helperPath" | Out-File -FilePath $logPath -Append -Encoding UTF8
"Running as: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)" | Out-File -FilePath $logPath -Append -Encoding UTF8
"Is Admin: $([bool](([System.Security.Principal.WindowsPrincipal][System.Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)))" | Out-File -FilePath $logPath -Append -Encoding UTF8

# Kill any existing helper process
taskkill /F /IM redd-block-helper.exe 2>$null
Start-Sleep -Seconds 1

# Check source exists
if (-not (Test-Path $sourcePath)) {{
    "ERROR: Source binary not found at $sourcePath" | Out-File -FilePath $logPath -Append -Encoding UTF8
    exit 1
}}
"Source binary exists: $(Get-Item $sourcePath | Select-Object -ExpandProperty Length) bytes" | Out-File -FilePath $logPath -Append -Encoding UTF8

# Copy the helper binary
try {{
    Copy-Item -Path $sourcePath -Destination $helperPath -Force
    "Binary copied successfully" | Out-File -FilePath $logPath -Append -Encoding UTF8
}} catch {{
    "ERROR copying binary: $_" | Out-File -FilePath $logPath -Append -Encoding UTF8
    exit 1
}}

# Add Windows Firewall rule to allow the helper
netsh advfirewall firewall delete rule name="ReDD Block Helper" 2>$null
$fwResult = netsh advfirewall firewall add rule name="ReDD Block Helper" dir=in action=allow program="$helperPath" protocol=TCP localport=62222 2>&1
"Firewall rule: $fwResult" | Out-File -FilePath $logPath -Append -Encoding UTF8

# Remove existing task if any
schtasks /Delete /TN "$taskName" /F 2>$null

# Create scheduled task for persistence (auto-start at logon with admin rights)
$taskResult = schtasks /Create /TN "$taskName" /TR "`"$helperPath`"" /SC ONLOGON /RL HIGHEST /F 2>&1
"Scheduled task: $taskResult" | Out-File -FilePath $logPath -Append -Encoding UTF8

# Start the helper directly
try {{
    Start-Process -FilePath $helperPath -WindowStyle Hidden
    "Helper process started" | Out-File -FilePath $logPath -Append -Encoding UTF8
}} catch {{
    "ERROR starting helper: $_" | Out-File -FilePath $logPath -Append -Encoding UTF8
    exit 1
}}

"$(Get-Date) - Install script completed successfully" | Out-File -FilePath $logPath -Append -Encoding UTF8
exit 0
"#, task_name, helper_path_str, install_path_str);

        // Write the script
        let mut script_file = match std::fs::File::create(&script_path) {
            Ok(f) => f,
            Err(e) => {
                return HelperResult {
                    success: false,
                    error: Some(format!("Failed to create install script: {}", e)),
                };
            }
        };
        
        if let Err(e) = script_file.write_all(script_content.as_bytes()) {
            return HelperResult {
                success: false,
                error: Some(format!("Failed to write install script: {}", e)),
            };
        }
        drop(script_file); // Close the file before running
        
        // Run the PowerShell script with elevation (single UAC prompt)
        log::info!("Running install script with elevation: {:?}", script_path);
        
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::Foundation::WAIT_OBJECT_0;
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};
        use windows::Win32::System::Threading::WaitForSingleObject;
        use std::mem::size_of;
        
        let verb = HSTRING::from("runas");
        let file = HSTRING::from("powershell");
        let args = format!("-ExecutionPolicy Bypass -WindowStyle Hidden -File \"{}\"", script_path.display());
        let params = HSTRING::from(&args);
        
        let mut sei = SHELLEXECUTEINFOW {
            cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            hwnd: windows::Win32::Foundation::HWND::default(),
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(file.as_ptr()),
            lpParameters: PCWSTR(params.as_ptr()),
            lpDirectory: PCWSTR::null(),
            nShow: 0, // SW_HIDE
            hInstApp: windows::Win32::Foundation::HINSTANCE::default(),
            lpIDList: std::ptr::null_mut(),
            lpClass: PCWSTR::null(),
            hkeyClass: windows::Win32::System::Registry::HKEY::default(),
            dwHotKey: 0,
            Anonymous: Default::default(),
            hProcess: windows::Win32::Foundation::HANDLE::default(),
        };
        
        let script_success = unsafe { 
            if ShellExecuteExW(&mut sei).is_ok() {
                if !sei.hProcess.is_invalid() {
                    // Wait for the script to complete (up to 30 seconds)
                    let wait_result = WaitForSingleObject(sei.hProcess, 30000);
                    wait_result == WAIT_OBJECT_0
                } else {
                    // No process handle returned — script may have launched but we can't track it.
                    // Wait a few seconds and hope for the best.
                    log::warn!("ShellExecuteExW returned no process handle, waiting 5 seconds for script to finish");
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    true
                }
            } else {
                false
            }
        };
        
        // Clean up the script file
        let _ = std::fs::remove_file(&script_path);
        
        // Read install log for diagnostics
        let install_log_path = install_dir.join("install.log");
        let install_log = std::fs::read_to_string(&install_log_path).unwrap_or_default();
        if !install_log.is_empty() {
            log::info!("Install script log:\n{}", install_log);
        } else {
            log::warn!("No install log found - script may not have run at all");
        }
        
        if !script_success {
            let detail = if install_log.is_empty() {
                "Install script did not run. UAC prompt may have been cancelled or blocked.".to_string()
            } else {
                format!("Install script failed. Log:\n{}", install_log)
            };
            return HelperResult {
                success: false,
                error: Some(detail),
            };
        }
        
        // Wait for helper to respond with the expected version (up to 15 seconds)
        for attempt in 0..30 {
            std::thread::sleep(std::time::Duration::from_millis(500));

            let status = check_helper_status();
            if status.running && status.version_ok {
                log::info!(
                    "Helper started successfully after {} attempts (version {:?})",
                    attempt + 1,
                    status.version
                );
                return HelperResult {
                    success: true,
                    error: None,
                };
            }
            if status.running && !status.version_ok {
                log::warn!(
                    "Helper responded after install but version is not yet acceptable: {:?}",
                    status.version
                );
            }
            
            // Every 5 attempts, check if the helper process is still alive
            if attempt % 5 == 4 {
                let proc_check = std::process::Command::new("tasklist")
                    .args(["/FI", "IMAGENAME eq redd-block-helper.exe", "/NH"])
                    .output();
                let helper_alive = match &proc_check {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        stdout.contains("redd-block-helper")
                    }
                    Err(_) => false,
                };
                if !helper_alive {
                    log::warn!("Helper process is not running after install (attempt {})", attempt + 1);
                    let msg = if install_log.is_empty() {
                        "Helper was installed but crashed on startup. This may be caused by antivirus software or a missing Visual C++ runtime.".to_string()
                    } else {
                        format!("Helper crashed on startup. Install log:\n{}", install_log)
                    };
                    return HelperResult {
                        success: false,
                        error: Some(msg),
                    };
                }
                log::debug!("Helper process is alive but not yet responding (attempt {})", attempt + 1);
            }
        }
        
        let timeout_msg = if install_log.is_empty() {
            "Helper installation may have failed - no install log found. Please try running as Administrator.".to_string()
        } else {
            format!("Helper installed but not responding after 15 seconds. Install log:\n{}", install_log)
        };
        HelperResult {
            success: false,
            error: Some(timeout_msg),
        }
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app; // Suppress unused warning
        HelperResult {
            success: false,
            error: Some("Helper installation not yet implemented for this platform".to_string()),
        }
    }
}

/// Start block via helper daemon
#[tauri::command]
pub async fn start_block_via_helper(
    domains: Vec<String>,
    end_time: u64,
    blocklist_id: String,
) -> HelperResult {
    log::info!(
        "start_block_via_helper: {} domains until {} for {}",
        domains.len(),
        end_time,
        blocklist_id
    );
    
    let cmd = IpcCommand {
        action: "start-block".to_string(),
        domains: Some(domains),
        end_time: Some(end_time),
        blocklist_id: Some(blocklist_id),
        apps: None,
        schedules: None,
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    match send_command(&cmd) {
        Ok(response) => HelperResult {
            success: response.success,
            error: response.error,
        },
        Err(e) => HelperResult {
            success: false,
            error: Some(e),
        },
    }
}

/// Clear block via helper daemon. If blocklist_id is Some(id), only that blocklist's block is cleared; if None, all manual blocks are cleared.
#[tauri::command]
pub async fn clear_block_via_helper(blocklist_id: Option<String>) -> HelperResult {
    log::info!("clear_block_via_helper called (blocklist_id: {:?})", blocklist_id);
    let cmd = IpcCommand {
        action: "clear-block".to_string(),
        domains: None,
        end_time: None,
        blocklist_id,
        apps: None,
        schedules: None,
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    match send_command(&cmd) {
        Ok(response) => HelperResult {
            success: response.success,
            error: response.error,
        },
        Err(e) => HelperResult {
            success: false,
            error: Some(e),
        },
    }
}

/// Uninstall helper daemon - restores hosts file and removes itself
#[tauri::command]
pub async fn uninstall_helper() -> HelperResult {
    log::info!("uninstall_helper called");
    
    // Send uninstall command to helper daemon
    let cmd = IpcCommand {
        action: "uninstall".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: None,
        schedules: None,
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    match send_command(&cmd) {
        Ok(response) if response.success => {
            if wait_for_helper_uninstall(HELPER_UNINSTALL_VERIFY_TIMEOUT) {
                HelperResult {
                    success: true,
                    error: None,
                }
            } else {
                log::warn!("Helper acknowledged uninstall but artifacts still remain; trying fallback cleanup");
                let fallback = force_cleanup_helper();
                if !fallback.success {
                    return fallback;
                }
                if wait_for_helper_uninstall(HELPER_UNINSTALL_VERIFY_TIMEOUT) {
                    fallback
                } else {
                    HelperResult {
                        success: false,
                        error: Some("The helper reported that uninstall started, but ReDD Block could still see helper artifacts afterward.".to_string()),
                    }
                }
            }
        }
        Ok(response) => {
            log::warn!("Helper returned error for uninstall: {:?}", response.error);
            let fallback = force_cleanup_helper();
            if !fallback.success {
                return fallback;
            }
            if wait_for_helper_uninstall(HELPER_UNINSTALL_VERIFY_TIMEOUT) {
                fallback
            } else {
                HelperResult {
                    success: false,
                    error: Some("Fallback cleanup ran, but the helper still appears to be installed afterward.".to_string()),
                }
            }
        }
        Err(e) => {
            log::warn!("Could not connect to helper for uninstall: {}", e);
            let fallback = force_cleanup_helper();
            if !fallback.success {
                return fallback;
            }
            if wait_for_helper_uninstall(HELPER_UNINSTALL_VERIFY_TIMEOUT) {
                fallback
            } else {
                HelperResult {
                    success: false,
                    error: Some("Fallback cleanup ran, but the helper still appears to be installed afterward.".to_string()),
                }
            }
        }
    }
}

/// Force cleanup helper - kills process, removes task, deletes files
/// Uses elevation on Windows since helper runs with admin privileges
fn force_cleanup_helper() -> HelperResult {
    log::info!("Performing force cleanup of helper...");
    
    #[cfg(target_os = "windows")]
    {
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};
        use windows::Win32::System::Threading::WaitForSingleObject;
        use std::mem::size_of;
        
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let install_dir = PathBuf::from(&program_data).join("ReDD Block");
        let helper_path = install_dir.join("redd-block-helper.exe");
        let state_path = install_dir.join("helper-state.json");
        let log_path = install_dir.join("helper.log");
        let old_log_path = install_dir.join("helper.log.old");
        let install_log_path = install_dir.join("install.log");

        let verb = HSTRING::from("runas");
        let file = HSTRING::from("powershell");
        let cleanup_cmd = format!(
            r#"-ExecutionPolicy Bypass -WindowStyle Hidden -Command "$hostsPath = \"$env:SystemRoot\System32\drivers\etc\hosts\"; $content = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue; if ($null -eq $content) {{ $content = \"\" }}; $startMarker = '# === BEGIN REDD BLOCK (reddfocus.org) ==='; $endMarker = '# === END REDD BLOCK (reddfocus.org) ==='; $startIdx = $content.IndexOf($startMarker); if ($startIdx -ge 0) {{ $before = $content.Substring(0, $startIdx).TrimEnd(); $endIdx = $content.IndexOf($endMarker); if ($endIdx -ge 0) {{ $after = $content.Substring($endIdx + $endMarker.Length).TrimStart(); if ($after.Length -gt 0) {{ $content = \"$before`n$after\" }} else {{ $content = $before }} }} else {{ $content = $before }} }}; $content = ($content -split \"`n\" | Where-Object {{ $_.Trim() -ne '# ReDD Block Start' -and $_.Trim() -ne '# ReDD Block End' }}) -join \"`n\"; Set-Content -Path $hostsPath -Value $content -NoNewline -ErrorAction SilentlyContinue; ipconfig /flushdns | Out-Null; taskkill /F /IM redd-block-helper.exe 2>$null; schtasks /Delete /TN 'ReDD Block Helper' /F 2>$null; netsh advfirewall firewall delete rule name='ReDD Block Helper' 2>$null; Remove-Item -LiteralPath '{}','{}','{}','{}','{}' -Force -ErrorAction SilentlyContinue""#,
            helper_path.display(),
            state_path.display(),
            log_path.display(),
            old_log_path.display(),
            install_log_path.display()
        );
        let params = HSTRING::from(&cleanup_cmd);
        
        let mut sei = SHELLEXECUTEINFOW {
            cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS,
            hwnd: windows::Win32::Foundation::HWND::default(),
            lpVerb: PCWSTR(verb.as_ptr()),
            lpFile: PCWSTR(file.as_ptr()),
            lpParameters: PCWSTR(params.as_ptr()),
            lpDirectory: PCWSTR::null(),
            nShow: 0,
            hInstApp: windows::Win32::Foundation::HINSTANCE::default(),
            lpIDList: std::ptr::null_mut(),
            lpClass: PCWSTR::null(),
            hkeyClass: windows::Win32::System::Registry::HKEY::default(),
            dwHotKey: 0,
            Anonymous: Default::default(),
            hProcess: windows::Win32::Foundation::HANDLE::default(),
        };
        
        let success = unsafe {
            if ShellExecuteExW(&mut sei).is_ok() {
                if !sei.hProcess.is_invalid() {
                    let waited = WaitForSingleObject(sei.hProcess, 10000) == WAIT_OBJECT_0;
                    let _ = CloseHandle(sei.hProcess);
                    waited
                } else {
                    true
                }
            } else {
                false
            }
        };
        
        if !success {
            log::warn!("Force cleanup may have failed - user cancelled UAC or error");
            return HelperResult {
                success: false,
                error: Some("Cleanup was cancelled or the admin prompt could not complete.".to_string()),
            };
        }

        log::info!("Force cleanup completed for Windows");
    }
    
    #[cfg(target_os = "macos")]
    {
        let install_path = "/Library/PrivilegedHelperTools/com.redd.block.helper";
        let plist_path = "/Library/LaunchDaemons/com.redd.block.helper.plist";
        let legacy_helper_path = "/usr/local/bin/redd-block-helper";
        let legacy_plist_path = "/Library/LaunchDaemons/org.reddfocus.redd-block-helper.plist";
        
        let script = format!(
            r#"do shell script "HOSTS=/etc/hosts; CONTENT=$(cat $HOSTS 2>/dev/null); echo \"$CONTENT\" | awk '/^# === BEGIN REDD BLOCK/ {{ skip=1; next }} /^# === END REDD BLOCK/ {{ skip=0; next }} !skip {{ print }}' | grep -v '# ReDD Block Start' | grep -v '# ReDD Block End' > ${{HOSTS}}.tmp; mv ${{HOSTS}}.tmp $HOSTS; dscacheutil -flushcache; killall -HUP mDNSResponder 2>/dev/null; launchctl bootout system/com.redd.block.helper 2>/dev/null; launchctl unload '{}' 2>/dev/null; launchctl bootout system/org.reddfocus.redd-block-helper 2>/dev/null; launchctl unload '{}' 2>/dev/null; rm -f '{}' '{}' '{}' '{}' '{}'" with administrator privileges"#,
            plist_path,
            legacy_plist_path,
            install_path,
            plist_path,
            legacy_helper_path,
            legacy_plist_path,
            SOCKET_PATH
        );

        match std::process::Command::new("osascript").arg("-e").arg(&script).output() {
            Ok(output) if output.status.success() => {
                log::info!("Force cleanup completed for macOS");
            }
            Ok(output) => {
                log::warn!(
                    "macOS force cleanup command failed: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
                return HelperResult {
                    success: false,
                    error: Some("Cleanup was cancelled or the admin prompt could not complete.".to_string()),
                };
            }
            Err(e) => {
                log::warn!("Failed to run macOS force cleanup command: {}", e);
                return HelperResult {
                    success: false,
                    error: Some(format!("Failed to run fallback cleanup: {}", e)),
                };
            }
        }
    }
    
    HelperResult {
        success: true,
        error: Some("The helper did not respond to the normal uninstall path, so ReDD Block used fallback cleanup.".to_string()),
    }
}

/// Block websites directly (fallback without helper)
#[tauri::command]
pub async fn block_websites(domains: Vec<String>) -> HelperResult {
    log::info!("block_websites called with {} domains", domains.len());
    
    HelperResult {
        success: false,
        error: Some("Direct website blocking requires helper daemon - please install it first".to_string()),
    }
}

/// Set blocked apps via the helper daemon (for persistent app blocking)
#[tauri::command]
pub async fn set_blocked_apps_via_helper(apps: Vec<String>) -> HelperResult {
    log::info!("set_blocked_apps_via_helper called with {} apps", apps.len());
    
    let cmd = IpcCommand {
        action: "set-blocked-apps".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: Some(apps),
        schedules: None,
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    match send_command(&cmd) {
        Ok(response) => {
            if response.success {
                HelperResult {
                    success: true,
                    error: None,
                }
            } else {
                HelperResult {
                    success: false,
                    error: response.error,
                }
            }
        }
        Err(e) => HelperResult {
            success: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn set_blocks_via_helper(blocks: Vec<HelperBlockData>) -> HelperResult {
    log::info!("set_blocks_via_helper called with {} blocks", blocks.len());
    
    let cmd = IpcCommand {
        action: "set-blocks".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: None,
        schedules: None,
        blocks: Some(blocks),
        keep_blocking_on_uninstall: None,
    };
    
    match send_command(&cmd) {
        Ok(response) => HelperResult {
            success: response.success,
            error: response.error,
        },
        Err(e) => HelperResult {
            success: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn set_schedules_via_helper(schedules: Vec<HelperScheduleData>) -> HelperResult {
    log::info!("set_schedules_via_helper called with {} schedules", schedules.len());
    
    let cmd = IpcCommand {
        action: "set-schedules".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: None,
        schedules: Some(schedules),
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    
    match send_command(&cmd) {
        Ok(response) => {
            if response.success {
                HelperResult {
                    success: true,
                    error: None,
                }
            } else {
                HelperResult {
                    success: false,
                    error: response.error,
                }
            }
        }
        Err(e) => HelperResult {
            success: false,
            error: Some(e),
        },
    }
}

#[tauri::command]
pub async fn set_keep_blocking_on_uninstall_via_helper(keep_blocking_on_uninstall: bool) -> HelperResult {
    log::info!(
        "set_keep_blocking_on_uninstall_via_helper called with {}",
        keep_blocking_on_uninstall
    );

    let cmd = IpcCommand {
        action: "set-keep-blocking-on-uninstall".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: None,
        schedules: None,
        blocks: None,
        keep_blocking_on_uninstall: Some(keep_blocking_on_uninstall),
    };

    match send_command(&cmd) {
        Ok(response) => HelperResult {
            success: response.success,
            error: response.error,
        },
        Err(e) => HelperResult {
            success: false,
            error: Some(e),
        },
    }
}

/// Clean hosts file by removing all ReDD Block entries.
/// Tries the helper daemon first; if unavailable, falls back to an elevated process.
#[tauri::command]
pub async fn clean_hosts_file() -> HelperResult {
    log::info!("clean_hosts_file called");

    // Try the helper daemon first
    let cmd = IpcCommand {
        action: "restore-hosts".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
        apps: None,
        schedules: None,
        keep_blocking_on_uninstall: None,
        blocks: None,
    };
    match send_command(&cmd) {
        Ok(response) if response.success => {
            log::info!("Hosts file cleaned via helper daemon");
            return HelperResult {
                success: true,
                error: None,
            };
        }
        Ok(response) => {
            log::warn!("Helper returned error: {:?}", response.error);
        }
        Err(e) => {
            log::warn!("Helper not available ({}), trying elevated fallback", e);
        }
    }

    // Fallback: clean hosts file directly via elevated process
    clean_hosts_elevated().await
}

/// Platform-specific elevated hosts file cleanup
#[cfg(target_os = "windows")]
fn clean_hosts_elevated_sync() -> HelperResult {
    use std::mem::size_of;
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
    use windows::Win32::Foundation::WAIT_OBJECT_0;
    use windows::Win32::System::Threading::WaitForSingleObject;

    log::info!("Attempting elevated hosts file cleanup on Windows");

    // PowerShell script that reads the hosts file, strips ReDD Block markers, and writes it back
    let ps_script = r#"
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$content = Get-Content $hostsPath -Raw -ErrorAction Stop
$startMarker = '# === BEGIN REDD BLOCK (reddfocus.org) ==='
$endMarker = '# === END REDD BLOCK (reddfocus.org) ==='
$startIdx = $content.IndexOf($startMarker)
if ($startIdx -ge 0) {
    $before = $content.Substring(0, $startIdx).TrimEnd()
    $endIdx = $content.IndexOf($endMarker)
    if ($endIdx -ge 0) {
        $after = $content.Substring($endIdx + $endMarker.Length).TrimStart()
        if ($after.Length -gt 0) { $content = "$before`n$after" } else { $content = $before }
    } else {
        $content = $before
    }
}
# Also clean legacy markers
$content = ($content -split "`n" | Where-Object { $_.Trim() -ne '# ReDD Block Start' -and $_.Trim() -ne '# ReDD Block End' }) -join "`n"
Set-Content -Path $hostsPath -Value $content -NoNewline -ErrorAction Stop
ipconfig /flushdns | Out-Null
"#;

    let verb = HSTRING::from("runas");
    let file = HSTRING::from("powershell");
    let params_str = format!(
        "-ExecutionPolicy Bypass -WindowStyle Hidden -Command \"{}\"",
        ps_script.replace('\n', " ").replace('"', "\\\"")
    );
    let params = HSTRING::from(&params_str);

    let mut sei = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        hwnd: windows::Win32::Foundation::HWND::default(),
        lpVerb: windows::core::PCWSTR(verb.as_ptr()),
        lpFile: windows::core::PCWSTR(file.as_ptr()),
        lpParameters: windows::core::PCWSTR(params.as_ptr()),
        lpDirectory: windows::core::PCWSTR::null(),
        nShow: 0, // SW_HIDE
        hInstApp: windows::Win32::Foundation::HINSTANCE::default(),
        lpIDList: std::ptr::null_mut(),
        lpClass: windows::core::PCWSTR::null(),
        hkeyClass: windows::Win32::System::Registry::HKEY::default(),
        dwHotKey: 0,
        Anonymous: Default::default(),
        hProcess: windows::Win32::Foundation::HANDLE::default(),
    };

    let result = unsafe { ShellExecuteExW(&mut sei) };
    if result.is_err() {
        return HelperResult {
            success: false,
            error: Some("User cancelled or UAC prompt failed".to_string()),
        };
    }

    // Wait for the elevated process to finish (up to 15 seconds)
    if !sei.hProcess.is_invalid() {
        let wait_result = unsafe { WaitForSingleObject(sei.hProcess, 15000) };
        unsafe { windows::Win32::Foundation::CloseHandle(sei.hProcess).ok() };
        if wait_result != WAIT_OBJECT_0 {
            return HelperResult {
                success: false,
                error: Some("Elevated cleanup timed out".to_string()),
            };
        }
    }

    log::info!("Elevated hosts file cleanup completed");
    HelperResult {
        success: true,
        error: None,
    }
}

#[cfg(target_os = "macos")]
fn clean_hosts_elevated_sync() -> HelperResult {
    use std::process::Command;

    log::info!("Attempting elevated hosts file cleanup on macOS");

    // Use osascript to run a shell command with admin privileges
    let script = r#"
do shell script "
HOSTS=/etc/hosts
CONTENT=$(cat $HOSTS)
# Remove current-format markers and everything between them
echo \"$CONTENT\" | awk '
    /^# === BEGIN REDD BLOCK/ { skip=1; next }
    /^# === END REDD BLOCK/ { skip=0; next }
    !skip { print }
' | grep -v '# ReDD Block Start' | grep -v '# ReDD Block End' > ${HOSTS}.tmp
mv ${HOSTS}.tmp $HOSTS
dscacheutil -flushcache
killall -HUP mDNSResponder 2>/dev/null
" with administrator privileges
"#;

    match Command::new("osascript").arg("-e").arg(script).output() {
        Ok(output) => {
            if output.status.success() {
                log::info!("Elevated hosts file cleanup completed on macOS");
                HelperResult {
                    success: true,
                    error: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                HelperResult {
                    success: false,
                    error: Some(format!("Elevated cleanup failed: {}", stderr)),
                }
            }
        }
        Err(e) => HelperResult {
            success: false,
            error: Some(format!("Failed to run osascript: {}", e)),
        },
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn clean_hosts_elevated_sync() -> HelperResult {
    HelperResult {
        success: false,
        error: Some("Elevated hosts cleanup not supported on this platform".to_string()),
    }
}

async fn clean_hosts_elevated() -> HelperResult {
    clean_hosts_elevated_sync()
}

/// Diagnostics result returned to the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticsResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hosts_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hosts_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_installed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_running: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_version_ok: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected_helper_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_state_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_state_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_log_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_log_tail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_log_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_log_tail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_status_artifact_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub helper_status_artifact_exists: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub os_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arch: Option<String>,
}

fn tail_lines(text: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    if lines.is_empty() {
        return "[File is empty]".to_string();
    }
    if lines.len() <= max_lines {
        return text.to_string();
    }
    format!(
        "[Showing last {} of {} lines]\n{}",
        max_lines,
        lines.len(),
        lines[lines.len() - max_lines..].join("\n")
    )
}

fn read_optional_tail(path: &std::path::Path, max_lines: usize) -> Option<String> {
    if !path.exists() {
        return None;
    }
    match std::fs::read_to_string(path) {
        Ok(content) => Some(tail_lines(&content, max_lines)),
        Err(e) => Some(format!("[Error reading file: {}]", e)),
    }
}

/// Get diagnostics info: hosts file content + helper daemon state
#[tauri::command]
pub async fn get_helper_diagnostics() -> DiagnosticsResult {
    log::info!("get_helper_diagnostics called");
    
    // Read hosts file
    #[cfg(target_os = "windows")]
    let hosts_path = "C:\\Windows\\System32\\drivers\\etc\\hosts";
    #[cfg(not(target_os = "windows"))]
    let hosts_path = "/etc/hosts";
    
    let hosts_content = std::fs::read_to_string(hosts_path)
        .unwrap_or_else(|e| format!("[Error reading hosts file: {}]", e));
    
    // Read helper state file
    #[cfg(target_os = "windows")]
    let state_path = {
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        std::path::PathBuf::from(&program_data).join("ReDD Block").join("helper-state.json")
    };
    #[cfg(target_os = "macos")]
    let state_path = std::path::PathBuf::from("/var/lib/redd-block/helper-state.json");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let state_path = std::path::PathBuf::from("/var/lib/redd-block/helper-state.json");
    
    let state_content = std::fs::read_to_string(&state_path)
        .unwrap_or_else(|e| format!("[Error reading state file: {}]", e));

    #[cfg(target_os = "windows")]
    let (helper_log_path, install_log_path) = {
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let install_dir = std::path::PathBuf::from(&program_data).join("ReDD Block");
        (
            install_dir.join("helper.log"),
            Some(install_dir.join("install.log")),
        )
    };
    #[cfg(target_os = "macos")]
    let (helper_log_path, install_log_path) = (
        std::path::PathBuf::from("/var/log/redd-block-helper.log"),
        None::<std::path::PathBuf>,
    );
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let (helper_log_path, install_log_path) = (
        std::path::PathBuf::from("/var/log/redd-block-helper.log"),
        None::<std::path::PathBuf>,
    );

    let helper_status = check_helper_status();
    let helper_artifact_path = helper_status_artifact_path();
    let helper_log_tail = read_optional_tail(&helper_log_path, 80);
    let install_log_tail = install_log_path
        .as_ref()
        .and_then(|path| read_optional_tail(path, 80));
    
    DiagnosticsResult {
        success: true,
        error: None,
        hosts_file: Some(hosts_content),
        hosts_path: Some(hosts_path.to_string()),
        helper_installed: Some(helper_status.installed),
        helper_running: Some(helper_status.running),
        helper_version: helper_status.version,
        helper_version_ok: Some(helper_status.version_ok),
        expected_helper_version: Some(EXPECTED_HELPER_VERSION.to_string()),
        helper_state_file: Some(state_content),
        helper_state_path: Some(state_path.display().to_string()),
        helper_log_path: Some(helper_log_path.display().to_string()),
        helper_log_tail,
        install_log_path: install_log_path.as_ref().map(|path| path.display().to_string()),
        install_log_tail,
        helper_status_artifact_path: if helper_artifact_path.as_os_str().is_empty() {
            None
        } else {
            Some(helper_artifact_path.display().to_string())
        },
        helper_status_artifact_exists: Some(helper_status_artifact_exists()),
        os_name: Some(std::env::consts::OS.to_string()),
        arch: Some(std::env::consts::ARCH.to_string()),
    }
}
