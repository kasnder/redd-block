# Browser-Extension Migration Plan

Plan for moving ReDD Block's desktop website-blocking backend off the
hosts-file path and onto a browser extension (Windows) and/or Apple's
Screen Time API (macOS). Scope: desktop only. iOS already uses Screen
Time; Android is out of scope.

This plan builds on the prototypes in `browser-ext-mvp/` (profile scan,
native host, enforcer loop, ReDD Focus patch) and the existing iOS
Screen Time plumbing in `tauri-plugin-screentime/`.

## Goals

- Eliminate the admin/sudo helper-install step wherever we can.
- Stop rewriting `/etc/hosts` and `C:\Windows\System32\drivers\etc\hosts`.
- Keep feature parity: one-off blocks, scheduled blocks, pause/resume,
  override challenges, keep-blocking-on-uninstall.
- Keep ReDD Focus usable standalone for users who never install the
  desktop app (per the existing rules in `browser-ext-mvp/README.md`).

## Backend choice: same approach on both OSes, or split?

The two realistic strategies:

### Option A — extension on both

Ship the ReDD Focus extension + native messaging host on macOS *and*
Windows. One conceptual code path, two platform installers.

- **Cost on macOS:** Safari coverage requires a Safari Web Extension
  target bundled inside the signed `.app`, with a
  `SafariWebExtensionHandler.swift` that reimplements the native-host
  wire format. `safari-web-extension-converter` is stricter than Chrome
  about manifest validity (see existing notes on `nativeMessaging` in
  `browser-ext-mvp/README.md`). Users still have to enable the
  extension in Safari's prefs after install.
- **Cost on Windows:** this is already the only option, so no extra
  cost.

### Option B — Screen Time on macOS, extension on Windows

- **macOS**: reuse the iOS `tauri-plugin-screentime` plumbing against
  `ManagedSettings.WebContentSettings` (available macOS 14+). One user
  authorization covers every browser, including Safari, with no
  extension install and no admin prompt.
- **Windows**: extension + Rust native host as prototyped.

### Recommendation: Option B

Screen Time buys us Safari for free and removes the admin prompt on
macOS. The Safari Web Extension entitlement work in Option A is real
engineering effort and still leaves users with a manual "Enable in
Safari" step. The cost of Option B is a second enforcement code path,
but the macOS one is mostly a port of the existing iOS plugin.

Fallback: macOS <14 keeps the existing hosts path (or, later, the
extension path — see Phase 2 version gate).

## Target architecture

| OS / version | Websites | Apps |
| --- | --- | --- |
| macOS 14+ | Screen Time `WebContentSettings` | Helper (AppleScript hide) — phase-2 optional: Screen Time shields |
| macOS <14 | Hosts file (legacy, unchanged) | Helper (AppleScript hide) |
| Windows 10+ | ReDD Focus extension + native host + enforcement loop | Helper (`SetWinEventHook`) |

Helper daemon stays around for app blocking on both OSes in the first
cut. We can revisit retiring it entirely once Screen Time app shields
are proven on macOS and the Windows enforcer process can absorb the
app-watch loop.

## Phases

### Phase 0 — shared infrastructure

- Port `profile-scan/scan.mjs` to Rust. Expose as a Tauri command so
  `src/app.js` can query compliance without shelling out to Node.
- Port `enforcer/enforce.mjs` to Rust. Runs as a long-lived loop inside
  the Tauri backend (or the helper — see Phase 4).
- Replace the Node native host with Rust. Two packaging options:
  1. separate `redd-block-host.exe` binary shipped in the same
     installer / `.app`;
  2. `--native-host` CLI mode on the main Tauri binary that branches
     into the stdio loop in `main()`.

  Recommend (2): one signed artifact, one notarization path, and the
  host can reuse the same blocklist-derivation code the UI uses. The
  Tauri binary has to start cheaply in headless mode — verify before
  committing.

### Phase 1 — feature flag + data model

- Add `blockingBackend` to `redd-block-data.json`:
  `"hosts" | "extension" | "screentime" | "both"`. Default `"both"` on
  upgrade so no user loses coverage mid-rollout.
