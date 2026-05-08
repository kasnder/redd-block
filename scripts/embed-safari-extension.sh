#!/bin/bash
# Embed the Safari Web Extension .appex into ReDD Block.app and
# re-sign so the embedded extension carries ReDD Block's Developer ID
# signature.
#
# Usage:
#   scripts/embed-safari-extension.sh <path-to-ReDD Block.app>
#
# Env vars (optional):
#   SAFARI_EXT_SIGNING_IDENTITY  Override signing identity. Default
#                                matches tauri.conf.json:
#                                "Developer ID Application: Reduce
#                                Digital Distraction Ltd (JD647S9RT6)"
#   SAFARI_EXT_BUNDLE_ID         Override embedded bundle ID. Default:
#                                com.reddblock.SafariExtension
#
# This script breaks and re-signs the parent .app's signature, so it
# must run AFTER Tauri has bundled+signed the .app and BEFORE any
# .dmg packaging or notarization. Tauri creates the .dmg from the
# (now-stale) signed .app, so callers also need to recreate the .dmg
# from the post-embed .app — see scripts/build-mac.sh for the wiring.
#
# We sign inner-out (.appex first, then the .app) per Apple's current
# recommendation. Avoiding `codesign --deep` lets each layer carry
# its own entitlements.

set -euo pipefail

APP_PATH="${1:?usage: $0 <path-to-ReDD Block.app>}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -d "$APP_PATH" ]; then
  echo "embed-safari-extension: '$APP_PATH' is not a directory" >&2
  exit 1
fi

DEFAULT_SIGNING_IDENTITY="Developer ID Application: Reduce Digital Distraction Ltd (JD647S9RT6)"
SIGNING_IDENTITY="${SAFARI_EXT_SIGNING_IDENTITY:-$DEFAULT_SIGNING_IDENTITY}"

APP_ENTITLEMENTS="$PROJECT_ROOT/src-tauri/entitlements.macos.plist"
EXT_ENTITLEMENTS="$PROJECT_ROOT/redd-focus-web/macOS (Extension)/MindShield.entitlements"

# 1. Build the .appex (unsigned). Last stdout line is the .appex path.
echo "embed-safari-extension: building .appex..."
APPEX=$(SAFARI_EXT_OUT_DIR="$PROJECT_ROOT/src-tauri/target/safari-ext" \
        bash "$PROJECT_ROOT/scripts/build-safari-extension.sh" | tail -n1)

if [ ! -d "$APPEX" ]; then
  echo "embed-safari-extension: built .appex missing at $APPEX" >&2
  exit 1
fi

# 2. Copy into the parent's PlugIns/ (Apple convention for app
# extensions). Wipe any prior copy in case we're embedding into an
# already-embedded .app (re-runs during dev).
PLUGINS_DIR="$APP_PATH/Contents/PlugIns"
mkdir -p "$PLUGINS_DIR"
EMBEDDED="$PLUGINS_DIR/ReDD Focus Extension.appex"
rm -rf "$EMBEDDED"
cp -R "$APPEX" "$EMBEDDED"
echo "embed-safari-extension: copied .appex → $EMBEDDED"

# 3. Sign the .appex with its own entitlements (App Group access for
# group.com.reddblock.shared). --options runtime enables the hardened
# runtime, required for notarization. --timestamp pins a trusted
# timestamp from Apple's TSA, also required for notarization.
echo "embed-safari-extension: signing .appex..."
codesign \
  --force \
  --options runtime \
  --entitlements "$EXT_ENTITLEMENTS" \
  --sign "$SIGNING_IDENTITY" \
  --timestamp \
  "$EMBEDDED"

# 4. Re-sign the outer .app with its entitlements. The .app was
# signed by Tauri, but adding the .appex into PlugIns/ invalidates
# the outer signature's sealed-resources hash. We don't use --deep
# here — the .appex was already signed correctly in step 3 and using
# --deep would clobber its entitlements with the parent's.
echo "embed-safari-extension: re-signing parent .app..."
codesign \
  --force \
  --options runtime \
  --entitlements "$APP_ENTITLEMENTS" \
  --sign "$SIGNING_IDENTITY" \
  --timestamp \
  "$APP_PATH"

# 5. Verify both layers. --strict catches things like dangling refs;
# --deep walks the bundle tree to also verify the embedded .appex.
echo "embed-safari-extension: verifying signature..."
codesign --verify --strict --deep --verbose=2 "$APP_PATH" 2>&1 | sed 's/^/  /'

echo "embed-safari-extension: done."
