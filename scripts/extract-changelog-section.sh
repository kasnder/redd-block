#!/usr/bin/env bash
# Print the changelog.md section for a GitHub Release to stdout (markdown kept).
#
# Includes every non-empty ### section for that version — Branding, Focus Spaces
# & Blocking, Performance, Fixes & Polish, Internal, platform tags, and all
# other markdown styling. Stops before the next ## heading (so a
# "## vX.Y.Z (previous format)" twin is not included).
#
# Store "What's new" text is built separately by
# scripts/changelog-to-store-whats-new.js (filters Internal + platform tags).
#
# Usage:
#   ./scripts/extract-changelog-section.sh 3.8.9 > release-notes.md
#
# Expects a heading like "## v3.8.9" in changelog.md (exact match; not
# "## v3.8.9 (previous format)").

set -euo pipefail

VERSION="${1:?usage: $0 <version> [changelog.md]}"
CHANGELOG="${2:-changelog.md}"
TAG="v${VERSION}"

if [[ ! -f "$CHANGELOG" ]]; then
  echo "Missing ${CHANGELOG}" >&2
  exit 1
fi

SECTION="$(mktemp)"
trap 'rm -f "$SECTION"' EXIT

awk -v ver="$TAG" '
  BEGIN { found = 0 }
  # Exact version heading only (optional trailing whitespace).
  $0 ~ "^## " ver "[[:space:]]*$" { found = 1; next }
  found && /^## / { exit }
  found { print }
' "$CHANGELOG" > "$SECTION"

if [[ ! -s "$SECTION" ]]; then
  echo "No changelog section for ${TAG} in ${CHANGELOG} — add ## ${TAG} first." >&2
  exit 1
fi

# Drop trailing blank lines for a tidy GitHub Release body.
awk '
  { lines[NR] = $0 }
  END {
    end = NR
    while (end > 0 && lines[end] ~ /^[[:space:]]*$/) end--
    for (i = 1; i <= end; i++) print lines[i]
  }
' "$SECTION"
