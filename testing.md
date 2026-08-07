# Digital Habits: Blocker Testing Tiers

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

No single tier is sufficient on its own. **Website blocking enforcement** (macOS Automation redirects, Windows/Firefox native messaging) is validated primarily through the **manual checklist** — Tier 2 asserts the Rust-derived enforcement snapshot (`current_blocking`), which proves derivation is correct but not that a browser actually redirects.

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
- protected app/domain guards,
- iOS allowlist effective-policy resolvers (Category 14, **T55–T62**).

The Category 14 tests are **logic tests, not behavior tests**: they exercise
the pure JS functions that decide what iOS Screen Time enforcement should do
(`specific-block` vs `all-except`, blocklist-wins subtraction, Apple's
50-exception cap, category-token exclusion) — constraints with no desktop
equivalent. They run in the normal desktop dev build; no iOS build, simulator,
or device is involved. Desktop's own allowlist composition rules live in Rust
and are covered by `cargo test` (see **Rust unit tests** below).

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
- **A1**: Enforcement derivation path (start → enforced, stop → cleared)
- **A2**: One-off start/end timing
- **A3**: Schedule active-now path
- **A4**: Future schedule path (**full only**)
- **A5**: Pause/resume one-off state path (**full only**)
- **A6**: Pause/resume one-off enforcement path
- **A7**: Pause natural-expiry one-off smoke (**full only**)
- **A8**: Pause/resume schedule active path (**full only**)
- **A9**: Pause natural-expiry schedule smoke (**full only**)
- **A10**: Pause inactive schedule suppression path (**full only**)
- **A11**: Data file owns enforcement — the legacy `set_blocks_via_helper` shim is ack-only and must not affect derived enforcement (**full only**)

Expected outcome for A2–A10, A11:
- blocking and schedule state transitions succeed through save + shim command paths
- pause/resume transitions update flags and sync without errors
- short timer-smoke checks confirm automatic pause expiry clears pause flags

### Testing Group B: Multi-block overlap correctness
- **B1**: Shared-domain overlap
- **B2**: One-off + schedule same blocklist (**full only**)

### Testing Group C: Clear and override semantics
- **C1**: Scoped clear by blocklist ID (shim ack + frontend clear path)
- **C2**: Clear-all manual blocks (**full only**)
- **C3**: Max difficulty blocklist start/clear path (**full only**)

### Testing Group E: Legacy-command and diagnostics invariants
- **E1**: Clean hosts command path (v1 migration cleanup — succeeds and is idempotent; v3 never writes hosts)
- **E2**: Diagnostics contract (v3 shim: always-ready helper status, `app_version` + `backend` label)

### Testing Group F: App-block command-path checks (non-visual)
- **F1**: Set blocked apps command path (**full only**)
- **F2**: Protected app payload path (**full only**)

### Testing Group G: Blocklist management
- **G1**: Duplicate blocklist then start/clear path (**full only**)

### Testing Group H: Allowlist mode (desktop websites channel)
- **H1**: Single allowlist enforcement state
- **H2**: Concurrent allowlists union (**full only**)
- **H3**: Allowlist + blocklist overlap (**full only**)
- **H4**: Pause/resume allowlist enforcement path (**full only**)

Group H creates, starts, pauses, and clears real allow-mode focus spaces
through the same save + sync path users hit (visible in the UI as the suite
runs). Each H test runs isolated (state reset before and after, same
mechanism as A4/A5/A7–A11), so leftover blocks from earlier failing tests
cannot skew its assertions. It asserts the Rust-derived enforcement snapshot via
`get_system_diagnostics` → `current_blocking` (`allowed_domains`,
per-block `mode`, flat blocked list) — the modern allowlist-aware read-back,
not the legacy hosts payload. Per-URL block/allow decisions and
blocklist-wins subtraction are decision-time logic covered by Rust unit tests
and Tier 1 Category 14. Group H is deliberately **websites-only**: automating
allow-mode app enforcement would enroll the tester's real open apps for quit —
that surface is manual checklist section 15.

## Tier 2 profile composition

- `core`: `A1`, `A2`, `A3`, `A6`, `B1`, `C1`, `E1`, `E2`, `H1`
- `full`: `core` + `A4`, `A5`, `A7`, `A8`, `A9`, `A10`, `A11`, `B2`, `C2`, `C3`, `F1`, `F2`, `G1`, `H2`, `H3`, `H4`

## Suite behavior

1. Setup snapshots the current `appData` so the suite can restore the user's state when it finishes.
2. Tests run sequentially by selected profile.
3. Some full-only pause/schedule cases use per-test reset/setup-cleanup boundaries.
4. Teardown restores the saved snapshot, saves it, and re-syncs via legacy shim commands.
5. When profile is `full` and at least one test fails, output includes a bottom **Group failure summary** for groups `A`–`H`.

### What differentiates Tier 2

- Real Tauri command flow from UI-side code.
- Catches persistence and shim regressions missed by Tier 1.

### Important limitations

- All groups now assert the Rust-derived enforcement snapshot (`get_system_diagnostics` → `current_blocking`), not the removed v1 hosts payload. This proves derivation and command paths, **not** browser-visible redirects.
- The legacy `*_via_helper` clear/set commands are acknowledgment-only shims on v3; the real clear path is the frontend mutating app data and saving. The rewritten C/B tests exercise both (shim ack + real path); A11 pins that shim payloads alone never affect enforcement.
- Some checks are command-path assertions, not UI-visible assertions.
- Not a substitute for manual Automation TCC flows, extension install, or enforcer grace UX.
- **Tech debt:** renaming `updateHostsFile()` (legacy name; it drives v3 sync).

