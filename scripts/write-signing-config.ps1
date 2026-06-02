# Writes src-tauri/tauri.signing.generated.conf.json with an absolute path to
# sign-bundle.cmd so Tauri can find the signer regardless of process CWD.
# Do not wrap the path in quotes — Tauri's Windows runner fails with os error 123.

param(
    [string]$ProjectRoot = (Split-Path $PSScriptRoot -Parent)
)

$signBundle = Join-Path $ProjectRoot "src-tauri\windows\sign-bundle.cmd"
if (-not (Test-Path $signBundle)) {
    Write-Error "Missing $signBundle"
    exit 1
}

$signBundle = (Resolve-Path $signBundle).Path
$outFile = Join-Path $ProjectRoot "src-tauri\tauri.signing.generated.conf.json"

# No quotes around the path — Tauri's Windows Command runner breaks on quoted signCommand.
$config = @{
    bundle = @{
        windows = @{
            signCommand = "$signBundle %1"
        }
    }
}

$config | ConvertTo-Json -Depth 4 | Set-Content -Path $outFile -Encoding utf8
Write-Host "  Signing config: $outFile" -ForegroundColor Gray
Write-Host "  Sign script: $signBundle" -ForegroundColor Gray
