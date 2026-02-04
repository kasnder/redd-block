param(
    [switch]$x64Only,
    [switch]$arm64Only
)

$ErrorActionPreference = "Stop"

Write-Host "=== ReDD Block Windows Store Build ===" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Determine which architectures to build
$buildX64 = -not $arm64Only
$buildArm64 = -not $x64Only

if ($buildX64) {
    Write-Host "Building x64..." -ForegroundColor Yellow
    Write-Host ""
    
    # Build helper for x64
    Write-Host "  [1/3] Building helper daemon (x64)..." -ForegroundColor Gray
    Push-Location (Join-Path $ProjectRoot "helper-daemon")
    cargo build --release --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    # Build Tauri app for x64
    Write-Host "  [2/3] Building Tauri app (x64)..." -ForegroundColor Gray
    Push-Location $ProjectRoot
    npm run tauri build -- --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    # Create APPX for x64
    Write-Host "  [3/3] Creating APPX package (x64)..." -ForegroundColor Gray
    & (Join-Path $PSScriptRoot "build-appx.ps1") -Architecture x64
    if ($LASTEXITCODE -ne 0) { exit 1 }
    
    Write-Host ""
    Write-Host "x64 build complete!" -ForegroundColor Green
    Write-Host ""
}

if ($buildArm64) {
    Write-Host "Building ARM64..." -ForegroundColor Yellow
    Write-Host ""
    
    # Build helper for ARM64
    Write-Host "  [1/3] Building helper daemon (ARM64)..." -ForegroundColor Gray
    Push-Location (Join-Path $ProjectRoot "helper-daemon")
    cargo build --release --target aarch64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    # Build Tauri app for ARM64
    Write-Host "  [2/3] Building Tauri app (ARM64)..." -ForegroundColor Gray
    Push-Location $ProjectRoot
    npm run tauri build -- --target aarch64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    # Create APPX for ARM64
    Write-Host "  [3/3] Creating APPX package (ARM64)..." -ForegroundColor Gray
    & (Join-Path $PSScriptRoot "build-appx.ps1") -Architecture arm64
    if ($LASTEXITCODE -ne 0) { exit 1 }
    
    Write-Host ""
    Write-Host "ARM64 build complete!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== Build Summary ===" -ForegroundColor Cyan

# Read version from tauri.conf.json for display
$TauriConfig = Get-Content (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$AppVersion = "$($TauriConfig.version).0"

if ($buildX64) {
    Write-Host "  x64:   ReDD-Block_${AppVersion}_x64.appx" -ForegroundColor White
}
if ($buildArm64) {
    Write-Host "  ARM64: ReDD-Block_${AppVersion}_arm64.appx" -ForegroundColor White
}
Write-Host ""
Write-Host "Upload both to Partner Center: https://partner.microsoft.com/dashboard" -ForegroundColor Yellow
