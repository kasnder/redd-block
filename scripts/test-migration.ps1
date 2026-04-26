# Manual setup/teardown for testing the v1.x -> new-stack migration on Windows.
#
# Usage (run from an *elevated* PowerShell — every command needs admin):
#   scripts\test-migration.ps1 inject              # snapshot hosts, inject markers + helper residue
#   scripts\test-migration.ps1 inject-with-backup  # also drop hosts.redd-backup
#   scripts\test-migration.ps1 check               # show current residue state
#   scripts\test-migration.ps1 restore             # roll hosts back to pre-test snapshot, remove residue
#
# Test workflow:
#   1. scripts\test-migration.ps1 inject
#   2. cd src-tauri ; cargo run --example test_migration
#   3. scripts\test-migration.ps1 check     # markers + helper-state.json should be gone
#   4. scripts\test-migration.ps1 restore   # safety net (no-op on hosts if migration already cleaned)

$ErrorActionPreference = 'Stop'

$Hosts        = 'C:\Windows\System32\drivers\etc\hosts'
$LegacyBackup = 'C:\Windows\System32\drivers\etc\hosts.redd-backup'
$HelperState  = 'C:\ProgramData\ReDD Block\helper-state.json'
$ProgDataDir  = 'C:\ProgramData\ReDD Block'
$SnapshotDir  = Join-Path $env:TEMP 'redd-migration-test'
$Snapshot     = Join-Path $SnapshotDir 'hosts.before-test'
$TaskName     = 'ReDD Block Helper'

function Assert-Admin {
    $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $p  = New-Object System.Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'This script must be run from an elevated PowerShell prompt.'
    }
}

$cmd = if ($args.Count -gt 0) { $args[0] } else { 'help' }

switch ($cmd) {
    { $_ -in 'inject','inject-with-backup' } {
        Assert-Admin
        if (Test-Path $Snapshot) {
            Write-Host "Snapshot already exists at $Snapshot - refusing to overwrite."
            Write-Host "Run 'restore' first if you want to start fresh."
            exit 1
        }
        New-Item -ItemType Directory -Force -Path $SnapshotDir | Out-Null
        Write-Host "Snapshotting current $Hosts to $Snapshot."
        Copy-Item -LiteralPath $Hosts -Destination $Snapshot -Force

        Write-Host "Injecting fake legacy markers into $Hosts."
        $marker = @"

# === BEGIN REDD BLOCK (reddfocus.org) ===
0.0.0.0 redd-block-test-marker.invalid
# === END REDD BLOCK (reddfocus.org) ===
"@
        Add-Content -LiteralPath $Hosts -Value $marker -Encoding ASCII

        Write-Host "Creating fake $HelperState."
        New-Item -ItemType Directory -Force -Path $ProgDataDir | Out-Null
        Set-Content -LiteralPath $HelperState -Value '{"test":"residue"}' -Encoding ASCII

        Write-Host "Registering fake scheduled task '$TaskName'."
        # Harmless action; we just need the task to exist so the migration's
        # schtasks /Delete + /Query gates exercise their real path.
        & schtasks /Create /TN $TaskName /TR 'cmd.exe /c exit' /SC ONLOGON /F | Out-Null

        if ($cmd -eq 'inject-with-backup') {
            Write-Host "Also dropping $LegacyBackup (legacy daemon's pre-mod copy)."
            Copy-Item -LiteralPath $Snapshot -Destination $LegacyBackup -Force
        }
        Write-Host "Done. Now run: cd src-tauri ; cargo run --example test_migration"
    }

    'check' {
        Write-Host '=== hosts markers ==='
        $matches = Select-String -Path $Hosts -Pattern 'REDD BLOCK|ReDD Block'
        if ($matches) { $matches | ForEach-Object { Write-Host $_.Line } } else { Write-Host '(no markers)' }
        Write-Host ''
        Write-Host '=== hosts.redd-backup ==='
        if (Test-Path $LegacyBackup) { Get-Item $LegacyBackup | Format-List FullName, Length, LastWriteTime } else { Write-Host '(absent)' }
        Write-Host '=== helper-state.json ==='
        if (Test-Path $HelperState) { Get-Item $HelperState | Format-List FullName, Length, LastWriteTime } else { Write-Host '(absent)' }
        Write-Host '=== scheduled task ==='
        & {
            $ErrorActionPreference = 'Continue'
            & schtasks /Query /TN $TaskName 2>&1 | Where-Object { $_ -notmatch 'cannot find' }
        }
        if ($LASTEXITCODE -ne 0) { Write-Host '(absent)' }
        Write-Host ''
        Write-Host '=== app-data snapshots ==='
        $appSnap = Join-Path $env:APPDATA 'com.reddblock\backups'
        if (Test-Path $appSnap) { Get-ChildItem $appSnap | Select-Object -First 10 } else { Write-Host '(none)' }
        Write-Host ''
        Write-Host '=== status marker(s) ==='
        Get-ChildItem (Join-Path $env:TEMP 'redd-migration-status.*') -ErrorAction SilentlyContinue | Select-Object -First 5
        Write-Host ''
        Write-Host '=== test snapshot ==='
        if (Test-Path $Snapshot) { Get-Item $Snapshot | Format-List FullName, Length, LastWriteTime } else { Write-Host '(absent)' }
    }

    'restore' {
        Assert-Admin
        if (-not (Test-Path $Snapshot)) {
            Write-Host "No snapshot at $Snapshot - nothing to restore from."
            exit 1
        }
        Write-Host "Restoring $Hosts from $Snapshot."
        Copy-Item -LiteralPath $Snapshot -Destination $Hosts -Force
        & ipconfig /flushdns | Out-Null
        Write-Host "Removing residue (helper-state.json, hosts.redd-backup, scheduled task)."
        Remove-Item -LiteralPath $HelperState -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $LegacyBackup -Force -ErrorAction SilentlyContinue
        # schtasks writes to stderr when the target task doesn't exist, which
        # under EAP=Stop becomes a terminating NativeCommandError. Drop EAP
        # for this best-effort delete (same pattern as cleanup.ps1).
        & {
            $ErrorActionPreference = 'Continue'
            & schtasks /Delete /TN $TaskName /F *>$null
        }
        Write-Host 'Removing test snapshot.'
        Remove-Item -LiteralPath $Snapshot -Force
        Write-Host "Done. $Hosts is back to its pre-test state."
    }

    default {
        @"
Usage: scripts\test-migration.ps1 {inject|inject-with-backup|check|restore}

  inject              Snapshot hosts, inject fake markers + helper residue +
                      a fake 'ReDD Block Helper' scheduled task.
  inject-with-backup  Same as inject, plus drop hosts.redd-backup so the
                      migration takes the 'prefer legacy backup' code path.
  check               Show current residue state.
  restore             Roll hosts back to the pre-test snapshot and remove
                      the helper-state.json / hosts.redd-backup / scheduled
                      task this harness created.

Run from an elevated PowerShell prompt.
"@
    }
}
