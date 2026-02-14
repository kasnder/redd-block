param(
    [switch]$x64Only,
    [switch]$arm64Only
)

$ErrorActionPreference = "Stop"

Write-Host "=== ReDD Block Windows Build ===" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent $PSScriptRoot

# Load .env file from project root if it exists
$envFile = Join-Path $ProjectRoot ".env"
if (Test-Path $envFile) {
    Write-Host "  Loading environment variables from .env..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        # Skip empty lines and comments
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $value = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    Write-Host ""
}

# Ensure SignTool.exe is on the PATH (required by Tauri bundler)
$signtoolInPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtoolInPath) {
    $sdkPaths = @(Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1)
    if ($sdkPaths.Count -gt 0) {
        $sdkDir = Split-Path $sdkPaths[0].FullName
        $env:PATH = "$sdkDir;$env:PATH"
        Write-Host "  Added SignTool to PATH from: $sdkDir" -ForegroundColor Gray
    }
    else {
        Write-Host "  WARNING: SignTool.exe not found. Install Windows SDK or add it to PATH." -ForegroundColor Yellow
    }
}

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
}
else {
    Write-Host "Installers are NOT code-signed. Set Azure env vars to enable signing." -ForegroundColor Yellow
}
Write-Host ""
