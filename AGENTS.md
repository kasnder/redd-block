# AGENTS.md

Guidance for coding agents (Claude Code, etc.) working in this repository.

This file is loaded on every task, so it holds only what you would get *wrong*
by exploring the repo: invariants, cross-file contracts, and the reasoning
behind decisions that look like bugs from inside a single file. If
`package.json`, a workflow file, or the code already tells you, it is not
repeated here — keep it that way when you edit this file.

## What this is

Digital Habits: Blocker is a cross-platform website/app blocker built as a
**single Tauri v2 app** (Rust backend + HTML/JS/CSS frontend) targeting macOS
11+, Windows 10+, iOS 16+, and Android 8+ (API 26+). One frontend codebase
(`src/`) drives all four platforms; enforcement differs completely per platform.
There is **no** privileged helper daemon and **no** hosts-file writing — the app
itself is the enforcement engine (v3 architecture).

**Blast radius.** Because one `src/` ships to four platforms with four unrelated
enforcement backends, the usual way a change goes wrong here is not a broken
build — it is working correctly on the platform you ran and silently changing
behavior on the other three. Before you call a change to `src/` done, say what
it does on the platforms you did not run, and say plainly which ones you could
not verify. "Tier 1 is green" is not the same claim as "Android still blocks."

## The product principle

The user of this app is adversarial to their own future self. They asked to be
blocked, and in a weak moment they will look for a way out — that is the entire
problem the product exists to solve. Friction is the feature, not a rough edge
to smooth.

Several parts of the codebase look like bugs until you apply this:

- The tray icon has no menu and there is no quit gesture anywhere. Both
  `RunEvent::ExitRequested` and, on macOS, an `applicationShouldTerminate:`
  hook unconditionally turn every exit route into a hide-window. A blocker the
  user can quit is a blocker the user can bypass. Do not add an escape hatch to
  either guard without a deliberate decision — `commands/uninstall.rs` calls
  `std::process::exit(0)` specifically to bypass both, and in-app uninstall
  (macOS) or the OS uninstaller (Windows) is the only intended way out.
- Override challenges (`src/override-challenge.js`) make unblocking
  deliberately effortful. Making them cheaper or skippable is a product
  regression, not an ergonomics win.
- The compliance enforcer force-quits non-compliant browsers, and is
  nonetheless **opt-in and default off** (`settings.enforcementEnabled`).
  Escalation is a choice the user makes, not one we make for them.

**The adversary is a distracted user, not a technical one.** Our users are
non-technical: the bypass we design against is the one reachable in a weak
moment through the app's own UI, not one that requires a devtools console, a
debugger, or a rebuild. That is why `window.__REDDBLOCK_INTERNALS__`
(`src/dev-internals.js`) ships unguarded in production even though it exposes
`saveData`, `acceptEula` and friends — a deliberate accepted cost, not an
oversight. Keep the bar there: adding to that object is fine, but anything that
lowers friction in a path a user can reach *without* opening a console is a
product regression. The `e2e-webdriver` / `system-test` hard stop in `lib.rs` is
the separate, stricter case — a network-reachable automation endpoint is a
bypass anyone could be walked through remotely, so it must never compile into a
release.

**Decide which way failures fall.** When enforcement cannot determine state — a
URL will not parse, a browser will not answer, a query fails — the code must
pick between blocking something it should not and allowing something it should
have blocked. Neither is automatically right, but the choice must be explicit,
and it must be written down where the next reader will see it. This codebase's
worst bugs are the ones that quietly chose "allow" (see the Samsung Internet
case below).

## Where the real documentation is

