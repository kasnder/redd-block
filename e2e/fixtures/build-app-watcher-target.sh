#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "app-watcher fixture requires macOS (swiftc + AppKit)" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_root="${APP_WATCHER_FIXTURE_OUTPUT_DIR:-${SYSTEM_TEST_ARTIFACTS_DIR:-${TMPDIR:-/tmp}/redd-block-system-test}/app-watcher-fixture}"
app_name="Digital Habits Test Target.app"
app_dir="${output_root}/${app_name}"
contents_dir="${app_dir}/Contents"
macos_dir="${contents_dir}/MacOS"
resources_dir="${contents_dir}/Resources"
binary="${macos_dir}/Digital Habits Test Target"

rm -rf "${app_dir}"
mkdir -p "${macos_dir}" "${resources_dir}"

swiftc \
  -O \
  -framework AppKit \
  "${repo_root}/e2e/fixtures/DigitalHabitsTestTarget.swift" \
  -o "${binary}"

cat > "${contents_dir}/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Digital Habits Test Target</string>
	<key>CFBundleExecutable</key>
	<string>Digital Habits Test Target</string>
	<key>CFBundleIdentifier</key>
	<string>org.digitalhabits.reddblock.appwatcherfixture</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>Digital Habits Test Target</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
</dict>
</plist>
PLIST

# Keep this fixture local-only. The system-test runner signs the blocker app;
# this target is intentionally unsigned and never copied to /Applications.
chmod +x "${binary}"
printf '%s\n' "${app_dir}"
