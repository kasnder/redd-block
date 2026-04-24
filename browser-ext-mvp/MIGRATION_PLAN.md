# Browser-Extension Migration Plan

> **Status (branch `claude/plan-extension-migration-J9CTL`)**
>
> First-pass implementation has landed. None of it has been
> compile-tested — this environment has no Rust toolchain, no Xcode,
> no Mac, no Windows. Needs a desktop build pass on real hardware
> before it can ship.
>
> **Landed**
> - `src-tauri/src/native_host.rs` — `--native-host` CLI mode, stdio
>   framing, file-watch + 30 s poll, blocklist derivation.
> - `src-tauri/src/profile_scan.rs` — Rust port of the MVP scanner.
> - `src-tauri/src/enforcer.rs` — 5 s tick, 60 s/30 s grace,
>   `enforcer://grace-update` / `grace-resolved` events,
>   taskkill / osascript quit.
> - `src-tauri/src/native_host_install.rs` — per-browser manifest
>   JSON on macOS/Linux, `HKCU\…\NativeMessagingHosts` registry keys
>   on Windows. User-scope only.
> - `src-tauri/src/app_watcher.rs` — in-process AppleScript
>   NSWorkspace watcher + System Events hide (macOS),
>   `SetWinEventHook` + `ShowWindow(SW_FORCEMINIMIZE)` (Windows).
> - `src-tauri/src/commands/migration.rs` — `strip_hosts_markers` +
>   `uninstall_legacy_helper` Tauri commands for first-launch cleanup.
> - `src-tauri/src/commands/helper_shim.rs` — legacy `*_via_helper`
>   command names kept as shims routed to the new backends so
>   `src/app.js` doesn't need to be rewritten in this pass.
> - `helper-daemon/` crate deleted. `scripts/*helper*` deleted.
>   `package.json` scripts scrubbed.
> - `tauri-plugin-autostart` added, hide-on-close wired in `lib.rs`.
> - `browser-ext-mvp/safari-handler/SafariWebExtensionHandler.swift`
>   — reference implementation of the Safari native-messaging
>   handler, to be dropped into the Xcode project's Safari extension
>   target.
> - `README.md` + `changelog.md` + `architecture.md` banner updated.
>
> **Stubbed / needs hardware**
> - Safari extension target must be added to the Tauri-generated
>   Xcode project, with
>   `browser-ext-mvp/safari-handler/SafariWebExtensionHandler.swift`
>   as its handler. See that folder's README.
> - The ReDD Focus extension patch (`reddfocus-patch.diff`) needs to
>   land upstream in the external `reddfocus-open-source` repo and
>   the updated extension re-published to Chrome Web Store / Firefox
>   AMO / Edge Add-ons.
>
> **Not done yet**
> - Full rewrite of `src/app.js` to call new commands directly. The
>   shim keeps the old call sites working; direct calls are cleaner.
> - Smoke-test on macOS and Windows hardware. Fix any compile /
>   linking errors that surface.
> - `manual-test-checklist.md` update for the new flows (extension
>   install + enforcer grace, hide-on-close, migration from v1.0.x).

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
