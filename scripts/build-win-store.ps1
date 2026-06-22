# Full Microsoft Store build for Fristed (matches redd-do).
#
# 1. Compile Tauri (unsigned — Partner Center re-signs the MSIX on upload)
# 2. Bundle NSIS/MSI with webviewInstallMode "skip" (Store uses MSIX, not the installer)
# 3. Package MSIX with makeappx (upload this to Partner Center)
#
# Prerequisites (Windows):
#   - Node 20+, Rust x86_64-pc-windows-msvc, Windows SDK (makeappx)
#   - WINDOWS_IDENTITY_NAME, WINDOWS_PUBLISHER, WINDOWS_PUBLISHER_DISPLAY_NAME in .env
#   - assets/icons/1024x1024.png (run: node scripts/generate-icons-from-svg.js)
#
# Output:
#   for-distribution/x86_64-pc-windows-msvc/fristed_<version>.0_x64.msix  <- submit this
#   for-distribution/x86_64-pc-windows-msvc/nsis|msi/  (optional sideload artifacts)
#
# Direct-distribution signing (AZURE_*) is only used by npm run build:win, not this script.

param(
    [switch]$x64Only,
    [switch]$arm64Only
)

$ErrorActionPreference = "Stop"

Write-Host "=== Fristed Windows Build (Microsoft Store) ===" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StoreConfig = "src-tauri/tauri.microsoftstore.conf.json"
$TargetX64 = "x86_64-pc-windows-msvc"
$TargetArm64 = "aarch64-pc-windows-msvc"

$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "  WARNING: No .env at $envFile" -ForegroundColor Yellow
    Write-Host "  Copy .env.example to .env and set WINDOWS_* vars before Store builds." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "  Loading environment variables from .env..." -ForegroundColor Gray
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $value = $parts[1].Trim().Trim('"').Trim("'")
                [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    if ($env:AZURE_CLIENT_ID -and $env:AZURE_TENANT_ID -and $env:AZURE_CLIENT_SECRET) {
        Write-Host "  Note: AZURE_* is set but unused here (Store MSIX is re-signed on upload)." -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "  Code signing: skipped (Microsoft Store submission; Partner Center re-signs the MSIX)." -ForegroundColor Gray
Write-Host ""

if (-not $env:WINDOWS_IDENTITY_NAME -or -not $env:WINDOWS_PUBLISHER) {
    Write-Host "  ERROR: Set WINDOWS_IDENTITY_NAME and WINDOWS_PUBLISHER in .env (Partner Center -> Product identity)." -ForegroundColor Red
    exit 1
}

$buildX64 = -not $arm64Only
$buildArm64 = -not $x64Only

function Invoke-TauriStoreBuild {
    param([string]$Target)

    Push-Location $ProjectRoot

    Write-Host "  Compiling ($Target)..." -ForegroundColor Gray
    node (Join-Path $ProjectRoot "scripts\run-tauri.js") build --target $Target --no-bundle
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }

    Write-Host "  Bundling NSIS/MSI ($Target)..." -ForegroundColor Gray
    node (Join-Path $ProjectRoot "scripts\run-tauri.js") bundle --target $Target --bundles nsis,msi --config $StoreConfig
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }

    Pop-Location

    node (Join-Path $ProjectRoot "scripts\collect-distribution-artifacts.js") --target $Target
    if ($LASTEXITCODE -ne 0) { exit 1 }

    $arch = if ($Target -eq $TargetArm64) { "arm64" } else { "x64" }
    & (Join-Path $ProjectRoot "scripts\build-msix.ps1") -Architecture $arch
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

if ($buildX64) {
    Write-Host "Building x64 for Microsoft Store..." -ForegroundColor Yellow
    Write-Host ""
    Invoke-TauriStoreBuild -Target $TargetX64
    node (Join-Path $ProjectRoot "scripts\verify-windows-store-artifacts.js") $TargetX64
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host ""
}

if ($buildArm64) {
    Write-Host "Building ARM64 for Microsoft Store..." -ForegroundColor Yellow
    Write-Host ""
    Invoke-TauriStoreBuild -Target $TargetArm64
    node (Join-Path $ProjectRoot "scripts\verify-windows-store-artifacts.js") $TargetArm64
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host ""
}

Write-Host "=== Store build complete ===" -ForegroundColor Green
Write-Host "  Submit the .msix from for-distribution/<target-triple>/ in Partner Center." -ForegroundColor Gray
Write-Host ""
