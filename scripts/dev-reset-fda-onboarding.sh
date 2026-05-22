#!/usr/bin/env bash
# dev-reset-fda-onboarding.sh — restore "first-time user" state on
# macOS so the FDA onboarding flow can be re-tested against the
# already-installed .app, without having to reinstall the .pkg.
#
# Usage:
#   scripts/dev-reset-fda-onboarding.sh           # default: keep EULA + blocklists
#   scripts/dev-reset-fda-onboarding.sh --eula    # also reset EULA acceptance
#   scripts/dev-reset-fda-onboarding.sh --nuke    # delete everything (incl. blocklists)
#
# Always:
#   - Quits any running ReDD Block process.
#   - Resets every TCC consent for `com.reddblock` (FDA + per-prompt
#     data-isolation consents, etc.) so macOS treats the next launch
#     as a brand-new (app, target-container) pair.
#   - Removes our onboarding marker files so the FDA overlay and
#     native-host install both run again.
#   - Deletes the native-messaging manifests from each browser dir so
#     we observe them being installed fresh.
#   - Wipes the tauri-plugin-log file so the next launch's TCC probe
#     trace starts clean.
#
# Optional --eula also wipes EULA acceptance from redd-block-data.json
# so the EULA screen reappears (full first-time flow).
#
# Optional --nuke removes ~/Library/Application Support/com.reddblock
# wholesale (blocklists too — useful for a true "this is a new
# Mac" simulation).

set -euo pipefail

EULA=0
NUKE=0
for arg in "$@"; do
    case "$arg" in
        --eula) EULA=1 ;;
        --nuke) NUKE=1 ;;
        --help|-h)
            head -n 25 "$0" | sed 's|^# \{0,1\}||'
            exit 0
            ;;
        *)
            echo "unknown flag: $arg (try --help)" >&2
            exit 1
            ;;
    esac
done

APP_DATA_DIR="$HOME/Library/Application Support/com.reddblock"
LOG_FILE="$HOME/Library/Logs/com.reddblock/ReDD Block.log"

echo "==> Quitting any running ReDD Block process"
pkill -9 -f "ReDD Block.app/Contents/MacOS/redd-block" 2>/dev/null || true
pkill -9 -x "ReDD Block" 2>/dev/null || true
sleep 0.5

echo "==> Resetting all TCC consents for com.reddblock"
# `tccutil reset All <bundle-id>` clears every per-service decision
# (Full Disk Access, "data from other apps", Accessibility, etc.).
# Safe to re-run; idempotent.
tccutil reset All com.reddblock 2>&1 || echo "  (tccutil exited non-zero — usually means no consents to reset, harmless)"

if [[ "$NUKE" == "1" ]]; then
    echo "==> --nuke: removing entire ${APP_DATA_DIR}"
    rm -rf "$APP_DATA_DIR"
else
    echo "==> Removing onboarding marker files (blocklists preserved)"
    for marker in \
        fda-onboarded.v1 \
        native-host-install.v1 \
        extension-hints-installed.v1 \
        external-uninstalls-scrubbed.v1 \
        native-host-manifest.v1.fingerprint
    do
        if [[ -f "$APP_DATA_DIR/$marker" ]]; then
            rm -f "$APP_DATA_DIR/$marker"
            echo "  removed $marker"
        fi
    done

    if [[ "$EULA" == "1" ]]; then
        echo "==> --eula: wiping EULA acceptance from redd-block-data.json"
        local_data="$APP_DATA_DIR/redd-block-data.json"
        if [[ -f "$local_data" ]] && command -v jq >/dev/null 2>&1; then
            tmp=$(mktemp /tmp/redd-block-data.XXXXXX.json)
            jq 'if .settings then .settings |= (del(.eulaAcceptedRevision) | del(.eulaAcceptedAt) | del(.onboardingComplete) | del(.welcomeOnboardingShown)) else . end' \
                "$local_data" > "$tmp"
            mv "$tmp" "$local_data"
            echo "  cleared EULA fields"
        elif [[ ! -f "$local_data" ]]; then
            echo "  $local_data not found, nothing to do"
        else
            echo "  WARNING: jq not installed; install with 'brew install jq' or edit redd-block-data.json by hand"
        fi
    fi
fi

echo "==> Removing browser native-messaging manifests so install runs fresh"
for manifest in \
    "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.ulriklyngs.mindshield.json" \
    "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/com.ulriklyngs.mindshield.json" \
    "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.ulriklyngs.mindshield.json" \
    "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts/com.ulriklyngs.mindshield.json"
do
    if [[ -f "$manifest" ]]; then
        rm -f "$manifest"
        echo "  removed $(basename "$(dirname "$(dirname "$manifest")")")/$(basename "$(dirname "$manifest")")/$(basename "$manifest")"
    fi
done

echo "==> Wiping log file"
if [[ -f "$LOG_FILE" ]]; then
    : > "$LOG_FILE"
    echo "  truncated $LOG_FILE"
fi

cat <<EOF

==> Done. To test the first-time flow:

  1. (In one terminal) follow the log:
       tail -F "$LOG_FILE" | grep tcc-probe

  2. (Then) launch the app:
       open "/Applications/ReDD Block.app"

  Expected:
    - The 'tcc-probe: deferring native_host_install::install …' line
      appears at startup (no cross-app writes yet).
    - EULA screen (only if you passed --eula).
    - FDA onboarding overlay appears.
    - If you click 'Open Full Disk Access settings' and toggle ReDD
      Block on, the overlay auto-advances; no TCC prompts fire.
    - If you click 'Continue without', the deferred installs run NOW
      (you'll see 3 prompts: Chrome, Edge, Mozilla — Brave skipped
      if not installed) and the persistent banner appears on the
      main UI.
EOF
