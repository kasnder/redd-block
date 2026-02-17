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

# Ensure Tauri bundler can find SignTool.exe
# Tauri checks TAURI_WINDOWS_SIGNTOOL_PATH env var first, then uses registry + os_bitness().
# On ARM64 Windows the registry-based detection can fail, so we set the env var explicitly.
if (-not $env:TAURI_WINDOWS_SIGNTOOL_PATH) {
    $sdkSigntool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1
    if ($sdkSigntool) {
        $env:TAURI_WINDOWS_SIGNTOOL_PATH = $sdkSigntool.FullName
        Write-Host "  SignTool: $($sdkSigntool.FullName)" -ForegroundColor Gray
    }
    else {
        Write-Host "  WARNING: SignTool.exe not found. Install Windows SDK or add it to PATH." -ForegroundColor Yellow
    }
}

# On ARM64 Windows, set DOTNET_ROOT to the x64 .NET location so the Azure Code Signing
# DLib (which is x64) can find the .NET 8 runtime under emulation.
$dotnetX64 = "C:\Program Files\dotnet\x64"
if ((Test-Path $dotnetX64) -and -not $env:DOTNET_ROOT) {
    $env:DOTNET_ROOT = $dotnetX64
    Write-Host "  .NET root: $dotnetX64" -ForegroundColor Gray
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
    
    # Copy cross-compiled binary to where Tauri's externalBin expects the sidecar.
    # Without this, beforeBuildCommand rebuilds the helper for the HOST arch (e.g. ARM64)
    # and Tauri would bundle that instead of the x64 binary.
    $helperSrc = Join-Path $ProjectRoot "helper-daemon\target\x86_64-pc-windows-msvc\release\redd-block-helper.exe"
    $helperDst = Join-Path $ProjectRoot "helper-daemon\target\release\redd-block-helper-x86_64-pc-windows-msvc.exe"
    Copy-Item $helperSrc $helperDst -Force
    Write-Host "  Copied x64 helper to sidecar location" -ForegroundColor Gray
    
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
    
    # Copy cross-compiled binary to where Tauri's externalBin expects the sidecar
    $helperSrc = Join-Path $ProjectRoot "helper-daemon\target\aarch64-pc-windows-msvc\release\redd-block-helper.exe"
    $helperDst = Join-Path $ProjectRoot "helper-daemon\target\release\redd-block-helper-aarch64-pc-windows-msvc.exe"
    Copy-Item $helperSrc $helperDst -Force
    Write-Host "  Copied ARM64 helper to sidecar location" -ForegroundColor Gray
    
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

# Copy installers to for-distribution with clean lowercase filenames
$distDir = Join-Path $ProjectRoot "for-distribution"
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

Write-Host ""
Write-Host "  Copying installers to for-distribution/..." -ForegroundColor White

if ($buildX64) {
    $x64Bundle = Join-Path $ProjectRoot "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
    $nsisSource = Join-Path $x64Bundle "nsis\ReDD Block_${AppVersion}_x64-setup.exe"
    $msiSource = Join-Path $x64Bundle "msi\ReDD Block_${AppVersion}_x64_en-US.msi"
    if (Test-Path $nsisSource) {
        Copy-Item $nsisSource (Join-Path $distDir "redd-block_${AppVersion}_x64-setup.exe")
        Write-Host "    redd-block_${AppVersion}_x64-setup.exe" -ForegroundColor Gray
    }
    if (Test-Path $msiSource) {
        Copy-Item $msiSource (Join-Path $distDir "redd-block_${AppVersion}_x64.msi")
        Write-Host "    redd-block_${AppVersion}_x64.msi" -ForegroundColor Gray
    }
}
if ($buildArm64) {
    $arm64Bundle = Join-Path $ProjectRoot "src-tauri\target\aarch64-pc-windows-msvc\release\bundle"
    $nsisSource = Join-Path $arm64Bundle "nsis\ReDD Block_${AppVersion}_arm64-setup.exe"
    $msiSource = Join-Path $arm64Bundle "msi\ReDD Block_${AppVersion}_arm64_en-US.msi"
    if (Test-Path $nsisSource) {
        Copy-Item $nsisSource (Join-Path $distDir "redd-block_${AppVersion}_arm64-setup.exe")
        Write-Host "    redd-block_${AppVersion}_arm64-setup.exe" -ForegroundColor Gray
    }
    if (Test-Path $msiSource) {
        Copy-Item $msiSource (Join-Path $distDir "redd-block_${AppVersion}_arm64.msi")
        Write-Host "    redd-block_${AppVersion}_arm64.msi" -ForegroundColor Gray
    }
}

Write-Host ""
if ($hasSigningVars) {
    Write-Host "Installers are code-signed with Azure Artifact Signing." -ForegroundColor Green
}
else {
    Write-Host "Installers are NOT code-signed. Set Azure env vars to enable signing." -ForegroundColor Yellow
}
Write-Host ""
