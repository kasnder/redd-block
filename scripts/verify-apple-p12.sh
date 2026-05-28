#!/usr/bin/env bash
# Check what signing identities a .p12 actually contains (run locally).
#
# Usage:
#   ./scripts/verify-apple-p12.sh ~/Desktop/Certificates.p12
#   ./scripts/verify-apple-p12.sh ~/Desktop/Certificates.p12 'your-export-password'

set -euo pipefail

P12="${1:?usage: $0 path/to/file.p12 [password]}"
PASSWORD="${2:-}"

if [ ! -f "$P12" ]; then
  echo "File not found: $P12" >&2
  exit 1
fi

if [ -z "$PASSWORD" ]; then
  read -r -s -p "Export password: " PASSWORD
  echo ""
fi

TMP="$(mktemp -d)"
KC="$TMP/test.keychain-db"

cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

security create-keychain -p test "$KC"
security unlock-keychain -p test "$KC"
security set-keychain-settings -lut 21600 "$KC"
security import "$P12" -k "$KC" -P "$PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/productbuild
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k test "$KC"

echo ""
echo "Identities in this .p12:"
echo "------------------------"
security find-identity -v "$KC"
echo ""

VALID="$(security find-identity -v "$KC" | grep -c 'valid identities found' || true)"
APP="$(security find-identity -v "$KC" | grep -c 'Developer ID Application' || true)"
INSTALLER="$(security find-identity -v "$KC" | grep -c 'Developer ID Installer' || true)"

echo "Summary:"
echo "  Developer ID Application lines:  $APP"
echo "  Developer ID Installer lines:    $INSTALLER"
echo ""
echo "For CI, copy the Installer line EXACTLY into APPLE_DEVELOPER_INSTALLER_IDENTITY:"
security find-identity -v "$KC" | sed -n 's/^[[:space:]]*[0-9]*) \([0-9A-F]*\) "\(.*\)"/\2/p' | grep 'Developer ID Installer' || echo "  (none found — re-export with the Installer private key)"
