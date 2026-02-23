# ReDD Block Testing Tiers

This document expands the `README.md` testing section with a deeper technical explanation of each tier, how to run it, what it validates, and what it does not validate.

Terminology in this file follows `README.md`:

- **Tier 1** = in-app logic tests
- **Tier 2** = in-app integration tests
- **Tier 3** = helper daemon smoke tests

---

## Why we use tiers

Each tier answers a different quality question:

- **Tier 1**: Is our blocking logic correct as pure behavior?
- **Tier 2**: Does app -> Tauri -> helper flow behave correctly with real side effects?
- **Tier 3**: Is the helper itself healthy and enforcing baseline system behavior?

No single tier is sufficient on its own.

---

## Quick run guide

- **Tier 1**
  - Start app in dev mode: `npm run dev`
  - Trigger tests: `Cmd+Shift+T` (macOS) or `Ctrl+Shift+T` (Windows)
  - Or console: `runBlockingTests()`
- **Tier 2**
  - In app dev console (default fast profile): `runIntegrationTests('core')`
  - In app dev console (expanded profile): `runIntegrationTests('full')`
- **Tier 3**
  - Cross-platform wrapper: `npm run test:helper`
  - macOS directly: `sudo ./scripts/test-helper-mac.sh`
  - Windows directly: `powershell -ExecutionPolicy Bypass -File .\scripts\test-helper-win.ps1`

---

## Tier 1: In-App Logic Tests

## Purpose

Tier 1 validates logic and state-composition rules without requiring helper installation or system file mutation.

## Entry points and structure

- Runner and categories: `src/blocking-tests.js`
- Pure helper/test functions: `src/test-utils.js`
- Loaded in dev UI via script tags: `src/index.html`
- Keyboard shortcut wiring: `src/app.js` (`Cmd/Ctrl + Shift + T`)

## What it actually tests

`src/blocking-tests.js` currently covers logical categories such as:

- time-window behavior (active/future/expired),
- schedule/day/time activation (including cross-midnight),
- overlap/union semantics,
- shared-domain edge cases,
- override and override-all state transitions,
- challenge difficulty selection,
- protected app/domain guards.

It uses mock `appData` and pure functions from `src/test-utils.js` including:

- `getBlockedDomains(...)`
- `hasAnyActiveBlocks(...)`
- `findHardestChallengeAtTime(...)`
- `simulateOverrideAll(...)`

## What differentiates Tier 1

- Very fast and deterministic.
- Excellent for regression in business logic.
- Minimal environment dependency.

## Important limitations

- Does not prove real hosts file writes.
- Does not prove DNS flush behavior.
- Does not prove real helper IPC transport.
- App watcher behavior is mostly marked as manual/placeholder in this tier.

---

## Tier 2: In-App Integration Tests

## Purpose

Tier 2 validates real side effects through the same app pathways users hit:

- frontend state updates,
- Tauri command calls,
- helper orchestration,
- hosts updates/cleanup.

## Entry points and structure

- Integration suite: `src/integration-tests.js`
- Exposed runner: `window.runIntegrationTests(profile)`
- Uses internals exported by app runtime:
  - `window.__REDDBLOCK_INTERNALS__` from `src/app.js`

Core internal handles used:

- `appData`
- `saveData`
- `updateHostsFile`
- `tauriAPI`
- `render`

## Current profile model

Tier 2 now supports two profiles:

- `runIntegrationTests('core')`
  - fast critical checks intended for regular local use.
- `runIntegrationTests('full')`
  - runs `core` plus expanded non-UI coverage.

Default behavior with invalid/missing profile falls back to `core`.

## Tier 2 exact test IDs and profile coverage

The IDs below match both:

- `src/integration-tests.js` test names, and
- console output lines (pass/fail/skip + group failure summary when applicable).

### Testing Group A: One-off and schedule mechanics
- **A1**: Hosts modification path
- **A2**: One-off start/end timing
- **A3**: Schedule active-now path
- **A4**: Future schedule path (**full only**)
- **A5**: Pause/resume one-off state path (**full only**)
- **A6**: Pause/resume one-off enforcement path (**full only**)
- **A7**: Pause natural-expiry one-off smoke (**full only**)
- **A8**: Pause/resume schedule active path (**full only**)
- **A9**: Pause natural-expiry schedule smoke (**full only**)
- **A10**: Pause inactive schedule suppression path (**full only**)

Expected outcome:
- blocking and schedule state transitions succeed through app -> Tauri -> helper
- pause/resume transitions propagate through save + hosts/helper sync paths
- short timer-smoke checks confirm automatic pause expiry clears pause flags

