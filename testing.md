# Fristed Testing Tiers

This document expands the `README.md` testing section with a deeper technical explanation of each tier, how to run it, what it validates, and what it does not validate.

Terminology in this file follows `README.md`:

- **Tier 1** = in-app logic tests
- **Tier 2** = in-app integration tests (desktop command-path + legacy hosts checks)

There is **no Tier 3** anymore — the v1.x privileged helper daemon and its smoke-test scripts were removed in v2.

---

## Why we use tiers

Each tier answers a different quality question:

- **Tier 1**: Is our blocking logic correct as pure behavior?
- **Tier 2**: Do app → Tauri command paths, data persistence, and migration cleanup behave correctly?

No single tier is sufficient on its own. **Website blocking enforcement** (macOS Automation redirects, Windows/Firefox native messaging) is validated primarily through the **manual checklist** — Tier 2 still contains some legacy hosts-file assertions from the v1 helper era that do not prove v3 blocking works.

---

## Quick run guide

- **Tier 1**
  - Start app in dev mode: `npm run dev`
  - Trigger tests: `Cmd+Shift+T` (macOS) or `Ctrl+Shift+T` (Windows)
  - Or console: `runBlockingTests()`
- **Tier 2**
  - In app dev console (default fast profile): `runIntegrationTests('core')`
  - In app dev console (expanded profile): `runIntegrationTests('full')`

---

## Tier 1: In-App Logic Tests

### Purpose

Tier 1 validates logic and state-composition rules without Tauri side effects or system file mutation.

### Entry points and structure

- Runner and categories: `src/blocking-tests.js`
- Pure helper/test functions: `src/test-utils.js`
- Loaded in dev UI via script tags: `src/index.html`
- Keyboard shortcut wiring: `src/app.js` (`Cmd/Ctrl + Shift + T`)

### What it actually tests

`src/blocking-tests.js` currently covers logical categories such as:

- time-window behavior (active/future/expired),
- schedule/day/time activation (including cross-midnight),
- overlap/union semantics,
- shared-domain edge cases,
- override and override-all state transitions,
- challenge difficulty selection (including max-difficulty effective count),
- blocklist duplication (data shape, naming, override copy, schedule copy),
- protected app/domain guards.

It uses mock `appData` and pure functions from `src/test-utils.js` including:

- `getBlockedDomains(...)`
- `hasAnyActiveBlocks(...)`
- `findHardestChallengeAtTime(...)`
- `simulateOverrideAll(...)`

### What differentiates Tier 1

- Very fast and deterministic.
- Excellent for regression in business logic.
- Minimal environment dependency.

### Important limitations

- Does not prove real Automation redirects (macOS) or extension blocking (Windows/Firefox).
- Does not prove app-watcher quit behavior (manual checklist covers that).
- App watcher behavior is mostly marked as manual/placeholder in this tier.

---

## Tier 2: In-App Integration Tests

### Purpose

Tier 2 validates real side effects through the same app pathways users hit:

- frontend state updates,
- Tauri command calls (`save_data`, legacy `*_via_helper` shims, `clean_hosts_file`, app-blocking commands),
- pause/resume flag propagation,
- diagnostics contract.

It does **not** run a separate helper daemon. `check_helper_status()` always reports the app itself as ready via `helper_shim.rs`.

### Entry points and structure

- Integration suite: `src/integration-tests.js`
- Exposed runner: `window.runIntegrationTests(profile)`
- Uses internals exported by app runtime:
  - `window.__REDDBLOCK_INTERNALS__` from `src/app.js`

Core internal handles used:

- `appData`
- `saveData`
- `updateHostsFile` (legacy name — does not write hosts in v3)
- `tauriAPI`
- `render`

### Current profile model

- `runIntegrationTests('core')` — fast critical checks for regular local use.
- `runIntegrationTests('full')` — `core` plus expanded non-UI coverage.

Default behavior with invalid/missing profile falls back to `core`.

### Tier 2 exact test IDs and profile coverage

### Testing Group A: One-off and schedule mechanics
- **A1**: Legacy hosts modification path (**see limitations below**)
- **A2**: One-off start/end timing
- **A3**: Schedule active-now path
- **A4**: Future schedule path (**full only**)
- **A5**: Pause/resume one-off state path (**full only**)
- **A6**: Pause/resume one-off enforcement path
- **A7**: Pause natural-expiry one-off smoke (**full only**)
- **A8**: Pause/resume schedule active path (**full only**)
- **A9**: Pause natural-expiry schedule smoke (**full only**)
- **A10**: Pause inactive schedule suppression path (**full only**)
- **A11**: Pause state roundtrip (**full only**)

