//! Process Watcher - monitors running applications and minimizes blocked ones
//!
//! Uses platform-specific APIs:
//! - macOS: osascript with NSWorkspace notifications
//! - Windows: PowerShell with SetWinEventHook

use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Manager, Emitter};

/// Process watcher state
pub struct ProcessWatcher {
    /// Maps lowercase app name -> original case app name
    blocked_apps: HashMap<String, String>,
    watcher_process: Option<Child>,
    running: bool,
}

impl ProcessWatcher {
    pub fn new() -> Self {
        ProcessWatcher {
            blocked_apps: HashMap::new(),
            watcher_process: None,
            running: false,
        }
    }
}

impl Default for ProcessWatcher {
    fn default() -> Self {
        Self::new()
    }
}

/// Global state for the process watcher
lazy_static::lazy_static! {
    static ref WATCHER: Arc<Mutex<ProcessWatcher>> = Arc::new(Mutex::new(ProcessWatcher::new()));
}

/// Start watching for blocked app launches
#[tauri::command]
pub fn start_process_watcher(app: AppHandle) {
    // Check if already running and set flag atomically to prevent race condition
    {
        let mut watcher = WATCHER.lock().unwrap();
        if watcher.running {
            log::debug!("Process watcher already running, skipping");
            return;
        }
        // Set running flag now, before spawning, to prevent multiple spawns
        watcher.running = true;
    }
    
    let watcher = WATCHER.clone();
    
    thread::spawn(move || {
        #[cfg(target_os = "macos")]
        start_macos_watcher(app, watcher);
        
        #[cfg(target_os = "windows")]
        start_windows_watcher(app, watcher);
    });
}

/// Stop watching for process launches
#[tauri::command]
pub fn stop_process_watcher() {
    let mut watcher = WATCHER.lock().unwrap();
    watcher.running = false;
    
    if let Some(mut process) = watcher.watcher_process.take() {
        let _ = process.kill();
    }
    
    log::info!("Process watcher stopped");
}

/// Update the list of blocked apps
#[tauri::command]
pub fn set_blocked_apps(apps: Vec<String>) {
    let mut watcher = WATCHER.lock().unwrap();
    watcher.blocked_apps = apps.iter()
        .map(|a| (a.to_lowercase(), a.clone()))
        .collect();
    log::debug!("Process watcher: blocking apps: {:?}", watcher.blocked_apps.keys().collect::<Vec<_>>());
}

/// Check if any apps are currently being blocked
#[tauri::command]
pub fn has_blocked_apps() -> bool {
    let watcher = WATCHER.lock().unwrap();
    !watcher.blocked_apps.is_empty()
}

