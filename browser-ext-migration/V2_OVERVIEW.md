# v2 Overview & Open TODOs

> **Historical — macOS superseded by v3.0.** This folder documents the **v2**
> extension-based desktop architecture. **Windows** still matches v2. On
> **macOS**, website blocking for Safari/Chrome/Brave/Edge moved to
> **Automation** in v3 — see [../architecture.md](../architecture.md) Part I.
> Safari App Group / bundled extension content here is v2-only history.

The condensed read for anyone landing in this folder. If you only have
five minutes, this is the file. The deeper documents linked below
exist for "I am about to touch this code" depth.

- **[MIGRATION_PLAN.md](MIGRATION_PLAN.md)** — full rationale, every
  decision, every landed change. The "why."
- **[MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md)** — Windows v1 → v2
  upgrade flow, hands-on test recipes.
- **[SAFARI_COMPLIANCE.md](SAFARI_COMPLIANCE.md)** — how we tell whether
  the Safari extension is installed / enabled / private-browsing-allowed,
  and which alternatives we ruled out.
- **[FUTURE_OPTIONS.md](FUTURE_OPTIONS.md)** — parked ideas
  (localhost HTTP transport, signed `.pkg` installer).

---

## What v2 is

A complete swap of the desktop blocking backend.

- **v1.x:** privileged helper daemon (`/etc/hosts` writes on macOS,
  hosts file + Windows service on Windows), admin/UAC prompt on
  every install.
- **v2:** the **ReDD Focus browser extension** is the blocking
  surface; the app is just a UI + native-messaging host + enforcer.
  No `/etc/hosts` mutation. No root daemon. No admin prompt on
  install.

Same v1.x data model (`redd-block-data.json`) ships forward unchanged
— blocklists, schedules, override settings all preserved on upgrade.

---

## Architecture in one screen

```
┌──────────────────────────────────────────────────────────┐
│ Rum app (Tauri/Rust)                              │
│  ├─ UI (src/app.js)                                      │
│  ├─ commands/                                            │
│  ├─ profile_scan.rs   ─ scans installed browsers         │
│  ├─ enforcer.rs       ─ 5 s tick; force-quits non-       │
│  │                     compliant browsers (60 s grace)   │
│  ├─ native_host.rs    ─ stdio framing for browser        │
│  │                     extensions (--native-host CLI)    │
│  ├─ native_host_install.rs ─ writes per-browser host     │
│  │                     manifests (~/Library/...,         │
│  │                     HKCU\...\NativeMessagingHosts)    │
│  ├─ app_group.rs      ─ Safari App Group bridge          │
│  ├─ app_watcher.rs    ─ in-process app blocker (sysinfo  │
│  │                     poll-and-kill, both OSes)         │
│  └─ commands/migration.rs ─ v1.x cleanup on first launch │
└──────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────────────┐
        │              │                      │
   stdio JSON     App Group volume       (Safari only)
        │              │                      │
        ▼              ▼                      │
┌──────────────┐  ┌──────────────────────────────────────┐
│ Chrome /     │  │ ReDD Focus Safari Extension          │
│ Brave / Edge │  │  ├─ background.js (heartbeat 15 s)   │
│ / Firefox    │  │  ├─ SafariWebExtensionHandler.swift  │
│ extension    │  │  │   (writes safari-status.json)     │
└──────────────┘  │  └─ blocked.html / blocked.js        │
                  └──────────────────────────────────────┘
```

### Communication transports

