param(
    [switch]$x64Only,
    [switch]$arm64Only
)

$ErrorActionPreference = "Stop"

Write-Host "=== ReDD Block Windows Build ===" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Check for Azure signing environment variables
$hasSigningVars = $env:AZURE_CLIENT_ID -and $env:AZURE_CLIENT_SECRET -and $env:AZURE_TENANT_ID
if (-not $hasSigningVars) {
    Write-Host "  WARNING: Azure signing env vars not set. Build will NOT be code-signed." -ForegroundColor Yellow
    Write-Host "  Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID to enable signing." -ForegroundColor Yellow
    Write-Host ""
}

# Determine which architectures to build
$buildX64 = -not $arm64Only
$buildArm64 = -not $x64Only

if ($buildX64) {
    Write-Host "Building x64..." -ForegroundColor Yellow
    Write-Host ""
    
    # Build helper for x64
    Write-Host "  [1/2] Building helper daemon (x64)..." -ForegroundColor Gray
    Push-Location (Join-Path $ProjectRoot "helper-daemon")
    cargo build --release --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    # Build Tauri app for x64 (signing happens automatically via signCommand)
    Write-Host "  [2/2] Building Tauri app (x64)..." -ForegroundColor Gray
    Push-Location $ProjectRoot
    npm run tauri build -- --target x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    Write-Host ""
    Write-Host "x64 build complete!" -ForegroundColor Green
    Write-Host ""
}

if ($buildArm64) {
    Write-Host "Building ARM64..." -ForegroundColor Yellow
    Write-Host ""
    
    # Build helper for ARM64
    Write-Host "  [1/2] Building helper daemon (ARM64)..." -ForegroundColor Gray
    Push-Location (Join-Path $ProjectRoot "helper-daemon")
    cargo build --release --target aarch64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    # Build Tauri app for ARM64 (signing happens automatically via signCommand)
    Write-Host "  [2/2] Building Tauri app (ARM64)..." -ForegroundColor Gray
    Push-Location $ProjectRoot
    npm run tauri build -- --target aarch64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
    
    Write-Host ""
    Write-Host "ARM64 build complete!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== Build Summary ===" -ForegroundColor Cyan

# Read version from tauri.conf.json for display
$TauriConfig = Get-Content (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$AppVersion = $TauriConfig.version

if ($buildX64) {
    $bundlePath = Join-Path $ProjectRoot "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
    Write-Host "  x64 installers:" -ForegroundColor White
    Write-Host "    NSIS: $bundlePath\nsis\ReDD Block_${AppVersion}_x64-setup.exe" -ForegroundColor Gray
    Write-Host "    MSI:  $bundlePath\msi\ReDD Block_${AppVersion}_x64_en-US.msi" -ForegroundColor Gray
}
if ($buildArm64) {
    $bundlePath = Join-Path $ProjectRoot "src-tauri\target\aarch64-pc-windows-msvc\release\bundle"
    Write-Host "  ARM64 installers:" -ForegroundColor White
    Write-Host "    NSIS: $bundlePath\nsis\ReDD Block_${AppVersion}_arm64-setup.exe" -ForegroundColor Gray
    Write-Host "    MSI:  $bundlePath\msi\ReDD Block_${AppVersion}_arm64_en-US.msi" -ForegroundColor Gray
}

Write-Host ""
if ($hasSigningVars) {
    Write-Host "Installers are code-signed with Azure Artifact Signing." -ForegroundColor Green
} else {
    Write-Host "Installers are NOT code-signed. Set Azure env vars to enable signing." -ForegroundColor Yellow
}
Write-Host ""
