# Best-effort cleanup of a legacy direct-install app so the Digital Habits
# Blocker NSIS installer leaves only one desktop app installed.
#
# Scoped to known prior product names only (allowlist). Does NOT touch
# ProgramData user data, the current "Digital Habits Blocker" install, or
# MSIX/Store packages (those never run this script).
#
# Invoked from NSIS_HOOK_PREINSTALL with no arguments (production defaults).
# Optional parameters override roots/names so the same logic can be verified
# in isolation without touching real Uninstall / Run keys.

param(
    [string[]]$LegacyNames = @('ReDD Blocker', 'ReDD Block', 'Fristed'),
    [string[]]$UninstallRoots = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    ),
    [string]$LocalAppData = $env:LOCALAPPDATA,
    [string]$ProgramFiles = $env:ProgramFiles,
    [string]$ProgramW6432 = $env:ProgramW6432,
    [string]$AppData = $env:APPDATA,
    [string]$UserProfile = $env:USERPROFILE,
    [string]$Public = $env:PUBLIC,
    [string]$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
    [string[]]$LegacyWatchdogTasks = @('ReDD Blocker Watchdog', 'ReDD Block Watchdog'),
    [switch]$SkipWatchdog
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-QuotedOrTrimmed([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $trim = $Value.Trim().Trim('"')
    if ([string]::IsNullOrWhiteSpace($trim)) { return $null }
    return $trim
}

function Invoke-LegacySilentUninstall {
    param([string]$UninstallString, [string]$InstallLocation)

    $raw = $UninstallString.Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) { return }

    $exe = $null
    $extraArgs = @()
    if ($raw.StartsWith('"')) {
        $end = $raw.IndexOf('"', 1)
        if ($end -lt 1) { return }
        $exe = $raw.Substring(1, $end - 1)
        $remainder = $raw.Substring($end + 1).Trim()
        if ($remainder) {
            $extraArgs = @($remainder -split '\s+' | Where-Object { $_ })
        }
    } else {
        $parts = $raw -split '\s+', 2
        $exe = $parts[0]
        if ($parts.Length -gt 1 -and $parts[1]) {
            $extraArgs = @($parts[1] -split '\s+' | Where-Object { $_ })
        }
    }

    if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { return }

    # Full silent uninstall (not /UPDATE): remove files, shortcuts, and the
    # Apps & Features key. _?= tells NSIS to run against the real install dir.
    $argList = [System.Collections.Generic.List[string]]::new()
    foreach ($a in $extraArgs) {
        if ($a -ieq '/S' -or $a -like '_?=*') { continue }
        $argList.Add($a)
    }
    $argList.Add('/S')
    $instDir = Get-QuotedOrTrimmed $InstallLocation
    if (-not $instDir) {
        $instDir = Split-Path -Parent $exe
    }
    if ($instDir) {
        $argList.Add("_?=$instDir")
    }

    Start-Process -FilePath $exe -ArgumentList $argList.ToArray() -Wait -WindowStyle Hidden | Out-Null
}

# 1. Prefer the old product's own uninstaller (files + shortcuts + Uninstall key).
foreach ($name in $LegacyNames) {
    foreach ($root in $UninstallRoots) {
        $key = Join-Path $root $name
        if (-not (Test-Path -LiteralPath $key)) { continue }
        $props = Get-ItemProperty -LiteralPath $key
        if (-not $props -or -not $props.UninstallString) { continue }
        Invoke-LegacySilentUninstall -UninstallString $props.UninstallString -InstallLocation $props.InstallLocation
    }
}

# 2. Directory sweep fallback — Tauri currentUser is %LOCALAPPDATA%\<name>
#    (no Programs\). Also cover per-machine Program Files and electron-builder's
#    %LOCALAPPDATA%\Programs\<name>.
$paths = New-Object System.Collections.Generic.List[string]
foreach ($name in $LegacyNames) {
    if ($ProgramFiles) { $paths.Add((Join-Path $ProgramFiles $name)) }
    if ($ProgramW6432) { $paths.Add((Join-Path $ProgramW6432 $name)) }
    if ($LocalAppData) {
        $paths.Add((Join-Path $LocalAppData $name))
        $paths.Add((Join-Path $LocalAppData (Join-Path 'Programs' $name)))
    }
}
foreach ($path in ($paths | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $prefix = $path.TrimEnd('\') + '\'
    Get-Process |
        Where-Object {
            $_.Path -and (
                $_.Path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or
                $_.Path.Equals($path.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)
            )
        } |
        Stop-Process -Force
    Remove-Item -LiteralPath $path -Recurse -Force
}

# 3. If uninstall.exe was missing, scrub leftover Apps & Features keys.
foreach ($name in $LegacyNames) {
    foreach ($root in $UninstallRoots) {
        $key = Join-Path $root $name
        if (Test-Path -LiteralPath $key) {
            Remove-Item -LiteralPath $key -Recurse -Force
        }
    }
}

# 4. Legacy HKCU Run values (dual-login risk if old exe still existed).
if (Test-Path -LiteralPath $RunKey) {
    foreach ($name in $LegacyNames) {
        Remove-ItemProperty -LiteralPath $RunKey -Name $name -Force
    }
}

# 5. Orphan shortcuts when we only did a directory delete.
foreach ($name in $LegacyNames) {
    $lnk = "$name.lnk"
    $candidates = @()
    if ($AppData) {
        $sm = Join-Path $AppData 'Microsoft\Windows\Start Menu\Programs'
        $candidates += (Join-Path $sm $lnk)
        $candidates += (Join-Path (Join-Path $sm $name) $lnk)
    }
    if ($UserProfile) {
        $candidates += (Join-Path (Join-Path $UserProfile 'Desktop') $lnk)
    }
    if ($Public) {
        $candidates += (Join-Path (Join-Path $Public 'Desktop') $lnk)
    }
    foreach ($p in $candidates) {
        if (Test-Path -LiteralPath $p) {
            Remove-Item -LiteralPath $p -Force
        }
    }
    if ($AppData) {
        $folder = Join-Path (Join-Path $AppData 'Microsoft\Windows\Start Menu\Programs') $name
        if ((Test-Path -LiteralPath $folder) -and -not (Get-ChildItem -LiteralPath $folder -Force | Select-Object -First 1)) {
            Remove-Item -LiteralPath $folder -Force
        }
    }
}

# 6. Legacy watchdog tasks (old PREUNINSTALL would do this; cover dir-only path).
if (-not $SkipWatchdog) {
    foreach ($task in $LegacyWatchdogTasks) {
        Start-Process -FilePath 'schtasks.exe' -ArgumentList @('/Delete', '/TN', $task, '/F') -Wait -WindowStyle Hidden | Out-Null
    }
}
