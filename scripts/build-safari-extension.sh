#!/bin/bash
# Build the macOS Safari Web Extension target out of redd-focus-web/
# and stage the resulting .appex to a deterministic output path. The
# .appex is ad-hoc / unsigned at this stage — it inherits ReDD Block's
# Developer ID signature when the outer .app is re-signed at embed
# time (see scripts/embed-safari-extension.sh). Keeping this step
# hermetic lets dev iteration work without touching the keychain.
#
# Inputs (env vars, all optional):
#   SAFARI_EXT_OUT_DIR        Output directory.
#                             Default: src-tauri/target/safari-ext
#   SAFARI_EXT_BUNDLE_ID      Bundle identifier override for the .appex.
#                             Default: com.reddblock.SafariExtension
#   SAFARI_EXT_DISPLAY_NAME   CFBundleDisplayName + manifest name for the
#                             ReDD Block–bundled copy. Default:
#                             "ReDD Focus (via ReDD Block)"
#   SAFARI_EXT_CONFIGURATION  Xcode configuration — Release | Debug.
#                             Default: Release
#
# Output (stdout, last line): the absolute path of the staged .appex.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAFARI_EXT_OUT_DIR="${SAFARI_EXT_OUT_DIR:-$PROJECT_ROOT/src-tauri/target/safari-ext}"
SAFARI_EXT_BUNDLE_ID="${SAFARI_EXT_BUNDLE_ID:-com.reddblock.SafariExtension}"
SAFARI_EXT_DISPLAY_NAME="${SAFARI_EXT_DISPLAY_NAME:-ReDD Focus (via ReDD Block)}"
SAFARI_EXT_CONFIGURATION="${SAFARI_EXT_CONFIGURATION:-Release}"

mkdir -p "$SAFARI_EXT_OUT_DIR"
SYMROOT="$SAFARI_EXT_OUT_DIR/build"
OBJROOT="$SAFARI_EXT_OUT_DIR/build-intermediates"

# Send xcodebuild's chatter to stderr so callers piping stdout get
# only the staged-appex path on the last line.
exec 3>&1
exec 1>&2

cd "$PROJECT_ROOT/redd-focus-web"

# We override PRODUCT_BUNDLE_IDENTIFIER so the embedded copy nests
# under com.reddblock.* and doesn't collide with a user's standalone
# ReDD Focus install. CODE_SIGNING_ALLOWED=NO skips signing; the
# parent .app's `codesign --deep` pass at embed time stamps it.
#
# We use SYMROOT/OBJROOT (rather than -derivedDataPath, which
# requires -scheme) because we want a target-only build — the
# project doesn't have a shared scheme for just the macOS Extension.
xcodebuild \
  -project "ReDD Focus.xcodeproj" \
  -target "Extension (macOS)" \
  -configuration "$SAFARI_EXT_CONFIGURATION" \
  SYMROOT="$SYMROOT" \
  OBJROOT="$OBJROOT" \
  PRODUCT_BUNDLE_IDENTIFIER="$SAFARI_EXT_BUNDLE_ID" \
  INFOPLIST_KEY_CFBundleDisplayName="$SAFARI_EXT_DISPLAY_NAME" \
  INFOPLIST_KEY_CFBundleName="$SAFARI_EXT_DISPLAY_NAME" \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  build

APPEX_PRODUCT_DIR="$SYMROOT/$SAFARI_EXT_CONFIGURATION"
APPEX_SRC="$APPEX_PRODUCT_DIR/ReDD Focus Extension.appex"
if [ ! -d "$APPEX_SRC" ]; then
  echo "build-safari-extension: .appex missing at $APPEX_SRC" >&2
  ls -la "$APPEX_PRODUCT_DIR" >&2 || true
  exit 1
fi

APPEX_OUT="$SAFARI_EXT_OUT_DIR/ReDD Focus Extension.appex"
rm -rf "$APPEX_OUT"
cp -R "$APPEX_SRC" "$APPEX_OUT"

# Safari lists the Web Extension name from manifest.json; the standalone
# App Store build keeps "ReDD Focus: Hide Distractions". Patch only this
# staged copy so users can tell the bundled install apart in Settings →
# Extensions when both are present.
MANIFEST="$APPEX_OUT/Contents/Resources/manifest.json"
if [ -f "$MANIFEST" ]; then
  python3 - "$MANIFEST" "$SAFARI_EXT_DISPLAY_NAME" <<'PY'
import json
import sys

path, name = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
data["name"] = name
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY
else
  echo "build-safari-extension: manifest.json missing at $MANIFEST" >&2
  exit 1
fi

# Restore stdout and emit the path. Callers can capture the last line
# via `APPEX_PATH=$(scripts/build-safari-extension.sh | tail -n1)`.
exec 1>&3 3>&-
echo "$APPEX_OUT"
