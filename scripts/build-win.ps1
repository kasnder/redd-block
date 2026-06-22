param(
    [switch]$x64Only,
    [switch]$arm64Only,
    [switch]$Unsigned
)

$ErrorActionPreference = "Stop"

function Show-SigningFailureHint {
    $log = Join-Path $env:TEMP "sign-debug.txt"
    Write-Host ""
    Write-Host "  Code signing failed during bundle." -ForegroundColor Red
    if (Test-Path $log) {
        $head = Get-Content $log -TotalCount 1 -ErrorAction SilentlyContinue
        if ($head -notmatch "sign\.ps1") {
            Write-Host "  (Log may be from a previous attempt; re-run after fixing .env.)" -ForegroundColor DarkYellow
        }
        Write-Host "  Details from $log :" -ForegroundColor Yellow
        Get-Content $log | Select-Object -Last 12 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
    }
    Write-Host ""
    Write-Host "  Fix AZURE_CLIENT_SECRET in .env (use the secret Value, not the Secret ID)." -ForegroundColor Yellow
    Write-Host "  Or build unsigned for local testing: npm run build:win:unsigned" -ForegroundColor Yellow
    Write-Host ""
}

function Invoke-TauriWinBuild {
    param([string]$Target)

    Push-Location $ProjectRoot
    # Absolute-path signing config so Tauri finds the script regardless of CWD.
    # sign-bundle.cmd delegates to sign.ps1, which loads .env on each sign call.
    & (Join-Path $ProjectRoot "scripts\write-signing-config.ps1") -ProjectRoot $ProjectRoot
    if (-not $?) { Pop-Location; exit 1 }
    node (Join-Path $ProjectRoot "scripts\run-tauri.js") build --target $Target --config src-tauri/tauri.signing.generated.conf.json
    if ($LASTEXITCODE -ne 0) {
        Show-SigningFailureHint
        Pop-Location
        exit 1
    }
    Pop-Location
}

Write-Host "=== Fristed Windows Build ===" -ForegroundColor Cyan
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

. (Join-Path $PSScriptRoot "windows-signing-preflight.ps1")
if (-not (Test-ReddBlockWindowsSigning)) { exit 1 }
$hasSigningVars = $env:AZURE_CLIENT_ID -and $env:AZURE_CLIENT_SECRET -and $env:AZURE_TENANT_ID
if (-not $hasSigningVars) {
    Write-Host "  Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID in .env to enable signing." -ForegroundColor Yellow
    Write-Host ""
}

if ($Unsigned) {
    $env:REDD_SKIP_CODE_SIGN = "1"
    Write-Host "  Code signing: skipped (-Unsigned flag; installers will be unsigned)." -ForegroundColor Yellow
    Write-Host ""
}

# Determine which architectures to build
$buildX64 = -not $arm64Only
$buildArm64 = -not $x64Only

if ($buildX64) {
    Write-Host "Building x64..." -ForegroundColor Yellow
    Write-Host ""

    # Build Tauri app for x64 (signing happens automatically via signCommand).
    # v2.0 dropped the privileged helper daemon — app blocking is now
    # in-process, so there is no longer a sidecar binary to cross-compile.
    Invoke-TauriWinBuild -Target "x86_64-pc-windows-msvc"

    Write-Host ""
    Write-Host "x64 build complete!" -ForegroundColor Green
    Write-Host ""
}

if ($buildArm64) {
    Write-Host "Building ARM64..." -ForegroundColor Yellow
    Write-Host ""

    Invoke-TauriWinBuild -Target "aarch64-pc-windows-msvc"

    Write-Host ""
    Write-Host "ARM64 build complete!" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== Build Summary ===" -ForegroundColor Cyan

$TauriConfig = Get-Content (Join-Path $ProjectRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$AppVersion = $TauriConfig.version
$ProductName = $TauriConfig.productName

# Copy installers to for-distribution with clean lowercase filenames
$distDir = Join-Path $ProjectRoot "for-distribution"
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

Write-Host ""
Write-Host "  Copying installers to for-distribution/..." -ForegroundColor White

if ($buildX64) {
    $x64Bundle = Join-Path $ProjectRoot "src-tauri\target\x86_64-pc-windows-msvc\release\bundle"
    $nsisSource = Join-Path $x64Bundle "nsis\${ProductName}_${AppVersion}_x64-setup.exe"
    $msiSource = Join-Path $x64Bundle "msi\${ProductName}_${AppVersion}_x64_en-US.msi"
    if (Test-Path $nsisSource) {
        Copy-Item $nsisSource (Join-Path $distDir "fristed_${AppVersion}_x64-setup.exe")
        Write-Host "    fristed_${AppVersion}_x64-setup.exe" -ForegroundColor Gray
    }
    if (Test-Path $msiSource) {
        Copy-Item $msiSource (Join-Path $distDir "fristed_${AppVersion}_x64.msi")
        Write-Host "    fristed_${AppVersion}_x64.msi" -ForegroundColor Gray
    }
}
if ($buildArm64) {
    $arm64Bundle = Join-Path $ProjectRoot "src-tauri\target\aarch64-pc-windows-msvc\release\bundle"
    $nsisSource = Join-Path $arm64Bundle "nsis\${ProductName}_${AppVersion}_arm64-setup.exe"
    $msiSource = Join-Path $arm64Bundle "msi\${ProductName}_${AppVersion}_arm64_en-US.msi"
    if (Test-Path $nsisSource) {
        Copy-Item $nsisSource (Join-Path $distDir "fristed_${AppVersion}_arm64-setup.exe")
        Write-Host "    fristed_${AppVersion}_arm64-setup.exe" -ForegroundColor Gray
    }
    if (Test-Path $msiSource) {
        Copy-Item $msiSource (Join-Path $distDir "fristed_${AppVersion}_arm64.msi")
        Write-Host "    fristed_${AppVersion}_arm64.msi" -ForegroundColor Gray
    }
}

Write-Host ""
if ($hasSigningVars) {
    if ($Unsigned) {
        Write-Host "Installers are NOT code-signed (-Unsigned)." -ForegroundColor Yellow
    } else {
        Write-Host "Installers are code-signed with Azure Artifact Signing." -ForegroundColor Green
    }
}
else {
    Write-Host "Installers are NOT code-signed. Set Azure env vars to enable signing." -ForegroundColor Yellow
}
Write-Host ""