| Browser | Transport | Trigger |
|---|---|---|
| Chrome, Brave, Edge | Native messaging (stdio) — `connectNative("com.ulriklyngs.mindshield")` | Per-browser manifest in `~/Library/Application Support/<vendor>/NativeMessagingHosts/` (mac) or `HKCU\Software\<vendor>\<browser>\NativeMessagingHosts\` (Windows). Both written by `native_host_install.rs`. |
| Firefox | Native messaging (stdio) — same protocol, manifest in `~/Library/Application Support/Mozilla/NativeMessagingHosts/` |
| Safari | App Group container (`group.com.reddblock.shared`) — Tauri app writes `redd-block-data.json`, extension writes `safari-status.json` | The extension is a separate Mac App Store app (`ReDD Focus.app`); shares the App Group with the Tauri app. |

The Tauri binary doubles as the native host: `redd-block --native-host`
is the entrypoint browsers connect to. One binary, two roles.

### Key constants (verified against code)

| Constant | Value | Where |
|---|---|---|
| Enforcer scan tick | 5 s | `enforcer.rs:23` |
| Grace period (default) | 60 s first / 30 s repeat | `enforcer.rs:32` |
| Grace bounds (user-configurable) | 5 – 300 s | `enforcer.rs:33-34` |
| Safari heartbeat interval | 15 s | `background.js:228` |
| Safari heartbeat staleness | 45 s | `app_group.rs::STATUS_STALE_MS` |
| Native-host discovery name | `com.ulriklyngs.mindshield` | manifests |
| App Group ID | `group.com.reddblock.shared` | `app_group.rs:18` |

### Compliance gate

A browser is compliant iff (`profile_scan.rs::compliant`):

```
!present || (installed && enabled == Some(true) && private_browsing == Some(true))
```

Same rule for every browser. Safari used to have an asymmetric "trust
the extension" rule that silently passed every install — fixed in
`83fa81c`.

For Safari, `present` is **running AND frontmost** rather than just
running. A minimised / hidden Safari (or one parked on another
Mission Control space) is treated like Safari-closed for
enforcement purposes. This sidesteps the false-positive that came
from Safari aggressively suspending MV3 background pages while
hidden — heartbeats stop firing, but we don't care because we're
not enforcing while the user isn't looking at Safari. Helper:
`profile_scan::safari_is_frontmost()`. See
[SAFARI_COMPLIANCE.md](SAFARI_COMPLIANCE.md) for the
detection model that backs each field.

When a browser is `present && !compliant`, the enforcer toasts a
grace warning and force-quits at zero (`taskkill` on Windows, sysinfo
SIGTERM/SIGKILL on macOS).

---

## Migration story (v1.x → v2)

Triggered at first launch, not at install time. See
[MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md) for the practical flow.

- **Detection**: `migration_pending_sync()` in
  `commands/migration.rs` looks for v1.x residue (hosts-file markers,
  legacy launchd plist on macOS, legacy service on Windows).
- **Gating**: while pending, the enforcer starts **paused** so it
  doesn't kill browsers before the user has installed the v2
  extension.
- **UX**: full-screen `#migration-onboarding` overlay in `src/app.js`.
  Pre-phase = welcome card; post-phase = per-browser install
  buttons.
- **Cleanup**: `run_upgrade_migration` invokes `cleanup.sh`/`.ps1`
  via `include_str!`. macOS prompts once for the admin password to
  bootout the legacy daemon.
- **Idempotency**: `settings.migrationRanAtVersion` is stamped on
  success; residue can reappear and we re-migrate.

---

## v1.x → v2 deletions worth knowing

- `helper-daemon/` crate — gone. `scripts/*helper*` — gone.
- `src-tauri/src/macos_permissions.rs` — gone. Automation TCC was
  only needed by the old AppleScript paths.
- The AppleScript NSWorkspace watcher and the
  `SetWinEventHook` / `ShowWindow(SW_FORCEMINIMIZE)` Windows path
  in `app_watcher.rs` — both replaced by a single sysinfo
  poll-and-kill loop shared by both OSes.
