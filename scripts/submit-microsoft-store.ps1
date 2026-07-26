# Submit Store MSIX packages to Partner Center via msstore CLI.
#
# Prerequisites:
#   - msstore on PATH (e.g. microsoft/microsoft-store-apppublisher action)
#   - AZURE_AD_TENANT_ID, AZURE_AD_APPLICATION_CLIENT_ID,
#     AZURE_AD_APPLICATION_SECRET, SELLER_ID configured via `msstore reconfigure`
#     (caller does reconfigure) OR pass -Reconfigure
#   - MS_STORE_PRODUCT_ID (or -ProductId)
#
# Usage:
#   ./scripts/submit-microsoft-store.ps1 `
#     -PackagesDir for-distribution `
#     -WhatsNewFile whats_new.txt `
#     -ProductId 9PXXXXXXXXXX
#
# Flow:
#   1. Bundle x64 + ARM64 .msix into one .msixbundle (makeappx)
#   2. Stamp What's new onto every listing (submission get → patch → updateMetadata)
#   3. msstore publish the bundle (submits for certification)

param(
    [Parameter(Mandatory = $true)]
    [string]$PackagesDir,

    [Parameter(Mandatory = $true)]
    [string]$WhatsNewFile,

    [string]$ProductId = $env:MS_STORE_PRODUCT_ID,

    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),

    [switch]$Reconfigure
)

$ErrorActionPreference = "Stop"

function Find-MakeAppx {
    $found = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe' `
        -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending |
        Select-Object -First 1
    if (-not $found) {
        throw 'makeappx.exe not found — Windows SDK missing on this runner.'
    }
    return $found.FullName
}

function Assert-CommandOk([string]$Label) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Label exited with code $LASTEXITCODE"
    }
}

if (-not $ProductId) {
    throw 'MS_STORE_PRODUCT_ID / -ProductId is required.'
}
if (-not (Test-Path -LiteralPath $PackagesDir)) {
    throw "PackagesDir not found: $PackagesDir"
}
if (-not (Test-Path -LiteralPath $WhatsNewFile)) {
    throw "WhatsNewFile not found: $WhatsNewFile"
}

$msixFiles = @(Get-ChildItem -Path $PackagesDir -Recurse -Filter '*.msix' -File |
    Where-Object { $_.Name -notlike '*.msixbundle' })
if ($msixFiles.Count -eq 0) {
    throw "No .msix packages under $PackagesDir"
}

Write-Host "Found $($msixFiles.Count) MSIX package(s):" -ForegroundColor Cyan
$msixFiles | ForEach-Object { Write-Host "  $($_.FullName)" }

# Bundle architectures into one .msixbundle (Store often requires bundle continuity).
$bundleDir = Join-Path $env:RUNNER_TEMP 'msix-bundle-stage'
if (-not $bundleDir -or $bundleDir -eq 'msix-bundle-stage') {
    $bundleDir = Join-Path ([System.IO.Path]::GetTempPath()) "redd-msix-bundle-$PID"
}
if (Test-Path $bundleDir) { Remove-Item $bundleDir -Recurse -Force }
New-Item -ItemType Directory -Path $bundleDir | Out-Null
foreach ($f in $msixFiles) {
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $bundleDir $f.Name)
}

$pkgJsonPath = Join-Path $ProjectRoot 'package.json'
$version = (Get-Content -LiteralPath $pkgJsonPath -Raw | ConvertFrom-Json).version
if (-not $version) { throw "Could not read version from $pkgJsonPath" }
$bundleOut = Join-Path $PackagesDir "redd-blocker_${version}_store.msixbundle"
$makeappx = Find-MakeAppx
Write-Host "Bundling with $makeappx → $bundleOut" -ForegroundColor Cyan
& $makeappx bundle /d $bundleDir /p $bundleOut /o
Assert-CommandOk 'makeappx bundle'
if (-not (Test-Path -LiteralPath $bundleOut)) {
    throw "Bundle was not created: $bundleOut"
}