- Read/write through `src-tauri/src/commands/data.rs`; surface in the
  existing Diagnostics panel for debugging.
- Gate existing hosts writes and future extension/Screen-Time writes on
  this flag. `"both"` keeps hosts active and additionally pushes to the
  new backend once installed — belt and braces during migration.

### Phase 2 — macOS Screen Time backend

- Extend `tauri-plugin-screentime` to compile a macOS target alongside
  iOS. Shared Swift sources where possible; platform-gated with
  `@available(macOS 14.0, *)`.
- Implement the macOS equivalents:
  - `ManagedSettings.WebContentSettings.blockedByFilter` for websites,
  - `DeviceActivityCenter` + `DeviceActivityMonitor` for schedules
    (mirrors existing iOS `DeviceActivityMonitorExtension.swift`),
  - App Group shared store for schedule payloads (same design as iOS).
- Add the `com.apple.developer.family-controls` entitlement to
  `tauri.macos.conf.json` and the generated Xcode project.
- Onboarding: on first launch after upgrade to `"screentime"`-capable
  version on macOS 14+, show the Screen Time authorization prompt.
  Treat authorization denial as "stay on hosts".
- App blocking stays in the helper for phase 2. Moving apps to Screen
  Time shields needs the `FamilyActivityPicker` since Screen Time app
  tokens are opaque — worth a separate phase.

Version gate: macOS <14 keeps `"hosts"` until we decide whether to
extend the Windows extension path to them too. Don't block the
migration on this subset.

### Phase 3 — Windows extension backend

- Land the `reddfocus-patch.diff` (already in this folder) upstream in
  the ReDD Focus repo. Respect the standalone-safety rules already
  documented in `browser-ext-mvp/README.md` (empty blocklist by default,
  feature-check `connectNative`, 5s→5min backoff, no new permissions
  beyond `nativeMessaging`).
- Rust native host:
  - reads `redd-block-data.json` from `app_data_dir()`,
  - derives effective domains at `now()` by intersecting active blocks'
    `[startTime, endTime)` with their blocklists' `websites`,
  - `fs::watch` + 30s poll (covers time-only schedule transitions),
  - pushes `{ "blocklist": [...] }` to the extension,
  - drops writes to `[]` when no block is active so the extension
    clears cleanly on session end,
  - supports a heartbeat so the daemon can distinguish "browser closed"
    from "extension disabled" from "host crashed".
- Windows install: write `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\<name>`
  pointing at the host binary (direct `.exe`, no `.bat` shim if we can
  avoid it). User scope — no UAC.
- Enforcement loop in the daemon (port of `enforce.mjs`):
  - tick every ~5s,
  - `sysinfo` / WMI process enumeration; parse `--user-data-dir` off
    each running browser to map process → profile,
  - run the ported profile-scan against each active profile,
  - on failure: 60s grace first offense, 30s on repeat, persistent
    Windows toast with countdown + "Fix now" deep link
    (`chrome://extensions/?id=<id>` / `about:addons`),
  - `taskkill /IM <browser>.exe` graceful on deadline, `/F` after N
    seconds to avoid corrupting browser state mid-save,
  - persist offense counts + timers across daemon restarts,
  - restart-loop prevention: if the user reopens a failing browser
    immediately, show a blocking redd-block window rather than nag
    again.
- Onboarding: profile-scan-gated. Only flip backend to `"extension"`
  after we see `installed && enabled && privateBrowsing` on at least
  one running browser profile. Otherwise stay on `"both"` and show the
  install prompt with a Web Store / AMO / Add-ons deep link.
- Optional hardening (later): force-install policies under
  `HKCU\Software\Policies\...`. Chromium can't auto-grant incognito;
  Firefox can. Not required for MVP; covered in
  `browser-ext-mvp/README.md`.

### Phase 4 — helper daemon scope reduction

Once Phase 2 + 3 ship and telemetry shows adoption:

- Strip website-blocking code paths from `helper-daemon` on the
  platforms where they're no longer used. Keep `restore_hosts` /
  `remove_block_from_hosts` around for the one-shot cleanup step in
  Phase 5.
