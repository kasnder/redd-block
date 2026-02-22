#!/bin/bash
# Build script for macOS universal binary with proper naming

set -e

# Source environment variables for signing/notarization
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Build helper for both architectures
echo "Building helper daemon for both architectures..."
cd helper-daemon
cargo build --release --target aarch64-apple-darwin
cargo build --release --target x86_64-apple-darwin
cp target/aarch64-apple-darwin/release/redd-block-helper target/release/redd-block-helper-aarch64-apple-darwin
cp target/x86_64-apple-darwin/release/redd-block-helper target/release/redd-block-helper-x86_64-apple-darwin
lipo -create \
  target/release/redd-block-helper-aarch64-apple-darwin \
  target/release/redd-block-helper-x86_64-apple-darwin \
  -output target/release/redd-block-helper-universal-apple-darwin

# Tauri externalBin expects the binary with target suffix for bundling
# For universal builds, it looks for -universal-apple-darwin suffix
echo "Copying universal helper for Tauri bundling..."
cd ..

# Build Tauri universal binary
echo "Building Tauri app..."
# Tauri v2 expects CI to be a bool string ("true"/"false"), not "1"/"0".
# Normalize inherited CI values so local shells/IDEs don't break builds.
TAURI_CI="${CI:-}"
if [ "$TAURI_CI" = "1" ]; then
  TAURI_CI="true"
elif [ "$TAURI_CI" = "0" ]; then
  TAURI_CI="false"
fi
PROJECT_ROOT="$(pwd)"
CARGO_TARGET_DIR="${PROJECT_ROOT}/src-tauri/target" CI="${TAURI_CI:-false}" npm run tauri build -- --target universal-apple-darwin

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

# Rename the DMG to preferred format
DMG_SOURCE="src-tauri/target/universal-apple-darwin/release/bundle/dmg/ReDD Block_${VERSION}_universal.dmg"
DMG_TARGET="src-tauri/target/universal-apple-darwin/release/bundle/dmg/reddblock-${VERSION}-universal.dmg"

if [ -f "$DMG_SOURCE" ]; then
  mv "$DMG_SOURCE" "$DMG_TARGET"
  
  # Copy to for-distribution folder in project root
  mkdir -p for-distribution
  cp "$DMG_TARGET" "for-distribution/reddblock-${VERSION}-universal.dmg"
  
  echo ""
  echo "✅ Build complete!"
  echo "   DMG: for-distribution/reddblock-${VERSION}-universal.dmg"
else
  echo "⚠️  DMG not found at expected location: $DMG_SOURCE"
  echo "   Looking for the generated universal DMG..."
  FALLBACK_DMG=$(find src-tauri/target -name "ReDD Block_${VERSION}_*.dmg" -print 2>/dev/null | head -n 1)
  if [ -n "$FALLBACK_DMG" ] && [ -f "$FALLBACK_DMG" ]; then
    mv "$FALLBACK_DMG" "$DMG_TARGET"
    mkdir -p for-distribution
    cp "$DMG_TARGET" "for-distribution/reddblock-${VERSION}-universal.dmg"
    echo ""
    echo "✅ Build complete (fallback path used)!"
    echo "   DMG: for-distribution/reddblock-${VERSION}-universal.dmg"
  else
    echo "⚠️  Could not locate universal DMG. Existing DMGs found:"
    find src-tauri/target -name "*.dmg" 2>/dev/null
  fi
fi
