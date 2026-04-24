# Browser-Extension Migration Plan

> **Status (branch `claude/plan-extension-migration-J9CTL`)**
>
> First-pass implementation has landed. None of it has been
> compile-tested — this environment has no Rust toolchain, no Xcode,
> no Mac, no Windows. Needs a desktop build pass on real hardware
> before it can ship.

## Landed on the branch

- `src-tauri/src/native_host.rs` — `--native-host` CLI mode, stdio
  framing, file-watch + 30 s poll, blocklist derivation.
- `src-tauri/src/profile_scan.rs` — Rust port of the MVP scanner.
  Safari `privateBrowsing` relaxed to "trust the extension to
  self-report" rather than demand Full Disk Access.
- `src-tauri/src/enforcer.rs` — 5 s tick, 60 s/30 s grace,
  `enforcer://grace-update` / `grace-resolved` events,
  `taskkill` / `osascript quit`.
- `src-tauri/src/native_host_install.rs` — per-browser manifest JSON
  on macOS/Linux, `HKCU\…\NativeMessagingHosts` registry keys on
  Windows. User-scope only.
- `src-tauri/src/app_watcher.rs` — in-process AppleScript
  NSWorkspace watcher + System Events hide (macOS),
  `SetWinEventHook` + `ShowWindow(SW_FORCEMINIMIZE)` (Windows).
- `src-tauri/src/macos_permissions.rs` — Automation TCC
  `check` / `request` / `open_automation_settings` /
  `open_accessibility_settings` commands.
- `src-tauri/src/commands/migration.rs` — `strip_hosts_markers`,
  `uninstall_legacy_helper`, `run_upgrade_migration` (idempotent,
  version-gated via `settings.migrationRanAtVersion`), and
  `onboarding_state` orchestrator.
- `src-tauri/src/commands/helper_shim.rs` — legacy `*_via_helper`
  command names kept as shims routed to the new backends so
  `src/app.js` doesn't need to be rewritten in this pass.
- `helper-daemon/` crate deleted. `scripts/*helper*` deleted.
  `package.json` scripts scrubbed.
- `tauri-plugin-autostart` added, hide-on-close wired in `lib.rs`.
- `browser-ext-mvp/safari-handler/SafariWebExtensionHandler.swift`
  — reference implementation of the Safari native-messaging
  handler, to be dropped into the Xcode project's Safari extension
  target.
- `src/index.html` + `src/app.js` — two new banners
  (`automation-permission-banner`, `extension-compliance-banner`)
  + `runDesktopOnboarding()` driven by `onboarding_state`; window
  `focus` listener re-runs the check when the user returns from
  System Settings / the extension store.
- `README.md` + `changelog.md` + `architecture.md` banner updated.

## Manual checks / follow-ups needed on real hardware

### Build / compile
- [ ] `cargo check` in `src-tauri/` on macOS. Likely fallout:
      `tauri-plugin-autostart` API surface may have changed; `windows`
      crate feature flags may need additions (`Win32_UI_Accessibility`,
      `Win32_System_Diagnostics_ToolHelp`, etc. are declared but
      untested); `sysinfo` 0.32 API may have shifted (`refresh_processes`
      signature).
- [ ] `cargo check` on Windows. Same concerns, plus the `HKCU` write
      path in `native_host_install.rs` uses `RegSetValueExW` — verify
      the slice-of-bytes length / wide-string encoding is right on
      real Windows.
- [ ] First `cargo build` will almost certainly surface trait import
      issues in `app_watcher.rs` (Windows `SetWinEventHook` callback
      signature, `PostThreadMessageW` arg types).

### macOS specifics
- [ ] Confirm the osascript error-string check in
      `macos_permissions::check_automation_permission` catches the
      actual error text emitted by the target macOS versions.
      Current match is on `"not authorized"` / `"-1743"`. macOS 14/15
      have changed the wording at least once; tweak the substring
      match as needed.
- [ ] Verify `x-apple.systempreferences:com.apple.preference.security
      ?Privacy_Automation` still deep-links into the right panel on
      the target macOS versions. macOS 13 reorganised System
      Settings; the URL scheme has been stable but verify.
- [ ] `uninstall_legacy_helper` uses `osascript` with
      `"with administrator privileges"` to bootout the launchd daemon.
      Test that the prompt wording is acceptable and that the command
      returns a usable status code when the user cancels.
