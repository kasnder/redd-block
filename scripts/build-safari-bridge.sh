#!/bin/bash
# Compile src-tauri/safari-bridge/safari-tool.swift into a universal
# (arm64 + x86_64) Mach-O binary that ships alongside the ReDD Block
# binary inside the .app's Contents/MacOS/. Rust commands shell out
# to this binary to call SafariServices APIs that aren't reachable
# from the Objective-C runtime in any clean way.
#
# Inputs (env vars, all optional):
#   SAFARI_TOOL_OUT_DIR  Output directory for the universal binary.
#                        Default: src-tauri/target/safari-bridge
#
# Output (stdout, last line): the absolute path of the staged
# universal `safari-tool` binary. The binary is unsigned at this
# stage — it inherits ReDD Block's Developer ID signature when the
# parent .app gets re-signed by scripts/embed-safari-extension.sh.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_TOOL_OUT_DIR="${SAFARI_TOOL_OUT_DIR:-$PROJECT_ROOT/src-tauri/target/safari-bridge}"
SRC="$PROJECT_ROOT/src-tauri/safari-bridge/safari-tool.swift"

if [ ! -f "$SRC" ]; then
  echo "build-safari-bridge: source missing at $SRC" >&2
  exit 1
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "build-safari-bridge: skipping on non-macOS host" >&2
  exit 0
fi

mkdir -p "$SAFARI_TOOL_OUT_DIR"

# Send compiler chatter to stderr so callers piping stdout get only
# the binary path on the last line.
exec 3>&1
exec 1>&2

ARM_BIN="$SAFARI_TOOL_OUT_DIR/safari-tool-arm64"
X86_BIN="$SAFARI_TOOL_OUT_DIR/safari-tool-x86_64"
UNI_BIN="$SAFARI_TOOL_OUT_DIR/safari-tool"

# -O optimizes (we ship release-quality), -target sets the per-arch
# triple + minimum macOS, -framework links SafariServices.
echo "build-safari-bridge: compiling arm64..."
swiftc -O \
  -target arm64-apple-macos11 \
  -framework SafariServices \
  -o "$ARM_BIN" \
  "$SRC"

echo "build-safari-bridge: compiling x86_64..."
swiftc -O \
  -target x86_64-apple-macos11 \
  -framework SafariServices \
  -o "$X86_BIN" \
  "$SRC"

# Glue the two single-arch slices into one universal Mach-O so the
# same binary runs on Apple Silicon and Intel without us having to
# pick at install time. lipo is the standard tool for this.
echo "build-safari-bridge: lipo'ing into universal..."
lipo -create "$ARM_BIN" "$X86_BIN" -output "$UNI_BIN"

# Quick verification: the universal bin should report both slices.
lipo -info "$UNI_BIN"

# Clean up per-arch outputs — Tauri doesn't need them and they'd
# just confuse anyone poking around target/.
rm -f "$ARM_BIN" "$X86_BIN"

exec 1>&3 3>&-
echo "$UNI_BIN"
