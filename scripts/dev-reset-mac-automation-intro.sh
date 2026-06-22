#!/usr/bin/env bash
# dev-reset-mac-automation-intro.sh — re-test the one-time macOS
# Automation upgrade intro modal without wiping blocklists or EULA.
#
# Usage:
#   scripts/dev-reset-mac-automation-intro.sh
#   npm run dev
#
# IMPORTANT — do NOT re-accept the EULA after this. Launch straight into
# the app (EULA should already be accepted). Re-accepting EULA triggers
# the full first-run browser-setup overlay instead of the one-off intro.
#
# The intro shows when ALL of these are true on next launch:
#   - macOS, EULA already accepted, welcome already seen
#   - onboardingComplete OR extension setup previously dismissed
#   - Automation is NOT granted for every installed Automation browser
#   - Safari and/or Chrome/Brave/Edge is installed
#
# Turn Automation off first:
#   System Settings → Privacy & Security → Automation → Fristed off

set -euo pipefail

EXT_DISMISS_KEY='reddBlockExtOnboardingDismissed'

echo "==> Quitting any running Fristed process"
pkill -9 -f "Fristed.app/Contents/MacOS/redd-block" 2>/dev/null || true
pkill -9 -f "tauri dev" 2>/dev/null || true
pkill -9 -x "Fristed" 2>/dev/null || true
sleep 0.5

echo "==> Resetting Automation / TCC for com.reddblock"
tccutil reset All com.reddblock 2>&1 || echo "  (tccutil note: harmless if nothing to reset)"

patch_data_file() {
    local data_file="$1"
    [[ -f "$data_file" ]] || return 0
    if ! command -v jq >/dev/null 2>&1; then
        echo "  WARNING: jq not installed; could not edit $data_file"
        return 0
    fi
    local tmp
    tmp=$(mktemp /tmp/redd-block-data.XXXXXX.json)
    jq '.settings |= (. // {} |
        del(.macAutomationIntroShown) |
        .onboardingComplete = true |
        .welcomeOnboardingShown = true |
        .eulaAcceptedRevision = (.eulaAcceptedRevision // 1))' \
        "$data_file" > "$tmp"
    if [[ -w "$data_file" ]]; then
        mv "$tmp" "$data_file"
    elif command -v sudo >/dev/null 2>&1; then
        sudo mv "$tmp" "$data_file"
        echo "  (wrote via sudo — $data_file is not user-writable)"
    else
        rm -f "$tmp"
        echo "  WARNING: could not write $data_file"
        return 0
    fi
    echo "  reset intro flag + ensured returning-user markers in $data_file"
}

echo "==> Resetting macAutomationIntroShown (keeps blocklists)"
for data_file in \
    "/var/lib/redd-block/redd-block-data.json" \
    "$HOME/Library/Application Support/com.reddblock/redd-block-data.json" \
    "$HOME/Library/Application Support/redd-block/redd-block-data.json" \
    "$HOME/Library/Application Support/com.redd.block/redd-block-data.json"
do
    patch_data_file "$data_file"
done

echo "==> Ensuring extension-setup dismiss key in webview localStorage"
if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "  WARNING: sqlite3 not found; skip localStorage"
else
    ts=$(date +%s)
    found=0
    while IFS= read -r db; do
        sqlite3 "$db" "INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('${EXT_DISMISS_KEY}', '${ts}');" 2>/dev/null || continue
        echo "  set ${EXT_DISMISS_KEY} in $db"
        found=1
    done < <(find "$HOME/Library/WebKit/com.reddblock" -name localstorage.sqlite3 2>/dev/null)
    if [[ "$found" == "0" ]]; then
        echo "  no com.reddblock localStorage yet — launch once, then re-run this script"
    fi
fi

cat <<EOF

==> Done. To see the intro modal:

  1. Turn Automation OFF for Fristed in System Settings
     (Privacy & Security → Automation) for Chrome/Safari/etc.

  2. Launch WITHOUT re-accepting the EULA:
       npm run dev

  The intro appears on startup — not after clicking through EULA.
  If you still get the full browser-setup screen, EULA was reset or
  onboardingComplete is missing from your data file.
EOF
