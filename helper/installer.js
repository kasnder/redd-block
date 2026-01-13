/**
 * Helper Installer for ReDD Block
 * 
 * This module handles the one-time installation of the privileged helper daemon.
 * It requires admin privileges to copy files and register the daemon service.
 */

const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const { app } = require('electron');

/**
 * Native sudo implementation using osascript (works on ARM64 without Rosetta)
 * Falls back to sudo-prompt on other platforms
 */
const sudoExec = (function () {
    if (process.platform === 'darwin') {
        // Use native osascript for macOS - works on all architectures
        return function (command, options, callback) {
            const appName = options.name || 'Application';
            // Escape the command for AppleScript
            const escapedCommand = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

            const osascript = `osascript -e 'do shell script "${escapedCommand}" with administrator privileges with prompt "${appName} needs to install a helper to block websites."'`;

            exec(osascript, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    // Check for user cancellation
                    if (error.message && (error.message.includes('User canceled') || error.message.includes('-128'))) {
                        callback(new Error('User did not grant permission'));
                    } else {
                        callback(error, stdout, stderr);
                    }
                } else {
                    callback(null, stdout, stderr);
                }
            });
        };
    } else {
        // Use sudo-prompt for other platforms (Windows, Linux)
        const sudo = require('sudo-prompt');
        return sudo.exec.bind(sudo);
    }
})();

const HELPER_NAME = 'redd-block-helper';
const INSTALL_PATH = process.platform === 'win32'
    ? path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'ReDD Block', 'helper')
    : '/usr/local/lib/redd-block/helper';

const PLIST_PATH = '/Library/LaunchDaemons/org.reddfocus.redd-block-helper.plist';
const SYSTEMD_PATH = '/etc/systemd/system/redd-block-helper.service';

/**
 * Get the path to the helper files in the app bundle
 */
function getSourceHelperPath() {
    // In development, helper is in the project root
    // In production, it's in the app's resources (extraResources)

    // Check if we're running from a packaged app (ASAR archive)
    const isPackaged = __dirname.includes('.asar');

    if (isPackaged) {
        // Production: binary is in resources/helper (from extraResources)
        return path.join(process.resourcesPath, 'helper');
    } else {
        // Development: helper is in the project root
        return path.join(__dirname, '..', 'helper');
    }
}

/**
 * Check if the helper is installed
 */
