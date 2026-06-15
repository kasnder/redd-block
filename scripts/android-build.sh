#!/usr/bin/env bash

# Build ReDD Block for Android.
#   npm run build:android        -> signed .aab for Play Store upload
#   npm run build:android-apk    -> signed .apk for sideloading/testing
#
# Release signing reads src-tauri/gen/android/keystore.properties (gitignored;
# see README "Android" section). Without it the build fails at the signing
# step - create the keystore first.
#
# Artifacts are copied to for-distribution/android/ like the other platforms.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${JAVA_HOME:-}" ]]; then
  JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [[ -x "$JBR/bin/java" ]]; then
    export JAVA_HOME="$JBR"
  else
    echo "JAVA_HOME is not set and Android Studio's bundled JDK was not found at $JBR. Install Android Studio or set JAVA_HOME to a JDK 17+ install." >&2
    exit 1
  fi
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  SDK="$HOME/Library/Android/sdk"
  if [[ -d "$SDK" ]]; then
    export ANDROID_HOME="$SDK"
  else
    echo "ANDROID_HOME is not set and no SDK was found at $SDK. Install the Android SDK (e.g. via Android Studio) or set ANDROID_HOME." >&2
    exit 1
  fi
fi

if [[ -z "${NDK_HOME:-}" ]]; then
  NDK_ROOT="$ANDROID_HOME/ndk"
  if [[ -d "$NDK_ROOT" ]]; then
    LATEST_NDK="$(ls -1 "$NDK_ROOT" 2>/dev/null | sort -r | head -n 1 || true)"
    if [[ -n "$LATEST_NDK" && -d "$NDK_ROOT/$LATEST_NDK" ]]; then
      export NDK_HOME="$NDK_ROOT/$LATEST_NDK"
    fi
  fi

  if [[ -z "${NDK_HOME:-}" ]]; then
    echo "NDK_HOME is not set and no NDK was found under $NDK_ROOT. Install one with: sdkmanager \"ndk;27.2.12479018\" (or via Android Studio's SDK Manager)." >&2
    exit 1
  fi
fi

export PATH="$ANDROID_HOME/platform-tools:$JAVA_HOME/bin:$PATH"

echo "JAVA_HOME    = $JAVA_HOME"
echo "ANDROID_HOME = $ANDROID_HOME"
echo "NDK_HOME     = $NDK_HOME"

APK=false
if [[ "${1:-}" == "--apk" ]]; then
  APK=true
  shift
fi

if [[ "$APK" == "true" ]]; then
  npx tauri android build --apk true --aab false "$@"
else
  npx tauri android build --aab true --apk false "$@"
fi

OUT_ROOT="src-tauri/gen/android/app/build/outputs"
DEST="for-distribution/android"
mkdir -p "$DEST"

find "$OUT_ROOT" -type f \( -name "*.aab" -o -name "*-release*.apk" \) -print0 | while IFS= read -r -d '' artifact; do
  cp "$artifact" "$DEST/"
  echo "Copied $(basename "$artifact") -> $DEST"
done
