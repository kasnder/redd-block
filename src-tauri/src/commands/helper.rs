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

/// Uses Windows ShellExecuteEx with "runas" verb to trigger native UAC prompt.
/// This works in MSIX/Store apps unlike Start-Process -Verb RunAs in PowerShell.
#[cfg(target_os = "windows")]
fn create_task_elevated_native(task_name: &str, install_path: &PathBuf) -> Result<(), String> {
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Foundation::WAIT_OBJECT_0;
    use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};
    use windows::Win32::System::Threading::WaitForSingleObject;
    use std::mem::size_of;
    
    // Build the schtasks arguments for task creation
    let args = format!(
        "/Create /TN \"{}\" /TR \"\\\"{}\\\"\" /SC ONLOGON /RL HIGHEST /F",
        task_name,
        install_path.display()
    );
    
    let verb = HSTRING::from("runas");
    let file = HSTRING::from("schtasks");
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
    
    // First delete any existing task (ignore errors)
    let delete_args = format!("/Delete /TN \"{}\" /F", task_name);
    let delete_params = HSTRING::from(&delete_args);
    let mut delete_sei = SHELLEXECUTEINFOW {
        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        hwnd: windows::Win32::Foundation::HWND::default(),
        lpVerb: PCWSTR(verb.as_ptr()),
        lpFile: PCWSTR(file.as_ptr()),
        lpParameters: PCWSTR(delete_params.as_ptr()),
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
    
    unsafe {
        // Delete existing task first (ignore result)
        let _ = ShellExecuteExW(&mut delete_sei);
        if !delete_sei.hProcess.is_invalid() {
            WaitForSingleObject(delete_sei.hProcess, 5000);
        }
        
        // Now create the new task
        if ShellExecuteExW(&mut sei).is_ok() {
            if !sei.hProcess.is_invalid() {
                // Wait for the process to complete
                let wait_result = WaitForSingleObject(sei.hProcess, 30000);
                if wait_result == WAIT_OBJECT_0 {
                    return Ok(());
                } else {
                    return Err("Timed out waiting for schtasks to complete".to_string());
                }
            }
            Ok(())
        } else {
            Err("User cancelled UAC prompt or elevation failed".to_string())
        }
    }
}


/// Helper daemon status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelperStatus {
    pub installed: bool,
    pub running: bool,
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
}

#[derive(Debug, Deserialize)]
struct IpcResponse {
    success: bool,
    #[serde(default)]
    error: Option<String>,
    #[allow(dead_code)]
    #[serde(default)]
    active: Option<bool>,
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
fn get_helper_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    // Tauri sidecars are placed next to the app binary with platform-specific suffix
    app.path().resource_dir().ok().map(|dir| {
        #[cfg(target_os = "macos")]
        let name = "redd-block-helper-aarch64-apple-darwin";
        #[cfg(target_os = "windows")]
        let name = "redd-block-helper-x86_64-pc-windows-msvc.exe";
        #[cfg(target_os = "linux")]
        let name = "redd-block-helper-x86_64-unknown-linux-gnu";
        
        dir.join(name)
    })
}