- [ ] AppleScript NSWorkspace watcher in `app_watcher.rs` uses a
      persistent `osascript` subprocess emitting lines on stderr.
      Test: does it stay running reliably, does Accessibility TCC
      cover the subprocess too, does it recover cleanly when osascript
      crashes.
- [ ] Safari bundle ID `com.ulriklyngs.mind-shield.mind-shield` in
      `profile_scan.rs::SAFARI_BUNDLE_ID` must match what the Safari
      Web Extension target uses once it's added to Xcode.
- [ ] Add the Safari Extension target in Xcode; drop in
      `browser-ext-mvp/safari-handler/SafariWebExtensionHandler.swift`;
      confirm signing + notarisation flow for the expanded bundle.

### Windows specifics
- [ ] Smoke-test the `SetWinEventHook` path in `app_watcher.rs`
      against a real blocked app. Known concerns: the hook callback
      uses a `static mut CURRENT: Option<BlockedApps>` pointer — not
      `Sync`; move to a safer shared-state idiom before shipping.
- [ ] `PostThreadMessageW(tid, WM_QUIT, ...)` for watcher shutdown —
      verify the thread id captured during hook install matches the
      thread running the message loop.
- [ ] `taskkill /IM <browser>.exe` then `/F` after a delay. Confirm
      the grace-to-hard-kill delay (10 s) is long enough for a real
      browser to flush its state, short enough for a focus app.
- [ ] Registry key write for the native-messaging manifest:
      `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\<name>`.
      Verify the key exists after install + gets picked up on the
      next browser launch.
- [ ] NSIS installer `windows/hooks.nsh` still has a
      "Keep Blocking after uninstall" message that's been removed
      from the feature set. Update or remove.

### Frontend
- [ ] The `extension-compliance-banner` Install button currently
      links to `reddfocus.org/tools/reddblock`. Better: use
      `state.browsers` to deep-link to the store for the specific
      browser that's failing (Chrome Web Store / Firefox AMO / Edge
      Add-ons / Safari → enable in Safari Settings).
- [ ] Full rewrite of `src/app.js` to call new commands
      (`scan_browser_profiles`, `set_blocked_apps`, Screen Time
      plugin commands) directly instead of the `*_via_helper` shim.
      Delete `commands/helper_shim.rs` after.
- [ ] Run the `runPostAcceptanceStartup` flow on a v1.0.x-upgraded
      install end-to-end: the migration should strip hosts markers,
      prompt for admin to remove the helper, register autostart +
      native-host manifests, and surface the extension-install
      banner until the user installs ReDD Focus.

### External / out-of-band
- [ ] Land `browser-ext-mvp/reddfocus-patch.diff` in the
      `reddfocus-open-source` repo (separate, not committed here).
- [ ] Republish ReDD Focus to Chrome Web Store / Firefox AMO /
      Edge Add-ons with the added `nativeMessaging` permission —
      triggers a re-review on each.
- [ ] Decide on a Chromium extension ID that matches
      `profile_scan::CHROMIUM_ID`
      (`hhblkhfdjijdinijakbmcpkmdfhoadcd`) and
      `native_host_install::CHROMIUM_EXT_ID`. If the store listing
      gets republished under a new ID, both constants must update.

### Documentation
- [ ] `scripts/manual-test-checklist.md` — rewrite for the new
      flows: extension install compliance + enforcer grace timer,
      hide-on-close + launch-at-login, first-launch migration from
      v1.0.x, Automation TCC permission grant / deny / recover.
- [ ] `architecture.md` — full rewrite of sections 4–9 once the
      code shape is validated on hardware. Banner at the top of the
      file marks them as historical for now.

---

One release collapses the desktop architecture to a single unprivileged
Tauri binary per OS. No hosts file, no privileged helper, no admin
prompt, no sudo. On first launch after upgrade the app migrates, strips
its hosts markers, uninstalls the helper, and never touches either
again.

## Target architecture

One Tauri binary per OS, running as the user. Same blocking stack on
both, with a Safari-specific handler baked into the macOS `.app` for
Safari coverage.

