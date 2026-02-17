# ==============================================
# ReddBlock Helper Daemon Smoke Test (Windows)
# ==============================================
# Tests the helper daemon via TCP IPC on 127.0.0.1:62222.
# Run with: powershell -ExecutionPolicy Bypass -File .\scripts\test-helper-win.ps1
#
# Must be run as Administrator for hosts file verification.
# Helper daemon must be installed and running.

$ErrorActionPreference = "Stop"

$HELPER_ADDR = "127.0.0.1"
$HELPER_PORT = 62222
$TEST_DOMAIN = "smoke-test-reddblock.invalid"
$HOSTS_FILE = "C:\Windows\System32\drivers\etc\hosts"
$AUTH_TOKEN_PATH = "$env:PROGRAMDATA\ReDD Block\auth-token"
$script:Passed = 0
$script:Failed = 0

function Write-Pass {
    param([string]$msg)
    Write-Host "  PASS: $msg" -ForegroundColor Green
    $script:Passed++
}

function Write-Fail {
    param([string]$msg)
    Write-Host "  FAIL: $msg" -ForegroundColor Red
    $script:Failed++
}

function Write-Warn {
    param([string]$msg)
    Write-Host "  WARN: $msg" -ForegroundColor Yellow
}

# Read auth token (required for Windows TCP IPC)
function Get-AuthToken {
    if (Test-Path $AUTH_TOKEN_PATH) {
        return (Get-Content $AUTH_TOKEN_PATH -Raw).Trim()
    }
    return $null
}

# Send a JSON command to the helper via TCP
function Send-HelperCommand {
    param([string]$jsonCmd)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($HELPER_ADDR, $HELPER_PORT)
        $stream = $client.GetStream()
        $writer = New-Object System.IO.StreamWriter($stream)
        $reader = New-Object System.IO.StreamReader($stream)

        $writer.WriteLine($jsonCmd)
        $writer.Flush()

        # Read response (with timeout)
        $stream.ReadTimeout = 5000
        $response = $reader.ReadLine()

        $client.Close()
        return $response
    }
    catch {
        return $null
    }
}

# Add auth token to command if available
function Build-Command {
    param([string]$action, [string]$extraJson = "")
    $token = Get-AuthToken
    if ($token -and $extraJson) {
        return "{`"action`":`"$action`",`"auth_token`":`"$token`",$extraJson}"
    }
    elseif ($token) {
        return "{`"action`":`"$action`",`"auth_token`":`"$token`"}"
    }
    elseif ($extraJson) {
        return "{`"action`":`"$action`",$extraJson}"
    }
    else {
        return "{`"action`":`"$action`"}"
    }
}

# ==========================================
# CHECKS
# ==========================================

Write-Host ""
Write-Host "ReddBlock Helper Daemon Smoke Test (Windows)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Check admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Note: Running without admin. Hosts file checks may be limited." -ForegroundColor Yellow
    Write-Host ""
}

# Test 1: Check TCP connection
Write-Host "1. Checking helper connection..."
try {
    $testClient = New-Object System.Net.Sockets.TcpClient
    $testClient.Connect($HELPER_ADDR, $HELPER_PORT)
    $testClient.Close()
    Write-Pass "TCP connection to ${HELPER_ADDR}:${HELPER_PORT} succeeded"
}
catch {
    Write-Fail "Cannot connect to helper at ${HELPER_ADDR}:${HELPER_PORT}"
    Write-Host ""
    Write-Host "Helper daemon is not installed or not running."
    Write-Host "Install it by starting a block in the app first."
    exit 1
}

# Test 2: Ping
Write-Host ""
Write-Host "2. Ping test..."
$cmd = Build-Command "ping"
$response = Send-HelperCommand $cmd
if ($response -and ($response -match '"success":\s*true')) {
    Write-Pass "Helper responded to ping"
}
else {
    Write-Fail "Helper did not respond to ping (response: $response)"
}

