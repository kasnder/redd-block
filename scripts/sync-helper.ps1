# Script to ensure helper-daemon sidecar is up-to-date
# Compares source file timestamps with the release binary and rebuilds if needed
# Then copies the release binary to ALL locations Tauri needs

$ErrorActionPreference = "Continue"

$helperDir = "helper-daemon"
$srcDir = "$helperDir\src"
$cargoToml = "$helperDir\Cargo.toml"
$releaseExe = "$helperDir\target\release\redd-block-helper.exe"
$debugDir = "src-tauri\target\debug"

# All the places the binary needs to exist
$sidecarExe = "$debugDir\redd-block-helper-x86_64-pc-windows-msvc.exe"
$plainExe = "$debugDir\redd-block-helper.exe"
$releaseDir = "$helperDir\target\release"
$x64Release = "$releaseDir\redd-block-helper-x86_64-pc-windows-msvc.exe"
$arm64Release = "$releaseDir\redd-block-helper-aarch64-pc-windows-msvc.exe"

# Get the newest source file modification time (includes Cargo.toml for version bumps)
$sourceFiles = @()
$sourceFiles += Get-ChildItem -Path $srcDir -Recurse -File -ErrorAction SilentlyContinue
$sourceFiles += Get-Item $cargoToml -ErrorAction SilentlyContinue

if ($sourceFiles.Count -eq 0) {
    Write-Host "No helper-daemon source files found, skipping helper build check."
    exit 0
}

$newestSource = ($sourceFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime

# Determine if we need to rebuild
$needsBuild = $false

if (-not (Test-Path $releaseExe)) {
    Write-Host "Release binary not found, will build helper-daemon."
    $needsBuild = $true
}
else {
    $releaseTime = (Get-Item $releaseExe).LastWriteTime
    if ($newestSource -gt $releaseTime) {
        Write-Host "Helper-daemon source files are newer than release binary."
        Write-Host "  Newest source: $newestSource"
        Write-Host "  Release binary: $releaseTime"
        $needsBuild = $true
    }
    else {
        Write-Host "Helper-daemon release binary is up-to-date."
    }
}

# Build if needed
if ($needsBuild) {
    Write-Host "Building helper-daemon..."
    Push-Location $helperDir
    # Touch main.rs to force cargo to recompile (ensures Cargo.toml version changes are picked up)
    (Get-Item "src\main.rs").LastWriteTime = Get-Date
    cargo build --release
    $buildResult = $LASTEXITCODE
    Pop-Location
    
    if ($buildResult -ne 0) {
        Write-Host "ERROR: Failed to build helper-daemon!" -ForegroundColor Red
        exit 1
    }
    
    if (-not (Test-Path $releaseExe)) {
        Write-Host "ERROR: Built binary not found at $releaseExe" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Helper-daemon built successfully." -ForegroundColor Green
}

# Copy to ALL required locations (always, to ensure consistency)
if (Test-Path $releaseExe) {
    # Ensure debug directory exists
    if (-not (Test-Path $debugDir)) {
        New-Item -ItemType Directory -Path $debugDir -Force | Out-Null
    }
    
    # Copy to debug dir (both plain name and arch-specific)
    Copy-Item $releaseExe $sidecarExe -Force
    Copy-Item $releaseExe $plainExe -Force
    Write-Host "Copied to debug dir: $sidecarExe" -ForegroundColor Green

    # Copy arch-specific variants in release dir (for Tauri externalBin)
    Copy-Item $releaseExe $x64Release -Force
    Copy-Item $releaseExe $arm64Release -Force
    Write-Host "Updated all arch-specific copies." -ForegroundColor Green
}

exit 0
