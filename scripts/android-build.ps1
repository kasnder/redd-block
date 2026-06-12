# Build ReDD Block for Android.
#   npm run build:android        → signed .aab for Play Store upload
#   npm run build:android-apk    → signed .apk for sideloading/testing
#
# Release signing reads src-tauri/gen/android/keystore.properties (gitignored;
# see README "Android" section). Without it the build fails at the signing
# step — create the keystore first.
#
# Artifacts are copied to for-distribution/android/ like the other platforms.

param(
    [switch]$Apk
)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

. "$PSScriptRoot\android-env.ps1"

if ($Apk) {
    npx tauri android build --apk true --aab false
} else {
    npx tauri android build --aab true --apk false
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$outRoot = 'src-tauri\gen\android\app\build\outputs'
$dest = 'for-distribution\android'
New-Item -ItemType Directory -Force $dest | Out-Null

$artifacts = Get-ChildItem -Recurse $outRoot -Include '*.aab', '*-release*.apk' -ErrorAction SilentlyContinue
foreach ($a in $artifacts) {
    Copy-Item $a.FullName $dest -Force
    Write-Host "Copied $($a.Name) -> $dest"
}
