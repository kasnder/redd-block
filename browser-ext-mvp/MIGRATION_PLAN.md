# Browser-Extension Migration Plan

One release flips desktop website blocking off `/etc/hosts` entirely.
No feature flag, no dual-run, no opt-in. On first launch after upgrade
the app migrates, strips its hosts markers, and never touches the hosts
file again.

## Per-OS backend

| OS | Websites | Apps |
| --- | --- | --- |
| macOS 14+ | Screen Time `ManagedSettings.WebContentSettings` | Helper (unchanged) |
| Windows 10+ | ReDD Focus extension + Rust native host + enforcer loop | Helper (unchanged) |
| macOS <14 | Not supported — prompt to upgrade macOS | Not supported |

### Why split instead of extension-on-both

Screen Time covers Safari for free. The alternative (ship a Safari Web
Extension bundled inside the signed `.app` with a
`SafariWebExtensionHandler`) is real engineering effort and still
leaves users with a manual "Enable in Safari" step. Windows has no
Screen Time equivalent, so the extension path is the only option there.

## Work

### macOS
1. Extend `tauri-plugin-screentime` to a macOS target. Mirror the iOS
   plugin: `WebContentSettings` for websites, `DeviceActivityCenter` +
   `DeviceActivityMonitor` for schedules, App Group store for
   schedule payloads.
2. Add `com.apple.developer.family-controls` entitlement to the macOS
   Xcode target and `tauri.macos.conf.json`.
3. Onboarding prompts Screen Time authorization. Denial shows a
   blocking screen with a "re-authorize" action — the app doesn't
   block anything without it.
4. App blocking stays in the helper (AppleScript hide). Unchanged.
5. Raise minimum macOS to 14+. On older versions, show an
   "upgrade macOS" message and exit.

### Windows
1. Port the three MVP prototypes to Rust:
   - `profile-scan/scan.mjs` → Tauri command,
   - `enforcer/enforce.mjs` → loop inside the Tauri backend,
   - `native-host/host.mjs` → `--native-host` CLI mode on the main
     Tauri binary (one signed artifact, reuses blocklist derivation).
2. Land `reddfocus-patch.diff` upstream in the ReDD Focus repo. The
   standalone-safety rules in `browser-ext-mvp/README.md` still apply.
3. Native host reads `redd-block-data.json`, derives the current
   blocklist, watches the file + 30s poll for schedule transitions,
   pushes `{ blocklist: [...] }` to the extension. Empty set when
   nothing is active.
4. Onboarding: block the app until profile-scan reports
   `installed && enabled && privateBrowsing` on a running browser.
   Deep-link to Web Store / AMO / Add-ons.
5. Enforcer loop (5s tick): for each running browser, profile-scan;
   on failure, 30s grace with a persistent toast + "Fix now" deep
   link (`chrome://extensions/?id=<id>` / `about:addons`), then
   `taskkill /IM <browser>.exe` (graceful) → `/F` after N seconds.
6. Windows native-host install writes registry keys under
   `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\<name>`.
   User scope, no UAC.
7. App blocking stays in the helper (`SetWinEventHook`). Unchanged.

### One-time migration on first launch post-upgrade
1. Call the existing `restore_hosts` helper command to strip redd-block
   markers from the hosts file.
2. Drop any helper state fields that only existed for hosts-based
   enforcement.
3. Set up the new backend (Screen Time auth prompt / extension install
   check).
4. Delete the hosts-rendering code from `helper-daemon/src/main.rs` in
   the same release.

## What we're not doing

- No `blockingBackend` feature flag. No `"both"` mode.
- No Safari Web Extension target.
- No backwards compatibility for macOS <14.
- No gradual cleanup phase — hosts code goes away in this release.
- No Screen Time app shields, no force-install policies. Later if wanted.

## Risks

- **Screen Time authorization denied on macOS.** The app doesn't block
  anything. Mitigate with a clear blocking screen and a prominent
  re-authorize action.
- **Extension uninstalled / disabled on Windows.** Enforcer quits the
  browser after 30s. Prototype already validates the UX.
- **macOS <14 users.** Locked out until they upgrade the OS. Accept.
- **Store re-review for the ReDD Focus extension patch.** Single new
  permission (`nativeMessaging`); don't grow it.
