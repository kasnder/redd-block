# Code-sign a Windows binary via Azure Artifact Signing.
# Invoked by Tauri bundle (see tauri.windows.conf.json). Loads .env from repo root
# because npm/tauri do not load it automatically.

param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BinaryPath
)

$ErrorActionPreference = 'Stop'

# scripts/sign.ps1 — manual signing; Tauri bundle uses src-tauri/windows/sign-bundle.cmd
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$LogFile = Join-Path $env:TEMP 'sign-debug.txt'

function Write-Log([string]$Line) {
    Add-Content -Path $LogFile -Value $Line
}

Set-Content -Path $LogFile -Value "=== SIGN DEBUG (sign.ps1) ==="

$envFile = Join-Path $ProjectRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $parts = $line -split '=', 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $value = $parts[1].Trim().Trim('"').Trim("'")
                Set-Item -Path "Env:$key" -Value $value
            }
        }
    }
    Write-Log "Loaded .env from $envFile"
}

Write-Log "CWD=$PWD"
Write-Log "FILE=$BinaryPath"
Write-Log "AZURE_CLIENT_ID=$env:AZURE_CLIENT_ID"
Write-Log "AZURE_TENANT_ID=$env:AZURE_TENANT_ID"

if ($env:REDD_SKIP_CODE_SIGN -eq '1') {
    Write-Log 'SKIP=REDD_SKIP_CODE_SIGN=1'
    exit 0
}

if (-not $env:AZURE_CLIENT_ID -or -not $env:AZURE_TENANT_ID -or -not $env:AZURE_CLIENT_SECRET) {
    Write-Log 'SKIP=missing Azure signing env vars'
    exit 0
}

$dotnetX64 = 'C:\Program Files\dotnet\x64'
if ((Test-Path $dotnetX64) -and -not $env:DOTNET_ROOT) {
    $env:DOTNET_ROOT = $dotnetX64
}
Write-Log "DOTNET_ROOT=$env:DOTNET_ROOT"

$cli = Join-Path $env:USERPROFILE '.cargo\bin\trusted-signing-cli.exe'
if (-not (Test-Path $cli)) {
    $onPath = Get-Command trusted-signing-cli.exe -ErrorAction SilentlyContinue
    if ($onPath) { $cli = $onPath.Source }
}

if (-not $cli -or -not (Test-Path $cli)) {
    Write-Log 'ERROR=trusted-signing-cli not found'
    Write-Error @"
trusted-signing-cli not found. Install with:
  cargo install trusted-signing-cli --locked
Or remove AZURE_* from .env to build unsigned.
See $LogFile
"@
    exit 1
}

Write-Log "TSCLI=$cli"

$signArgs = @(
    '-e', 'https://neu.codesigning.azure.net',
    '-a', 'redd-block-signing',
    '-c', 'redd-block-signing',
    '-d', 'Fristed',
    $BinaryPath
)

$output = & $cli @signArgs 2>&1 | Out-String
$output | Add-Content -Path $LogFile
if ($LASTEXITCODE -ne 0) {
    Write-Log "EXIT_CODE=$LASTEXITCODE"
    Write-Error "Azure signing failed (exit $LASTEXITCODE). See $LogFile"
    exit $LASTEXITCODE
}

Write-Log 'EXIT_CODE=0'
exit 0
