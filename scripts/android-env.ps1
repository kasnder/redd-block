# Shared environment setup for the Android dev/build scripts.
# Resolves the Android toolchain (JDK, SDK, NDK) without requiring
# machine-wide environment variables — explicit env vars always win,
# otherwise the standard Android Studio install locations are used.

$ErrorActionPreference = 'Stop'

if (-not $env:JAVA_HOME) {
    $jbr = 'C:\Program Files\Android\Android Studio\jbr'
    if (Test-Path "$jbr\bin\java.exe") {
        $env:JAVA_HOME = $jbr
    } else {
        throw "JAVA_HOME is not set and Android Studio's bundled JDK was not found at $jbr. Install Android Studio or set JAVA_HOME to a JDK 17+ install."
    }
}

if (-not $env:ANDROID_HOME) {
    $sdk = "$env:LOCALAPPDATA\Android\Sdk"
    if (Test-Path $sdk) {
        $env:ANDROID_HOME = $sdk
    } else {
        throw "ANDROID_HOME is not set and no SDK was found at $sdk. Install the Android SDK (e.g. via Android Studio) or set ANDROID_HOME."
    }
}

if (-not $env:NDK_HOME) {
    $ndkRoot = Join-Path $env:ANDROID_HOME 'ndk'
    $latest = if (Test-Path $ndkRoot) {
        Get-ChildItem $ndkRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
    }
    if ($latest) {
        $env:NDK_HOME = $latest.FullName
    } else {
        throw "NDK_HOME is not set and no NDK was found under $ndkRoot. Install one with: sdkmanager `"ndk;27.2.12479018`" (or via Android Studio's SDK Manager)."
    }
}

# adb for device/emulator detection during `tauri android dev`.
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:JAVA_HOME\bin;$env:Path"

Write-Host "JAVA_HOME    = $env:JAVA_HOME"
Write-Host "ANDROID_HOME = $env:ANDROID_HOME"
Write-Host "NDK_HOME     = $env:NDK_HOME"