---

## Rust unit tests

Desktop enforcement semantics live in Rust and carry their own unit tests,
run outside the app:

```
cd src-tauri && cargo test --lib
```

(Use `--lib`; bare `cargo test` currently fails compiling a stale
`test_watcher` example binary.)

Coverage relevant to blocking behavior:

- `web_automation.rs` — URL block/allow decisions, including the **desktop
  allowlist semantics**: allowlist blocks non-allowed hosts, allowlist-only
  sessions count as active web enforcement, concurrent allowlists union,
  blocklist precedence on overlap, and block-page metadata attribution
  (blocklist hit wins; else earliest-started allowlist).
- `native_host.rs` — extension payload derivation (`derive_payload`),
  including allowlist domains staying out of the legacy flat blocklist.
- `profile_scan.rs`, `window_inventory.rs`, `commands/diagnostics.rs`,
  `commands/migration.rs` — supporting surfaces.

Run these before merging changes to `web_automation.rs`, `native_host.rs`,
`app_watcher.rs`, or `enforcer.rs`.

---

## Android Kotlin unit tests

Android website blocking hinges on reading the URL out of each browser's URL
bar via the accessibility tree. That parsing lives in
`tauri-plugin-android-blocker/.../service/BrowserUrlParser.kt` — deliberately
free of Android framework types so it runs as a plain JVM test:

```
cd src-tauri/gen/android && ./gradlew :tauri-plugin-android-blocker:testDebugUnitTest
```

`BrowserUrlParserTest` pins **verbatim URL-bar strings dumped from real
devices** (`adb shell uiautomator dump`), quirks included. This matters because
a browser-specific quirk here fails *silently*: the browser stays in the
supported-package map, extraction just returns nothing, and that browser never
blocks with no error anywhere. That is exactly how Samsung Internet's invisible
`U+200E` LTR-mark prefix went unnoticed.

**When adding or fixing a browser:** open a site in it, `uiautomator dump` the
tree, add the raw `text` value of its URL-bar node as a fixture, then verify on
a device (`logcat -s BlockerService` should log `Blocking website …`). The unit
test proves parsing; only the device proves the accessibility event actually
arrives and the friction gate launches.

---

## Tier Comparison

- **Tier 1 (logic)**: high breadth of logic permutations, zero system mutation.
- **Tier 2 (integration)**: moderate breadth, Tauri command paths with the `current_blocking` enforcement snapshot as read-back.
- **Rust unit tests**: enforcement decision logic (URL matching, allowlist composition, payload derivation).
- **Android Kotlin unit tests**: browser URL-bar parsing (`BrowserUrlParser`), against fixtures dumped from real devices.
- **Manual checklist**: required for website enforcement, permissions, enforcer, and visual UX.

Recommended stance:

- Run Tier 1 during feature work.
- Run Tier 2 for data/sync/shim regressions; do not treat passing Tier 2 as proof of website blocking.
- Run the manual checklist before every release.

---

## iOS and testing tiers

iOS enforcement uses the Screen Time plugin (`tauri-plugin-screentime`).

- **Tier 1 (logic):** Runs in the app; safe on iOS. Same blocking/schedule/override logic applies. **Category 14 (T55–T62)** covers the iOS allowlist effective-policy resolvers — run it on the desktop dev build; the resolvers are shared JS and encode iOS-only constraints (Apple's 50-exception cap, `specific-block` vs `all-except`, category-token exclusion).
- **Tier 2 (integration):** Desktop-oriented; helper-dependent paths always see the shim as “ready” but do not exercise Screen Time. **Manual checklist is the primary way to validate iOS.**
- **Enforcement layer:** cannot be automated — FamilyControls authorization and shields do not work meaningfully in the simulator, and `ManagedSettingsStore` state cannot be read back. See `architecture.md` §12.3 for device-validation findings and known carve-outs.

For release, run the **manual test checklist** (section **14. iOS-Specific**, including the **14.1 iOS allowlist matrix**) on a physical iPhone.

---

## Typical contributor workflow

1. Run Tier 1 during active feature work for fast feedback.
2. Run Tier 2 before merging changes that touch save/sync/shim/app-blocking command paths (Group H when touching allowlist derivation or sync).
3. Run `cargo test --lib` before merging changes to Rust enforcement code.
4. Run the manual checklist for website blocking, permissions, enforcer, and release confidence — section 15 for desktop allowlist, section 14/14.1 for iOS.

---

## Common troubleshooting

- **Tier 1 not running:**
  - confirm `src/index.html` includes `test-utils.js` and `blocking-tests.js`.
  - confirm shortcut handler in `src/app.js` is active in current build.
- **Tier 2 failing with "current_blocking missing from system diagnostics":**
  - confirm the `get_system_diagnostics` command is registered and `tauriAPI.getSystemDiagnostics` exists in `src/app.js`.
- **Tier 2 failing at setup/teardown:**
  - confirm `window.__REDDBLOCK_INTERNALS__` exports are present from `src/app.js`.
