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
 * Windows: Use lightweight polling to detect new processes
 * 
 * WMI Win32_ProcessStartTrace requires admin rights, so we use a different approach:
 * - Poll every 2 seconds (much less frequent than old 500ms)
 * - Track which processes we've seen before
 * - Only trigger for NEW processes that match blocked apps
 * - This is efficient because we only check for differences, not all processes
 */
let windowsPollInterval = null;
let knownProcesses = new Set();

function startWindowsWatcher() {
    if (windowsPollInterval) {
        clearInterval(windowsPollInterval);
    }

    // Initialize with current processes
    getRunningProcesses().then(processes => {
        knownProcesses = new Set(processes);
        log.info(`Windows process watcher initialized with ${knownProcesses.size} known processes`);
    });

    // Poll every 2 seconds for new processes
    windowsPollInterval = setInterval(async () => {
        if (blockedApps.size === 0) return; // Skip if nothing to block

        const currentProcesses = await getRunningProcesses();
        const currentSet = new Set(currentProcesses);

        // Find new processes (case-insensitive)
        for (const proc of currentProcesses) {
            const procLower = proc.toLowerCase();
            if (!knownProcesses.has(proc) && blockedApps.has(procLower)) {
                log.info(`Process watcher: Detected blocked app launch: ${proc}`);
                if (onAppBlocked) {
                    onAppBlocked(proc);
                }
            }
        }

        // Update known processes
        knownProcesses = currentSet;
    }, 2000);

    log.info('Windows process watcher started (polling mode)');
}

function stopWindowsWatcher() {
    if (windowsPollInterval) {
        clearInterval(windowsPollInterval);
        windowsPollInterval = null;
    }
}

async function getRunningProcesses() {
    return new Promise((resolve) => {
        // Get just process names, no window title filter
        const psScript = `Get-Process | Select-Object -ExpandProperty ProcessName -Unique`;
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, (error, stdout) => {
            if (error) {
                log.error('Error getting processes:', error);
                resolve([]);
                return;
            }
            const processes = stdout.trim().split('\n').map(p => p.trim()).filter(p => p);
            resolve(processes);
        });
    });
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
    set appName to (theNotification's userInfo()'s objectForKey:(current application's NSWorkspaceApplicationKey))'s localizedName() as text
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
                log.info(`Process watcher: Blocked app activated/launched: ${appName}`);
                if (onAppBlocked) {
                    onAppBlocked(appName);
                }
            }
        }
    });

    watcherProcess.on('close', (code) => {
        log.info(`macOS app watcher exited with code ${code}`);
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
                        if (name of proc as text) is "${appNameLower}" or (name of proc as text) is "${appNameLower.charAt(0).toUpperCase() + appNameLower.slice(1)}" then
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
        const psScript = `
Add-Type -TypeDefinition @"
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
