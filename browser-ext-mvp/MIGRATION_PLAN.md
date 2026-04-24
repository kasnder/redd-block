# Browser-Extension Migration Plan

One release collapses the desktop architecture to a single unprivileged
Tauri binary per OS. No hosts file, no privileged helper, no admin
prompt, no sudo. On first launch after upgrade the app migrates, strips
its hosts markers, uninstalls the helper, and never touches either
again.

## Target architecture

One Tauri binary per OS, running as the user.

| OS | Website blocking | App blocking |
| --- | --- | --- |
| macOS 14+ | Screen Time `ManagedSettings.WebContentSettings` | AppleScript hide, in-process (Accessibility TCC, no root) |
| Windows 10+ | ReDD Focus extension + native host + enforcer loop | `SetWinEventHook` + `ShowWindow`, in-process |

macOS <14 is not supported. Users get a "please upgrade macOS" screen.

### Why the split

Screen Time covers Safari for free with one system-level toggle — no
Safari Web Extension target, no per-browser extension install. Windows
has no equivalent, so the extension path is the only option there.

## Persistence (both OSes)

The app is its own enforcement engine, so it has to be running for
schedules to fire and blocks to expire.

- **Hide on close.** Intercept the window close event in Tauri; hide
  to tray / menu bar instead of quitting. Tray icon opens the UI back.
  Optionally make Cmd-Q / Alt-F4 confirm while a block is active.
- **Launch at login.**
  - macOS: `SMAppService.mainApp` (one API call, togglable in System
    Settings → Login Items) or a user-level `~/Library/LaunchAgents`
    plist with `RunAtLoad=true`.
  - Windows: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
    entry. No admin.
- **Relaunch on force-quit.**
  - macOS: launchd agent with `KeepAlive=true`.
  - Windows: user Scheduled Task with "Restart on failure".

All three layers are unprivileged. A motivated user can still disable
them; that's consistent with the self-binding philosophy (the override
challenge is the primary deterrent, not OS-level coercion).

## Work

### macOS
1. Extend `tauri-plugin-screentime` to a macOS target. Mirror the iOS
   plugin: `WebContentSettings` for websites, `DeviceActivityCenter` +
   `DeviceActivityMonitor` for schedules, App Group store for
   schedule payloads.
2. Add `com.apple.developer.family-controls` entitlement.
3. Onboarding: Screen Time authorization prompt. Denial shows a
   blocking screen with re-authorize action.
4. App blocking in-process via AppleScript (same logic as today's
   helper, just moved into the Tauri binary). Accessibility /
   Automation TCC prompt on first use; no root.
5. Raise minimum macOS to 14+.

### Windows
1. Port the three MVP prototypes to Rust inside the main Tauri binary:
   - `profile-scan/scan.mjs` → Tauri command,
   - `enforcer/enforce.mjs` → background loop,
   - `native-host/host.mjs` → `--native-host` CLI mode on the main
     binary. One signed artifact, reuses the app's blocklist derivation.
2. Land `reddfocus-patch.diff` upstream in the ReDD Focus repo.
3. Native messaging install: registry keys under
   `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\<name>`
   pointing at the Tauri binary. User scope, no UAC.
4. Onboarding: block the app until profile-scan reports
   `installed && enabled && privateBrowsing` on a running browser.
5. Enforcer loop: 5s tick, profile-scan each running browser, 30s
   grace + toast + "Fix now" deep link on failure, then
   `taskkill /IM <browser>.exe` (graceful → `/F` after N seconds).
6. App blocking in-process via `SetWinEventHook` + `ShowWindow`.
   Same logic as today's helper, just in the Tauri binary.

### One-time migration on first launch post-upgrade
1. Call `restore_hosts` to strip redd-block markers from the hosts file.
2. Uninstall the old helper (existing `uninstall` IPC, then delete the
   launchd plist / scheduled task, then remove the helper binary and
   state dir).
3. Register the user-level login item / keep-alive entry.
4. Set up the new backend (Screen Time auth / extension install check).
5. Delete the entire `helper-daemon/` crate and all hosts-related code
   from `src-tauri/` in the same release.

## What we're not doing

- No privileged helper.
- No hosts-file writes.
- No `blockingBackend` feature flag / `"both"` mode.
- No Safari Web Extension target.
- No backwards compatibility for macOS <14.
- No "keep blocking when the app is uninstalled." Uninstall removes
  the binary the login item points at, so enforcement stops. Simpler,
  and matches the new "app is the engine" model. If this feature turns
  out to be load-bearing, revisit with a small separate persistent
  binary in a later release.
- No Screen Time app shields on macOS, no force-install policies on
  Windows. Later if wanted.

## Risks

- **Screen Time authorization denied on macOS.** App is useless;
  mitigate with a clear blocking screen and a prominent re-authorize
  action.
- **Accessibility TCC denied on macOS.** App blocking stops working
  but website blocking still does. Surface a settings link.
- **Extension disabled on Windows.** Enforcer quits the browser after
  30s; prototype already validates the UX.
- **macOS <14 users.** Locked out until they upgrade the OS. Accept.
- **Store re-review** for the ReDD Focus extension patch. Single new
  permission (`nativeMessaging`); don't grow it.
- **User can defeat persistence.** Disabling the login item and
  killing the process defeats enforcement. Same philosophy as the
  override challenge — annoying, not uncrackable.
