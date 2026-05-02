#!/bin/bash
# Build the macOS desktop app as a bundle + DMG.

set -euo pipefail

# Source environment variables for signing/notarization if present.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Support the older APPLE_PASSWORD name by mapping it to the variable
# the notarize hook actually reads.
if [ -n "${APPLE_PASSWORD:-}" ] && [ -z "${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
  export APPLE_APP_SPECIFIC_PASSWORD="${APPLE_PASSWORD}"
fi

# Tauri v2 expects CI to be "true"/"false", not "1"/"0".
TAURI_CI="${CI:-}"
if [ "$TAURI_CI" = "1" ]; then
  TAURI_CI="true"
elif [ "$TAURI_CI" = "0" ]; then
  TAURI_CI="false"
fi

PROJECT_ROOT="$(pwd)"
BUILD_TARGET="${BUILD_MAC_TARGET:-universal-apple-darwin}"

CONFIG_ARGS=()
if [ -n "${APPLE_SIGNING_IDENTITY_OVERRIDE:-}" ]; then
  echo "Using signing identity override: ${APPLE_SIGNING_IDENTITY_OVERRIDE}"
  CONFIG_ARGS=(
    --config
    "{\"bundle\":{\"macOS\":{\"signingIdentity\":\"${APPLE_SIGNING_IDENTITY_OVERRIDE}\"}}}"
  )
fi

TARGET_DIR="${PROJECT_ROOT}/src-tauri/target/${BUILD_TARGET}/release/bundle"

echo "Building ReDD Block for macOS (${BUILD_TARGET})..."
CARGO_TARGET_DIR="${PROJECT_ROOT}/src-tauri/target" \
CI="${TAURI_CI:-false}" \
npm run tauri -- build --target "${BUILD_TARGET}" ${CONFIG_ARGS[@]+"${CONFIG_ARGS[@]}"}

VERSION=$(node -p "require('./package.json').version")
APP_SOURCE="${TARGET_DIR}/macos/ReDD Block.app"
DMG_SOURCE="${TARGET_DIR}/dmg/ReDD Block_${VERSION}_$(basename "${BUILD_TARGET%%-*}")".dmg
if [ "${BUILD_TARGET}" = "universal-apple-darwin" ]; then
  DMG_SOURCE="${TARGET_DIR}/dmg/ReDD Block_${VERSION}_universal.dmg"
fi
DMG_TARGET="${TARGET_DIR}/dmg/reddblock-${VERSION}-${BUILD_TARGET}.dmg"

mkdir -p for-distribution

if [ -d "$APP_SOURCE" ]; then
  rm -rf "for-distribution/ReDD Block.app"
  cp -R "$APP_SOURCE" "for-distribution/ReDD Block.app"
fi

if [ -f "$DMG_SOURCE" ]; then
  mv "$DMG_SOURCE" "$DMG_TARGET"
elif [ ! -f "$DMG_TARGET" ]; then
  FALLBACK_DMG=$(find "${TARGET_DIR}/dmg" -maxdepth 1 -name "*.dmg" -print 2>/dev/null | head -n 1)
  if [ -n "$FALLBACK_DMG" ] && [ "$FALLBACK_DMG" != "$DMG_TARGET" ]; then
    mv "$FALLBACK_DMG" "$DMG_TARGET"
  fi
fi

if [ -f "$DMG_TARGET" ]; then
  cp "$DMG_TARGET" "for-distribution/reddblock-${VERSION}-${BUILD_TARGET}.dmg"
fi

echo ""
echo "Build complete."
if [ -d "for-distribution/ReDD Block.app" ]; then
  echo "  App: for-distribution/ReDD Block.app"
fi
if [ -f "for-distribution/reddblock-${VERSION}-${BUILD_TARGET}.dmg" ]; then
  echo "  DMG: for-distribution/reddblock-${VERSION}-${BUILD_TARGET}.dmg"
fi
