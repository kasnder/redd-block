# Run ReDD Block on a connected Android device or emulator with hot reload.
# Android counterpart of scripts/ios-dev.sh. Extra arguments are passed to
# `tauri android dev` (e.g. a device name).

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

. "$PSScriptRoot\android-env.ps1"

npx tauri android dev @args
exit $LASTEXITCODE
