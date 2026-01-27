use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use tauri::Manager;

#[cfg(target_os = "macos")]
use std::os::unix::net::UnixStream;

const SOCKET_PATH: &str = "/tmp/redd-block-helper.sock";

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

#[cfg(not(target_os = "macos"))]
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
    // Check if socket exists and try to ping
    let installed = std::path::Path::new(SOCKET_PATH).exists();
    
    let running = if installed {
        let cmd = IpcCommand {
            action: "ping".to_string(),
            domains: None,
            end_time: None,
            blocklist_id: None,
        };
        send_command(&cmd).map(|r| r.success).unwrap_or(false)
    } else {
        false
    };
    
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
    
    #[cfg(not(target_os = "macos"))]
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
