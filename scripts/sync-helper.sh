#!/bin/bash
# Script to ensure helper-daemon sidecar is up-to-date (macOS version)
# Compares source file timestamps with the sidecar binary and rebuilds if needed
# Also ensures the installed system helper matches the sidecar version

set -e

HELPER_DIR="helper-daemon"
SRC_DIR="$HELPER_DIR/src"
CARGO_TOML="$HELPER_DIR/Cargo.toml"
RELEASE_BIN="$HELPER_DIR/target/release/redd-block-helper"
SIDECAR_BIN="src-tauri/target/debug/redd-block-helper-aarch64-apple-darwin"
INSTALLED_HELPER="/Library/PrivilegedHelperTools/com.redd.block.helper"
PLIST="/Library/LaunchDaemons/com.redd.block.helper.plist"

# Check if source directory exists
if [ ! -d "$SRC_DIR" ]; then
    echo "No helper-daemon source files found, skipping helper build check."
    exit 0
fi

# Get the newest source file modification time
NEWEST_SOURCE=$(find "$SRC_DIR" -type f -newer "$SIDECAR_BIN" 2>/dev/null | head -1)
CARGO_NEWER=""
if [ -f "$CARGO_TOML" ] && [ -f "$SIDECAR_BIN" ]; then
    if [ "$CARGO_TOML" -nt "$SIDECAR_BIN" ]; then
        CARGO_NEWER="yes"
    fi
fi

# Check if sidecar exists and is up-to-date
SIDECAR_OUTDATED=false

if [ ! -f "$SIDECAR_BIN" ]; then
    echo "Sidecar binary not found at $SIDECAR_BIN, will build helper-daemon."
    SIDECAR_OUTDATED=true
elif [ -n "$NEWEST_SOURCE" ] || [ -n "$CARGO_NEWER" ]; then
    echo "Helper-daemon source files are newer than sidecar binary."
    SIDECAR_OUTDATED=true
else
    echo "Helper-daemon sidecar is up-to-date."
fi

if [ "$SIDECAR_OUTDATED" = true ]; then
    echo "Building helper-daemon..."
    cd "$HELPER_DIR"
    cargo build --release
    cd ..
    
    # Copy to sidecar location
    if [ -f "$RELEASE_BIN" ]; then
        # Ensure target directory exists
        mkdir -p "$(dirname "$SIDECAR_BIN")"
        cp "$RELEASE_BIN" "$SIDECAR_BIN"
        echo "Copied helper binary to sidecar location: $SIDECAR_BIN"
    else
        echo "ERROR: Built binary not found at $RELEASE_BIN"
        exit 1
    fi
fi

# Always check if the installed system helper needs updating
# This runs even if we didn't rebuild, to catch cases where the helper was installed
# from an old sidecar binary
if [ -f "$INSTALLED_HELPER" ] && [ -f "$SIDECAR_BIN" ]; then
    # Compare checksums to see if they differ
    INSTALLED_HASH=$(md5 -q "$INSTALLED_HELPER" 2>/dev/null || echo "none")
    SIDECAR_HASH=$(md5 -q "$SIDECAR_BIN" 2>/dev/null || echo "different")
    
    if [ "$INSTALLED_HASH" != "$SIDECAR_HASH" ]; then
        echo "Installed helper differs from sidecar, updating system helper..."
        echo "(requires sudo password)"
        sudo cp "$SIDECAR_BIN" "$INSTALLED_HELPER"
        sudo chmod 755 "$INSTALLED_HELPER"
        
        # Restart the launchd daemon to pick up the new binary
        if [ -f "$PLIST" ]; then
            echo "Restarting helper daemon..."
            sudo launchctl unload "$PLIST" 2>/dev/null || true
            sudo launchctl load "$PLIST"
            echo "Helper daemon restarted with updated binary."
        fi
    else
        echo "Installed system helper is already up-to-date."
    fi
fi

exit 0
