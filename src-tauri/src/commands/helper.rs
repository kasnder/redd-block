use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::Manager;

#[cfg(target_os = "macos")]
use std::os::unix::net::UnixStream;

#[cfg(target_os = "windows")]
use std::net::TcpStream;

#[cfg(target_os = "macos")]
const SOCKET_PATH: &str = "/tmp/redd-block-helper.sock";

#[cfg(target_os = "windows")]
const HELPER_TCP_ADDR: &str = "127.0.0.1:62222";


/// Helper daemon status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperStatus {
    pub installed: bool,
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub version_ok: bool,
}

/// Expected helper version (should match app version)
const EXPECTED_HELPER_VERSION: &str = env!("CARGO_PKG_VERSION");

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
    let mut stream = TcpStream::connect(HELPER_TCP_ADDR)
        .map_err(|e| format!("Failed to connect to helper: {}", e))?;
    
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

/// Get path to the bundled helper binary
fn get_helper_path(_app: &tauri::AppHandle) -> Option<PathBuf> {
    // Tauri externalBin bundles the sidecar next to the main executable
    // For universal builds, the suffix is stripped; for arch-specific builds, suffix is kept
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))?;
    
    #[cfg(target_os = "macos")]
    let candidates = [
        "redd-block-helper",  // Universal builds
        "redd-block-helper-aarch64-apple-darwin",  // ARM64 build
        "redd-block-helper-x86_64-apple-darwin",   // Intel build
        "redd-block-helper-universal-apple-darwin", // Universal with explicit suffix
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
    };
    
    let ping_result = send_command(&cmd);
    let (running, helper_version) = match &ping_result {
        Ok(r) if r.success => (true, r.version.clone()),
        _ => (false, None),
    };
    
    // Check if version matches expected
    let version_ok = match &helper_version {
        Some(v) => v == EXPECTED_HELPER_VERSION,
        None => false,
    };
    
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
        
        // Script to copy binary, set permissions, write plist, and load daemon
        // Uses osascript to prompt for admin password
        // Also cleans up old helper location from pre-0.4.4 versions (/usr/local/bin/redd-block-helper)
        let old_helper_path = "/usr/local/bin/redd-block-helper";
        let old_plist_path = "/Library/LaunchDaemons/org.reddfocus.redd-block-helper.plist";
        let script = format!(
            r#"do shell script "launchctl unload '{}' 2>/dev/null; rm -f '{}' '{}'; cp '{}' '{}' && chmod 755 '{}' && echo '{}' > '{}' && launchctl load '{}'" with administrator privileges"#,
            old_plist_path,
            old_helper_path,
            old_plist_path,
            helper_path.display(),
            install_path,
            install_path,
            plist_content.replace("\"", "\\\"").replace("\n", "\\n"),
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
        let script_path = install_dir.join("install-helper.ps1");
        let task_name = "ReDD Block Helper";
        let helper_path_str = helper_path.to_string_lossy();
        let install_path_str = install_path.to_string_lossy();
        
        let script_content = format!(r#"
$taskName = "{}"
$sourcePath = "{}"
$helperPath = "{}"

# Kill any existing helper process
taskkill /F /IM redd-block-helper.exe 2>$null
Start-Sleep -Seconds 1

# Copy the helper binary
Copy-Item -Path $sourcePath -Destination $helperPath -Force

# Remove existing task if any
schtasks /Delete /TN "$taskName" /F 2>$null

# Create scheduled task for persistence (auto-start at logon with admin rights)
schtasks /Create /TN "$taskName" /TR "`"$helperPath`"" /SC ONLOGON /RL HIGHEST /F

# Start the helper directly (we're already elevated)
Start-Process -FilePath $helperPath -WindowStyle Hidden

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
                    true
                }
            } else {
                false
            }
        };
        
        // Clean up the script file
        let _ = std::fs::remove_file(&script_path);
        
        if !script_success {
            return HelperResult {
                success: false,
                error: Some("User cancelled UAC prompt or script failed to run".to_string()),
            };
        }
        
        // Wait for helper to respond (up to 5 seconds)
        for attempt in 0..10 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            
            let ping_result = send_command(&IpcCommand {
                action: "ping".to_string(),
                domains: None,
                end_time: None,
                blocklist_id: None,
            });
            
            if ping_result.is_ok() {
                log::info!("Helper started successfully after {} attempts", attempt + 1);
                return HelperResult {
                    success: true,
                    error: None,
                };
            }
            log::debug!("Waiting for helper to start, attempt {}", attempt + 1);
        }
        
        HelperResult {
            success: false,
            error: Some("Helper installation completed but helper not responding. Please try again or restart your computer.".to_string()),
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

/// Clear block via helper daemon
#[tauri::command]
pub async fn clear_block_via_helper() -> HelperResult {
    log::info!("clear_block_via_helper called");
    
    let cmd = IpcCommand {
        action: "clear-block".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
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
    };
    
    match send_command(&cmd) {
        Ok(response) if response.success => HelperResult {
            success: true,
            error: None,
        },
        Ok(response) => {
            // Helper responded but with an error (e.g., old helper doesn't know "uninstall")
            log::warn!("Helper returned error for uninstall: {:?}", response.error);
            // Fall through to force cleanup
            force_cleanup_helper()
        },
        Err(e) => {
            // Can't connect to helper - maybe already gone or not responding
            log::warn!("Could not connect to helper for uninstall: {}", e);
            force_cleanup_helper()
        },
    }
}

/// Force cleanup helper - kills process, removes task, deletes files
/// Uses elevation on Windows since helper runs with admin privileges
fn force_cleanup_helper() -> HelperResult {
    log::info!("Performing force cleanup of helper...");
    
    #[cfg(target_os = "windows")]
    {
        use windows::core::{HSTRING, PCWSTR};
        use windows::Win32::Foundation::WAIT_OBJECT_0;
        use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};
        use windows::Win32::System::Threading::WaitForSingleObject;
        use std::mem::size_of;
        
        // Create a script that kills the process and cleans up
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let install_dir = PathBuf::from(&program_data).join("ReDD Block");
        
        // Run elevated taskkill and cleanup
        let verb = HSTRING::from("runas");
        let file = HSTRING::from("powershell");
        let cleanup_cmd = format!(
            "-ExecutionPolicy Bypass -WindowStyle Hidden -Command \"taskkill /F /IM redd-block-helper.exe 2>$null; schtasks /Delete /TN 'ReDD Block Helper' /F 2>$null; Remove-Item -Path '{}' -Recurse -Force -ErrorAction SilentlyContinue\"",
            install_dir.display()
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
                    WaitForSingleObject(sei.hProcess, 10000) == WAIT_OBJECT_0
                } else {
                    true
                }
            } else {
                false
            }
        };
        
        if success {
            log::info!("Force cleanup completed for Windows");
        } else {
            log::warn!("Force cleanup may have failed - user cancelled UAC or error");
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // Try to unload the launchd daemon
        let _ = std::process::Command::new("launchctl")
            .args(["remove", "org.reddfocus.block.helper"])
            .output();
        
        // Note: On macOS, removing daemon files requires admin
        log::info!("Force cleanup completed for macOS (launchd unloaded)");
    }
    
    HelperResult {
        success: true,
        error: Some("Helper force-removed (used fallback cleanup)".to_string()),
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

/// Refresh blocked apps list (notifies process watcher)
#[tauri::command]
pub fn refresh_blocked_apps() {
    log::info!("refresh_blocked_apps called");
    // Will be implemented with process watcher
}
