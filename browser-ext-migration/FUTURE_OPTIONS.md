# Future Options

Design notes for ideas explored during the browser-extension migration and
intentionally parked for the v2.0 release.

## A. Localhost HTTP Fallback Transport

Goal: recover Chrome / Brave / Edge / Firefox users when native-messaging
installation is broken, and keep a second transport available if the Safari
App Group container becomes unreadable.

- Tauri runs `tiny_http` on `127.0.0.1:33321`, walking `33321..=33330` on
  `EADDRINUSE`.
- Discovery file lives at `<app-data>/blocklist-port.txt`.
- `GET /blocklist` returns the same `{blocklist, blocks}` payload as native
  messaging.
- `POST /status` accepts `{installed, enabled, privateBrowsing, browser, version}`.
- `background.js` falls back when `connectNative` is unavailable, returns
  null, or disconnects with an error within about 5 seconds.
- Extension manifest would need loopback `host_permissions` for
  `http://127.0.0.1:33321/*` through `http://127.0.0.1:33330/*`.
- Security model is unchanged in practice: any local process can read the
  blocklist, which is acceptable under the app's self-binding trust model.
- Estimated cost: about 150 LOC Rust, 80 LOC JS, plus extension store re-review.

## B. Signed `.pkg` Installer

Goal: collapse the macOS v1.x to v2.0 upgrade cleanup into install time so the
user pays the admin prompt during install instead of on first launch.

- [scripts/build-mac-pkg.sh](/Users/konrad.kollnig/Documents/redd-block/scripts/build-mac-pkg.sh)
  already wraps the Tauri-built `.app` with `pkgbuild` and `productbuild`.
- Preinstall would run the same cleanup logic as the in-app migration, with
  the script body kept single-source via `include_str!`.
- Postinstall would open the new app for the invoking user.
- Distribution requires a `Developer ID Installer` certificate in addition to
  the existing `Developer ID Application` certificate.
- Environment variables would be
  `APPLE_DEVELOPER_INSTALLER_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and
  `APPLE_TEAM_ID`.
- This stays parked because the `.dmg` plus first-launch migration is already
  verified end-to-end and good enough for the current release.
- Estimated extra work: no net-new code, plus about 30 minutes of Apple
  certificate setup.
