#!/usr/bin/env bash
# build-mac-pkg.sh — wrap the Tauri-built .app into a signed installer .pkg.
#
# Why: Tauri's built-in `pkg` bundle target is App-Store-oriented and
# doesn't accept custom pre/postinstall scripts. For the v1.x → 2.0
# migration we want a real installer that can stop the old daemon and
# launch the new app at the end. So we let Tauri build the .app /
# .dmg as usual, then wrap the .app with `pkgbuild` + `productbuild`
# here.
#
# Usage:
#   scripts/build-mac-pkg.sh                  # debug build
#   scripts/build-mac-pkg.sh --release        # release build
#
# Required env vars for a signed + notarized .pkg:
#   APPLE_DEVELOPER_INSTALLER_IDENTITY  — "Developer ID Installer: ..."
#   APPLE_NOTARIZE_USER, APPLE_NOTARIZE_PASS, APPLE_TEAM_ID  (optional, for notarization)
# If APPLE_DEVELOPER_INSTALLER_IDENTITY is unset, produces an unsigned
# .pkg suitable for local testing only.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

PROFILE="debug"
if [[ "${1:-}" == "--release" ]]; then
    PROFILE="release"
fi

APP_NAME="ReDD Block"
BUNDLE_ID="com.reddblock"
APP_PATH="src-tauri/target/${PROFILE}/bundle/macos/${APP_NAME}.app"
SCRIPTS_DIR="scripts/macos-pkg/scripts"

if [[ ! -d "$APP_PATH" ]]; then
    echo "ERROR: $APP_PATH not found. Run 'npm run tauri build' (or 'tauri build --debug') first."
    exit 1
fi

# Pull version from tauri.conf.json so the .pkg filename matches.
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
echo "Building .pkg for ${APP_NAME} ${VERSION} (${PROFILE})"

OUT_DIR="src-tauri/target/${PROFILE}/bundle/pkg"
mkdir -p "$OUT_DIR"

COMPONENT_PKG="$OUT_DIR/component.pkg"
DIST_PKG="$OUT_DIR/${APP_NAME// /-}-${VERSION}.pkg"
DIST_FILE=$(mktemp /tmp/redd-block-dist.XXXXXX.xml)

# Build a *temporary* scripts dir so we can copy in the shared
# cleanup.sh template alongside preinstall/postinstall — the
# preinstall reads cleanup.sh at runtime via `dirname "$0"/cleanup.sh`.
# Keeping cleanup.sh in src-tauri/src/commands/migration/ as the single
# source of truth (the in-app Rust migration code also include_str!s
# from there) and copying it at build time avoids duplicate
# maintenance.
PKG_SCRIPTS_DIR=$(mktemp -d /tmp/redd-block-pkgscripts.XXXXXX)
cp "$SCRIPTS_DIR"/* "$PKG_SCRIPTS_DIR/"
cp "src-tauri/src/commands/migration/cleanup.sh" "$PKG_SCRIPTS_DIR/cleanup.sh"
chmod 755 "$PKG_SCRIPTS_DIR"/preinstall "$PKG_SCRIPTS_DIR"/postinstall
echo "Bundled scripts in $PKG_SCRIPTS_DIR:"
ls -l "$PKG_SCRIPTS_DIR"

# 1. Component package: just wraps the .app.
pkgbuild \
    --root "$(dirname "$APP_PATH")" \
    --identifier "$BUNDLE_ID.app" \
    --version "$VERSION" \
    --install-location "/Applications" \
    --scripts "$PKG_SCRIPTS_DIR" \
    "$COMPONENT_PKG"

# 2. Distribution definition (XML) — wraps the component package and
#    declares product metadata, minimum OS, etc.
cat > "$DIST_FILE" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>${APP_NAME}</title>
    <organization>${BUNDLE_ID}</organization>
    <domains enable_localSystem="true" />
    <options customize="never" require-scripts="false" rootVolumeOnly="true" />
    <volume-check>
        <allowed-os-versions>
            <os-version min="11.0" />
        </allowed-os-versions>
    </volume-check>
    <choices-outline>
        <line choice="default">
            <line choice="${BUNDLE_ID}.app" />
        </line>
    </choices-outline>
    <choice id="default" />
    <choice id="${BUNDLE_ID}.app" visible="false">
        <pkg-ref id="${BUNDLE_ID}.app" />
    </choice>
    <pkg-ref id="${BUNDLE_ID}.app" version="${VERSION}" onConclusion="none">component.pkg</pkg-ref>
</installer-gui-script>
EOF

# 3. productbuild combines it into the user-facing .pkg.
SIGN_ARGS=()
if [[ -n "${APPLE_DEVELOPER_INSTALLER_IDENTITY:-}" ]]; then
    SIGN_ARGS=(--sign "$APPLE_DEVELOPER_INSTALLER_IDENTITY")
    echo "Signing with: $APPLE_DEVELOPER_INSTALLER_IDENTITY"
else
    echo "WARNING: APPLE_DEVELOPER_INSTALLER_IDENTITY unset — producing UNSIGNED .pkg (local-test-only)"
fi

productbuild \
    --distribution "$DIST_FILE" \
    --package-path "$OUT_DIR" \
    "${SIGN_ARGS[@]}" \
    "$DIST_PKG"

rm -f "$DIST_FILE" "$COMPONENT_PKG"
rm -rf "$PKG_SCRIPTS_DIR"

# 4. Notarization (optional).
if [[ -n "${APPLE_NOTARIZE_USER:-}" && -n "${APPLE_NOTARIZE_PASS:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    echo "Submitting to notarization service (this may take a few minutes)…"
    xcrun notarytool submit "$DIST_PKG" \
        --apple-id "$APPLE_NOTARIZE_USER" \
        --password "$APPLE_NOTARIZE_PASS" \
        --team-id "$APPLE_TEAM_ID" \
        --wait
    xcrun stapler staple "$DIST_PKG"
    echo "Notarized + stapled."
else
    echo "Skipping notarization (APPLE_NOTARIZE_USER / APPLE_NOTARIZE_PASS / APPLE_TEAM_ID not all set)."
fi

echo
echo "Built: $DIST_PKG"
ls -lh "$DIST_PKG"