/// Check helper daemon status
#[tauri::command]
pub fn check_helper_status() -> HelperStatus {
    // Try to ping the helper - this works for both platforms
    let cmd = IpcCommand {
        action: "ping".to_string(),
        domains: None,
        end_time: None,
        blocklist_id: None,
    };
    
    let running = send_command(&cmd).map(|r| r.success).unwrap_or(false);
    
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
    
    HelperStatus { installed, running }
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
                        let helper = dir.join("redd-block-helper-aarch64-apple-darwin");
                        if helper.exists() {
                            helper
                        } else {
                            return HelperResult {
                                success: false,
                                error: Some("Helper binary not found in app bundle".to_string()),
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
        
        // Copy helper to /usr/local/bin (persistent location)
        let install_path = "/usr/local/bin/redd-block-helper";
        
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
        let script = format!(
            r#"do shell script "cp '{}' '{}' && chmod 755 '{}' && echo '{}' > '{}' && launchctl load '{}'" with administrator privileges"#,
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
        use std::process::Command;
        
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
        
        // Kill any existing helper process to free up the port
        log::info!("Killing any existing helper process...");
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "redd-block-helper.exe"])
            .output();
        
        // Give the OS time to release the TCP port (handles TIME_WAIT state)
        std::thread::sleep(std::time::Duration::from_millis(1500));
        
        // Install to ProgramData (accessible by scheduled tasks running as SYSTEM)
        let program_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        let install_dir = PathBuf::from(&program_data).join("ReDD Block");
        let install_path = install_dir.join("redd-block-helper.exe");
        
        // Create install directory
        if let Err(e) = std::fs::create_dir_all(&install_dir) {
            return HelperResult {
                success: false,
                error: Some(format!("Failed to create install directory: {}", e)),
            };
        }
        
        // Copy the helper binary
        if let Err(e) = std::fs::copy(&helper_path, &install_path) {
            return HelperResult {
                success: false,
                error: Some(format!("Failed to copy helper binary: {}", e)),
            };
        }
        
        let task_name = "ReDD Block Helper";
        
        // Always use native UAC elevation - requires admin to create task with HIGHEST privileges
        let create_result = create_task_elevated_native(task_name, &install_path);
        
        match create_result {
            Ok(()) => {
                // Start the helper with elevation using ShellExecuteEx with runas verb
                // The scheduled task is for auto-start on logon, but for immediate start we need elevation
                log::info!("Starting helper process with elevation: {:?}", install_path);
                
                use windows::core::{HSTRING, PCWSTR};
                use windows::Win32::UI::Shell::{ShellExecuteExW, SHELLEXECUTEINFOW, SEE_MASK_NOCLOSEPROCESS};
                use std::mem::size_of;
                
                let verb = HSTRING::from("runas");
                let file = HSTRING::from(install_path.to_string_lossy().as_ref());
                
                let mut sei = SHELLEXECUTEINFOW {
                    cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
                    fMask: SEE_MASK_NOCLOSEPROCESS,
                    hwnd: windows::Win32::Foundation::HWND::default(),
                    lpVerb: PCWSTR(verb.as_ptr()),
                    lpFile: PCWSTR(file.as_ptr()),
                    lpParameters: PCWSTR::null(),
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
                
                let spawn_success = unsafe { ShellExecuteExW(&mut sei).is_ok() };
                
                if spawn_success {
                    // Wait for helper to actually start (up to 5 seconds)
                    for attempt in 0..10 {
                        std::thread::sleep(std::time::Duration::from_millis(500));
                        
                        // Try to ping the helper
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
                    
                    // Helper didn't start in time
                    HelperResult {
                        success: false,
                        error: Some("Helper process spawned with elevation, but not responding. Please try again or restart your computer.".to_string()),
                    }
                } else {
                    HelperResult {
                        success: false,
                        error: Some("User cancelled UAC prompt or failed to start helper with elevation".to_string()),
                    }
                }
            },
            Err(e) => HelperResult {
                success: false,
                error: Some(e),
            },
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
        Ok(response) => HelperResult {
            success: response.success,
            error: response.error,
        },
        Err(e) => {
            // If we can't connect, the helper might already be gone
            // Try to clean up the scheduled task/launchd daemon manually
            log::warn!("Could not connect to helper for uninstall: {}", e);
            
            #[cfg(target_os = "windows")]
            {
                // Try to remove the scheduled task
                let _ = std::process::Command::new("schtasks")
                    .args(["/Delete", "/TN", "ReDD Block Helper", "/F"])
                    .output();
            }
            
            #[cfg(target_os = "macos")]
            {
                // Try to unload the launchd daemon
                let _ = std::process::Command::new("launchctl")
                    .args(["remove", "org.reddfocus.block.helper"])
                    .output();
            }
            
            HelperResult {
                success: true,
                error: Some(format!("Helper cleaned up (was not running: {})", e)),
            }
        },
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
