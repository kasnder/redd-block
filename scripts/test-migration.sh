#!/usr/bin/env bash
# Manual setup/teardown for testing the v1.x → new-stack migration on macOS.
#
# Usage:
#   scripts/test-migration.sh inject     # backup hosts, add fake markers
#   scripts/test-migration.sh inject-with-backup  # also drop /etc/hosts.redd-backup
#   scripts/test-migration.sh check      # show current residue state
#   scripts/test-migration.sh restore    # restore /etc/hosts from our snapshot
#
# Test workflow:
#   1. scripts/test-migration.sh inject
#   2. cd src-tauri && cargo run --example test_migration
#   3. scripts/test-migration.sh check     # markers should be gone
#   4. scripts/test-migration.sh restore   # safety net (no-op if migration already cleaned)

set -euo pipefail

HOSTS=/etc/hosts
SNAPSHOT_DIR="${TMPDIR:-/tmp}/redd-migration-test"
SNAPSHOT="$SNAPSHOT_DIR/hosts.before-test"

mkdir -p "$SNAPSHOT_DIR"

cmd="${1:-help}"

case "$cmd" in
  inject|inject-with-backup)
    if [[ -e "$SNAPSHOT" ]]; then
      echo "Snapshot already exists at $SNAPSHOT — refusing to overwrite."
      echo "Run 'restore' first if you want to start fresh."
      exit 1
    fi
    echo "Snapshotting current $HOSTS to $SNAPSHOT (no sudo needed for read)."
    cp "$HOSTS" "$SNAPSHOT"
    chmod 600 "$SNAPSHOT"
    echo "Injecting fake legacy markers into $HOSTS (one admin prompt via osascript)."
    # Build the marker block in a temp file (user-writable) so the
    # elevated step is just a simple `cat tempfile >> /etc/hosts` —
    # no quoting nightmares through bash → AppleScript → sh.
    MARKER_TMP="$SNAPSHOT_DIR/markers.txt"
    cat > "$MARKER_TMP" <<'MARKER_EOF'

# === BEGIN REDD BLOCK (reddfocus.org) ===
0.0.0.0 redd-block-test-marker.invalid
# === END REDD BLOCK (reddfocus.org) ===
MARKER_EOF

    INJECT_CMD="cat '$MARKER_TMP' >> /etc/hosts"
    if [[ "$cmd" == "inject-with-backup" ]]; then
      INJECT_CMD="$INJECT_CMD && cp '$SNAPSHOT' /etc/hosts.redd-backup"
      echo "Also dropping /etc/hosts.redd-backup (legacy daemon's pre-mod copy)."
    fi
    /usr/bin/osascript -e "do shell script \"$INJECT_CMD\" with administrator privileges with prompt \"Test harness: inject legacy ReDD Block markers into /etc/hosts.\""
    rm -f "$MARKER_TMP"
    echo "Done. Now run: cd src-tauri && cargo run --example test_migration"
    ;;

  check)
    echo "=== /etc/hosts markers ==="
    if grep -E "REDD BLOCK|ReDD Block" "$HOSTS" >/dev/null; then
      grep -nE "REDD BLOCK|ReDD Block" "$HOSTS"
    else
      echo "(no markers)"
    fi
    echo
    echo "=== /etc/hosts.redd-backup ==="
    ls -l /etc/hosts.redd-backup 2>&1 | head -3 || true
    echo
    echo "=== app-data snapshots ==="
    ls -l "$HOME/Library/Application Support/com.reddblock/backups/" 2>&1 | head -10 || true
    echo
    echo "=== status marker(s) ==="
    ls -l "${TMPDIR:-/tmp}"/redd-migration-status.* 2>&1 | head -5 || true
    echo
    echo "=== test snapshot ==="
    ls -l "$SNAPSHOT" 2>&1 | head -3 || true
    ;;

  restore)
    if [[ ! -e "$SNAPSHOT" ]]; then
      echo "No snapshot at $SNAPSHOT — nothing to restore from."
      exit 1
    fi
    echo "Restoring $HOSTS from $SNAPSHOT (one admin prompt via osascript)."
    /usr/bin/osascript -e "do shell script \"cp '$SNAPSHOT' '$HOSTS' && dscacheutil -flushcache 2>/dev/null; killall -HUP mDNSResponder 2>/dev/null; rm -f /etc/hosts.redd-backup\" with administrator privileges with prompt \"Test harness: restore /etc/hosts from pre-test snapshot.\""
    echo "Removing test snapshot."
    rm -f "$SNAPSHOT"
    echo "Done. /etc/hosts is back to its pre-test state."
    ;;

  *)
    cat <<EOF
Usage: $0 {inject|inject-with-backup|check|restore}

  inject              Snapshot /etc/hosts, then add fake legacy markers.
  inject-with-backup  Same as inject, plus drop /etc/hosts.redd-backup
                      (so the migration takes the "prefer legacy backup"
                      code path instead of awk-stripping in place).
  check               Show current residue state (markers, backups, snapshots).
  restore             Roll /etc/hosts back to the pre-test snapshot.
EOF
    ;;
esac