- Consider merging the Windows native host into the helper process:
  the native-host manifest points at the helper with `--native-host`,
  and the stdio loop lives inside the same service. One install, one
  binary to sign.
- macOS app blocking can either stay in helper (AppleScript hide) or
  migrate to Screen Time shields in a later phase. Keep it in helper
  for now — the current `NSWorkspace`-driven code works.

### Phase 5 — migration UX and hosts cleanup

On first launch after the backend becomes available:

- **macOS 14+**: prompt Screen Time authorization. On success:
  1. flip `blockingBackend` to `"screentime"`,
  2. strip redd-block markers from `/etc/hosts` via the existing
     `restore_hosts` helper command,
  3. leave the helper installed for app blocking.
- **Windows**: run profile-scan. If compliant, flip to `"extension"`
  and strip hosts markers. If not, stay on `"both"` and prompt to
  install the extension.
- Diagnostics panel shows: active backend, last enforcement event,
  extension compliance per profile, Screen Time authorization state.
  Useful for "why didn't this block" debugging.

### Phase 6 — Safari only if we ever drop Screen Time

Only needed for the macOS <14 fallback, or if we change our minds on
Option B. Deferred. When/if we do it, follow the Safari-compile risks
already listed in `browser-ext-mvp/README.md`:

- move `nativeMessaging` to `optional_permissions`, request at runtime,
- Safari ignores `connectNative(name)` and always routes to the host
  app's `SafariWebExtensionHandler.swift`,
- don't create a native-messaging manifest JSON under Apple bundle
  paths.

### Phase 7 — cleanup

- After N releases with no `"hosts"` users in logs, remove the
  hosts-rendering code entirely.
- Retire the helper daemon only once app blocking has also migrated
  off it on both OSes.
- Update `architecture.md` and `README.md` to reflect the new layout.

## Risks and open questions

- **Screen Time authorization friction on macOS.** Users have to toggle
  it in System Settings. This is a different UX from "enter your
  password once for the helper"; some users may bounce. Worth piloting
  before committing.
- **macOS <14 floor.** Current README lists 10.15+. If we don't want to
  bump, the extension path is the only macOS fallback for <14 — which
  brings the Safari entitlement work back. Easiest: keep hosts on <14
  and let the install base age out.
- **Multi-profile bypass on Windows.** A user can open a non-default
  Chrome profile that lacks the extension. Enforcer handles this by
  scanning every running profile — but `--user-data-dir` on a USB
  stick is out of scope; document as a known bypass.
- **`Secure Preferences` HMAC on Chromium.** We read it as plain JSON
  today. Works in practice because Chrome only validates on next
  *write*. Long-term: parse the signed format or accept tampering
  resets state.
- **Firefox private-browsing detection is version-flaky** — already
  flagged in `profile-scan/README.md`. Needs a real-world test matrix
  (ESR, stable, Developer Edition, Nightly).
- **Store re-review.** Adding `nativeMessaging` to the published
  extension is a re-review across three stores. The patch in this
  folder already keeps to that single permission; do not grow it.
- **Node on end-user machines.** Non-starter. The prototype host is
  Node-based for MVP speed; ship Rust before any release, per Phase 0.
- **Notarization.** If we ship a separate `redd-block-host` binary on
  macOS, it must be signed and notarized separately. Another reason to
  prefer the `--native-host` CLI-mode packaging.

## Rough sequencing

Phase 0 and Phase 1 are prerequisites for everything else and can ship
in a single release with zero user-visible change. Phase 2 (macOS) and
Phase 3 (Windows) are independent and can parallelize across engineers.
Phase 5 gates on whichever finishes first per platform. Phases 4, 6, 7
are cleanup and can slip without blocking the migration.

## What this plan does *not* change

- iOS. Already uses Screen Time end-to-end; untouched.
- Override challenges and difficulty UI — lives in `src/app.js`, not
  tied to backend.
- App-data persistence format — `redd-block-data.json` stays, only
  gains a `blockingBackend` field.
- Helper daemon IPC protocol — commands stay stable; we just stop
  calling the hosts-related ones on migrated backends.
