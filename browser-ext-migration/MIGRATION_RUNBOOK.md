# How the v1.x → v2 migration runs in practice (Windows)

## Context

We've verified the cleanup *logic* works end-to-end (`cargo run --example test_migration` — accept, cancel, retry, idempotent re-run all green; data preservation verified by MD5). The remaining question is the *delivery* path: when a real v1.x user installs v2, what fires the cleanup, and is that flow practically testable?

This is a planning/analysis doc — no code edits proposed unless you choose option B or C below.

## How it actually fires today

Trace: NSIS installer → first launch → frontend `invoke('onboarding_state')` → Rust migration.

1. **Installer** (`src-tauri/tauri.conf.json` + `src-tauri/windows/hooks.nsh`): Tauri's NSIS bundle in default mode **overwrites** v1.x files. It does **not** run the v1.x uninstaller and has **no pre-install hook**. The pre-uninstall hook in `hooks.nsh:1-39` only fires during *uninstall*, not upgrade. Installer launches `redd-block.exe` at the end.
2. **App startup** (`src-tauri/src/lib.rs::run()`): the Rust `setup` block is **silent on migration**. No backend-driven detection. Cleanup is 100% frontend-triggered.
3. **Frontend** (`src/app.js:959, :1038`): `runDesktopOnboarding()` is called unconditionally on every non-iOS launch and `invoke('onboarding_state')`.
4. **Backend** (`src-tauri/src/commands/migration.rs:293-316`): `onboarding_state` synchronously calls `run_upgrade_migration` *before* returning. That function (`migration.rs:238-290`) gates on `settings.migrationRanAtVersion == CARGO_PKG_VERSION` — fast no-op on subsequent launches. On first launch after upgrade, `migration_pending_sync()` trips, `run_elevated_migration` fires the **UAC prompt**, runs the elevated PowerShell, re-validates, and stamps the version.
5. **Banners** (`src/app.js:1040-1080+`):
   - `migration_pending=true` → "Migration incomplete" banner with a Retry button that re-invokes `run_upgrade_migration` directly (`app.js:1069`).
   - `had_residue_before && !migration_pending` → one-time upgrade welcome card.

So **yes** — re-install / update *does* run the cleanup, just at first-launch-after-install rather than during the install itself. The user sees one UAC prompt the first time they open v2.

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
src-tauri/target/debug/bundle/nsis/ReDD Block_<ver>_x64-setup.exe
# Tauri auto-launches at install end → expect UAC pops automatically
# verify: hosts clean, helper-state.json gone, scheduled task gone,
#         redd-block-data.json hash unchanged, no "Migration incomplete" banner
```
This is the only way to validate that the *frontend wiring* (auto-fire on first launch + Retry banner) actually works — `cargo run --example test_migration` skips all of it.

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
# residue baseline
scripts\test-migration.ps1 inject
$preDataHash = (Get-FileHash 'C:\ProgramData\ReDD Block\redd-block-data.json' -Algorithm MD5).Hash

# build + install
npm run tauri -- build --debug --bundles nsis
& "src-tauri\target\debug\bundle\nsis\ReDD Block_*_x64-setup.exe"
# Tauri's installer launches the app at end. UAC should fire.

# verify
scripts\test-migration.ps1 check                    # all (absent)
(Get-FileHash 'C:\ProgramData\ReDD Block\redd-block-data.json' -Algorithm MD5).Hash -eq $preDataHash
# inspect Settings → "migrationRanAtVersion" = "2.0.0"
# confirm one-time upgrade welcome card visible; close + relaunch → no UAC, no card
```

Cancel path:
```powershell
scripts\test-migration.ps1 inject
# launch redd-block.exe from Start menu → DECLINE UAC
# expect: "Migration incomplete" banner in UI, residue intact
# click Retry, accept UAC → completes, banner clears
```
