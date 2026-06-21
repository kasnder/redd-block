#!/usr/bin/env bash
# Upload Rum release installers to S3.
#
# Uses the same bucket, region, and key layout as redd-next download links:
#   https://redd-website-assets.s3.eu-north-1.amazonaws.com/reddblock/fristed-{version}.pkg
#   https://redd-website-assets.s3.eu-north-1.amazonaws.com/reddblock/redd-block_{version}_x64-setup.exe
#   https://redd-website-assets.s3.eu-north-1.amazonaws.com/reddblock/redd-block_{version}_arm64-setup.exe
#
# Env (matches redd-api/.env.example):
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
#   S3_ASSETS_BUCKET   default: redd-website-assets
#   S3_RELEASE_PREFIX  default: reddblock/
#
# Usage:
#   ./scripts/upload-release-to-s3.sh mac
#   ./scripts/upload-release-to-s3.sh windows
#   ./scripts/upload-release-to-s3.sh all

set -euo pipefail

PLATFORM="${1:?usage: $0 mac|windows|all}"

cd "$(dirname "$0")/.."

BUCKET="${S3_ASSETS_BUCKET:-redd-website-assets}"
PREFIX="${S3_RELEASE_PREFIX:-reddblock/}"
VERSION="$(node -p "require('./package.json').version")"

upload_file() {
  local file="$1"
  local content_type="$2"
  local key="${PREFIX}$(basename "$file")"
  echo "Uploading ${file} → s3://${BUCKET}/${key}"
  aws s3 cp "$file" "s3://${BUCKET}/${key}" \
    --content-type "$content_type" \
    --cache-control "public, max-age=31536000, immutable"
}

upload_mac() {
  local pkg="for-distribution/fristed-${VERSION}.pkg"
  if [[ ! -f "$pkg" ]]; then
    echo "Missing macOS installer: $pkg" >&2
    exit 1
  fi
  upload_file "$pkg" "application/octet-stream"
}

upload_windows() {
  shopt -s nullglob
  local files=(for-distribution/redd-block_${VERSION}_*-setup.exe)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "No Windows installers found for version ${VERSION}" >&2
    exit 1
  fi
  for file in "${files[@]}"; do
    upload_file "$file" "application/vnd.microsoft.portable-executable"
  done
}

case "$PLATFORM" in
  mac) upload_mac ;;
  windows) upload_windows ;;
  all)
    upload_mac
    upload_windows
    ;;
  *)
    echo "Unknown platform: $PLATFORM (expected mac, windows, or all)" >&2
    exit 1
    ;;
esac

echo "S3 upload complete."
