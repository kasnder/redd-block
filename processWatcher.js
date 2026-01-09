/**
 * Process Watcher - Event-driven app monitoring
 * 
 * Uses platform-specific APIs to detect when new processes start:
 * - Windows: WMI Win32_ProcessStartTrace events
 * - macOS: NSWorkspace notifications via AppleScript
 * 
 * This replaces the polling-based approach for much lower resource usage.
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

let watcherProcess = null;
let blockedApps = new Set();
let onAppBlocked = null;

/**
 * Start watching for process launches
 * @param {Function} callback - Called when a blocked app is detected: callback(appName)
 */
function startWatching(callback) {
    onAppBlocked = callback;

    if (process.platform === 'win32') {
        startWindowsWatcher();
    } else if (process.platform === 'darwin') {
        startMacOSWatcher();
    }
}

/**
 * Stop watching for process launches
 */
function stopWatching() {
    // Stop Windows polling
    if (process.platform === 'win32') {
        stopWindowsWatcher();
    }

    // Stop macOS watcher process
    if (watcherProcess) {
        watcherProcess.kill();
        watcherProcess = null;
    }
}

/**
 * Update the list of apps to block
 * @param {Set|Array} apps - Set or array of app names to block
 */
function setBlockedApps(apps) {
    // Store in lowercase for case-insensitive matching (Windows process names vary in case)
    blockedApps = new Set(Array.from(apps).map(a => a.toLowerCase()));
    log.info('Process watcher: blocking apps:', Array.from(blockedApps));
}

/**
 * Check if any apps are currently being blocked
 */
function hasBlockedApps() {
    return blockedApps.size > 0;
}

/**
 * Windows: Event-driven process monitoring using a persistent PowerShell process
 * 
 * Uses SetWinEventHook to listen for:
 * - EVENT_SYSTEM_FOREGROUND: when a window becomes the foreground window
 * - EVENT_OBJECT_CREATE: when a new process window is created
 * 
 * This eliminates all polling - the PowerShell process runs continuously
 * and only outputs when events occur.
 */
let windowsWatcherProcess = null;
let windowsWatcherReady = false;

function startWindowsWatcher() {
    if (windowsWatcherProcess) {
        windowsWatcherProcess.kill();
        windowsWatcherProcess = null;
    }
    windowsWatcherReady = false;

    // PowerShell script that uses SetWinEventHook for event-driven monitoring
    // Listens for:
    // - EVENT_SYSTEM_FOREGROUND (0x0003): when a window becomes foreground
    // - EVENT_SYSTEM_MINIMIZEEND (0x0017): when a window is restored from minimized
    const psScript = `
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
    public const uint EVENT_SYSTEM_MINIMIZEEND = 0x0017;
    public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    public const uint WINEVENT_SKIPOWNPROCESS = 0x0002;
    
    private static WinEventDelegate _delegate;
    private static IntPtr _foregroundHook;
    private static IntPtr _minimizeEndHook;
    
    public static void Start() {
        _delegate = new WinEventDelegate(WinEventProc);
        
        // Hook for foreground window changes
        _foregroundHook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero, _delegate,
            0, 0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
        );
        
        // Hook for window restore from minimized (catches taskbar clicks)
        _minimizeEndHook = SetWinEventHook(
            EVENT_SYSTEM_MINIMIZEEND, EVENT_SYSTEM_MINIMIZEEND,
            IntPtr.Zero, _delegate,
            0, 0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
        );
        
        // Output ready signal
        Console.WriteLine("READY");
        Console.Out.Flush();
        
        // Output initial foreground window
        OutputCurrentForeground();
    }
    
    public static void Stop() {
        if (_foregroundHook != IntPtr.Zero) {
            UnhookWinEvent(_foregroundHook);
            _foregroundHook = IntPtr.Zero;
        }
        if (_minimizeEndHook != IntPtr.Zero) {
            UnhookWinEvent(_minimizeEndHook);
            _minimizeEndHook = IntPtr.Zero;
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

# Start the watcher
[ForegroundWatcher]::Start()

# Keep the script running with a message pump for the hook to work
try {
    Add-Type -AssemblyName System.Windows.Forms
    while ($true) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 100
    }
} finally {
    [ForegroundWatcher]::Stop()
}
`;

    // Write script to temp file
    const tempScriptPath = path.join(require('electron').app.getPath('temp'), 'redd-foreground-watcher.ps1');
    fs.writeFileSync(tempScriptPath, psScript);

    windowsWatcherProcess = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', tempScriptPath
    ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });

    windowsWatcherProcess.stdout.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === 'READY') {
                windowsWatcherReady = true;
                log.info('Windows foreground watcher ready (event-driven)');
                continue;
            }

            if (trimmed.startsWith('FG:')) {
                const processName = trimmed.substring(3);
                if (processName && blockedApps.has(processName.toLowerCase())) {
                    log.info(`Process watcher: Blocked app in foreground: ${processName}`);
                    if (onAppBlocked) {
                        onAppBlocked(processName);
                    }
                }
            }
        }
    });

    windowsWatcherProcess.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
            log.warn('Windows watcher stderr:', msg);
        }
    });

    windowsWatcherProcess.on('close', (code) => {
        log.info(`Windows foreground watcher exited with code ${code}`);
        windowsWatcherProcess = null;
        windowsWatcherReady = false;
        // Clean up temp file
        try {
            if (fs.existsSync(tempScriptPath)) {
                fs.unlinkSync(tempScriptPath);
            }
        } catch (e) { }
    });

    windowsWatcherProcess.on('error', (err) => {
        log.error('Windows watcher error:', err);
    });

    log.info('Windows foreground watcher started (event-driven, no polling)');
}

