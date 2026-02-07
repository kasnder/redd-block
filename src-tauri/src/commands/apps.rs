use tauri_plugin_dialog::DialogExt;
use std::process::Command;

/// Open a file picker dialog to select one or more applications
#[tauri::command]
pub async fn open_app_picker(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    let default_path = std::path::Path::new("/Applications");
    
    #[cfg(target_os = "windows")]
    let default_path = std::path::Path::new("C:\\Program Files");
    
    #[cfg(target_os = "linux")]
    let default_path = std::path::Path::new("/usr/share/applications");

    let files = app.dialog()
        .file()
        .set_title("Select Applications to Block")
        .set_directory(default_path)
        .blocking_pick_files();

    match files {
        Some(file_paths) => {
            let mut app_names = Vec::new();
            for file_path in file_paths {
                if let Some(path) = file_path.into_path().ok() {
                    if let Some(name) = path.file_stem() {
                        app_names.push(name.to_string_lossy().to_string());
                    } else {
                        app_names.push(path.to_string_lossy().to_string());
                    }
                }
            }
            Ok(app_names)
        }
        None => Ok(Vec::new()),
    }
}

/// Get list of running applications
#[tauri::command]
pub fn get_running_apps() -> Vec<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .arg("-l")
            .arg("JavaScript")
            .arg("-e")
            .arg("const apps = Application('System Events').processes.whose({backgroundOnly: false}).name(); JSON.stringify(apps);")
            .output();
        
        match output {
            Ok(out) => {
                if let Ok(json_str) = String::from_utf8(out.stdout) {
                    if let Ok(apps) = serde_json::from_str::<Vec<String>>(&json_str) {
                        return apps;
                    }
                }
                Vec::new()
            }
            Err(_) => Vec::new(),
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-Command", 
                   "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -ExpandProperty ProcessName -Unique | ConvertTo-Json"])
            .output();
        
        match output {
            Ok(out) => {
                if let Ok(json_str) = String::from_utf8(out.stdout) {
                    // Handle both array and single value
                    if let Ok(apps) = serde_json::from_str::<Vec<String>>(&json_str) {
                        return apps;
                    }
                    if let Ok(app) = serde_json::from_str::<String>(&json_str) {
                        return vec![app];
                    }
                }
                Vec::new()
            }
            Err(_) => Vec::new(),
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        Vec::new() // TODO: Implement for Linux
    }
}

/// Minimize/hide an application
#[tauri::command]
pub fn minimize_app(app_name: String) -> bool {
    #[cfg(target_os = "macos")]
    {
        let escaped_name = app_name.replace("\"", "\\\"");
        let script = format!(
            "tell application \"System Events\" to set visible of application process \"{}\" to false",
            escaped_name
        );
        
        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .is_ok()
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows minimize implementation using PowerShell
        let script = format!(r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32 {{
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}}
"@
Get-Process -Name "{}" -ErrorAction SilentlyContinue | ForEach-Object {{
    [Win32]::ShowWindow($_.MainWindowHandle, 6)
}}
"#, app_name);
        
        Command::new("powershell")
            .args(["-ExecutionPolicy", "Bypass", "-Command", &script])
            .output()
            .is_ok()
    }
    
    #[cfg(target_os = "linux")]
    {
        false // TODO: Implement for Linux
    }
}
