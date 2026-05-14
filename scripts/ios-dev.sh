#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPORT_DIR="$ROOT_DIR/src-tauri/gen/apple"
ACTIVE_EXPORT_OPTIONS="$EXPORT_DIR/ExportOptions.plist"
DEV_EXPORT_OPTIONS="$EXPORT_DIR/ExportOptions.dev.plist"
BACKUP_EXPORT_OPTIONS="$(mktemp "$EXPORT_DIR/ExportOptions.plist.backup.XXXXXX")"

cp "$ACTIVE_EXPORT_OPTIONS" "$BACKUP_EXPORT_OPTIONS"

cleanup() {
  if [[ -f "$BACKUP_EXPORT_OPTIONS" ]]; then
    mv "$BACKUP_EXPORT_OPTIONS" "$ACTIVE_EXPORT_OPTIONS"
  fi
}

trap cleanup EXIT INT TERM

cp "$DEV_EXPORT_OPTIONS" "$ACTIVE_EXPORT_OPTIONS"

PATH="$ROOT_DIR/scripts:$PATH" \
APPLE_DEVELOPMENT_TEAM=JD647S9RT6 \
tauri ios dev --host "$@"