# Test 3: Get version
Write-Host ""
Write-Host "3. Version check..."
$cmd = Build-Command "get-version"
$response = Send-HelperCommand $cmd
if ($response -and ($response -match '"version"')) {
    $parsed = $response | ConvertFrom-Json
    Write-Pass "Helper version: $($parsed.version)"
}
else {
    Write-Fail "Could not get helper version (response: $response)"
}

# Test 4: Get status
Write-Host ""
Write-Host "4. Status check..."
$cmd = Build-Command "get-status"
$response = Send-HelperCommand $cmd
$skipRemaining = $false
if ($response -and ($response -match '"success":\s*true')) {
    $parsed = $response | ConvertFrom-Json
    Write-Pass "Status check OK (active: $($parsed.active))"

    if ($parsed.active -eq $true) {
        Write-Warn "There is already an active block - skipping start/clear tests"
        $skipRemaining = $true
    }
}
else {
    Write-Fail "Status check failed (response: $response)"
}

if ($skipRemaining) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    $msg = "  RESULTS: $($script:Passed) passed, $($script:Failed) failed, 3 skipped"
    Write-Host $msg -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    exit 0
}

# Test 5: Start a test block
Write-Host ""
Write-Host "5. Start test block..."
$endTime = [long](([datetime]::UtcNow - [datetime]"1970-01-01").TotalMilliseconds + 120000)
$extra = "`"domains`":[`"$TEST_DOMAIN`"],`"endTime`":$endTime,`"blocklistId`":`"smoke-test`""
$cmd = Build-Command "start-block" $extra
$response = Send-HelperCommand $cmd
if ($response -and ($response -match '"success":\s*true')) {
    Write-Pass "Test block started for $TEST_DOMAIN"
}
else {
    Write-Fail "Failed to start test block (response: $response)"
}

# Test 6: Verify hosts file
Write-Host ""
Write-Host "6. Verify hosts file..."
Start-Sleep -Seconds 1
$hostsContent = Get-Content $HOSTS_FILE -Raw -ErrorAction SilentlyContinue
$escapedDomain = [regex]::Escape($TEST_DOMAIN)
if ($hostsContent -match $escapedDomain) {
    Write-Pass "Hosts file contains $TEST_DOMAIN"
}
else {
    Write-Fail "Hosts file does NOT contain $TEST_DOMAIN"
}

# Test 7: Verify block markers
if ($hostsContent -match "BEGIN REDD BLOCK") {
    Write-Pass "Hosts file has REDD BLOCK markers"
}
else {
    Write-Fail "Hosts file missing REDD BLOCK markers"
}

# Test 8: Clear the block
Write-Host ""
Write-Host "7. Clear test block..."
$cmd = Build-Command "clear-block"
$response = Send-HelperCommand $cmd
if ($response -and ($response -match '"success":\s*true')) {
    Write-Pass "Test block cleared"
}
else {
    Write-Fail "Failed to clear test block (response: $response)"
}

# Test 9: Verify cleanup
Write-Host ""
Write-Host "8. Verify cleanup..."
Start-Sleep -Seconds 1
$hostsContent = Get-Content $HOSTS_FILE -Raw -ErrorAction SilentlyContinue
if ($hostsContent -match $escapedDomain) {
    Write-Fail "Hosts file STILL contains $TEST_DOMAIN after clear"
}
else {
    Write-Pass "Hosts file cleaned - $TEST_DOMAIN removed"
}

# Test 10: Safety check
if ($hostsContent -match "localhost") {
    Write-Pass "Safety: localhost entry present in hosts file"
}
else {
    Write-Fail "SAFETY ISSUE: localhost entry MISSING from hosts file!"
}

# ==========================================
# SUMMARY
# ==========================================

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
$total = $script:Passed + $script:Failed
if ($script:Failed -eq 0) {
    Write-Host "  ALL $total CHECKS PASSED" -ForegroundColor Green
}
else {
    Write-Host "  RESULTS: $($script:Passed) passed, $($script:Failed) failed" -ForegroundColor Red
}
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

exit $script:Failed