| Read this | Before you |
| --- | --- |
| [architecture.md](architecture.md) | Touch any enforcement code. **Part I = v3 (current, start here).** Parts II/III are historical v2/v1 kept for migration context — do not reason about current behavior from them, they describe a daemon and a hosts file that no longer exist. |
| [testing.md](testing.md) | Add or debug a test. Has the full "What runs in CI" table with triggers and path filters. |
| [docs/android-build.md](docs/android-build.md) | Build, install, or profile the Android app. Includes the toolchain trap that costs an hour if you hit it blind (`cargo` resolving to Homebrew's rust, failing with `can't find crate for std`) and the adb recipes for granting accessibility and measuring startup. |
| [docs/android-generated-project-manual-edits.md](docs/android-generated-project-manual-edits.md) | Run `tauri android init` or edit `src-tauri/gen/android/` — it is committed, and re-initializing drops hand-applied patches. |

## Commands

`package.json` is the reference for what exists; only the traps are listed here.

- **Version bumps span several files** — always use
  `./scripts/bump-version.sh <version>`. It updates `package.json`,
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and — via
  `scripts/sync-ios-version.mjs` — `tauri.ios.conf.json` plus the generated
  Xcode project and its `Info.plist`s. The iOS side is the one a hand edit
  always misses.
- **`pnpm build:android` needs `ANDROID_HOME` / `NDK_HOME` / `JAVA_HOME`
  exported** — `pnpm install` does not set them. See
  [docs/android-build.md](docs/android-build.md).
- **Use `cargo test --lib`**, not bare `cargo test` — the latter still tries to
  build a stale `test_watcher` example.
- **`cargo fmt` needs two invocations**, because `tauri-plugin-android-blocker`
  is a separate crate graph from `src-tauri`. CI runs `cargo fmt --all --check`
  in both directories, so formatting only one leaves the other red:

  ```bash
  pnpm lint                                             # eslint over src/, scripts/, e2e/, vite.config.js
  (cd src-tauri && cargo fmt --all)                     # --all here also covers tauri-plugin-screentime
  (cd tauri-plugin-android-blocker && cargo fmt --all)
  ```

### pnpm is the only supported package manager

`npm install` fails by design — a `preinstall` guard (`only-allow pnpm`) stops
it, and `package-lock.json` is gitignored. This is not a style preference:

- **Worktrees are the reason.** Agent tasks run one git worktree each, and every
  worktree gets its own `node_modules` (~250 MB with npm). pnpm's
  content-addressed store hardlinks instead, so worktree *n+1* costs
  approximately nothing. With five worktrees checked out the measured
  difference was 1051 MB naive vs 856 MB actual, and the only directory
  contributing nothing to that saving was the npm-installed one.
- **Two lockfiles is the failure mode this replaced.** The repo carried both
  `package-lock.json` and `pnpm-lock.yaml` for a while. Nothing in CI validated
  the pnpm one, so it was one dependency change away from silently describing a
  different tree than the one anyone built against.

The trap when converting a command: **pnpm does not strip `--`**. `npm run
tauri -- build` passes `build`; `pnpm run tauri -- build` passes `--` *and*
`build`, and the tauri CLI chokes on it. Write `pnpm tauri build` — pnpm
forwards trailing args, flags included, without the separator.

## Architecture essentials

### Single source of truth
Desktop website/app rules derive from one JSON file, `redd-block-data.json`
(canonical `/var/lib/redd-block/...` on macOS,
`%PROGRAMDATA%\Digital Habits Blocker\...` on Windows; per-user fallback until
the shared dir is writable — path logic in `src-tauri/src/commands/data.rs`).
The frontend writes it via
`save_data`; every backend re-reads it. `native_host::derive_payload()` computes
effective website rules: blocklist domains always block; when any allowlist
source is active, policy is `allowed-union − blocked-union` (blocklist wins on
overlap). iOS uses its own App Group store, not this file.

### Enforcement per platform
- **macOS websites:** Automation (Apple Events) in `src-tauri/src/web_automation.rs` — 1 s tick, redirects blocked tabs in Safari/Chrome/Brave/Edge to a bundled block page (`src-tauri/blocked/`). Firefox is the exception: it uses the extension + native-messaging host.
- **Windows websites:** Digital Habits: Focus extension + native-messaging host (`native_host.rs`); the same binary runs as the host via `redd-block --native-host`.
- **Desktop apps (both OSes):** in-process poll-and-quit watcher, `src-tauri/src/app_watcher.rs` (1 s tick, PID state machine: warn → 30 s grace → polite quit → SIGKILL). Allow-mode inverts the target set.
- **Compliance enforcer** (`src-tauri/src/enforcer.rs`, 5 s tick): force-quits non-compliant *running* browsers during active website blocks — opt-in only.
- **iOS:** Apple Screen Time via `tauri-plugin-screentime/` (Swift). No file, no extension, no process watching. Allow-mode uses `.all(except:)` with a 50-item cap.
- **Android:** `tauri-plugin-android-blocker/` — Kotlin AccessibilityService applies the block/friction gate, WorkManager handles schedule transitions; Rust only bridges Tauri commands.

### Allow-mode / allowlists
"Focus spaces" (allow only these, block everything else) exist on all platforms.
The desktop rule (blocklist wins on overlap; concurrent allowlists union) is
mirrored on iOS by **two deliberately-duplicated resolvers that must stay in
sync**: JS (`deriveIOSEffectiveWebsitePolicy` / `deriveIOSEffectiveAppPolicy` in
`src/app.js`) for pre-validation, Swift (`IOSPolicyResolver` in the shared
`ScheduleData.swift`) for enforcement. Changing one without the other produces a
UI that promises something enforcement will not do. See architecture.md §9.4
and §12.3.

### Frontend module conventions (important, non-obvious)
`src/` is plain ES modules, no framework — and it relies on two conventions
nothing in the code will remind you of:

- Cross-module mutable state lives on the single `state` object in
  `src/state.js`, because module-level `let`s cannot be reassigned across ES
  imports.
- Module top level holds **declarations only**, never calls into other app
  modules. This is what keeps the hub↔feature import cycles safe: every
  cross-module call is a hoisted function invoked at runtime. A single top-level
  call into another module can turn a working cycle into an undefined-at-import
  crash.

The order-sensitive startup sequence is the `DOMContentLoaded` handler in
`src/app.js`. The `window.__REDDBLOCK_INTERNALS__` keys in `src/dev-internals.js`
are a contract with the in-app tests — renaming one breaks tests that will not
tell you why.

`src/tauri-api.js` is a compat layer. The frontend still calls legacy
`*_via_helper` command names that route through
`src-tauri/src/commands/helper_shim.rs` (mostly no-ops for website blocking; app
blocking forwards to `app_watcher`). This is dead naming, not a live daemon —
there is no `helper-daemon/` in the repo, so do not go looking for one.

### Build-time platform gating
`__ANDROID_BUILD__` is a Vite `define` constant, and it is the right tool **only
when it lets Rollup delete code from the Android bundle** — an early
`if (__ANDROID_BUILD__) return;` in a void function lets Rollup drop the body
and tree-shake its helpers. That trick only works on functions nobody reads a
value from: shared value-returning helpers (`browserIconUrl`,
`BROWSER_STORE_LINKS`, …) are deliberately left unguarded, because returning
`undefined` on Android would break callers rather than shrink anything. For
behavioral branching that must stay in the bundle for desktop, use the runtime
`state.isAndroid` flag instead.

Gating the *code* that references a static asset does not by itself drop the
asset: Vite emits a file for every `import url from './x.png'` at transform
time, before tree-shaking, so a desktop-only image whose only reference is
eliminated is left orphaned in the APK. Guard the reference with
`__ANDROID_BUILD__` and the `pruneOrphanAndroidAssets` plugin in
`vite.config.js` sweeps the file. This is also why dead asset imports are worth
cleaning up rather than tolerating.

### App lifecycle
Closing the window **hides to tray** and keeps all watchers running; enforcement
continues across window close. See "The product principle" above for why there
is no quit path. An EULA gate (revision-based, `CURRENT_EULA_REVISION` in
`src/app.js`) blocks post-acceptance startup hooks. v1.x cleanup (hosts strip,
legacy daemon removal, may prompt for admin once) runs once via
`src-tauri/src/commands/migration.rs`.

## Testing

Tier 1 and Tier 2 have CLI runners, and both also run **inside the app** in dev
mode via the dev console. Full details, including the "What runs in CI" table:
[testing.md](testing.md).

- **Tier 1** (logic, instant, no system changes): `pnpm test:tier1`
  headlessly, or `Cmd+Shift+T` / `Ctrl+Shift+T` / `runBlockingTests()` in dev.
  Cases in `src/blocking-tests.js`.
- **Tier 2** (integration, real command paths, safe `.invalid` domains):
  `pnpm build:e2e-app` then `pnpm test:tier2` over WebDriver, or
  `runIntegrationTests('core' | 'full')` in the dev console. Cases in
  `src/integration-tests.js`. **Tier 2 asserts the Rust-derived
  `current_blocking` snapshot — it does not prove a browser actually redirects.**
- **Android URL parsing**: JVM unit tests in `BrowserUrlParserTest`
  (`cd src-tauri/gen/android && ./gradlew :tauri-plugin-android-blocker:testDebugUnitTest`).
  Fixtures are raw URL-bar strings dumped from real devices — add one whenever
  you touch the supported-browser list.
- **Rust backend**: `#[cfg(test)]` unit tests in the module under test.
- **Website-enforcement correctness** (Automation redirects, extension blocking)
  is validated manually — `scripts/manual-test-checklist.md`.

### Write the failing test first

When fixing a bug or changing enforcement behavior, add the test **before** the
fix and confirm it fails for the reason you are about to address. A test written
afterwards only proves the code does what it currently does.

This matters more here than in most codebases, because the characteristic
failure mode is silence rather than an error:

- A browser-specific URL-bar quirk makes extraction return nothing. The browser
  stays in the supported map, blocking just stops working for it, and nothing
  logs an error — that is how Samsung Internet's invisible `U+200E` prefix went
  unnoticed.
- `web_automation::tests::file_url_encodes_spaces` asserted the pre-rename
  product name and could never pass. Nothing ran it, so nobody found out until
  `cargo test --lib` was wired into CI.

Put the test where CI will actually run it, matching the layer you changed:

| What you changed | Where the test goes |
| --- | --- |
| Blocking/schedule/allowlist logic in `src/` | `src/blocking-tests.js` (Tier 1) |
| Desktop enforcement semantics — derivation, URL decisions, payloads | `#[cfg(test)]` in the Rust module |
| Android URL-bar parsing / a new browser | `BrowserUrlParserTest` fixtures |
| Command paths, persistence round-trips | `src/integration-tests.js` (Tier 2) |

Prefer the highest row that can hold the case. Reaching for
`scripts/manual-test-checklist.md` is correct only when no automated layer can
express the case — a real browser redirecting, a real app being quit — and not
because writing the automated test is awkward.

### What CI does and does not cover

All four automated suites run on PRs to `main` and again on the resulting `main`
commits. Lint + Tier 1 (`ci.yml`) run on every PR; the Rust tests
(`rust-ci.yml`), the Android build and Kotlin tests (`android-ci.yml`) and
Tier 2 (`e2e-ci.yml`) are path-filtered, so a PR that misses their filters shows
green without ever having run them. Releases additionally gate every build job
on lint + Tier 1 and run `cargo test --lib` before macOS signing.

Two blind spots to know about before you trust a green run:

- **Clippy only runs against the Android target**, which compiles a minority of
  `src-tauri/src`. Everything gated `cfg(not(any(ios, android)))` —
  `app_watcher`, `enforcer`, `native_host`, `profile_scan`, … — plus the
  macOS/Windows-only modules compile out. The desktop enforcement engine is
  *not* linted and is not currently clippy-clean, so a green Android CI says
  nothing about whether your macOS/Windows change passes clippy. There is no
  Linux clippy job because the lib does not compile on Linux at all.
- **eslint is `js/recommended` only, and `no-unused-vars` is a warning, not an
  error.** There is a standing backlog of dead bindings the gate deliberately
  does not fail on. Clearing them is worthwhile — dead asset imports become
  exactly the orphans `pruneOrphanAndroidAssets` has to sweep back out — but do
  it as its own change rather than mixed into feature work.
