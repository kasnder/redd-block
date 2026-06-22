# Browser-Extension Migration Plan

> **Historical — macOS superseded by v3.0.** v2 replaced the v1 helper daemon
> with browser extensions. v3 replaced macOS Safari/Chromium extension blocking
> with Automation. See [../architecture.md](../architecture.md) for the current
> design. This plan remains useful for **Windows** and v1→v2 migration context.

> **Status (branch `claude/plan-extension-migration-J9CTL`)** — code complete,
> end-to-end tested on real macOS and Windows hardware. Safari now uses an
> App Group bridge (`group.com.reddblock.shared`) between Rum and the
> ReDD Focus Safari extension. The macOS release path is `.dmg` only; the old
> localhost fallback and signed `.pkg` ideas are preserved in
> [FUTURE_OPTIONS.md](./FUTURE_OPTIONS.md).

## Current state at a glance

### Architecture
The privileged-helper-daemon stack is gone. v2.0 is a single unprivileged
Tauri binary per OS that:
- Blocks websites via the **ReDD Focus browser extension** (Chrome / Brave /
  Edge / Firefox via native messaging; Safari via a dedicated extension target
  plus App Group container bridge).
- Blocks apps via an in-process sysinfo poll-and-kill watcher.
- Persists itself via `tauri-plugin-autostart` (LaunchAgent on macOS, HKCU
  Run-key on Windows) plus a watchdog Scheduled Task on Windows.
- Survives login: window stays hidden when launched via autostart (`--autostart`
  flag in argv); user opens it via the menu-bar tray icon.

### Migration delivery
| OS | Path | Where cleanup runs |
|---|---|---|
| macOS | `.pkg` installer | preinstall script (one wizard admin prompt covers everything) |
| macOS | `.dmg` (fallback / direct) | in-app on first launch (full-screen overlay → admin prompt) |
| Windows | NSIS installer | in-app on first launch (post-install hook auto-opens app → overlay → UAC) |

Both paths converge on the **same `cleanup.sh` / `cleanup.ps1`** loaded via
`include_str!` from `src-tauri/src/commands/migration/`. One source of truth;
the .pkg preinstall and the in-app `run_elevated_macos`/`run_elevated_windows`
both substitute `{STAGED}`/`{STATUS}` placeholders into the same script body.

### What's verified end-to-end
**macOS** (real v1.x install + .pkg upgrade):
- Preinstall stops the running v1.x daemon, atomic-writes hosts using legacy
  `.redd-backup` as source, removes daemon-specific files, status marker.
- User blocklist data byte-identical pre/post (MD5 verified).
- Autostart enabled on first launch → `~/Library/LaunchAgents/Rum.plist`
  registered with `--autostart` flag.
- Subsequent autostart-launches: app starts hidden in tray.
- Behaviour-change banner appears for upgraders, auto-hides when extension
  is fully set up everywhere.

**Windows** (Tier 1 + Tier 2 pass per `MIGRATION_RUNBOOK.md`):
- In-app cleanup against fake residue: accept / cancel / retry / idempotent
  re-run all green; field-level data preservation verified.
- Console windows hidden during elevated cleanup (no PS flash).
- UI poll-and-recover pattern means a wedged Rust IPC doesn't lock the
  Continue button.
- Watchdog Scheduled Task self-heals on every launch.
- `tauri-plugin-single-instance` collapses post-install hook + finish-page
  Run-checkbox into one process.

### Frontend onboarding overlay
Single `#migration-onboarding` overlay drives three states:
1. **Pre-cleanup** (residue detected) — explanation card, Continue triggers
   admin prompt, cancel keeps overlay open with Try Again.
2. **Post-cleanup** (just finished cleanup) — checklist (✓ Old version, ✓
   Blocklists preserved, ○ Install extension) + per-browser status rows
   with Copy URL buttons.
3. **Welcome** (fresh user, never had v1.x, extension not yet compliant) —
   same layout but cleanup checklist hidden, headline "Welcome to Rum"
   instead of "Cleanup complete".

Dismissal persisted in `localStorage` (`reddBlockExtOnboardingDismissed`).
After dismiss, slim `extension-compliance-banner` takes over for ongoing
nagging.

### Robustness improvements landed during testing
- Elevated scripts moved to standalone files (`cleanup.sh`, `cleanup.ps1`)
  with editor syntax-highlighting / linting support. Loaded via `include_str!`.
