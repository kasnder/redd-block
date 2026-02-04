#!/bin/bash
# Version bump script for ReDD Block
# Usage: ./scripts/bump-version.sh 0.4.3
#
# This script updates the version in all necessary files:
# - package.json
# - src-tauri/tauri.conf.json (single source of truth for builds)
# - helper-daemon/Cargo.toml

set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/bump-version.sh <version>"
    echo "Example: ./scripts/bump-version.sh 0.4.3"
    exit 1
fi

NEW_VERSION="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Bumping version to $NEW_VERSION..."
echo ""

# Update package.json
echo "  Updating package.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"
else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json"
fi

# Update tauri.conf.json
echo "  Updating src-tauri/tauri.conf.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/src-tauri/tauri.conf.json"
else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/src-tauri/tauri.conf.json"
fi

# Update helper-daemon/Cargo.toml
echo "  Updating helper-daemon/Cargo.toml..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$PROJECT_ROOT/helper-daemon/Cargo.toml"
else
    sed -i "s/^version = \"[^\"]*\"/version = \"$NEW_VERSION\"/" "$PROJECT_ROOT/helper-daemon/Cargo.toml"
fi

echo ""
echo "✅ Version bumped to $NEW_VERSION in all files!"
echo ""
echo "Files updated:"
echo "  - package.json"
echo "  - src-tauri/tauri.conf.json"
echo "  - helper-daemon/Cargo.toml"
echo ""
echo "Note: Build scripts (build-appx.ps1, build-win-store.ps1) read from"
echo "      tauri.conf.json automatically - no manual update needed."
