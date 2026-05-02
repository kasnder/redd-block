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
# Env vars (auto-sourced from .env if present):
#   APPLE_DEVELOPER_INSTALLER_IDENTITY  — "Developer ID Installer: ..."
#   APPLE_NOTARIZE_USER, APPLE_NOTARIZE_PASS, APPLE_TEAM_ID  (optional, for notarization)
# If APPLE_DEVELOPER_INSTALLER_IDENTITY is unset, produces an unsigned
# .pkg suitable for local testing only.
#
# Picks up the same BUILD_MAC_TARGET as scripts/build-mac.sh (default
# "universal-apple-darwin") so the .pkg wraps the universal .app.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# Source .env for signing/notarization creds, like build-mac.sh does.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PROFILE="debug"
if [[ "${1:-}" == "--release" ]]; then
    PROFILE="release"
fi

APP_NAME="ReDD Block"
BUNDLE_ID="com.reddblock"
SCRIPTS_DIR="scripts/macos-pkg/scripts"

# Match build-mac.sh: universal build by default so the resulting .pkg works on
# both Intel and Apple Silicon. Set BUILD_MAC_TARGET="" to use the legacy
# arch-less path produced by a plain `tauri build` (single arch).
BUILD_TARGET="${BUILD_MAC_TARGET-universal-apple-darwin}"

resolve_bundle_base() {
    local target="$1"
    if [[ -n "$target" ]]; then
        echo "src-tauri/target/${target}/${PROFILE}/bundle"
    else
        echo "src-tauri/target/${PROFILE}/bundle"
    fi
}

BUNDLE_BASE="$(resolve_bundle_base "$BUILD_TARGET")"
APP_PATH="${BUNDLE_BASE}/macos/${APP_NAME}.app"

# Fall back to the legacy non-target path if the targeted .app is missing
# (e.g. someone ran a plain `tauri build` instead of `npm run build:mac`).
if [[ ! -d "$APP_PATH" && -n "$BUILD_TARGET" ]]; then
    LEGACY_BUNDLE_BASE="$(resolve_bundle_base "")"
    LEGACY_APP_PATH="${LEGACY_BUNDLE_BASE}/macos/${APP_NAME}.app"
    if [[ -d "$LEGACY_APP_PATH" ]]; then
        echo "Note: '${APP_PATH}' missing, falling back to '${LEGACY_APP_PATH}'."
        BUNDLE_BASE="$LEGACY_BUNDLE_BASE"
        APP_PATH="$LEGACY_APP_PATH"
    fi
fi

if [[ ! -d "$APP_PATH" ]]; then
    echo "ERROR: $APP_PATH not found."
    echo "       Run 'npm run build:mac' first (or 'npm run tauri build' for a single-arch dev build)."
    exit 1
fi

# Pull version from tauri.conf.json so the .pkg filename matches.
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
echo "Building .pkg for ${APP_NAME} ${VERSION} (${PROFILE})"

OUT_DIR="${BUNDLE_BASE}/pkg"
mkdir -p "$OUT_DIR"

COMPONENT_PKG="$OUT_DIR/component.pkg"
DIST_PKG="$OUT_DIR/${APP_NAME// /-}-${VERSION}.pkg"
DIST_DIR=$(mktemp -d /tmp/redd-block-dist.XXXXXX)
DIST_FILE="$DIST_DIR/distribution.xml"

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
    "${SIGN_ARGS[@]+"${SIGN_ARGS[@]}"}" \
    "$DIST_PKG"

rm -rf "$DIST_DIR" "$PKG_SCRIPTS_DIR"
rm -f "$COMPONENT_PKG"

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

# Mirror build-mac.sh: also drop a copy in for-distribution/ so all shippable
# artifacts (.app, .dmg, .pkg) live in one well-known folder.
mkdir -p for-distribution
DIST_PKG_COPY="for-distribution/$(basename "$DIST_PKG")"
cp "$DIST_PKG" "$DIST_PKG_COPY"
echo "Copied to: $DIST_PKG_COPY"
