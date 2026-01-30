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
cd ..

# Build Tauri universal binary
echo "Building Tauri app..."
npm run tauri build -- --target universal-apple-darwin

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
  echo "   Looking for DMG files..."
  find src-tauri/target -name "*.dmg" 2>/dev/null
fi