Expected outcome for A2–A10, A11:
- blocking and schedule state transitions succeed through save + shim command paths
- pause/resume transitions update flags and sync without errors
- short timer-smoke checks confirm automatic pause expiry clears pause flags

### Testing Group B: Multi-block overlap correctness
- **B1**: Shared-domain overlap
- **B2**: One-off + schedule same blocklist (**full only**)

### Testing Group C: Clear and override semantics
- **C1**: Scoped clear by blocklist ID (**legacy hosts assertion — see limitations**)
- **C2**: Clear-all manual blocks (**full only**)
- **C3**: Max difficulty blocklist start/clear path (**full only**)

### Testing Group E: Hosts safety and cleanup invariants
- **E1**: Clean hosts command path (v1 migration cleanup — strips markers if present)
- **E2**: Diagnostics contract

### Testing Group F: App-block command-path checks (non-visual)
- **F1**: Set blocked apps command path (**full only**)
- **F2**: Protected app payload path (**full only**)

### Testing Group G: Blocklist management
- **G1**: Duplicate blocklist then start/clear path (**full only**)

## Tier 2 profile composition

- `core`: `A1`, `A2`, `A3`, `A6`, `B1`, `C1`, `E1`, `E2`
- `full`: `core` + `A4`, `A5`, `A7`, `A8`, `A9`, `A10`, `A11`, `B2`, `C2`, `C3`, `F1`, `F2`, `G1`

## Suite behavior

1. Setup snapshots the current `appData` so the suite can restore the user's state when it finishes.
2. Tests run sequentially by selected profile.
3. Some full-only pause/schedule cases use per-test reset/setup-cleanup boundaries.
4. Teardown restores the saved snapshot, saves it, and re-syncs via legacy shim commands.
5. When profile is `full` and at least one test fails, output includes a bottom **Group failure summary** for groups `A`–`G`.

### What differentiates Tier 2

- Real Tauri command flow from UI-side code.
- Catches persistence and shim regressions missed by Tier 1.

### Important limitations

- **A1, C1, C3, and parts of B/C groups** still assert domains appear in `/etc/hosts` via diagnostics. v3 website blocking does **not** write hosts — those tests validate legacy assumptions and **will fail or pass vacuously** unless rewritten to check `derive_payload` / browser-visible blocking instead.
- Some checks are command-path assertions, not UI-visible assertions.
- Not a substitute for manual Automation TCC flows, extension install, or enforcer grace UX.
- **Tech debt:** rewrite Tier 2 website assertions for v3 (Automation + native host) — tracked alongside renaming `updateHostsFile()`.

---

## Tier Comparison

- **Tier 1 (logic)**: high breadth of logic permutations, zero system mutation.
- **Tier 2 (integration)**: moderate breadth, Tauri command paths + stale hosts checks.
- **Manual checklist**: required for website enforcement, permissions, enforcer, and visual UX.

Recommended stance:

- Run Tier 1 during feature work.
- Run Tier 2 for data/sync/shim regressions; do not treat passing Tier 2 as proof of website blocking.
- Run the manual checklist before every release.

---

## iOS and testing tiers

iOS enforcement uses the Screen Time plugin (`tauri-plugin-screentime`).

- **Tier 1 (logic):** Runs in the app; safe on iOS. Same blocking/schedule/override logic applies.
- **Tier 2 (integration):** Desktop-oriented; helper-dependent paths always see the shim as “ready” but do not exercise Screen Time. **Manual checklist is the primary way to validate iOS.**

For release, run the **manual test checklist** (section **14. iOS-Specific**) on a physical iPhone.

---

## Typical contributor workflow

1. Run Tier 1 during active feature work for fast feedback.
2. Run Tier 2 before merging changes that touch save/sync/shim/app-blocking command paths.
3. Run the manual checklist for website blocking, permissions, enforcer, and release confidence.

---

## Common troubleshooting

- **Tier 1 not running:**
  - confirm `src/index.html` includes `test-utils.js` and `blocking-tests.js`.
  - confirm shortcut handler in `src/app.js` is active in current build.
- **Tier 2 failing on A1/C1/C3 (hosts assertions):**
  - expected on v3 until integration tests are rewritten — use manual checklist for website blocking instead.
- **Tier 2 failing at setup/teardown:**
  - confirm `window.__REDDBLOCK_INTERNALS__` exports are present from `src/app.js`.
