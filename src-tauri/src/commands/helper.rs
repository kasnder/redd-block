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

#[cfg(target_os = "windows")]
fn is_msix_package() -> bool {
    // MSIX apps have PACKAGE_FAMILY_NAME environment variable set
    std::env::var("PACKAGE_FAMILY_NAME").is_ok() ||
    // Also check if executable path contains WindowsApps (MSIX install location)
    std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.contains("WindowsApps")))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn create_task_direct(task_name: &str, install_path: &PathBuf) -> Result<(), String> {
    use std::process::Command;
    
    // Delete existing task if any (ignore errors)
    let _ = Command::new("schtasks")
        .args(["/Delete", "/TN", task_name, "/F"])
        .output();
    
    // Create new scheduled task that runs at logon with highest privileges
    let create_result = Command::new("schtasks")
        .args([
            "/Create",
            "/TN", task_name,
            "/TR", &format!("\"{}\"", install_path.display()),
            "/SC", "ONLOGON",
            "/RL", "HIGHEST",
            "/F",
        ])
        .output();
    
    match create_result {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            Err(format!("Failed to create scheduled task: {}", error_msg))
        },
        Err(e) => Err(format!("Failed to run schtasks: {}", e)),
    }
}

#[cfg(target_os = "windows")]
fn create_task_elevated(task_name: &str, install_path: &PathBuf) -> Result<(), String> {
    use std::process::Command;
    
    // Escape single quotes for PowerShell
    let escaped_task_name = task_name.replace("'", "''");
    let escaped_path = install_path.display().to_string().replace("'", "''");
    
    // Delete existing task with elevation
    let delete_script = format!(
        r#"Start-Process -FilePath 'schtasks' -ArgumentList '/Delete', '/TN', '{}', '/F' -Verb RunAs -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue"#,
        escaped_task_name
    );
    let _ = Command::new("powershell.exe")
        .args(["-Command", &delete_script])
        .output();
    
    // Create task with elevation (UAC prompt)
    let create_script = format!(
        r#"$proc = Start-Process -FilePath 'schtasks' -ArgumentList '/Create', '/TN', '{}', '/TR', '{}', '/SC', 'ONLOGON', '/RL', 'HIGHEST', '/F' -Verb RunAs -Wait -WindowStyle Hidden -PassThru; exit $proc.ExitCode"#,
        escaped_task_name,
        escaped_path
    );
    
    let result = Command::new("powershell.exe")
        .args(["-Command", &create_script])
        .output();
    
    match result {
        Ok(output) if output.status.success() || output.status.code() == Some(0) => Ok(()),
        Ok(output) => {
            let error_msg = String::from_utf8_lossy(&output.stderr);
            if error_msg.contains("canceled") || error_msg.contains("denied") || error_msg.contains("Access is denied") {
                Err("User cancelled or denied elevation. Administrator privileges are required to install the helper.".to_string())
            } else {
                Err(format!("Failed to create scheduled task: {}", error_msg))
            }
        },
        Err(e) => Err(format!("Failed to run PowerShell: {}", e)),
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
        
        // Check if running in MSIX (Microsoft Store) context
        let is_msix = is_msix_package();
        
        let task_name = "ReDD Block Helper";
        
        // Create scheduled task - use elevation for MSIX, direct for standalone
        let create_result = if is_msix {
            create_task_elevated(task_name, &install_path)
        } else {
            create_task_direct(task_name, &install_path)
        };
        
        match create_result {
            Ok(()) => {
                // Start the helper now
                let run_result = Command::new("schtasks")
                    .args(["/Run", "/TN", task_name])
                    .output();
                
                std::thread::sleep(std::time::Duration::from_millis(500));
                
                match run_result {
                    Ok(r) if r.status.success() => HelperResult {
                        success: true,
                        error: None,
                    },
                    Ok(r) => HelperResult {
                        success: false,
                        error: Some(format!("Task created but failed to run: {}", 
                            String::from_utf8_lossy(&r.stderr))),
                    },
                    Err(e) => HelperResult {
                        success: false,
                        error: Some(format!("Task created but failed to run: {}", e)),
                    },
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
