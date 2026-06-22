#!/bin/bash
# Compile src-tauri/safari-bridge/safari-bridge.swift into a universal
# (arm64 + x86_64) dynamic library that gets linked into the main
# redd-block binary. Rust calls into it via @_cdecl C-ABI exports
# to reach SafariServices APIs that aren't reachable from the
# Objective-C runtime in any clean way.
#
# Why a dylib and not a static lib: Swift's stdlib is shipped as a
# shared library on macOS (in /usr/lib/swift/) since Big Sur. Static-
# linking Swift code is technically possible but pulls in a huge
# stdlib and breaks library evolution. A dylib is the standard.
#
# Why a dylib and not a CLI sidecar: SFSafariExtensionManager rejects
# calls from any binary other than the registered main executable of
# the host bundle (returns SFErrorDomain error 1, "extensionNotFound").
# Linking the Swift code into the main redd-block binary keeps the
# call in the right process context.
#
# Inputs (env vars, all optional):
#   SAFARI_BRIDGE_OUT_DIR  Output directory.
#                          Default: src-tauri/target/safari-bridge
#
# Output (stdout, last line): the absolute path of the staged
# universal `libsafari_bridge.dylib`. The dylib is unsigned at this
# stage; it inherits Fristed's Developer ID signature when the
# parent .app gets re-signed.
#
# Skips silently on non-macOS hosts so the same script can be wired
# into a cross-platform build (e.g. invoked from build.rs).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_BRIDGE_OUT_DIR="${SAFARI_BRIDGE_OUT_DIR:-$PROJECT_ROOT/src-tauri/target/safari-bridge}"
SRC="$PROJECT_ROOT/src-tauri/safari-bridge/safari-bridge.swift"

if [ ! -f "$SRC" ]; then
  echo "build-safari-bridge: source missing at $SRC" >&2
  exit 1
fi

if [ "$(uname -s)" != "Darwin" ]; then
  echo "build-safari-bridge: skipping on non-macOS host" >&2
  exit 0
fi

mkdir -p "$SAFARI_BRIDGE_OUT_DIR"

# Send compiler chatter to stderr so callers piping stdout get only
# the binary path on the last line.
exec 3>&1
exec 1>&2

ARM_DYLIB="$SAFARI_BRIDGE_OUT_DIR/libsafari_bridge-arm64.dylib"
X86_DYLIB="$SAFARI_BRIDGE_OUT_DIR/libsafari_bridge-x86_64.dylib"
UNI_DYLIB="$SAFARI_BRIDGE_OUT_DIR/libsafari_bridge.dylib"

# Per-arch compiles: -O for release optimization, -emit-library +
# -module-name set the dylib's metadata, -framework SafariServices
# pulls in the API we're calling. -install_name controls how the
# linked binary will look up the dylib at runtime: setting it to
# `@rpath/libsafari_bridge.dylib` lets Tauri's normal RPATH
# (`@executable_path/../Frameworks`) resolve it from inside the .app.
echo "build-safari-bridge: compiling arm64..."
swiftc -O \
  -target arm64-apple-macos11 \
  -emit-library \
  -module-name SafariBridge \
  -framework SafariServices \
  -Xlinker -install_name -Xlinker "@rpath/libsafari_bridge.dylib" \
  -o "$ARM_DYLIB" \
  "$SRC"

echo "build-safari-bridge: compiling x86_64..."
swiftc -O \
  -target x86_64-apple-macos11 \
  -emit-library \
  -module-name SafariBridge \
  -framework SafariServices \
  -Xlinker -install_name -Xlinker "@rpath/libsafari_bridge.dylib" \
  -o "$X86_DYLIB" \
  "$SRC"

# Glue the two single-arch slices into one universal Mach-O so the
# same dylib runs on Apple Silicon and Intel without us having to
# pick at install time.
echo "build-safari-bridge: lipo'ing into universal..."
lipo -create "$ARM_DYLIB" "$X86_DYLIB" -output "$UNI_DYLIB"

# Quick verification: the universal dylib should report both slices.
lipo -info "$UNI_DYLIB"

# Clean up per-arch outputs — Cargo doesn't need them.
rm -f "$ARM_DYLIB" "$X86_DYLIB"

exec 1>&3 3>&-
echo "$UNI_DYLIB"
