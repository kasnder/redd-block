#!/bin/bash
# Submit a (signed, hardened-runtime) .app to Apple's notarization
# service, wait for the verdict, and staple the resulting ticket.
#
# Required for pluginkit on macOS 26 to register Safari Web
# Extensions embedded in the host app — without a stapled ticket the
# host app reports as "Unnotarized Developer ID" and pluginkit
# silently refuses to load the embedded .appex (Tahoe is stricter
# than older releases on this).
#
# Usage:
#   scripts/notarize-app.sh <path-to-app>
#
# Env vars (required unless SAFARI_EXT_SKIP_NOTARIZE=1):
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
#
# Env vars (optional):
#   SAFARI_EXT_SKIP_NOTARIZE=1  Skip the network round-trip.
#                               Useful for fast dev iteration when
#                               you don't need pluginkit to load the
#                               embedded extension yet.

set -euo pipefail

APP_PATH="${1:?usage: $0 <path-to-app>}"

if [ ! -d "$APP_PATH" ]; then
  echo "notarize-app: '$APP_PATH' is not a directory" >&2
  exit 1
fi

if [ "${SAFARI_EXT_SKIP_NOTARIZE:-}" = "1" ]; then
  echo "notarize-app: SAFARI_EXT_SKIP_NOTARIZE=1 — skipping (Safari extension WILL NOT load until you re-run without the flag)"
  exit 0
fi

# Fast path: if Apple's notary service already has a ticket for this
# bundle's CDHash — e.g., a previous run uploaded successfully but
# died before stapler could write the ticket to disk (OOM kill,
# closed terminal, network drop) — `stapler staple` will fetch it
# directly without re-uploading. Saves a 5-min notary round-trip on
# any build resumed after an interrupted notarize.
#
# stapler returns non-zero when no ticket is on file (fresh build),
# so we suppress its output and fall through to the full submit.
if xcrun stapler staple "$APP_PATH" >/dev/null 2>&1; then
  echo "notarize-app: existing ticket found on Apple's servers — stapled without re-submitting"
  spctl --assess --type execute --verbose=4 "$APP_PATH" 2>&1 | sed 's/^/  /'
  echo "notarize-app: done."
  exit 0
fi

: "${APPLE_ID:?APPLE_ID env var required for notarization}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD env var required for notarization}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID env var required for notarization}"

# notarytool requires a zip/pkg/dmg payload, not a raw .app, so we
# zip into a temp file. Using ditto preserves resource forks /
# extended attrs, which `zip` would mangle.
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

ZIP_PATH="$WORKDIR/notarize-payload.zip"
echo "notarize-app: zipping $APP_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "notarize-app: submitting to Apple — this typically takes 1–5 min..."
xcrun notarytool submit "$ZIP_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo "notarize-app: stapling ticket onto $APP_PATH"
xcrun stapler staple "$APP_PATH"

# Quick sanity-check — spctl should now accept it.
echo "notarize-app: verifying with spctl..."
spctl --assess --type execute --verbose=4 "$APP_PATH" 2>&1 | sed 's/^/  /'
echo "notarize-app: done."
