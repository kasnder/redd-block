# Bundled elevated cleanup for the v1.x → 2.0 migration on Windows.
#
# Loaded by Rust via include_str! and templated with two paths:
#   {STAGED}  — temp file holding the cleaned hosts content
#   {STATUS}  — temp file we write 'ok' to on success (Rust gates on it)
#
# DO NOT add other template placeholders without updating
# run_elevated_windows in commands/migration.rs.
#
# Run via Start-Process -Verb RunAs (UAC prompt). EAP=Stop ensures
# any unhandled error aborts before destructive steps. Status marker
# is written ONLY at the very end.
#
# Notes on the EAP=Continue blocks: schtasks/taskkill/ipconfig write
# to stderr when the target doesn't exist (the common case on a
# clean machine). Under EAP=Stop those stderr lines become
# terminating NativeCommandError records and abort the whole
# script. Each best-effort native-command call is wrapped in an
# EAP=Continue scope; the explicit `throw`s after each step are the
# authoritative gates.

$ErrorActionPreference = 'Stop'
$staged = '{STAGED}'
$status = '{STATUS}'
$hosts = 'C:\Windows\System32\drivers\etc\hosts'
$legacyBackup = 'C:\Windows\System32\drivers\etc\hosts.redd-backup'

# 1. validate staged cleaned content
if (-not (Test-Path $staged)) { throw 'staged hosts missing' }
$cleanedRaw = Get-Content -Raw -LiteralPath $staged
if ([string]::IsNullOrWhiteSpace($cleanedRaw)) { throw 'staged hosts empty' }
if ($cleanedRaw -notmatch 'localhost') { throw 'staged hosts missing localhost' }

# 2. STOP the legacy scheduled task FIRST and any helper processes,
#    then poll until they're actually gone (10 s ceiling).
& {
    $ErrorActionPreference = 'Continue'
    & schtasks /End /TN 'ReDD Block Helper' 2>&1 | Out-Null
    & taskkill /IM 'redd-block-helper.exe' /T /F 2>&1 | Out-Null
}
for ($i = 0; $i -lt 10; $i++) {
    $running = Get-Process -Name 'redd-block-helper' -ErrorAction SilentlyContinue
    if (-not $running) { break }
    Start-Sleep -Seconds 1
}
if (Get-Process -Name 'redd-block-helper' -ErrorAction SilentlyContinue) {
    throw 'helper still running after taskkill'
}

# 3. atomic-ish replace via a UNIQUE temp file (avoid collision if two
#    migration runs race).
$tmp = $hosts + '.redd-tmp.' + [System.IO.Path]::GetRandomFileName()
Set-Content -LiteralPath $tmp -Value $cleanedRaw -NoNewline -Encoding ASCII
Move-Item -LiteralPath $tmp -Destination $hosts -Force

# 4. VERIFY the write actually landed.
$postWrite = Get-Content -Raw -LiteralPath $hosts
if ($postWrite -notmatch 'localhost') { throw 'post-write hosts missing localhost' }
if ($postWrite -match '^# === BEGIN REDD BLOCK' -or $postWrite -match '^# ReDD Block Start') {
    throw 'post-write hosts still contains markers'
}

# 5. flush DNS — wrapped because ipconfig can write to stderr (e.g.
#    DNS Client service stopped) which would otherwise terminate
#    the script *after* hosts is already clean.
& {
    $ErrorActionPreference = 'Continue'
    & ipconfig /flushdns 2>&1 | Out-Null
}

# 6. retire legacy scheduled task + daemon-specific files only.
#    CRITICAL: do NOT recursively delete C:\ProgramData\ReDD Block.
#    The new app reuses that directory for the user's blocklist data
#    (redd-block-data.json) when shared-storage was activated — see
#    commands/data.rs::should_use_shared_data_path.
& {
    $ErrorActionPreference = 'Continue'
    & schtasks /Delete /TN 'ReDD Block Helper' /F 2>&1 | Out-Null
}
Remove-Item -LiteralPath 'C:\ProgramData\ReDD Block\helper-state.json' -Force -ErrorAction SilentlyContinue

# 7. VERIFY removal.
$taskStillThere = $false
& {
    $ErrorActionPreference = 'Continue'
    & schtasks /Query /TN 'ReDD Block Helper' 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $script:taskStillThere = $true }
}
if ($taskStillThere) { throw 'scheduled task still present' }
if (Test-Path -LiteralPath 'C:\ProgramData\ReDD Block\helper-state.json') { throw 'helper-state.json still present' }

# 8. INTENTIONALLY KEEP $legacyBackup ($hosts.redd-backup). Last-resort
#    recovery copy of the user's pre-modification hosts file. Only
#    deleted during uninstall (see purge_legacy_backups_sync).

# 9. status marker — written only after every gate above passed.
Set-Content -LiteralPath $status -Value 'ok' -Encoding ASCII -NoNewline
