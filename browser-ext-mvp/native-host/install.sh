#!/usr/bin/env bash
# Install / uninstall the native messaging host manifest for Chrome, Brave,
# Edge, and Firefox. User-scope — no sudo needed. Safari handles native
# messaging via the containing app's SafariWebExtensionHandler.swift
# instead, so it's skipped.
#
# Usage:
#   ./install.sh            # install
#   ./install.sh --uninstall  (or -u)   # remove manifests
set -euo pipefail

HOST_NAME="com.ulriklyngs.mindshield"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Deploy the host outside ~/Documents / ~/Desktop / ~/Downloads so macOS
# TCC doesn't block the browser from executing it.
HOST_DEPLOY_DIR="$HOME/Library/Application Support/redd-block-mvp"
HOST_BIN="$HOST_DEPLOY_DIR/host.mjs"

# Chromium extension IDs allowed to talk to this host. Defaults to the
# published ReDD Focus ID; append unpacked/dev IDs via --chromium-id or the
# EXTRA_CHROMIUM_IDS env var (comma-separated).
CHROMIUM_IDS=("hhblkhfdjijdinijakbmcpkmdfhoadcd")
# Firefox extension IDs.
FIREFOX_IDS=("mindshield@example.com")

TARGET_DIRS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
)

MODE="install"
for arg in "$@"; do
  case "$arg" in
    -u|--uninstall) MODE="uninstall" ;;
    --chromium-id=*) CHROMIUM_IDS+=("${arg#--chromium-id=}") ;;
    --firefox-id=*)  FIREFOX_IDS+=("${arg#--firefox-id=}") ;;
    -h|--help)
      sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Also accept extra IDs via env (comma-separated).
if [[ -n "${EXTRA_CHROMIUM_IDS:-}" ]]; then
  IFS=',' read -ra _extra <<< "$EXTRA_CHROMIUM_IDS"
  CHROMIUM_IDS+=("${_extra[@]}")
fi

json_array() {
  local out="" id
  for id in "$@"; do
    [[ -n "$out" ]] && out+=",\n"
    out+="    \"$id\""
  done
  printf "%b" "$out"
}

chromium_manifest() {
  local origins=""
  for id in "${CHROMIUM_IDS[@]}"; do
    [[ -n "$origins" ]] && origins+=",\n"
    origins+="    \"chrome-extension://$id/\""
  done
  cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "ReDD Focus native host (MVP)",
  "path": "$HOST_BIN",
  "type": "stdio",
  "allowed_origins": [
$(printf "%b" "$origins")
  ]
}
EOF
}

firefox_manifest() {
  cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "ReDD Focus native host (MVP)",
  "path": "$HOST_BIN",
  "type": "stdio",
  "allowed_extensions": [
$(json_array "${FIREFOX_IDS[@]}")
  ]
}
EOF
}

manifest_for() {
  case "$1" in
    *Mozilla*) firefox_manifest ;;
    *)         chromium_manifest ;;
  esac
}

do_install() {
  # Resolve node's absolute path so the shebang works when the browser
  # spawns the host from GUI context (where PATH is stripped and tools
  # installed via fnm/nvm/homebrew aren't visible by default).
  local node_bin
  node_bin="$(command -v node || true)"
  if [[ -z "$node_bin" ]]; then
    echo "error: node not found on PATH. Install Node.js first." >&2
    exit 1
  fi

  mkdir -p "$HOST_DEPLOY_DIR"
  # Copy host.mjs and rewrite its shebang to an absolute path.
  {
    echo "#!$node_bin"
    tail -n +2 "$DIR/host.mjs"
  } > "$HOST_BIN"
  chmod +x "$HOST_BIN"
  echo "  deployed $HOST_BIN (shebang -> $node_bin)"
  for dir in "${TARGET_DIRS[@]}"; do
    mkdir -p "$dir"
    manifest_for "$dir" > "$dir/$HOST_NAME.json"
    echo "  wrote $dir/$HOST_NAME.json"
  done
  echo "Done. Restart the browser if it was already running."
}

do_uninstall() {
  local removed=0
  for dir in "${TARGET_DIRS[@]}"; do
    local f="$dir/$HOST_NAME.json"
    if [[ -f "$f" ]]; then
      rm -f "$f"
      echo "  removed $f"
      removed=$((removed + 1))
      # Clean up the NativeMessagingHosts dir if we emptied it, but only
      # if it exists and is empty — never touch non-empty vendor dirs.
      if [[ -d "$dir" ]] && [[ -z "$(ls -A "$dir" 2>/dev/null)" ]]; then
        rmdir "$dir" 2>/dev/null && echo "  cleaned empty $dir" || true
      fi
    fi
  done
  if [[ -d "$HOST_DEPLOY_DIR" ]]; then
    rm -rf "$HOST_DEPLOY_DIR"
    echo "  removed $HOST_DEPLOY_DIR"
  fi
  if [[ $removed -eq 0 ]]; then
    echo "Nothing to remove — no manifests named $HOST_NAME.json found."
  else
    echo "Removed $removed manifest(s). Restart the browser if it was running."
  fi
}

case "$MODE" in
  install)   echo "Installing native host manifests...";   do_install ;;
  uninstall) echo "Uninstalling native host manifests..."; do_uninstall ;;
esac