function stopWindowsWatcher() {
    if (windowsWatcherProcess) {
        windowsWatcherProcess.kill();
        windowsWatcherProcess = null;
        windowsWatcherReady = false;
    }
}

/**
 * macOS: Use NSWorkspace notifications via AppleScript
 * Listens for both app launches AND app activations (when user clicks to bring app forward)
 */
function startMacOSWatcher() {
    if (watcherProcess) {
        watcherProcess.kill();
    }

    // AppleScript that monitors for app launches AND activations using NSWorkspace notifications
    const script = `
use framework "Foundation"
use framework "AppKit"

on appEvent_(theNotification)
    set appName to(theNotification's userInfo()'s objectForKey: (current application's NSWorkspaceApplicationKey))'s localizedName() as text
    log appName
end appEvent_

set theWorkspace to current application's NSWorkspace's sharedWorkspace()
set notifCenter to theWorkspace's notificationCenter()

--Listen for app launches
notifCenter's addObserver:me selector:"appEvent:" |name|:(current application's NSWorkspaceDidLaunchApplicationNotification) object: (missing value)

    --Listen for app activations(when user clicks to bring app forward)
notifCenter's addObserver:me selector:"appEvent:" |name|:(current application's NSWorkspaceDidActivateApplicationNotification) object: (missing value)

    repeat
    delay 60
end repeat
`;

    // Write script to temp file
    const tempScriptPath = path.join(require('electron').app.getPath('temp'), 'redd-app-watcher.applescript');
    fs.writeFileSync(tempScriptPath, script);

    watcherProcess = spawn('osascript', [tempScriptPath], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    // For AppleScript, output from 'log' goes to stderr
    watcherProcess.stderr.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
            const appName = line.trim();
            if (appName && blockedApps.has(appName.toLowerCase())) {
                log.info(`Process watcher: Blocked app activated / launched: ${appName} `);
                if (onAppBlocked) {
                    onAppBlocked(appName);
                }
            }
        }
    });

    watcherProcess.on('close', (code) => {
        log.info(`macOS app watcher exited with code ${code} `);
        try {
            if (fs.existsSync(tempScriptPath)) {
                fs.unlinkSync(tempScriptPath);
            }
        } catch (e) { }
    });

    watcherProcess.on('error', (err) => {
        log.error('macOS app watcher error:', err);
    });

    log.info('macOS app watcher started');
}

/**
 * Hide all currently blocked apps (call this when a block starts)
 */
function hideAllBlockedApps() {
    if (process.platform === 'darwin' && blockedApps.size > 0) {
        const appList = Array.from(blockedApps);
        log.info('Hiding all blocked apps:', appList);

        // Hide each blocked app
        appList.forEach(appNameLower => {
            // Try with the lowercase name, AppleScript will match case-insensitively
            const script = `
                tell application "System Events"
                    set allProcs to every application process whose visible is true
                    repeat with proc in allProcs
                        if (name of proc as text) is "${appNameLower}" or(name of proc as text) is "${appNameLower.charAt(0).toUpperCase() + appNameLower.slice(1)}" then
                            set visible of proc to false
                        end if
                    end repeat
                end tell
            `;
            exec(`osascript -e '${script}'`, (err) => {
                if (err) log.error('Error hiding app:', err);
            });
        });
    }
}

/**
 * Minimize/hide an app
 * @param {string} appName - Name of the app to minimize
 */
function minimizeApp(appName) {
    if (process.platform === 'win32') {
        // Use temp file approach for reliable escaping
        const tempScriptPath = path.join(require('electron').app.getPath('temp'), `minimize-${Date.now()}.ps1`);
        const psScript = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Minimize {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$processes = Get-Process -Name "${appName}" -ErrorAction SilentlyContinue
foreach ($proc in $processes) {
    if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
        [Win32Minimize]::ShowWindow($proc.MainWindowHandle, 6)
        Write-Output "Minimized: $($proc.ProcessName)"
    }
}
`;
        fs.writeFileSync(tempScriptPath, psScript);
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, (err, stdout, stderr) => {
            // Clean up temp file
            try { fs.unlinkSync(tempScriptPath); } catch (e) { }

            if (err) {
                log.error('Error minimizing app:', err);
            } else if (stdout) {
                log.info('Minimize output:', stdout.trim());
            }
            if (stderr) {
                log.warn('Minimize stderr:', stderr);
            }
        });
    } else if (process.platform === 'darwin') {
        // Use 'application process' - this is the correct System Events syntax
        const escapedName = appName.replace(/"/g, '\\"');
        const script = `tell application "System Events" to set visible of application process "${escapedName}" to false`;
        exec(`osascript -e '${script}'`, (err) => {
            if (err) log.error('Error hiding app:', err);
        });
    }
}

module.exports = {
    startWatching,
    stopWatching,
    setBlockedApps,
    hasBlockedApps,
    minimizeApp,
    hideAllBlockedApps
};
