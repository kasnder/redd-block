# Browser-Extension Migration Plan

> **Status (branch `claude/plan-extension-migration-J9CTL`)**
>
> Compiled and partially exercised on real macOS *and* Windows hardware.
> macOS: Cmd-Q, tray, accessory mode, app watcher, enforcer + native
> notifications, hide-on-close all verified working in a debug `.app`
> bundle. Windows (arm64 debug NSIS bundle): build / link / install /
> launch / native-messaging connect / extension-compliance scan /
> enforcer kill (taskkill graceful→force) / toast notifications / tray
> behaviour / watchdog Scheduled Task / clean uninstall — all verified.
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

### Windows — verified this pass
The Windows hardware-test pass landed a string of fixes (see
[Recent additions](#recent-additions-since-the-original-plan)). What
still needs doing before merge:
- [ ] **Phase 4 manual verification on Windows hardware.** Mirror the
      macOS scenarios:
      - **Upgrade migration** from a v1.0.x install (or a hand-crafted
        `C:\Windows\System32\drivers\etc\hosts` with `# ReDD Block
        Start` markers + the legacy scheduled task / `C:\ProgramData\
        ReDD Block`). The hosts strip is expected to log
        `Access is denied (os error 5)` because the new app runs
        unprivileged — that's fine; the new stack doesn't depend on a
        clean hosts file. Verify `migrationRanAtVersion` is persisted
        so the strip isn't re-attempted every launch (currently
        observed firing twice in a single session — investigate
        `commands::data::canonical_data_path` / write timing).
      - **Browser-quit graceful path.** Trigger the enforcer (disable
        the extension during a session); confirm the 60 s toast
        fires, the browser closes via `taskkill /IM brave.exe /T`
        (sessions/cookies persisted), and forced `taskkill /F /T`
        only kicks in for stragglers after the 10 s grace.
      - **Watchdog respawn.** Kill `redd-block.exe` from Task Manager;
        confirm the Scheduled Task `ReDD Block Watchdog` respawns it
        within ~1 minute. Disable the task in Task Scheduler; relaunch
        the app and confirm `watchdog::register()` re-creates it.
      - **Clean uninstall.** Add/Remove Programs → confirm the
        Scheduled Task is gone, `%LOCALAPPDATA%\ReDD Block\
        native-host\` is empty, and `Get-ChildItem 'HKCU:\Software\
        BraveSoftware\Brave-Browser\NativeMessagingHosts'` no longer
        lists `com.ulriklyngs.mindshield`.
- [ ] **Code-signing for production Windows builds.** `scripts/sign.cmd`
      now skips signing when `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` /
      `AZURE_CLIENT_SECRET` are unset, so local `--debug --bundles
      nsis` runs produce an unsigned installer. CI must continue to
      provide all three so production builds get the Azure Trusted
      Signing identity.
- [ ] **`windows/hooks.nsh` "Keep Blocking after uninstall" message.**
      Still references a feature that's been removed from the new
      stack; either reword (briefly explain that uninstall removes the
      enforcement engine) or drop the prompt entirely.

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

#### Windows-side additions (this hardware-test pass)
- `tauri-plugin-notification` extended to Windows (`Cargo.toml` target
  `cfg(any(macos, windows))`). The capability moved into a new
  `desktop-notifications` capability filtered to both platforms
  (`src-tauri/capabilities/macos.json`). The `notify()` helper in
  `enforcer.rs` is no longer macOS-only — Windows toasts fire on grace
  start and on kill.
- AUMID registration at startup. `lib.rs::run()` calls
  `SetCurrentProcessExplicitAppUserModelID("com.reddblock")` *before*
  the Tauri builder is constructed. Without this, WinRT
  `ToastNotificationManager` is created with an unregistered AUMID and
  every toast silently dies. The string matches `bundle.identifier` in
  `tauri.conf.json`, which is what the NSIS installer writes into the
  Start Menu shortcut's `System.AppUserModel.ID`.
- `enforcer::quit_browser` split: macOS keeps the sysinfo
  SIGTERM/SIGKILL loop, Windows uses
  `taskkill /IM <browser>.exe /T` → 10 s grace →
  `taskkill /F /IM <browser>.exe /T`. The macOS path stops claiming
  "SIGTERM failed" when sysinfo just returns `None` (signal not
  supported) — only `Some(false)` warns now.
- `main.rs`: `windows_subsystem = "windows"` is now always-on for
  Windows targets (was `not(debug_assertions)`-only). Installed `--debug`
  builds no longer pop a console window whose close kills the app
  tree. Stdout isn't load-bearing — `tauri-plugin-log` writes to file
  and to the webview DevTools console.
- `lib.rs` tray: right-click menu removed entirely (no Open / Quit
  items). Left-click reveals/focuses the main window; right-click is
  a no-op. Combined with the existing close + Cmd-Q + `ExitRequested`
  interceptors, **uninstall is now the only sanctioned exit path** —
  `ALLOW_EXIT` is read but never set to `true`.
- `profile_scan::scan_chromium`: pick the *best-scoring* matching
  extension entry (by `(enabled, incognito)`) instead of the first
  one. A profile that holds both a stale Web-Store stub
  (`hhblkhfdjijdinijakbmcpkmdfhoadcd` with everything null) and an
  unpacked dev extension was previously evaluated against the stub →
  compliance failed → enforcer killed the browser. The scanner now
  walks every accepted ID and keeps the entry that gives full
  compliance.
- `commands/migration.rs`: hosts-strip permission-denied is now a
  warn-and-continue, not a fatal error. The new stack doesn't need a
  clean hosts file; leftover lines from a previous helper-daemon
  install are benign until the next admin-level write. (Pre-existing
  on the branch but called out because the Windows test pass surfaced
  it.)
- `scripts/sign.cmd`: skips signing entirely when the three Azure env
  vars are unset (exit 0). Lets developers produce unsigned local NSIS
  bundles via `npm run tauri -- build --debug --bundles nsis` without
  setting up Trusted Signing. CI behaviour unchanged.
- `src-tauri/src/watchdog.rs` (new module, Windows-only). Per-user
  Scheduled Task `ReDD Block Watchdog` triggers every minute; the
  task action is a small wrapper `redd-block-watchdog.cmd` next to
  the exe that uses `tasklist` + `start ""` to spawn `redd-block.exe`
  only if it isn't already running. `register()` is called at every
  startup (idempotent, self-heals if the user disables the task);
  `unregister()` is called from the `--uninstall` path and from the
  NSIS pre-uninstall hook.
- `windows/hooks.nsh` rewritten: now (1) deletes the watchdog
  Scheduled Task before any process kill (otherwise the next minute
  would respawn the binary mid-uninstall), (2) keeps the existing
  `KillProcess` step, (3) calls `redd-block.exe --uninstall` to clean
  per-browser native-messaging manifests + matching HKCU registry
  keys + watchdog wrapper script. Previously the hook only killed +
  showed a message; native-host artefacts were orphaned after every
  Windows uninstall.

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
- `browser-ext-migration/redd-focus-web.patch`
  — in-progress changes to the Safari extension repo (handler
  rewrite + manifest + entitlements). Apply with `git apply` against
  a clone of `redd-focus-web`. Kept as a patch because the Safari
  side is deferred until signing-team consolidation.
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
- [x] `cargo check` clean on Windows (arm64). Compiled, linked, and
      bundled as a debug NSIS installer. Quirk: must build via
      PowerShell, **not** Git Bash — Git's `usr/bin/link.exe` (GNU
      coreutils hardlink utility) shadows MSVC's linker on the bash
      `PATH`, producing a confusing
      `/usr/bin/link: missing operand after '\377\376'`. PowerShell's
      `PATH` resolves `link.exe` to the VS BuildTools install
      correctly. Document this in `manual-test-checklist.md`. The
      original plan's `RegSetValueExW` / `SetWinEventHook` /
      `PostThreadMessageW` concerns are obsolete — the watcher is now
      a single sysinfo poll-and-kill loop shared with macOS, and the
      registry-write path is verified working (the extension's
      `connectNative` succeeds).

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
- [x] ~~`SetWinEventHook` / `PostThreadMessageW` watcher~~ — obsolete.
      Replaced by the shared sysinfo poll-and-kill loop in
      `app_watcher.rs`, identical to the macOS path under
      `cfg(any(macos, windows))`. No `static mut`, no per-platform
      message-loop quirks.
- [x] `taskkill /IM <browser>.exe /T` (graceful, posts WM_CLOSE) →
      10 s grace → `taskkill /F /IM <browser>.exe /T` (forced) in
      `enforcer::quit_browser`. Verified on Brave: graceful close
      runs Chromium's normal exit path; forced `/F` only kicks in
      for stragglers.
- [x] Registry key writes for the native-messaging manifest under
      `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\
      com.ulriklyngs.mindshield`. Verified by an extension
      `connectNative` round-trip from Brave.
- [x] WinRT toast notifications. AUMID
      `SetCurrentProcessExplicitAppUserModelID("com.reddblock")` is
      now called at the top of `lib.rs::run()`; without it
      `tauri-plugin-notification` silently drops every toast on
      Windows.
- [x] Console window. `windows_subsystem = "windows"` is always-on
      for Windows, so installed `--debug` builds no longer pop a
      console window whose close kills the app.
- [x] Tray right-click menu removed (no Open / Quit items); left-click
      reveals/focuses the main window. Uninstall is the only
      sanctioned exit path.
- [x] Watchdog Scheduled Task (`ReDD Block Watchdog`, per-user, 1-min
      poll). Self-heals on every app launch via
      `watchdog::register()`; removed by both `redd-block.exe
      --uninstall` and the NSIS pre-uninstall hook.
- [x] NSIS uninstall now properly cleans native-host artefacts. The
      pre-uninstall hook deletes the watchdog task, kills the
      process, and runs `redd-block.exe --uninstall` so per-browser
      manifests under `%LOCALAPPDATA%\ReDD Block\native-host\` and
      the HKCU registry keys are removed before the binary is
      deleted.
- [x] Local debug builds without Azure Trusted Signing creds.
      `scripts/sign.cmd` now skips signing when
      `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET`
      are unset (exit 0), so `npm run tauri -- build --debug
      --bundles nsis` produces an unsigned installer for development.
- [ ] `windows/hooks.nsh` "Keep Blocking after uninstall" message
      still references a removed feature. Reword to reflect the new
      "uninstall removes the enforcement engine" model, or drop the
      prompt entirely.
- [ ] `commands/migration.rs` re-runs migration on each
      `onboarding_state()` call instead of stamping
      `migrationRanAtVersion` once. Observed firing the hosts-strip
      twice in a single Windows session, ~16 s apart. Investigate
      `commands::data::canonical_data_path` resolution / the
      data-file write timing in `run_upgrade_migration`. Non-fatal
      (the hosts strip is idempotent and warn-and-continue) but
      noisy in logs.

### Frontend
- [Deferred] Banner Install button deep-link, `src/app.js` rewrite,
      v1.0.x upgrade end-to-end — moved to
      [Remaining work](#remaining-work).

### External / out-of-band
- [ ] Land the upstream `reddfocus-patch.diff` (extension-side
      `nativeMessaging` permission) in the `reddfocus-open-source`
      repo. The diff lives in git history under
      `browser-ext-mvp/reddfocus-patch.diff` — recover it with
      `git show <pre-rename-sha>:browser-ext-mvp/reddfocus-patch.diff`
      if you need it.
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
  The tray itself has no right-click menu — uninstall is the only
  sanctioned exit path; Cmd-Q (macOS), `RunEvent::ExitRequested`, and
  `applicationShouldTerminate:` are all intercepted.
- **Launch at login.** `tauri-plugin-autostart` takes care of this on
  both OSes (user-level, no admin).
- **Relaunch on force-quit.**
  - macOS: launchd `KeepAlive=true` (planned; not yet wired).
  - Windows: per-user Scheduled Task `ReDD Block Watchdog` polling
    every minute (`src-tauri/src/watchdog.rs`). Registered at install
    time via the NSIS hook *and* re-registered on every app launch
    (self-heal if the user deletes/disables it from Task Scheduler).
    Uninstalled by both `redd-block.exe --uninstall` and the NSIS
    pre-uninstall hook.

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
  `SafariWebExtensionHandler.swift`. Patch with the in-progress
  rewrite lives at `browser-ext-migration/redd-focus-web.patch`
  (apply against a clone of redd-focus-web). Deferred until signing
  teams are consolidated — see [Remaining work](#remaining-work).

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
  and request at runtime.
- **Store re-review** across Chrome / Firefox / Edge for the single
  new permission (`nativeMessaging`). Don't grow it further.
- **User can defeat persistence.** Disabling the login item and
  killing the process defeats enforcement. Same philosophy as the
  override challenge — annoying, not uncrackable.
