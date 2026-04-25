# Browser-Extension Migration Plan

> **Status (branch `claude/plan-extension-migration-J9CTL`)**
>
> Compiled and partially exercised on real macOS hardware. Cmd-Q,
> tray, accessory mode, app watcher, enforcer + native notifications,
> hide-on-close all verified working in a debug `.app` bundle.
> Remaining work is tracked in [Remaining work](#remaining-work) below.

## Remaining work

Ordered by priority. Items moved here from the rest of the doc as they
land; everything below this section is historical context for *how*
the migration was structured.

### macOS — must do before merge
- [ ] **Phase 4 manual verification on real hardware.** Three
      scenarios still untouched this session (the others — enforcer
      grace, app watcher, hide-on-close, autostart — already
      verified):
      - **Upgrade migration** from a v1.0.x install (or a
        hand-crafted `/etc/hosts` with `# ReDD Block start` markers
        + a stub launchd plist). Verify
        [src-tauri/src/commands/migration.rs:run_upgrade_migration](../src-tauri/src/commands/migration.rs)
        strips markers, prompts admin to bootout the daemon,
        installs native-host manifests, and stamps
        `settings.migrationRanAtVersion`.
      - **Extension-compliance banner** — install the extension in 1
        of 2 browsers, confirm the banner shows the uninstalled one;
        install in both, banner clears.
      - **Native-messaging manifests** — `cat ~/Library/Application\
        Support/Google/Chrome/NativeMessagingHosts/com.ulriklyngs.mindshield.json`
        (and the Brave/Edge/Firefox equivalents) and confirm the
        `path` field points at the running binary.
- [ ] **Phase 5: rewrite [scripts/manual-test-checklist.md](../scripts/manual-test-checklist.md).**
      Existing file describes the old hosts-file / helper-daemon era.
      Replace with sections matching the verified new flow:
      first-launch upgrade migration, extension install compliance
      (1-of-N + all-N), native-host connectivity (Chrome / Firefox /
      Edge), enforcer grace timer (extension disabled / removed),
      app watcher (blocked app hide), hide-on-close + launch-at-login.

### Deferred — explicit non-goals for this branch
- [ ] **Safari support.** Phase 3 of the original plan (App Group
      bridge + Safari handler rewrite) needs both bundles signed by
      the same Apple Developer team. ReDD Block is on team
      `JD647S9RT6`; redd-focus-web upstream is on `7YEYWQKK25`. Until
      ownership is consolidated, App Groups can't bridge the
      sandboxed Safari extension to the unsandboxed app. Deferred
      until signing alignment is sorted; tracked as a follow-up
      ticket. Workaround paths (localhost HTTP, dual-team local
      re-sign for testing) documented in chat.
- [ ] **Native-host payload upgrade** (`{blocklist, blocks: [...]}`).
      Cosmetic improvement to `blocked.html` only — blocking already
      works with the current `{blocklist}` payload. Pick up once
      Safari support is back on the table.
- [ ] **`src/app.js` rewrite** to drop the `*_via_helper` shims in
      [src-tauri/src/commands/helper_shim.rs](../src-tauri/src/commands/helper_shim.rs).
      Functionally a no-op for users; cleanup only.
- [ ] **Deep-link the extension-compliance banner Install button**
      to the right store per browser (Chrome Web Store / Firefox AMO
      / Edge Add-ons). Currently links to `reddfocus.org/tools/reddblock`.
- [ ] **`architecture.md` sections 4–9 full rewrite.** The banner at
      the top marks them as historical; defer until the migration
      lands on `main`.

### Windows — untouched this pass
All Windows items below in
[Manual checks / follow-ups needed on real hardware](#manual-checks--follow-ups-needed-on-real-hardware)
remain. No Windows hardware tested in this pass; treat the entire
Windows path as unverified.

### Recent additions (since the original plan)
The following items landed during the macOS hardware-test pass and
supersede earlier sections of this doc:

- `src-tauri/src/app_watcher.rs` rewritten as a sysinfo poll-and-kill
  loop (1 s tick, SIGTERM → 10 s grace → SIGKILL). Replaces the
  AppleScript NSWorkspace watcher — that approach never delivered
  events because `osascript`'s `delay` doesn't pump the Cocoa run
  loop.
- `src-tauri/src/enforcer.rs` `quit_browser` ported to the same
  sysinfo SIGTERM/SIGKILL primitive. AppleScript and Automation TCC
  no longer required.
- `src-tauri/src/macos_permissions.rs` and the
  `automation-permission-banner` UI deleted — no longer needed.
- `src-tauri/src/lib.rs`: NSApplication accessory-mode (no dock
  icon), `applicationShouldTerminate:` swizzle to intercept Cmd-Q,
  hide-on-close handler, tray-icon left-click opens window,
  notification permission requested at startup.
- Custom shield-silhouette template tray icon at
  `src-tauri/icons/tray-template.png`.
- `tauri-plugin-notification` wired up; enforcer fires native macOS
  notifications at grace start + at kill. Works in signed `.app`
  bundles; silently no-ops in `tauri dev` (bare binary, no bundle
  context — known macOS limitation).

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
- [x] `cargo check` clean on macOS. Compiled and run as a debug
      `.app` bundle (ad-hoc signed) on macOS hardware.
- [ ] `cargo check` on Windows still untested. Concerns from the
      original plan stand: `HKCU` write path in
      `native_host_install.rs` (`RegSetValueExW` slice-length /
      wide-string encoding); `app_watcher.rs` Windows trait imports
      (`SetWinEventHook` callback signature, `PostThreadMessageW`
      arg types). Note: macOS app_watcher is now sysinfo-based and
      shared with Windows under the same `cfg(any(macos, windows))`,
      so the Win-specific watcher concerns from the original plan
      are obsolete — the new code is one polling loop, not two.

### macOS specifics
- [x] ~~Automation TCC error-string check~~ — code deleted, no
      longer relevant.
- [ ] `uninstall_legacy_helper` uses `osascript` with
      `"with administrator privileges"` to bootout the launchd daemon.
      Test that the prompt wording is acceptable and that the command
      returns a usable status code when the user cancels. (Still
      pending — covered by Phase 4 scenario 1.)
- [x] ~~AppleScript NSWorkspace watcher reliability~~ — replaced by
      sysinfo poll-and-kill in `app_watcher.rs`. Verified working
      against Calculator on macOS hardware.
- [Deferred] Safari bundle ID + Safari Extension target —
      see [Remaining work → Safari support](#remaining-work).

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
- [Deferred] Banner Install button deep-link, `src/app.js` rewrite,
      v1.0.x upgrade end-to-end — moved to
      [Remaining work](#remaining-work).

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
- [Deferred] `manual-test-checklist.md` rewrite, `architecture.md`
      sections 4–9 — moved to
      [Remaining work](#remaining-work).

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