- `safari-status.json::privateBrowsing` self-report from
  `tab.incognito` — replaced by `browser.extension.isAllowedIncognitoAccess()`.
  See [SAFARI_COMPLIANCE.md "Rejected options"](SAFARI_COMPLIANCE.md#rejected-options).

---

## Open TODOs

Roughly ordered by release-blocking likelihood.

### 🟡 macOS in-place upgrade — `.pkg` path wired, distribution still TBD

The app is always running (autostart at login + hide-on-close +
`tauri-plugin-single-instance` + `applicationShouldTerminate:`
intercept), so a `.dmg` drag-replace fails to overwrite the running
bundle. The `.pkg` path now handles this end to end:

- [scripts/build-mac-pkg.sh](../scripts/build-mac-pkg.sh) builds a
  signed installer.
- [scripts/macos-pkg/scripts/preinstall](../scripts/macos-pkg/scripts/preinstall)
  stops the running app (polite quit → SIGTERM by binary path →
  SIGKILL stragglers + `--native-host` subprocesses) before the
  payload is laid down.
- The `postinstall` script relaunches the app for the invoking
  user.

What's still owed:

- [ ] Decide whether the `.pkg` becomes the **primary** macOS
      distribution or whether the `.dmg` keeps shipping with a
      "quit before installing" disclaimer.
- [ ] If primary: Apple Developer ID **Installer** certificate
      provisioned alongside the existing Application certificate.
- [ ] CI: notarize + staple the `.pkg` (the script structure is
      ready; needs `APPLE_DEVELOPER_INSTALLER_IDENTITY`,
      `APPLE_NOTARIZE_USER`, `APPLE_NOTARIZE_PASS`,
      `APPLE_TEAM_ID`).
- [ ] Test the upgrade path on a real machine: install v2 from
      `.pkg`, leave it running for a session, install a slightly
      newer v2 from `.pkg` over the top — confirm running app dies,
      payload swaps cleanly, postinstall relaunches.

### 🟡 macOS *"would like to access data from other apps"* prompt

Fires once on first launch on macOS Sonoma/Sequoia and has no
in-app context. On Sequoia (15+) this single user-facing prompt
maps to several underlying TCC classes that Apple consolidated —
process-info reads (sysinfo's `proc_pidpath`) and shared App Group
container reads both surface as the same *"data from other apps"*
dialog. We tried replacing sysinfo with
`libc::proc_listallpids` + `libc::proc_name` and the prompt still
fired, so the App Group read in
[app_group.rs](../src-tauri/src/app_group.rs) is the (or another)
trigger.

The prompt is honest — we're genuinely reading data another app
wrote — and can't be suppressed without breaking Safari support.
The realistic fix is **UX, not code**: surface a one-line
explanation in the Safari onboarding step before the first
`app_group::path()` call fires, e.g. *"macOS will ask permission
for Rum to read data from the ReDD Focus Safari extension —
that's how we know whether your block is active."* Defer the first
read until after that screen has been shown.

If a future macOS release ever splits the consolidated prompts
back out, we can revisit replacing sysinfo with libproc to silence
the process-info half independently — kept as a parked option.

### 🟡 Windows regression testing

`MIGRATION_RUNBOOK.md` covers the migration overlay flow. End-to-end
regression on a clean Windows VM still owed:

- [ ] Fresh install of v2 on Windows 10 + 11 — confirm no admin/UAC
      prompt during install (only once during first-launch
      migration if v1.x residue is present).
- [ ] Native-messaging manifests written to all four registry keys
      (`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ulriklyngs.mindshield`
      and equivalents for Brave / Edge / Mozilla).
- [ ] Watchdog scheduled task (`Rum Watchdog`) registers on
      first launch; survives app crash + relaunch within 1 minute.
- [ ] Enforcer kill path: disable extension in Chrome → toast → 60 s
      grace → `taskkill /IM chrome.exe /T` → 10 s grace → `taskkill
      /F`. Verified browser is actually killed, not just minimised.
- [ ] App-blocking in-process loop (sysinfo poll-and-kill) fires
      against a real blocked app (e.g. Notepad).
- [ ] v1.x → v2 upgrade with both `--silent` and interactive NSIS
      installers.
- [ ] Uninstall via Settings → Apps → confirm registry keys + watchdog
      task + native-messaging manifests are all removed.

### 🟡 Native messaging E2E on a clean machine

The v1.x → v1.0 native-messaging path had intermittent failures (some
browsers wouldn't connect; some installations dropped manifests). The
v2 path uses `tauri-plugin-single-instance` and a per-OS user-scope
manifest written by `native_host_install.rs`. Worth a fresh run on a
machine that has never had Rum on it:

- [ ] Each of Chrome / Brave / Edge / Firefox: install the extension
      from its store, confirm `connectNative("com.ulriklyngs.mindshield")`
      succeeds within 5 s of extension load (visible in extension
      DevTools console — `[redd-block] native disconnected:` would
      indicate failure).
- [ ] Install the app *after* installing the extensions. Confirm the
      extensions reconnect within the backoff window.
- [ ] Kill the app while the browser is open. Confirm the extension
      logs disconnect, then reconnects when the app relaunches.
- [ ] Repeat on a corporate-managed machine if available — these
      sometimes have group policy blocking native-messaging hosts.

### 🟡 Localhost HTTP fallback — re-evaluate now that the rest is solid

Originally parked (FUTURE_OPTIONS.md §A) because we didn't want a
second transport without evidence we needed one. After the v2 native-
messaging path is regression-tested, decide:

- If native messaging is solid on every test machine → leave
  parked.
- If any browser/policy combination still flakes → ship the localhost
  fallback. Cost estimate in FUTURE_OPTIONS.md is ~150 LOC Rust + ~80
  LOC JS + extension store re-review.

### 🟢 `redd-focus-web/` upstream sync

The folder is gitignored; it's a local checkout of the public ReDD
Focus extension repo. The Safari handler rewrite, App Group
entitlements, manifest version bump, 15 s heartbeat,
`isAllowedIncognitoAccess()` switch, and (pending) `web_accessible_resources`
fix all need to be PR'd upstream before the next Safari App Store
release.

### 🟢 Diagnostics screen surfacing

`browserComplianceStatus()` and `firstNonCompliantBrowser()` in
`src/app.js` are now consistent with the Rust gate, but the Settings
→ Diagnostics modal calls `browserComplianceStatus(b)` (single arg —
likely a bug from before the signature changed). Confirm the
Diagnostics row reflects real Safari state once the rest of v2 is
verified.

### 🟢 Multi-space / minimised-Safari coverage

The frontmost-app gate (`safari_is_frontmost()` in
[profile_scan.rs](../src-tauri/src/profile_scan.rs)) means we
*don't* enforce when Safari is minimised or parked on a different
Mission Control space. A determined user could disable the
extension and let auto-refreshing background tabs load blocked
content silently. They can't actually use Safari without bringing
it forward (at which point enforcement resumes within ~45 s), so
this is mostly theoretical, but it is a real escape hatch.

The clean fix is the FDA + plist-read path
([SAFARI_COMPLIANCE.md → Rejected options](SAFARI_COMPLIANCE.md#rejected-options))
which doesn't depend on the heartbeat at all. Parked as a v2.1
cleanup; the frontmost-app gate is the v2 ship answer because it
needs no new permission and no battery-cost wake-ups.
