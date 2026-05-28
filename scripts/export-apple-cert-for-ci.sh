#!/usr/bin/env bash
# Encode an exported Apple .p12 for the GitHub Actions secret
# APPLE_CERTIFICATE_BASE64.
#
# 1. Keychain Access → select Developer ID Application + Installer
#    (both must include private keys) → File → Export Items → .p12
# 2. Run:
#      ./scripts/export-apple-cert-for-ci.sh path/to/certificate.p12
# 3. Paste into GitHub → Settings → Secrets → APPLE_CERTIFICATE_BASE64
# 4. Use the .p12 export password as APPLE_CERTIFICATE_PASSWORD

set -euo pipefail

FILE="${1:?usage: $0 path/to/certificate.p12}"

if [ ! -f "$FILE" ]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

echo "Base64 for APPLE_CERTIFICATE_BASE64 (single line, copied to clipboard if pbcopy exists):"
base64 -i "$FILE" | tr -d '\n' | tee /dev/stderr | pbcopy 2>/dev/null && echo "(copied to clipboard)" || true
