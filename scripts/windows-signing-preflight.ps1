# Shared checks before Tauri bundle runs scripts/sign.cmd (Azure Artifact Signing).

function Test-ReddBlockWindowsSigning {
    $hasVars = $env:AZURE_CLIENT_ID -and $env:AZURE_TENANT_ID -and $env:AZURE_CLIENT_SECRET
    if (-not $hasVars) {
        Write-Host "  Code signing: skipped (AZURE_* not set in .env)." -ForegroundColor Gray
        return $true
    }

    $cli = Join-Path $env:USERPROFILE '.cargo\bin\trusted-signing-cli.exe'
    if (-not (Test-Path $cli)) {
        Write-Host ""
        Write-Host "  ERROR: AZURE_* is set but trusted-signing-cli is not installed." -ForegroundColor Red
        Write-Host "    cargo install trusted-signing-cli --locked" -ForegroundColor Yellow
        Write-Host "  Or comment out AZURE_* in .env to bundle unsigned (fine for local MSIX tests)." -ForegroundColor Yellow
        Write-Host ""
        return $false
    }

    $cargoBin = Split-Path $cli -Parent
    if ($env:PATH -notlike "*$cargoBin*") {
        $env:PATH = "$cargoBin;$env:PATH"
    }
    Write-Host "  Code signing: enabled ($cli)" -ForegroundColor Gray
    return $true
}