if ($Reconfigure) {
    $tenant = $env:AZURE_AD_TENANT_ID
    $seller = $env:SELLER_ID
    $client = $env:AZURE_AD_APPLICATION_CLIENT_ID
    $secret = $env:AZURE_AD_APPLICATION_SECRET
    if (-not ($tenant -and $seller -and $client -and $secret)) {
        throw 'Reconfigure requires AZURE_AD_TENANT_ID, SELLER_ID, AZURE_AD_APPLICATION_CLIENT_ID, AZURE_AD_APPLICATION_SECRET.'
    }
    Write-Host 'Configuring msstore credentials…' -ForegroundColor Cyan
    msstore reconfigure `
        --tenantId $tenant `
        --sellerId $seller `
        --clientId $client `
        --clientSecret $secret
    Assert-CommandOk 'msstore reconfigure'
}

# Avoid Spectre spinner ANSI / OEM codepage corrupting JSON.
$env:NO_COLOR = '1'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
# Widen the console so Spectre is less likely to wrap JSON mid-string (patch
# script also strips residual wrap artifacts inside string values).
try {
    $rawUi = $Host.UI.RawUI
    $buf = $rawUi.BufferSize
    if ($buf.Width -lt 4096) {
        $buf.Width = 4096
        $rawUi.BufferSize = $buf
    }
} catch {
    # Non-interactive CI hosts may reject buffer resize — repair handles wraps.
}

$submissionJson = Join-Path $env:RUNNER_TEMP 'store-submission.json'
$patchedJson = Join-Path $env:RUNNER_TEMP 'store-submission-patched.json'
if (-not $env:RUNNER_TEMP) {
    $submissionJson = Join-Path ([System.IO.Path]::GetTempPath()) "store-submission-$PID.json"
    $patchedJson = Join-Path ([System.IO.Path]::GetTempPath()) "store-submission-patched-$PID.json"
}

$notesStamped = $false
try {
    Write-Host "Fetching pending submission for $ProductId…" -ForegroundColor Cyan
    # Redirected capture (not the pipeline) — still may wrap; Node repairs it.
    $getErr = "$submissionJson.err"
    $proc = Start-Process -FilePath 'msstore' `
        -ArgumentList @('submission', 'get', $ProductId) `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $submissionJson `
        -RedirectStandardError $getErr
    if ($proc.ExitCode -ne 0) {
        throw "msstore submission get exited with code $($proc.ExitCode)"
    }

    $patchScript = Join-Path $ProjectRoot 'scripts\patch-store-release-notes.js'
    node $patchScript $submissionJson $WhatsNewFile $patchedJson
    Assert-CommandOk 'patch-store-release-notes.js'

    $meta = Get-Content -LiteralPath $patchedJson -Raw -Encoding utf8
    Write-Host 'Updating submission metadata (What''s new)…' -ForegroundColor Cyan
    msstore submission updateMetadata $ProductId $meta
    Assert-CommandOk 'msstore submission updateMetadata'
    $notesStamped = $true
    Write-Host 'Release notes stamped on the pending submission.' -ForegroundColor Green
} catch {
    Write-Warning "What's-new stamping failed ($_). Publishing package with carried-forward notes — fix in Partner Center if needed."
    if (Test-Path -LiteralPath $submissionJson) {
        Write-Host '--- head of submission.json ---' -ForegroundColor Yellow
        Get-Content -LiteralPath $submissionJson -TotalCount 30 | Write-Host
    }
}

# pathOrUrl must be the package file (.msix / .msixbundle / .msixupload).
# -i/--inputDirectory is a DIRECTORY of packages — passing a file yields
# "Input directory does not exist."
Write-Host "Publishing $bundleOut to Store product $ProductId…" -ForegroundColor Cyan
msstore publish $bundleOut -id $ProductId
Assert-CommandOk 'msstore publish'

Write-Host "Submitted to Partner Center (certification). notesStamped=$notesStamped" -ForegroundColor Green