| OS | Website blocking | App blocking |
| --- | --- | --- |
| macOS 11+ | ReDD Focus extension — Chrome/Brave/Edge/Firefox via `--native-host`, Safari via `SafariWebExtensionHandler.swift` | AppleScript hide, in-process (Accessibility TCC, no root) |
| Windows 10+ | ReDD Focus extension via `--native-host` + registry-registered manifest | `SetWinEventHook` + `ShowWindow`, in-process |

### Why not Screen Time on macOS

We considered using Apple's Screen Time API on macOS as a parallel
path, but the cost outweighs the benefit:

- The `com.apple.developer.family-controls` entitlement takes weeks
  to approve and is fragile to lose.
- The minimum macOS would have to jump to 14 (Sonoma), cutting off
  users on 11–13.
- Rust ↔ Swift FFI scaffolding + a separate `DeviceActivityMonitor`
  extension target would need to live alongside the Windows code.
- The only thing Screen Time buys us is "Safari without writing a
  Safari extension" — and the Safari extension path, while
  Swift-heavy, is genuinely smaller in aggregate than the Screen
  Time bridge would be.

Extension-everywhere keeps one conceptual model across both OSes and
minimises the Swift surface area to one file.

## Persistence (both OSes)

The app is its own enforcement engine, so it has to be running for
schedules to fire and blocks to expire.

- **Hide on close.** Intercept the window close event in Tauri; hide
  to tray / menu bar instead of quitting. Tray icon opens the UI back.
- **Launch at login.** `tauri-plugin-autostart` takes care of this on
  both OSes (user-level, no admin).
- **Relaunch on force-quit.** launchd `KeepAlive=true` (macOS) /
  Task Scheduler "Restart on failure" (Windows) — both configurable
  at install time.

A motivated user can still disable any of these; that's consistent
with the self-binding philosophy.

## Work

### Shared Rust plumbing (done on branch)
- Port the three MVP prototypes to Rust inside the main Tauri binary.
- Native messaging install / uninstall: per-browser JSON manifests
  (macOS user dirs) or `HKCU` registry keys (Windows).
- Enforcer loop emitting `enforcer://grace-update` events the UI can
  turn into a countdown toast.
- In-process app watcher replacing the helper's watcher.

### macOS-specific (done on branch except the Safari target)
- Migration cleanup: strip `/etc/hosts` section, uninstall old
  launchd daemon + helper binary, remove `/var/lib/redd-block`.
- Safari Web Extension target in Xcode with
  `SafariWebExtensionHandler.swift`. Reference implementation lives
  at `browser-ext-mvp/safari-handler/` — ready to drop in. Needs a
  Mac developer to wire it up in Xcode, confirm the bundle ID, and
  run through signing + notarisation.

### Windows-specific (done on branch)
- Migration cleanup: strip `C:\…\hosts` section, delete scheduled
  task + helper binary, remove `C:\ProgramData\ReDD Block`.
- Registry-based native-messaging install (`HKCU\Software\Google\
  Chrome\NativeMessagingHosts\<name>` and equivalents).

### Extension side
- Land `reddfocus-patch.diff` upstream.
- Re-publish to Chrome Web Store / Firefox AMO / Edge Add-ons with
  the new `nativeMessaging` permission — triggers a re-review.

## What we're not doing

- No privileged helper.
- No hosts-file writes.
- No `blockingBackend` feature flag / `"both"` mode.
- No Screen Time on macOS.
- No backwards compatibility for macOS <11 (Safari extension floor).
- No "keep blocking when the app is uninstalled." Uninstall removes
  the binary the login item points at, so enforcement stops. Simpler,
  and matches the new "app is the engine" model.
- No Screen Time app shields, no force-install policies. Later if
  wanted.

## Risks

- **Extension disabled on either OS.** Enforcer quits the browser
  after 30 s; prototype already validates the UX.
- **Safari extension review.** `nativeMessaging` is finicky in
  Safari's pipeline; fallback is to move it to `optional_permissions`
  and request at runtime. Documented in `browser-ext-mvp/README.md`.
- **Store re-review** across Chrome / Firefox / Edge for the single
  new permission (`nativeMessaging`). Don't grow it further.
- **User can defeat persistence.** Disabling the login item and
  killing the process defeats enforcement. Same philosophy as the
  override challenge — annoying, not uncrackable.
