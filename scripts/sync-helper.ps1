# Script to ensure helper-daemon sidecar is up-to-date
# Compares source file timestamps with the sidecar binary and rebuilds if needed

$ErrorActionPreference = "Continue"

$helperDir = "helper-daemon"
$srcDir = "$helperDir\src"
$cargoToml = "$helperDir\Cargo.toml"
$releaseExe = "$helperDir\target\release\redd-block-helper.exe"
$sidecarExe = "src-tauri\target\debug\redd-block-helper-x86_64-pc-windows-msvc.exe"

# Get the newest source file modification time
$sourceFiles = @()
$sourceFiles += Get-ChildItem -Path $srcDir -Recurse -File -ErrorAction SilentlyContinue
$sourceFiles += Get-Item $cargoToml -ErrorAction SilentlyContinue

if ($sourceFiles.Count -eq 0) {
    Write-Host "No helper-daemon source files found, skipping helper build check."
    exit 0
}

$newestSource = ($sourceFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime

# Check if sidecar exists and is up-to-date
$sidecarOutdated = $false

if (-not (Test-Path $sidecarExe)) {
    Write-Host "Sidecar binary not found, will build helper-daemon."
    $sidecarOutdated = $true
}
else {
    $sidecarTime = (Get-Item $sidecarExe).LastWriteTime
    if ($newestSource -gt $sidecarTime) {
        Write-Host "Helper-daemon source files are newer than sidecar binary."
        Write-Host "  Newest source: $newestSource"
        Write-Host "  Sidecar binary: $sidecarTime"
        $sidecarOutdated = $true
    }
    else {
        Write-Host "Helper-daemon sidecar is up-to-date."
    }
}

if ($sidecarOutdated) {
    Write-Host "Building helper-daemon..."
    Push-Location $helperDir
    cargo build --release
    $buildResult = $LASTEXITCODE
    Pop-Location
    
    if ($buildResult -ne 0) {
        Write-Host "ERROR: Failed to build helper-daemon!" -ForegroundColor Red
        exit 1
    }
    
    # Copy to sidecar location
    if (Test-Path $releaseExe) {
        # Ensure target directory exists
        $targetDir = Split-Path $sidecarExe -Parent
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        Copy-Item $releaseExe $sidecarExe -Force
        Write-Host "Copied helper binary to sidecar location: $sidecarExe" -ForegroundColor Green
    }
    else {
        Write-Host "ERROR: Built binary not found at $releaseExe" -ForegroundColor Red
        exit 1
    }
}

exit 0