function isHelperInstalled() {
    if (process.platform === 'darwin') {
        // Check for plist and either the binary (production) or JS file (dev mode)
        const hasPlist = fs.existsSync(PLIST_PATH);
        const hasBinary = fs.existsSync(path.join(INSTALL_PATH, 'redd-block-helper'));
        const hasScript = fs.existsSync(path.join(INSTALL_PATH, 'redd-block-helper.js'));
        return hasPlist && (hasBinary || hasScript);
    } else if (process.platform === 'linux') {
        return fs.existsSync(SYSTEMD_PATH) && fs.existsSync(path.join(INSTALL_PATH, 'redd-block-helper.js'));
    } else if (process.platform === 'win32') {
        // Dev mode: Check if helper js file exists
        if (fs.existsSync(path.join(INSTALL_PATH, 'redd-block-helper.js'))) {
            return true;
        }
        // Production mode: Check if the helper exe is installed OR scheduled task exists
        if (fs.existsSync(path.join(INSTALL_PATH, 'redd-block-helper.exe'))) {
            return true;
        }
        try {
            // Check if scheduled task exists
            execSync('schtasks /Query /TN "ReddBlockHelper"', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }
    return false;
}

/**
 * Install the helper on macOS
 */
function installMacOS() {
    return new Promise((resolve, reject) => {
        const sourcePath = getSourceHelperPath();

        // Use the compiled binary (includes Node.js, no dependencies)
        const helperBinary = path.join(sourcePath, 'dist', 'redd-block-helper');
        const helperScript = path.join(sourcePath, 'redd-block-helper.js');

        // Check if compiled binary exists, or fall back to running with Node (dev mode)
        const useDevMode = !fs.existsSync(helperBinary);

        if (useDevMode) {
            console.log('Helper binary not found, using development mode (running with Node.js)');
            if (!fs.existsSync(helperScript)) {
                return reject(new Error('Helper script not found at: ' + helperScript));
            }
        }

        // Find the Node.js executable path
        // In dev mode, we need to know where Node is installed
        let nodePath = '/usr/local/bin/node'; // default
        try {
            // Try to get the actual node path
            nodePath = execSync('which node', { encoding: 'utf8' }).trim();
        } catch (e) {
            // Fallback paths for common installations
            if (fs.existsSync('/opt/homebrew/bin/node')) {
                nodePath = '/opt/homebrew/bin/node'; // Homebrew on ARM64
            } else if (fs.existsSync('/usr/local/bin/node')) {
                nodePath = '/usr/local/bin/node'; // Homebrew on Intel or manual install
            }
        }
        console.log('Using Node.js at:', nodePath);

        // Generate plist content
        // In dev mode, run with node; in production, run the binary directly
        const programArgs = useDevMode
            ? `<string>${nodePath}</string>
        <string>${INSTALL_PATH}/redd-block-helper.js</string>`
            : `<string>${INSTALL_PATH}/redd-block-helper</string>`;

        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>org.reddfocus.redd-block-helper</string>
    
    <key>ProgramArguments</key>
    <array>
        ${programArgs}
    </array>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <true/>
    
    <key>Nice</key>
    <integer>5</integer>
    
    <key>StandardOutPath</key>
    <string>/var/log/redd-block-helper.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/redd-block-helper.log</string>
</dict>
</plist>`;

        // Write plist to temp file
        const tempPlistPath = '/tmp/org.reddfocus.redd-block-helper.plist';
        fs.writeFileSync(tempPlistPath, plistContent);

        // Create install script - copy either binary or script files
        const copyCommand = useDevMode
            ? `cp "${helperScript}" "${INSTALL_PATH}/"
            cp "${path.join(sourcePath, 'ipc-client.js')}" "${INSTALL_PATH}/" 2>/dev/null || true`
            : `cp "${helperBinary}" "${INSTALL_PATH}/"`;

        const chmodCommand = useDevMode
            ? `chmod 755 "${INSTALL_PATH}/redd-block-helper.js"`
            : `chmod 755 "${INSTALL_PATH}/redd-block-helper"`;

        const installScript = `
            # Create install directory
            mkdir -p "${INSTALL_PATH}"
            mkdir -p /var/lib/redd-block
            
            # Copy helper files
            ${copyCommand}
            
            # Copy generated plist
            cp "${tempPlistPath}" "${PLIST_PATH}"
            
            # Set permissions
            chmod 644 "${PLIST_PATH}"
            ${chmodCommand}
            chown -R root:wheel "${INSTALL_PATH}"
            
            # Load the daemon
            launchctl unload "${PLIST_PATH}" 2>/dev/null || true
            launchctl load -w "${PLIST_PATH}"
            
            echo "Helper installed successfully${useDevMode ? ' (development mode)' : ''}"
        `;

        sudoExec(installScript, { name: 'ReDD Block Website Blocker' }, (error, stdout, stderr) => {
            if (error) {
                if (error.message && error.message.includes('User did not grant permission')) {
                    reject(new Error('Permission denied'));
                } else {
                    reject(error);
                }
            } else {
                console.log('Helper installation output:', stdout);
                if (stderr) console.warn('Helper installation stderr:', stderr);
                resolve(true);
            }
        });
    });
}

/**
 * Install the helper on Linux
 */
function installLinux() {
    return new Promise((resolve, reject) => {
        const sourcePath = getSourceHelperPath();
        const helperScript = path.join(sourcePath, 'redd-block-helper.js');
        const serviceSource = path.join(sourcePath, 'redd-block-helper.service');

        const installScript = `
            # Create install directory
            mkdir -p "${INSTALL_PATH}"
            mkdir -p /var/lib/redd-block
            
            # Copy helper files
            cp "${helperScript}" "${INSTALL_PATH}/"
            cp "${path.join(sourcePath, 'ipc-client.js')}" "${INSTALL_PATH}/"
            
            # Copy systemd service
            cp "${serviceSource}" "${SYSTEMD_PATH}"
            
            # Set permissions
            chmod 644 "${SYSTEMD_PATH}"
            chmod 755 "${INSTALL_PATH}/redd-block-helper.js"
            
            # Enable and start the service
            systemctl daemon-reload
            systemctl enable redd-block-helper
            systemctl start redd-block-helper
            
            echo "Helper installed successfully"
        `;

        sudoExec(installScript, { name: 'ReDD Block' }, (error, stdout, stderr) => {
            if (error) {
                if (error.message && error.message.includes('User did not grant permission')) {
                    reject(new Error('Permission denied'));
                } else {
                    reject(error);
                }
            } else {
                console.log('Helper installation output:', stdout);
                if (stderr) console.warn('Helper installation stderr:', stderr);
                resolve(true);
            }
        });
    });
}

/**
 * Install the helper on Windows
 * Uses a Windows Service created via nssm (Non-Sucking Service Manager)
 * or alternatively a Scheduled Task running at SYSTEM level
 */
function installWindows() {
    return new Promise((resolve, reject) => {
        const sourcePath = getSourceHelperPath();

        // Use the compiled binary for Windows
        const helperBinary = path.join(sourcePath, 'dist', 'redd-block-helper-win.exe');

        // For development, check if we have a Windows binary, otherwise use node
        const hasWindowsBinary = fs.existsSync(helperBinary);

        // Create data directory
        const dataDir = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'ReDD Block');

        // Get the full path to node.exe - we're already running in Node so use process.execPath
        // This ensures SYSTEM user can find node even if it's not in system PATH
        const nodePath = process.execPath;

        // Build the script path for the helper
        const helperScriptPath = path.join(INSTALL_PATH, 'redd-block-helper.js');

        // Build PowerShell install script
        // For the scheduled task version, we need to be careful with escaping
        let installScript;

        if (hasWindowsBinary) {
            // Production mode: use a Scheduled Task to run at startup with SYSTEM privileges
            // Note: pkg-compiled binaries don't implement Windows SCM, so we use schtasks instead of sc.exe
            const exePath = path.join(INSTALL_PATH, 'redd-block-helper.exe');

            installScript = `
# Create install directory
New-Item -ItemType Directory -Force -Path "${INSTALL_PATH}"
New-Item -ItemType Directory -Force -Path "${dataDir}"

# Stop any existing helper process
Get-Process -Name "redd-block-helper" -ErrorAction SilentlyContinue | Stop-Process -Force

# Remove old service if it exists (from previous install attempts)
sc.exe stop "ReddBlockHelper" 2>$null
sc.exe delete "ReddBlockHelper" 2>$null

# Remove old scheduled task if exists
schtasks /Delete /TN "ReddBlockHelper" /F 2>$null

# Copy helper binary
Copy-Item "${helperBinary}" "${exePath}" -Force

# Create a scheduled task to run at system startup with highest privileges
# Using XML for more control over the task settings
$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>ReDD Block Helper - runs in background to enforce website blocks</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession>
    <UseUnifiedSchedulingEngine>true</UseUnifiedSchedulingEngine>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${exePath}</Command>
      <WorkingDirectory>${INSTALL_PATH}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

# Save XML to temp file and register task
$xmlPath = "$env:TEMP\\redd-block-task.xml"
$taskXml | Out-File -FilePath $xmlPath -Encoding Unicode
schtasks /Create /TN "ReddBlockHelper" /XML $xmlPath /F
Remove-Item $xmlPath -Force

# Start the task immediately
schtasks /Run /TN "ReddBlockHelper"

# Wait for it to start
Start-Sleep -Seconds 2

Write-Host "Helper installed successfully"
`;
        } else {
            // Development mode: run helper directly without scheduled task
            // This avoids SYSTEM user permission issues with named pipes

            // Build the script using string concatenation
            // Use single quotes in PowerShell for paths with spaces
            const scriptLines = [
                '# Create install directory',
                "New-Item -ItemType Directory -Force -Path '" + INSTALL_PATH + "'",
                "New-Item -ItemType Directory -Force -Path '" + dataDir + "'",
                '',
                '# Copy helper script files',
                "Copy-Item '" + path.join(sourcePath, 'redd-block-helper.js') + "' '" + INSTALL_PATH + "\\' -Force",
                "Copy-Item '" + path.join(sourcePath, 'ipc-client.js') + "' '" + INSTALL_PATH + "\\' -Force",
                '',
                '# Start the helper process directly (development mode)',
                "Start-Process -FilePath '" + nodePath + "' -ArgumentList '\"" + helperScriptPath + "\"' -WorkingDirectory '" + INSTALL_PATH + "' -WindowStyle Hidden",
                '',
                '# Wait for the helper to start and create the pipe',
                'Start-Sleep -Seconds 2',
                '',
                'Write-Host "Helper installed and started (development mode)"'
            ];
            installScript = scriptLines.join('\r\n');
        }

        // Write the PowerShell script to a temp file to avoid escaping issues
        const tempScriptPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'redd-block-install.ps1');
        fs.writeFileSync(tempScriptPath, installScript, 'utf8');

        // Execute the PowerShell script file with admin privileges
        // Using -File instead of -Command avoids escaping issues
        sudoExec('powershell.exe -ExecutionPolicy Bypass -File "' + tempScriptPath + '"',
            { name: 'ReDD Block Website Blocker' },
            (error, stdout, stderr) => {
                // Clean up temp script
                try {
                    fs.unlinkSync(tempScriptPath);
                } catch (e) {
                    // Ignore cleanup errors
                }

                if (error) {
                    if (error.message && error.message.includes('User did not grant permission')) {
                        reject(new Error('Permission denied'));
                    } else {
                        reject(error);
                    }
                } else {
                    console.log('Helper installation output:', stdout);
                    if (stderr) console.warn('Helper installation stderr:', stderr);
                    resolve(true);
                }
            }
        );
    });
}

/**
 * Install the helper daemon
 * @returns {Promise<boolean>}
 */
async function installHelper() {
    if (process.platform === 'darwin') {
        return installMacOS();
    } else if (process.platform === 'linux') {
        return installLinux();
    } else if (process.platform === 'win32') {
        return installWindows();
    } else {
        throw new Error(`Unsupported platform: ${process.platform} `);
    }
}

/**
 * Uninstall the helper daemon
 */
async function uninstallHelper() {
    return new Promise((resolve, reject) => {
        let uninstallScript;

        if (process.platform === 'darwin') {
            uninstallScript = `
                launchctl unload "${PLIST_PATH}" 2 > /dev/null || true
        rm - f "${PLIST_PATH}"
        rm - rf "${INSTALL_PATH}"
        rm - rf /var/lib/redd - block
                echo "Helper uninstalled"
            `;
        } else if (process.platform === 'linux') {
            uninstallScript = `
                systemctl stop redd - block - helper 2 > /dev/null || true
                systemctl disable redd - block - helper 2 > /dev/null || true
        rm - f "${SYSTEMD_PATH}"
        rm - rf "${INSTALL_PATH}"
        rm - rf /var/lib/redd - block
                systemctl daemon - reload
                echo "Helper uninstalled"
            `;
        } else {
            return reject(new Error(`Unsupported platform: ${process.platform} `));
        }

        sudoExec(uninstallScript, { name: 'ReDD Block' }, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(true);
            }
        });
    });
}

module.exports = {
    isHelperInstalled,
    installHelper,
    uninstallHelper,
    getSourceHelperPath
};
