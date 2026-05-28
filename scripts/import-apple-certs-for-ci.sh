#!/usr/bin/env bash
# Import Apple code-signing identities into an ephemeral CI keychain.
#
# Required env:
#   APPLE_CERTIFICATE_BASE64       Developer ID Application .p12 (base64)
#   APPLE_CERTIFICATE_PASSWORD     password for Application .p12
#   KEYCHAIN_PASSWORD              ephemeral keychain password
#
# Optional env (if Application + Installer were exported separately):
#   APPLE_INSTALLER_CERTIFICATE_BASE64
#   APPLE_INSTALLER_CERTIFICATE_PASSWORD   defaults to APPLE_CERTIFICATE_PASSWORD
#
# Optional verification:
#   APPLE_DEVELOPER_INSTALLER_IDENTITY     e.g. "Developer ID Installer: …"

set -euo pipefail

: "${APPLE_CERTIFICATE_BASE64:?APPLE_CERTIFICATE_BASE64 is required}"
: "${APPLE_CERTIFICATE_PASSWORD:?APPLE_CERTIFICATE_PASSWORD is required}"
: "${KEYCHAIN_PASSWORD:?KEYCHAIN_PASSWORD is required}"

KEYCHAIN_PATH="${KEYCHAIN_PATH:-$RUNNER_TEMP/app-signing.keychain-db}"

import_p12() {
  local label="$1"
  local b64="$2"
  local password="$3"
  local path="$RUNNER_TEMP/${label}.p12"

  echo "Importing ${label} certificate..."
  echo "$b64" | base64 --decode > "$path"
  security import "$path" \
    -P "$password" \
    -A -t cert -f pkcs12 -quiet \
    -T /usr/bin/codesign \
    -T /usr/bin/productbuild \
    -k "$KEYCHAIN_PATH"
}

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

import_p12 "application" "$APPLE_CERTIFICATE_BASE64" "$APPLE_CERTIFICATE_PASSWORD"

if [ -n "${APPLE_INSTALLER_CERTIFICATE_BASE64:-}" ]; then
  INSTALLER_PASSWORD="${APPLE_INSTALLER_CERTIFICATE_PASSWORD:-$APPLE_CERTIFICATE_PASSWORD}"
  import_p12 "installer" "$APPLE_INSTALLER_CERTIFICATE_BASE64" "$INSTALLER_PASSWORD"
fi

security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH"
security default-keychain -s "$KEYCHAIN_PATH"

if [ -n "${GITHUB_ENV:-}" ]; then
  {
    echo "KEYCHAIN_PATH=$KEYCHAIN_PATH"
    echo "KEYCHAIN_PASSWORD=$KEYCHAIN_PASSWORD"
  } >> "$GITHUB_ENV"
fi

echo ""
echo "Code signing identities available in CI keychain:"
security find-identity -v -p codesigning "$KEYCHAIN_PATH" || true
echo ""
echo "Installer / productbuild identities:"
security find-identity -v "$KEYCHAIN_PATH" | grep "Developer ID Installer" || true

if [ -n "${APPLE_DEVELOPER_INSTALLER_IDENTITY:-}" ]; then
  if ! security find-identity -v "$KEYCHAIN_PATH" | grep -F "${APPLE_DEVELOPER_INSTALLER_IDENTITY}" >/dev/null; then
    echo ""
    echo "ERROR: APPLE_DEVELOPER_INSTALLER_IDENTITY is set but not found in the keychain:" >&2
    echo "  ${APPLE_DEVELOPER_INSTALLER_IDENTITY}" >&2
    echo "" >&2
    echo "Fix: export the Developer ID Installer private key as .p12 and add" >&2
    echo "APPLE_INSTALLER_CERTIFICATE_BASE64 (or include both certs in one .p12)." >&2
    exit 1
  fi
  echo ""
  echo "Installer identity OK: ${APPLE_DEVELOPER_INSTALLER_IDENTITY}"
fi