/// Internal function to minimize/hide a specific app (used by watcher)
fn internal_minimize_app(app_name: &str) {
    #[cfg(target_os = "macos")]
    {
        let escaped = app_name.replace('"', "\\\"");
        let script = format!(
            r#"tell application "System Events" to set visible of application process "{}" to false"#,
            escaped
        );
        // Spawn without waiting to avoid blocking
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
    
    #[cfg(target_os = "windows")]
    {
        let ps_script = format!(r#"
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Minimize {{
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}}
"@
$processes = Get-Process -Name "{}" -ErrorAction SilentlyContinue
foreach ($proc in $processes) {{
    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {{
        [Win32Minimize]::ShowWindow($proc.MainWindowHandle, 6)
    }}
}}
"#, app_name);
        
        let _ = Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn();
    }
    
    log::debug!("Minimized app: {}", app_name);
}

/// Hide all currently blocked apps
#[tauri::command]
pub fn hide_all_blocked_apps() {
    let apps: Vec<String> = {
        let watcher = WATCHER.lock().unwrap();
        // Get the original case names (values), not lowercase keys
        watcher.blocked_apps.values().cloned().collect()
    };
    
    log::debug!("hide_all_blocked_apps: hiding {} apps", apps.len());
    for app in apps {
        internal_minimize_app(&app);
    }
}

#[cfg(target_os = "macos")]
fn start_macos_watcher(app: AppHandle, watcher: Arc<Mutex<ProcessWatcher>>) {
    // AppleScript that monitors for app launches and activations
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
    let temp_path = std::env::temp_dir().join("redd-app-watcher.applescript");
    if std::fs::write(&temp_path, script).is_err() {
        log::error!("Failed to write AppleScript file");
        return;
    }

    let mut process = match Command::new("osascript")
        .arg(&temp_path)
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(p) => p,
        Err(e) => {
            log::error!("Failed to start macOS watcher: {}", e);
            // Reset running flag since we failed to start
            let mut w = watcher.lock().unwrap();
            w.running = false;
            return;
        }
    };

    log::info!("macOS app watcher started");

    // Read stderr (AppleScript 'log' outputs to stderr)
    if let Some(stderr) = process.stderr.take() {
        let reader = BufReader::new(stderr);
        let app_clone = app.clone();
        let watcher_clone = watcher.clone();
        
        for line in reader.lines() {
            // Check if we should stop
            {
                let w = watcher_clone.lock().unwrap();
                if !w.running {
                    break;
                }
            }
            
            if let Ok(app_name) = line {
                let app_name = app_name.trim();
                if app_name.is_empty() {
                    continue;
                }
                
                // Check if this app is blocked
                let is_blocked = {
                    let w = watcher_clone.lock().unwrap();
                    w.blocked_apps.contains_key(&app_name.to_lowercase())
                };
                
                if is_blocked {
                    log::info!("Blocked app detected: {}", app_name);
                    
                    // Minimize the app
                    internal_minimize_app(app_name);
                    
                    // Emit event to frontend
                    let _ = app_clone.emit("blocked-app-detected", app_name.to_string());
                }
            }
        }
    }

    // Clean up
    let _ = process.kill();
    let _ = std::fs::remove_file(&temp_path);
    
    {
        let mut w = watcher.lock().unwrap();
        w.running = false;
    }
    
    log::info!("macOS app watcher stopped");
}

#[cfg(target_os = "windows")]
fn start_windows_watcher(app: AppHandle, watcher: Arc<Mutex<ProcessWatcher>>) {
    // PowerShell script for event-driven foreground monitoring
    let ps_script = r#"
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class ForegroundWatcher {
    public delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);
    
    [DllImport("user32.dll")]
    public static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);
    
    [DllImport("user32.dll")]
    public static extern bool UnhookWinEvent(IntPtr hWinEventHook);
    
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    
    public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    public const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
    
    private static WinEventDelegate _delegate;
    private static IntPtr _hook;
    
    public static void Start() {
        _delegate = new WinEventDelegate(WinEventProc);
        _hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero, _delegate, 0, 0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
        );
        Console.WriteLine("READY");
        Console.Out.Flush();
        OutputCurrentForeground();
    }
    
    public static void Stop() {
        if (_hook != IntPtr.Zero) {
            UnhookWinEvent(_hook);
            _hook = IntPtr.Zero;
        }
    }
    
    private static void WinEventProc(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime) {
        if (hwnd == IntPtr.Zero) return;
        OutputProcessForWindow(hwnd);
    }
    
    private static void OutputCurrentForeground() {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd != IntPtr.Zero) {
            OutputProcessForWindow(hwnd);
        }
    }
    
    private static void OutputProcessForWindow(IntPtr hwnd) {
        try {
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            if (processId > 0) {
                Process proc = Process.GetProcessById((int)processId);
                Console.WriteLine("FG:" + proc.ProcessName);
                Console.Out.Flush();
            }
        } catch { }
    }
}
"@

[ForegroundWatcher]::Start()
try {
    Add-Type -AssemblyName System.Windows.Forms
    while ($true) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 100
    }
} finally {
    [ForegroundWatcher]::Stop()
}
"#;

    // Write to temp file
    let temp_path = std::env::temp_dir().join("redd-foreground-watcher.ps1");
    if std::fs::write(&temp_path, ps_script).is_err() {
        log::error!("Failed to write PowerShell script");
        return;
    }

    let mut process = match Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(&temp_path)
        .stdout(Stdio::piped())
        .spawn()
    {
        Ok(p) => p,
        Err(e) => {
            log::error!("Failed to start Windows watcher: {}", e);
            // Reset running flag since we failed to start
            let mut w = watcher.lock().unwrap();
            w.running = false;
            return;
        }
    };

    log::info!("Windows foreground watcher started");

    if let Some(stdout) = process.stdout.take() {
        let reader = BufReader::new(stdout);
        let app_clone = app.clone();
        let watcher_clone = watcher.clone();
        
        for line in reader.lines() {
            {
                let w = watcher_clone.lock().unwrap();
                if !w.running {
                    break;
                }
            }
            
            if let Ok(line) = line {
                let trimmed = line.trim();
                
                if trimmed.starts_with("FG:") {
                    let process_name = &trimmed[3..];
                    
                    let is_blocked = {
                        let w = watcher_clone.lock().unwrap();
                        w.blocked_apps.contains_key(&process_name.to_lowercase())
                    };
                    
                    if is_blocked {
                        log::info!("Blocked app in foreground: {}", process_name);
                        internal_minimize_app(process_name);
                        let _ = app_clone.emit("blocked-app-detected", process_name.to_string());
                    }
                }
            }
        }
    }

    let _ = process.kill();
    let _ = std::fs::remove_file(&temp_path);
    
    {
        let mut w = watcher.lock().unwrap();
        w.running = false;
    }
    
    log::info!("Windows foreground watcher stopped");
}