Pause case intent (expected vs what test verifies):
- **A6 expected**: paused one-off is temporarily non-enforcing and manual resume restores enforcement; **verified** by pause flags + successful sync path before/after resume.
- **A7 expected**: paused one-off auto-resumes after pause timeout; **verified** by short wait then pause flags naturally cleared.
- **A8 expected**: active schedule can be paused and resumed with clean helper sync; **verified** by schedule pause flags + successful sync path before/after resume.
- **A9 expected**: paused schedule auto-resumes after pause timeout; **verified** by short wait then schedule pause flags naturally cleared.
- **A10 expected**: inactive schedule can be paused to suppress upcoming activation and then resumed; **verified** by inactive pause flag transition + clean resume/sync path.

### Testing Group B: Multi-block overlap correctness
- **B1**: Shared-domain overlap
- **B2**: One-off + schedule same blocklist (**full only**)

Expected outcome:
- overlap behavior remains stable without merge/preference regressions

### Testing Group C: Clear and override semantics
- **C1**: Scoped clear by blocklist ID
- **C2**: Clear-all manual blocks (**full only**)

Expected outcome:
- scoped clear affects only targeted manual block scope
- clear-all removes all manual block scope

### Testing Group D: Keep-blocking preference decision inputs
- **D1**: Keep-blocking preference roundtrip

Expected outcome:
- helper preference update path is reliable and reversible

### Testing Group E: Hosts safety and cleanup invariants
- **E1**: Clean hosts command path

Expected outcome:
- hosts cleanup command path succeeds without helper command errors

### Testing Group F: App-block command-path checks (non-visual)
- **F1**: Set blocked apps command path (**full only**)
- **F2**: Protected app payload path (**full only**)

Expected outcome:
- app-block command transport remains stable (visual watcher behavior is still manual)

## Tier 2 profile composition

- `core`: `A1`, `A2`, `A3`, `B1`, `C1`, `D1`, `E1`
- `full`: `core` + `A4`, `A5`, `A6`, `A7`, `A8`, `A9`, `A10`, `B2`, `C2`, `F1`, `F2`

## Suite behavior

1. setup initializes test harness state.
2. tests run sequentially by selected profile.
3. teardown clears test-created app state and helper-side temporary enforcement state.
4. when profile is `full` and at least one test fails, output includes a bottom **Group failure summary** for groups `A`-`F`.

## What differentiates Tier 2

- Real system-touching app flow from UI-side code.
- Exercises app-to-helper coordination and persistence behavior.
- Catches integration issues missed by Tier 1.

## Important limitations

- Some checks remain command-path assertions rather than UI-visible assertions.
- Tests can be skipped when helper is unavailable or version-mismatched.
- Still not a substitute for manual visual UX and OS prompt flows.

---

## Tier 3: Helper Daemon Smoke Tests

## Purpose

Tier 3 directly validates helper baseline health and enforcement pipeline independent of most frontend logic.

## Entry points and structure

- macOS script: `scripts/test-helper-mac.sh`
- Windows script: `scripts/test-helper-win.ps1`
- npm wrapper: `package.json` -> `test:helper`

## Transport specifics

- macOS uses Unix socket: `/tmp/redd-block-helper.sock`
- Windows uses TCP loopback: `127.0.0.1:62222`
  - includes auth token handling from `%PROGRAMDATA%\ReDD Block\auth-token`

## What it actually checks

Both scripts validate a baseline chain:

1. helper reachable (socket/TCP),
2. `ping`,
3. helper version/status,
4. start a smoke test block,
5. verify hosts contains test domain + markers,
6. clear block,
7. verify cleanup and localhost safety.

## What differentiates Tier 3

- Closest to helper engine health.
- Fast failure signal for helper transport/enforcement regressions.
- Useful before deep app-level debugging.

## Important limitations

- Bypasses most frontend orchestration and UI logic.
- Not a complete product behavior test.
- Focused on baseline helper correctness, not full feature matrix.

---

## Tier Comparison

- **Tier 1 (logic)**: high breadth of logic permutations, zero system mutation.
- **Tier 2 (integration)**: moderate breadth, real app pathways and side effects.
- **Tier 3 (smoke/helper)**: narrow breadth, deep helper sanity and transport checks.

Recommended stance:

- Use all three tiers together.
- Treat Tier 2 as the primary candidate for expansion when aligning automation with manual checklist depth.

---

## Typical contributor workflow

1. Run Tier 1 during active feature work for fast feedback.
2. Run Tier 2 before merging behavior changes that touch block/schedule/helper flows.
3. Run Tier 3 when debugging helper-specific issues or before release packaging.
4. Run manual checklist for final release confidence and UX/platform validation.

---

## Common troubleshooting

- Tier 1 not running:
  - confirm `src/index.html` includes `test-utils.js` and `blocking-tests.js`.
  - confirm shortcut handler in `src/app.js` is active in current build.
- Tier 2 failing at setup/teardown:
  - confirm `window.__REDDBLOCK_INTERNALS__` exports are present from `src/app.js`.
  - confirm helper is installed/running for helper-dependent cases.
- Tier 3 connection failures:
  - verify helper service is installed and started.
  - check socket/TCP path and permissions.
  - on Windows, check auth token file and firewall/task state.