- Status-marker temp paths use nanoseconds (was seconds → collisions).
- macOS: daemon-stopped poll uses `launchctl print` (pgrep was false-matching
  on the script's own argv).
- Windows: PowerShell native-command stderr wrapped in EAP=Continue scopes
  (schtasks/taskkill/ipconfig wrote to stderr and aborted under EAP=Stop).
- `profile_scan` `installed` field requires actual app bundle/exe in standard
  locations (was just profile-dir existence → false positives).
- Webstore-allowlist stubs (`{active_bit, allowlist}` with no `manifest`/`path`/
  `state`) filtered out (Brave/Edge keep these for extensions the user has
  merely viewed in the store).
- Dead `get_running_apps` + `minimize_app` commands removed (would have
  triggered macOS Automation TCC permission dialog for nothing).
- `--autostart` flag in launch agent lets us start hidden.

## Remaining work

The migration itself is now implemented. Remaining follow-up work is mainly
release operations and documentation cleanup:

- Ship the updated Safari changes from the local `redd-focus-web/` checkout
  upstream and republish the Safari App Store build with the
  `group.com.reddblock.shared` entitlement enabled.
- Cut notarized macOS `.dmg` builds and signed Windows NSIS builds in CI.
- Rewrite the old helper-era manual test checklist and longer-form architecture
  notes.

Parked alternatives are documented in [FUTURE_OPTIONS.md](./FUTURE_OPTIONS.md).

## Implemented and verified (was originally on this list)

The sections below were the original plan-doc TODOs at the start of this
branch. Kept as historical context for *what* and *why*. Status line at
the top of each notes whether it's done.

### Distribution: `.pkg` for the v1.x → 2.0 upgrade ✓
**Status: implemented and verified end-to-end on real macOS hardware.**
A `.dmg` drag-replace install on macOS leaves the v1.x daemon running
and the hosts file edited until the user explicitly launches the new
app — which means a window where the old privileged stack is
unsupervised. It also creates a "browser closed without explanation"
failure mode the moment the new app's enforcer ticks against an
uninstalled extension after migration.

For 2.0 specifically we ship a real installer `.pkg` with pre/post
install scripts so the cleanup happens at install time and the new
app auto-launches:

- `scripts/build-mac-pkg.sh` — wraps the Tauri-built `.app` with
  `pkgbuild` + `productbuild`. Signed with `Developer ID Installer`
  (env var `APPLE_DEVELOPER_INSTALLER_IDENTITY`). Notarization runs
  if `APPLE_NOTARIZE_USER` / `APPLE_NOTARIZE_PASS` / `APPLE_TEAM_ID`
  are set. npm scripts: `build:mac-pkg`, `build:mac-pkg:debug`.
- `scripts/macos-pkg/scripts/preinstall` — quits any running v1.x
  GUI, then runs the same bundled hosts-strip + daemon-removal flow
  as the in-app `run_elevated_macos`. Same safety order: stop daemon
  → poll launchd → atomic hosts write → verify → remove daemon files
  → verify removal. Never fails the install on cleanup errors (the
  in-app migration is the safety net).
- `scripts/macos-pkg/scripts/postinstall` — `launchctl asuser …
  /usr/bin/open /Applications/Rum.app` so 2.0 auto-launches
  for the invoking user, mirroring Windows NSIS finish-page.

The in-app migration code stays as the safety net for users who
upgrade by some other path (manual `.dmg` from old archive, partial
`.pkg` failure, etc.). Defense in depth — both paths land on the
same end state.

### macOS — verification log
- [x] **Upgrade migration verified end-to-end on real hardware.** Two
      full v1.x → 2.0 migrations exercised against a real legacy
      install (running launchd daemon + `/etc/hosts` markers + populated
      `/var/lib/redd-block/redd-block-data.json`). Verified:
      - One osascript admin prompt covers everything.
      - `set -e` + ordered gates: any failed step aborts before any
        destructive action and leaves the system retryable.
      - Daemon-stopped poll uses `launchctl print` (pgrep would
        false-match on the script's own argv content).
      - Hosts content sourced from `/etc/hosts.redd-backup` when sane,
        falling back to in-place awk-strip otherwise. Atomic mv via
        unique mktemp staged file. Re-read + re-validate post-write.
      - Daemon plist + binary + helper-state.json removed. **User's
        `redd-block-data.json` preserved** — md5 confirmed identical
        before/after migration, blocklists intact. The shared dir
        `/var/lib/redd-block/` is intentionally kept because
        `should_use_shared_data_path` keys off the data file's
        existence (commands/data.rs).
      - Cancel path: `success=false user_cancelled=true`, hosts
        untouched, no daemon changes, status marker cleaned up.
      - Retry after cancel: re-prompt, accept, completes cleanly.
      - Idempotent re-run: `migration_pending_sync` returns false,
        no prompt, no-op.
      - App-data snapshots (`~/Library/Application Support/com.reddblock/backups/hosts.<ts>`)
        retained and not pruned.
      - Test harness: `scripts/test-migration.sh` + `cargo run --example
        test_migration` (in `src-tauri/`).
- [ ] **Full-screen migration onboarding tested in the running app.**
      The in-app migration now drives a full-screen onboarding overlay
      (`#migration-onboarding` in `src/index.html`) instead of thin
      banners. Two phases:
        - "pre" — explanation card + Continue button. Clicking Continue
          fires `run_upgrade_migration` which prompts admin. Cancel →
          stay in pre with retry CTA.
        - "post" — checklist (old version cleaned ✓, blocklists
          preserved ✓, install extension ○) + per-browser store
          buttons (driven by `OnboardingState.browsers`). Polls
          compliance on window focus so the checklist ticks itself
          off when the user comes back from the store.
      Enforcer is paused at process launch when `migration_pending`
      was true at startup (see `commands::enforcement::auto_start`)
      and resumed only when the user dismisses the post phase
      (Done or Skip). This prevents the "browser closed without
      explanation" failure mode immediately after a successful
      migration.
- [ ] **Extension-compliance banner** — install the extension in 1
      of 2 browsers, confirm the banner shows the uninstalled one;
      install in both, banner clears.
- [ ] **Native-messaging manifests** — `cat ~/Library/Application\
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
- [ ] **Native-host payload upgrade** (`{blocklist, blocks: [...]}`).
      Cosmetic improvement to `blocked.html` only — blocking already
      works with the current `{blocklist}` payload.
- [ ] **Localhost fallback transport** and **signed `.pkg` installer**.
      Parked by design for v2.0; see [FUTURE_OPTIONS.md](./FUTURE_OPTIONS.md).
- [ ] **`src/app.js` rewrite** to drop the `*_via_helper` shims in
      [src-tauri/src/commands/helper_shim.rs](../src-tauri/src/commands/helper_shim.rs).
      Functionally a no-op for users; cleanup only.
- [ ] **Deep-link the extension-compliance banner Install button**
      to the right store per browser (Chrome Web Store / Firefox AMO
      / Edge Add-ons). Currently links to `reddfocus.org/tools/reddblock`.
- [ ] **`architecture.md` sections 4–9 full rewrite.** The banner at
      the top marks them as historical; defer until the migration
      lands on `main`.

### Windows — verification log
- [ ] **Mirror the macOS upgrade-migration verification.** Same harness
      structure works (`cargo run --example test_migration` in
      `src-tauri/`). The Windows code path uses
      `Start-Process -Verb RunAs` PowerShell with
      `$ErrorActionPreference='Stop'` instead of osascript; same
      ordered gates: stop scheduled task + taskkill helper → poll for
      gone → atomic write hosts (`Set-Content` + `Move-Item -Force`
      with random suffix) → verify post-write → `schtasks /Delete` +
      `Remove-Item helper-state.json` (NOT the whole `C:\ProgramData\
      Rum` — same data-preservation rule as macOS) →
      verify removal → status marker. Things to test against a real
      v1.x install (or a hand-crafted residue):
      - One UAC prompt, accept → hosts cleaned, scheduled task gone,
        `C:\ProgramData\Rum\helper-state.json` gone, **`redd-block-data.json` md5 unchanged**.
      - Cancel UAC → exit code 1223, no destructive change, banner
        appears.
      - Retry after cancel → completes.
      - Idempotent re-run → no prompt, no-op.
      - App-data snapshots written under `%APPDATA%\com.reddblock\backups\`.
      - `C:\Windows\System32\drivers\etc\hosts.redd-backup` retained
        (only deleted at uninstall via `purge_legacy_backups_sync`).

### Windows — verified previous pass
The Windows hardware-test pass landed a string of fixes (see
[Recent additions](#recent-additions-since-the-original-plan)). What
still needs doing before merge:
- [ ] **Browser-quit graceful path.** Trigger the enforcer (disable
      the extension during a session); confirm the 60 s toast
      fires, the browser closes via `taskkill /IM brave.exe /T`
      (sessions/cookies persisted), and forced `taskkill /F /T`
      only kicks in for stragglers after the 10 s grace.
      - **Watchdog respawn.** Kill `redd-block.exe` from Task Manager;
        confirm the Scheduled Task `Rum Watchdog` respawns it
        within ~1 minute. Disable the task in Task Scheduler; relaunch
        the app and confirm `watchdog::register()` re-creates it.
      - **Clean uninstall.** Add/Remove Programs → confirm the
        Scheduled Task is gone, `%LOCALAPPDATA%\Rum\
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
- `commands/migration.rs`: rewritten to bundle the hosts-strip and
  legacy-helper removal into ONE elevated step per OS (osascript on
  macOS, `Start-Process -Verb RunAs` PowerShell on Windows). Order is
  snapshot → validate cleaned content → atomic write → flush DNS →
  remove daemon → remove `/etc/hosts.redd-backup` → status marker;
  `set -e` / `$ErrorActionPreference='Stop'` so any failed gate aborts
  before destructive steps. Rust re-validates after the script returns
  and only stamps `migrationRanAtVersion` on full success. If the user
  cancels the prompt or any step fails, the system is left exactly as
  it was found and a "Migration incomplete" banner appears in the UI
  to retry. A pre-edit snapshot of the live hosts file is also written
  to `<app-data>/backups/hosts.<timestamp>` (last 3 retained) as
  belt-and-braces. When `/etc/hosts.redd-backup` exists and is sane
  (non-empty, contains `localhost`), it's preferred as the cleaned
  source over awk-based marker stripping.
- `scripts/sign.cmd`: skips signing entirely when the three Azure env
  vars are unset (exit 0). Lets developers produce unsigned local NSIS
  bundles via `npm run tauri -- build --debug --bundles nsis` without
  setting up Trusted Signing. CI behaviour unchanged.
- `src-tauri/src/watchdog.rs` (new module, Windows-only). Per-user
  Scheduled Task `Rum Watchdog` triggers every minute; the
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
  Safari `privateBrowsing` is sourced from
  `browser.extension.isAllowedIncognitoAccess()` self-reported via a
  15 s heartbeat into the App Group container; the gate matches
  Chromium semantics. See
  [SAFARI_COMPLIANCE.md](SAFARI_COMPLIANCE.md) for the full
  detection model and rejected alternatives (FDA + plist parsing,
  `SFSafariExtensionManager`).
- `src-tauri/src/enforcer.rs` — 5 s tick, 60 s/30 s grace,
  `enforcer://grace-update` / `grace-resolved` events,
  `taskkill` / `osascript quit`.
- `src-tauri/src/native_host_install.rs` — per-browser manifest JSON
  on macOS/Linux, `HKCU\…\NativeMessagingHosts` registry keys on
  Windows. User-scope only.
- `src-tauri/src/app_watcher.rs` — sysinfo poll-and-kill loop shared
  by macOS and Windows. The earlier AppleScript NSWorkspace watcher
  / `SetWinEventHook` / `ShowWindow(SW_FORCEMINIMIZE)` paths were
  removed once the simpler poll proved sufficient on both OSes.
- `src-tauri/src/macos_permissions.rs` — *deleted* during the helper
  removal. Automation TCC was only needed by the legacy AppleScript
  paths; the in-process app blocker no longer requires it. Recover
  from git history if a future feature needs it.
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
- `redd-focus-web/`
  — local checkout of the Safari extension repo containing the
  handler rewrite, background heartbeat, manifest bump, and App Group
  entitlements that still need to be shipped upstream through the
  App Store.
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
- [x] Safari bundle ID + Safari Extension target — now wired through
      the App Group bridge described above.

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
- [x] Watchdog Scheduled Task (`Rum Watchdog`, per-user, 1-min
      poll). Self-heals on every app launch via
      `watchdog::register()`; removed by both `redd-block.exe
      --uninstall` and the NSIS pre-uninstall hook.
- [x] NSIS uninstall now properly cleans native-host artefacts. The
      pre-uninstall hook deletes the watchdog task, kills the
      process, and runs `redd-block.exe --uninstall` so per-browser
      manifests under `%LOCALAPPDATA%\Rum\native-host\` and
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
- [x] `commands/migration.rs` rewritten with an explicit
      detect-then-elevate flow: `migration_pending_sync()` is the
      single source of truth for "is there v1.x residue?" and short-
      circuits before any prompt. `migrationRanAtVersion` is only
      stamped on successful userspace re-validation, so partial
      failures don't get latched and the next launch / banner click
      retries cleanly.

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
  - Windows: per-user Scheduled Task `Rum Watchdog` polling
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
  `SafariWebExtensionHandler.swift`. The App Groups rewrite now lives
  directly in the local `redd-focus-web/` checkout and should be
  upstreamed from there once the Safari App Store release is cut.

### Windows-specific (done on branch)
- Migration cleanup: strip `C:\…\hosts` section, delete scheduled
  task + helper binary, remove `C:\ProgramData\Rum`.
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
