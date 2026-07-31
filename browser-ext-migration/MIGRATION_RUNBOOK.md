# How the v1.x → v2 migration runs in practice (Windows)

> **Historical.** Describes v1→v2 upgrade cleanup (still runs in v3 via
> `commands/migration.rs`). macOS website blocking changed again in v3 — see
> [../architecture.md](../architecture.md).

## Context

We've verified the cleanup *logic* works end-to-end (`cargo run --example test_migration` — accept, cancel, retry, idempotent re-run all green; data preservation verified by MD5). The remaining question is the *delivery* path: when a real v1.x user installs v2, what fires the cleanup, and is that flow practically testable?

This is a planning/analysis doc — no code edits proposed unless you choose option B or C below.

## How it actually fires today

Trace: NSIS installer → first launch → frontend full-screen onboarding → Rust migration.

1. **Installer** (`src-tauri/tauri.conf.json` + `src-tauri/windows/hooks.nsh`): Tauri's NSIS bundle in default mode **overwrites** v1.x files. It does **not** run the v1.x uninstaller and has **no pre-install hook**. The pre-uninstall hook in `hooks.nsh:1-39` only fires during *uninstall*, not upgrade. Installer launches `redd-block.exe` at the end (or the user does, if they unchecked "Run Digital Habits: Blocker" on the finish page).
2. **App startup** (`src-tauri/src/lib.rs::run()`): the Rust `setup` block calls `commands::enforcement::auto_start`, which checks `migration_pending_sync()` and starts the enforcer **paused** if v1.x residue is on disk. Without this, the enforcer would fire 30-60 s after launch and kill the user's browser before they had a chance to install the Digital Habits: Focus extension.
3. **Frontend** (`src/app.js::runDesktopOnboarding`): on every non-iOS launch, calls the lightweight `migration_pending` check. Two outcomes:
   - **Pending** → show full-screen `#migration-onboarding` overlay in **"pre"** phase (welcome card + Continue button). The main UI is gated until the user dismisses the overlay.
   - **Not pending, but `migration_was_pending_at_launch=true`** → show overlay in **"post"** phase (cleanup-complete checklist + per-browser install buttons).
   - Neither → main UI loads normally; `extension-compliance-banner` may still nag.
4. **Backend** (`src-tauri/src/commands/migration.rs::run_upgrade_migration`): only fired when the user clicks Continue (or the in-overlay Try Again button) — `onboarding_state` is now pure (no migration as a side effect). The gate is `migration_pending_sync()`, not the version stamp — residue can reappear (e.g. v1.x reinstalled side-by-side) and we re-migrate. On success, version is stamped via `stamp_version`.
5. **Recovery on cancel/failure**: same overlay stays open with status text "We need that admin permission to finish — your blocklists are safe" and the Continue button relabelled "Try again". User clicks → re-prompt. No way to accidentally dismiss the overlay short of force-quitting the app.

So **yes** — install / upgrade does run cleanup, at first launch rather than during install itself. One UAC prompt the first time they open v2 (after they click Continue on the welcome card, so they have context).

## The practical test workflow on this machine

**Tier 1 — cleanup logic only (what we've been doing):**
```
scripts/test-migration.ps1 inject     # elevated; fakes residue
cd src-tauri ; cargo run --example test_migration
scripts/test-migration.ps1 check
```
Fast. Exercises `run_elevated_migration` + the elevated PowerShell. Skips the Tauri UI, the version-stamp gate, the banners, the installer.

**Tier 2 — full first-launch flow (not yet exercised):**
```
# build unsigned NSIS installer (debug)
npm run tauri -- build --debug --bundles nsis
# inject residue first if you want to simulate v1.x upgrade
scripts/test-migration.ps1 inject
# install
src-tauri/target/debug/bundle/nsis/Digital Habits Blocker_<ver>_x64-setup.exe
# Tauri auto-launches at install end (finish-page "Run Digital Habits: Blocker").
# Expect:
#   1. Full-screen "Welcome to Digital Habits: Blocker 2.0" overlay (not the main UI)
#   2. Click Continue → UAC fires
#   3. Accept → overlay swaps to post-cleanup checklist with per-browser buttons
#   4. Click "I've installed it" → main UI shows, enforcer resumes
# Verify: hosts clean, helper-state.json gone, scheduled task gone,
#         redd-block-data.json user-data fields unchanged (the file's
#         byte hash WILL change on Windows because the running app
#         legitimately stamps `migrationRanAtVersion` and
#         `migrationRanAt`; only the macOS .pkg flow leaves it
#         byte-identical because cleanup runs from preinstall before
#         the new app ever launches).
```
This is the only way to validate that the *frontend wiring* (auto-fire on first launch + retry path + browser-store deep-links + enforcer pause) actually works — `cargo run --example test_migration` skips all of it.

**Tier 3 — real v1.x upgrade:** install an actual v1.x release first (creates real `helper-state.json`, real scheduled task, real hosts markers, populated `redd-block-data.json`). Then run the v2 installer over the top. This is what the macOS Claude's instructions described. Highest fidelity, slowest to set up.

## Design point: should the installer itself trigger cleanup?

The current design defers cleanup to first launch. Trade-offs vs triggering it from NSIS:

| | Current (runtime, first-launch) | Alternative (NSIS pre-install hook) |
|---|---|---|
| UAC prompts during install | 1 (the NSIS installer itself) | 1 (NSIS already runs elevated — could piggyback) |
| UAC prompts at first launch | 1 (migration) | 0 |
| v1.x daemon/scheduled task active during overlap window | Yes — between install end and user accepting UAC, v1 scheduled task can still fire | No — cleaned before v2 binaries land |
| Complexity | Low. All cleanup logic in Rust, one code path | Higher. NSIS-side scripting OR ship v1 binary in v2 installer just to invoke its `--uninstall` |
| Testability | Easy — `cargo run --example test_migration` exercises the core path | Harder — needs full NSIS install dance to test |
| Failure recovery | "Migration incomplete" banner + Retry button | NSIS hook failure stops install; recovery story unclear |
| Cancel path | User declines UAC → banner appears, app keeps working | User declines UAC → install fails halfway? |

The current design's main weakness is the **overlap window**: between v2 install completing and the user accepting UAC at first launch, the v1.x scheduled task can still respawn the v1 daemon, which can re-touch hosts. Probably benign in practice (the daemon's behaviour at that point is to re-assert markers it already wrote), but it's not zero-risk.

**Recommendation:** keep the current design. The runtime path is simpler, more testable, has a clean failure-recovery story (Retry banner), and the overlap window is short and low-impact. The "Migration incomplete" banner is the load-bearing UX guarantee that cleanup will eventually happen even if the user dismisses the first UAC.

## What to actually do next

Three options, in increasing scope:

### Option A — Just run the Tier 2 test (recommended)

Build the debug NSIS installer, install it on this machine (residue is gone post our tests, so re-inject first), launch and confirm:
- UAC fires automatically without us having to invoke anything
- Accept → no "Migration incomplete" banner, upgrade welcome card shows once
- Cancel → "Migration incomplete" banner appears with Retry button; click Retry, accept → completes

If this passes, the migration delivery story is validated. Files to read for verification: `src/app.js:959-1090`, `src/index.html` (banner markup).

No code changes. Pure verification.

### Option B — Tighten the runtime path before testing

Small fixes to `src-tauri/src/commands/migration.rs` informed by the audit:
- Step 5 `ipconfig /flushdns` already wrapped in EAP=Continue (done this session).
- `Set-Content -Encoding ASCII` → `utf8NoBOM` to preserve Unicode in hosts (data fidelity).
- Launcher's `catch` block conflates UAC-cancel with launch failure — tighten to inspect `$_.Exception` and distinguish.
- Optional: stale-temp-file sweep at startup (`%TEMP%\redd-migration*`).

Then run Tier 2.

### Option C — Add NSIS pre-install hook (large, not recommended)

Move cleanup into a `NSIS_HOOK_PREINSTALL` macro in `windows/hooks.nsh` that calls the elevated PowerShell directly. Requires either reimplementing the cleanup as embedded NSIS script *or* shipping a stub `redd-block.exe --migrate-only` invocation that runs before the main install. Substantial scope; only worth it if you decide the overlap window is unacceptable.

## Critical files (for whichever option you pick)

- `src-tauri/src/commands/migration.rs` — cleanup logic (`run_upgrade_migration`, `run_elevated_migration`, `run_elevated_windows`)
- `src-tauri/src/main.rs:36-48` — `--uninstall` flag handler
- `src-tauri/src/lib.rs::run()` — confirms no backend migration on startup
- `src/app.js:959, 1038-1090` — frontend invocation + banner wiring
- `src/index.html` — banner markup
- `src-tauri/windows/hooks.nsh` — NSIS pre-uninstall hook (only)
- `src-tauri/tauri.conf.json` — NSIS installer config (default mode, no pre-install hook)

## Verification (Tier 2 — Option A)

```powershell
# residue baseline — capture user-data fields, not byte hash. The
# migration WILL touch redd-block-data.json on Windows (stamp the
# version) so MD5 comparison will always fail; instead diff the
# JSON before/after at the field level. blocklists, schedules,
# settings.eulaAcceptedAt, settings.onboardingComplete must
# round-trip identically.
scripts\test-migration.ps1 inject
$pre = Get-Content 'C:\ProgramData\Digital Habits Blocker\redd-block-data.json' -Raw | ConvertFrom-Json

# build + install
npm run tauri -- build --debug --bundles nsis
& "src-tauri\target\debug\bundle\nsis\Digital Habits Blocker_*_x64-setup.exe"
# Tauri's installer launches the app at end. UAC should fire.

# verify
scripts\test-migration.ps1 check                    # all (absent)
$post = Get-Content 'C:\ProgramData\Digital Habits Blocker\redd-block-data.json' -Raw | ConvertFrom-Json
# preserved (must match):
($post.blocklists | ConvertTo-Json -Depth 10) -eq ($pre.blocklists | ConvertTo-Json -Depth 10)
($post.schedules | ConvertTo-Json -Depth 10) -eq ($pre.schedules | ConvertTo-Json -Depth 10)
$post.settings.eulaAcceptedAt -eq $pre.settings.eulaAcceptedAt
# stamped (must NOT match):
$post.settings.migrationRanAtVersion -eq '2.0.0'
# confirm one-time upgrade welcome card visible; close + relaunch → no UAC, no card
```

Cancel path:
```powershell
scripts\test-migration.ps1 inject
# launch redd-block.exe from Start menu → DECLINE UAC
# expect: full-screen overlay STAYS visible with status text
#         "We need that admin permission to finish — your blocklists
#         are safe.", Continue button relabelled "Try again". Residue
#         intact, main UI not visible.
# click Try again, accept UAC → overlay swaps to post-cleanup
# checklist (per-browser install buttons), residue cleaned.
```
