# ReDD Block Architecture Reference (macOS, Windows, iOS)

This is the technical architecture source-of-truth for contributors.

It is intentionally detailed and implementation-aligned, with file references to actual code paths.

---

## 1) Scope and goals

This document explains:

- core runtime architecture on desktop and iOS,
- state ownership and synchronization rules,
- enforcement pipelines (websites and apps),
- lifecycle flows (start, schedule, override, uninstall, cleanup),
- override difficulty configuration (including max difficulty mode) and blocklist duplication,
- cross-platform differences,
- a plain-language exhaustive functionality catalog.

Primary code surfaces:

- `src/app.js` (frontend orchestration and UX state)
- `src-tauri/src/commands/data.rs` (app data persistence)
- `src-tauri/src/commands/helper.rs` (desktop helper bridge and lifecycle commands)
- `src-tauri/src/commands/apps.rs` (desktop app picker utilities)
- `src-tauri/src/lib.rs` (command registration and platform window setup)
- `helper-daemon/src/main.rs` (desktop privileged enforcement engine)
- `tauri-plugin-screentime/` (iOS blocking plugin stack): `src/commands.rs`, `src/mobile.rs` (Rust bridge), `ios/Sources/ScreentimePlugin.swift` (authorization, ManagedSettings, DeviceActivityCenter, activity picker), `ios/Sources/ScheduleData.swift` and `src-tauri/gen/apple/Shared/ScheduleData.swift` (App Group schedule payload), `src-tauri/gen/apple/ReddBlockMonitor/DeviceActivityMonitorExtension.swift` (DeviceActivityMonitor for scheduled windows).

---

## 2) Runtime architecture at a glance

There are two enforcement families:

- **Desktop (macOS/Windows):** helper daemon is the privileged enforcement runtime.
- **iOS:** Screen Time plugin/API is the enforcement runtime.

```mermaid
flowchart TD
    userInput[UserInput_UI] --> appFrontend[AppFrontend_src_app_js]
    appFrontend --> tauriBackend[TauriBackend_Commands]
    tauriBackend --> platformBranch{Platform}
    platformBranch -->|Desktop| helperIpc[IPC_to_Helper]
    helperIpc --> helperCore[HelperDaemon_main_rs]
    helperCore --> desktopEnforce[HostsAndAppWatcher]
    platformBranch -->|iOS| stPlugin[ScreenTimePlugin]
    stPlugin --> iosEnforce[ScreenTimeEnforcement]
```

---

## 3) State ownership and authority model

## 3.1 App-owned state (authoring and UX)

Persisted via `src-tauri/src/commands/data.rs`:

- `blocklists`
- `activeBlocks`
- `schedules`
- `settings`

Used by `src/app.js` for:

- rendering,
- challenge UX,
- local schedule/block computations,
- command dispatching.

## 3.2 Helper-owned state (desktop enforcement authority)

Persisted via `helper-daemon/src/main.rs` (`helper-state.json`):

- `manual_blocks`
- `blocked_apps`
- `schedules`
- `keepBlockingOnUninstall`

This state is authoritative for desktop enforcement decisions and merging behavior.

## 3.3 iOS enforcement state

iOS does not use helper/hosts. Enforcement is delegated to Screen Time API through plugin calls from `src/app.js` (`plugin:screentime|...` commands).

---

## 4) Desktop helper internals

Core constants and command model in `helper-daemon/src/main.rs`:

- hosts markers:
  - `# === BEGIN REDD BLOCK (reddfocus.org) ===`
  - `# === END REDD BLOCK (reddfocus.org) ===`
- hosts path:
  - macOS: `/etc/hosts`
  - Windows: `C:\Windows\System32\drivers\etc\hosts`
- IPC command enum includes:
  - `start-block`, `clear-block`, `set-schedules`, `set-blocked-apps`,
  - `set-keep-blocking-on-uninstall`, `restore-hosts`, `uninstall`, `ping`, `get-version`, `get-status`.

---

## 5) Website blocking pipeline (desktop, technical)

## 5.1 End-to-end command path

For desktop, website enforcement always goes through helper:

1. `src/app.js` computes current desired blocked-domain state.
2. Tauri commands in `src-tauri/src/commands/helper.rs` send JSON IPC (`start-block`, `clear-block`, `set-schedules`, `restore-hosts`).
3. Helper `handle_command()` (`helper-daemon/src/main.rs`) updates authoritative state.
4. Helper calls `sync_hosts_file()` to rebuild effective domains and write hosts.
5. Helper calls `flush_dns_cache()`.

```mermaid
flowchart LR
    uiIntent[UI_BlockingIntent] --> tauriCmd[Tauri_HelperCommand]
    tauriCmd --> helperCmd[Helper_handle_command]
    helperCmd --> mergeDomains[ResolveEffectiveDomains]
    mergeDomains --> hostsTransform[remove_old_section_plus_add_new]
    hostsTransform --> hostsWrite[write_hosts_file]
    hostsWrite --> dnsFlush[flush_dns_cache]
```

## 5.2 Hosts transformation internals

Helper hosts functions in `helper-daemon/src/main.rs`:

- `remove_block_from_hosts(content)`:
  - removes the managed section between
    - `# === BEGIN REDD BLOCK (reddfocus.org) ===`
    - `# === END REDD BLOCK (reddfocus.org) ===`
  - also strips legacy markers (`# ReDD Block Start/End`).

- `add_block_to_hosts(content, domains)`:
  - first calls `remove_block_from_hosts` (replace-not-append semantics),
  - sanitizes each domain:
    - strips `https://`/`http://`,
    - strips URL paths,
    - lowercases,
  - skips protected domains via `is_protected_domain`,
  - writes both IPv4 and IPv6 entries:
    - `0.0.0.0 domain`, `0.0.0.0 www.domain`,
    - `:: domain`, `:: www.domain`.

- `sync_hosts_file(state, schedule_state)`:
  - computes union set from active manual blocks and active schedule domains,
  - deduplicates via set semantics,
  - writes final rendered hosts content.

## 5.3 Write safety and rollback mechanics

`write_hosts_file(content)` enforces multiple hard safety checks:

- refuses writes that omit `localhost` entry,
- on unsafe content:
  - attempts `restore_hosts_from_backup()`,
  - if restore fails, writes a minimal valid hosts file as last resort.

Backup mechanics:

- `ensure_backup_exists()` creates `hosts.redd-backup` on first write,
- backup is cleaned of managed block entries before saving,
- `restore_hosts_from_backup()` validates backup still contains `localhost`.

## 5.4 Platform-specific write strategy

- **Windows**:
  - direct write with `fs::write(HOSTS_PATH, content)`,
  - avoids rename approach due to common lock contention from AV/DNS services.

- **macOS**:
  - atomic-leaning approach: write temp file then `rename`,
  - direct-write fallback if rename fails.

## 5.5 DNS flush internals

`flush_dns_cache()` does per-OS commands:

- macOS:
  - `dscacheutil -flushcache`
  - `killall -HUP mDNSResponder`
- Windows:
  - `ipconfig /flushdns` with hidden-window creation flags.

This ensures OS resolver sees hosts changes quickly (browser cache may still delay visible behavior).

## 5.6 Domain normalization and protection

Both frontend and helper enforce protections:

- frontend:
  - `PROTECTED_DOMAINS` in `src/app.js`,
  - `isProtectedDomain()`.
- helper:
  - protected-domain filter before hosts rendering.

This defense-in-depth prevents accidental self-breakage if UI validation is bypassed.

---

## 6) App blocking watcher pipeline (desktop, technical)

App blocking is helper-owned and independent of hosts writes.

## 6.1 Watcher lifecycle and state transitions

In `helper-daemon/src/main.rs`:

- `set_blocked_apps(...)` updates manual blocked app list.
- schedule evaluator computes schedule-active apps.
- effective blocked apps are union of manual + schedule sources.
- `start_app_watcher()` starts background watcher if needed.
- `stop_app_watcher()` tears down watcher when no effective apps remain.

Watcher stop details:

- Windows posts `WM_QUIT` to watcher thread message loop.
- macOS kills the watcher subprocess/script and cleans temp script file.

## 6.2 macOS watcher internals

`run_macos_app_watcher(...)`:

- writes a temporary AppleScript that subscribes to:
  - `NSWorkspaceDidLaunchApplicationNotification`,
  - `NSWorkspaceDidActivateApplicationNotification`.
- runs via `osascript`, reading emitted app names from stderr log output.
- matches app names case-insensitively against blocked set.
- debounces repeat detections (~500ms window via `last_detection` map).
- calls `hide_app(app_name)` which executes AppleScript visibility hide.
- includes a macOS-only periodic foreground fallback check thread (2s cadence):
  - reads current frontmost app name,
  - applies same blocked-app matching and debounce rules,
  - calls `hide_app(...)` when event-driven watcher misses focus transitions.

## 6.3 Windows watcher internals

`run_windows_app_watcher(...)`:

- installs WinEvent hook (`SetWinEventHook`) for:
  - `EVENT_SYSTEM_FOREGROUND`,
  - `EVENT_SYSTEM_MINIMIZEEND`.
- runs native message loop (`GetMessageW`, `TranslateMessage`, `DispatchMessageW`).
- callback resolves process image name from `hwnd`,
  normalizes executable name, and compares against effective blocked-app set.
- blocked app windows are minimized via `ShowWindow(..., SW_FORCEMINIMIZE)`.

Windows performance path:

- effective blocked apps are stored in shared `RwLock<Arc<Vec<String>>>` state (`EFFECTIVE_BLOCKED_APPS`),
- callback reads cloned app lists with low contention and safer lifetime semantics.

```mermaid
flowchart TD
    effectiveApps[EffectiveBlockedApps_manual_plus_schedule] --> watcherNeed{AnyAppsBlocked}
    watcherNeed -->|Yes| startWatcher[start_app_watcher]
    watcherNeed -->|No| stopWatcher[stop_app_watcher]
    startWatcher --> platformImpl{Platform}
    platformImpl -->|macOS| macHide[HideApp_via_AppleScript]
    platformImpl -->|Windows| winMin[MinimizeApp_via_WinEventHook]
```

## 6.4 App protection rules

Protected apps are filtered in frontend and helper:

- `PROTECTED_APP_NAMES` in `src/app.js`,
- helper-side protected-app checks.

Goal: never hide/minimize ReDD Block itself.

## 6.5 App blocking persistence caveat

Desktop watcher persistence is robust while helper is alive, but timing semantics differ by source:

- schedule app activation/deactivation is helper-evaluated (30s cadence),
- manual app blocking state is persisted helper-side,
- one-off app-block expiry interactions still depend on how app-side intent and helper state stay synchronized over time.

---

## 7) One-off blocks (manual blocks)

## 7.1 Data model

Helper stores manual one-off blocks as `manual_blocks` with:

- domains,
- end_time,
- blocklist_id.

## 7.2 Runtime behavior

- Start path adds/updates manual block state and triggers hosts sync.
- Expiry path runs in helper `expiry_checker()` loop (1s cadence).
- Expired manual blocks are removed by time and persisted.

This gives near-real-time end behavior for website enforcement without requiring app UI to stay open.

Technical details:

- start command path:
  - frontend `updateHostsFile()` / block start flow in `src/app.js`,
  - Tauri `start_block_via_helper(...)`,
  - helper `IpcCommand::StartBlock` -> `start_block(...)`.
- clear path:
  - scoped clear by blocklist identity uses `clear_block_via_helper(blocklist_id)`,
  - helper `clear_block(...)` mutates only targeted manual block(s),
  - resulting domain set is recomputed through `sync_hosts_file(...)`.
- expiry loop behavior:
  - `expiry_checker()` runs every second,
  - retains only blocks with `end_time > now`,
  - on change, triggers hosts sync + state persist.

## 7.3 Pause/resume architecture (one-off + schedule)

Pause semantics are stateful and enforcement-driven, not UI-only.

- one-off pause state lives in app data (`src/app.js`): `isPaused`, `pauseEndTime` on active blocks.
- schedule pause state is synchronized end-to-end:
  - frontend schedule records include pause fields,
  - `syncSchedulesToHelper()` sends `isPaused` + `pauseEndTime`,
  - helper schedule records persist the same fields.

Enforcement behavior:

- while paused:
  - domains/apps from paused one-off and paused schedule sources are excluded from effective blocking sets,
  - helper schedule evaluation explicitly skips paused schedules.
- on manual resume or natural pause expiry:
  - pause fields are cleared,
  - app re-syncs helper schedule/manual block state,
  - hosts and app watcher state are recomputed and re-applied.

Schedule pause can be triggered even when no segment is currently active; this suppresses upcoming segment activation until pause end or manual resume.

---

## 8) Scheduled blocks

## 8.1 Schedule representation

Helper schedule records include:

- `id`, `domains`, `apps`,
- `isPaused`, `pauseEndTime`,
- segment list with start/end hour/minute and day set.

## 8.2 Evaluator loop

`schedule_evaluator()` in helper runs every 30s:

- computes active schedule domains/apps from local time,
- skips schedules paused at current time (`isPaused && pauseEndTime > now`),
- compares with previous active set,
- applies transitions:
  - hosts sync when active domains changed,
  - watcher/app updates when active apps changed.

```mermaid
flowchart TD
    tick30s[Every30Seconds] --> readSched[ReadSchedules]
    readSched --> activeDomains[ComputeActiveScheduleDomains]
    readSched --> activeApps[ComputeActiveScheduleApps]
    activeDomains --> domainChanged{DomainsChanged}
    activeApps --> appsChanged{AppsChanged}
    domainChanged -->|Yes| syncHosts[sync_hosts_file]
    appsChanged -->|Yes| updateWatcher[StartStopWatcherAndHideApps]
```

## 8.3 Future schedule activation

On desktop, helper can activate future schedule windows without app UI running, because schedule evaluation is helper-local and persistent.

---

## 9) Merge semantics and overlap correctness

Effective desktop enforcement is a composition of:

- manual one-off blocks,
- currently active schedule windows.

Consequences:

- shared domains remain blocked while any source is active,
- one block override does not collapse unrelated overlapping rules,
- one-off and schedule on same blocklist compose safely.

This is a key correctness property for concurrent blocking scenarios.

---

## 10) Override architecture

Frontend handles challenge UX (`src/app.js`) and dispatches scoped clear commands to helper.

Important paths:

- scoped clear uses identity-aware semantics (blocklist/target-specific),
- override-all uses broad clear semantics intentionally,
- helper applies state mutation + resync, preventing UI-only divergence.

This keeps override behavior deterministic in multi-block situations.

### 10.1 Override difficulty configuration and max difficulty mode

Override difficulty (friction settings) lives on each blocklist and controls the challenge required to override a block: type (random words, random gibberish, or custom text), character count, and optional **max difficulty** lock.

**Data model** (persisted in `blocklist.overrideDifficulty`):

- `type`: `'random-words'` | `'gibberish'` | `'custom'`
- `count`: number of characters (for random types) or length of custom text
- `maxDifficulty`: boolean — when true, effective challenge is always max for the chosen random type (7500 for random-words, 5000 for gibberish)
- `countBeforeMax`: when `maxDifficulty` is true, stored so unchecking restores this count (avoids defaulting to 50)
- `typeBeforeMax`: when `maxDifficulty` is true, stored so unchecking restores this type (e.g. `'custom'`)
- `customText`: used only when `type === 'custom'`

**Max difficulty behavior:**

- When the user checks “Max difficulty” (checkbox next to the override-type dropdown in Add/Edit Blocklist modal):
  - The dropdown is restricted to Random Words and Random Gibberish (Custom Text option is removed from the DOM and stored in `removedOverrideCustomOptionEl` so it can be re-appended).
  - If the current type was Custom Text, it switches to Random Words.
  - The character count is set and locked to the max for the selected type; the count input is greyed out (same disabled styling as when the blocklist is active) and made non-interactive (`override-count-max-mode`, `form-input-disabled`, `input-suffix-disabled`).
  - Current type and count are stored in memory (`lastOverrideTypeValueBeforeMaxDifficulty`, `lastOverrideCountValueBeforeMaxDifficulty`) and on save as `typeBeforeMax` and `countBeforeMax`.
- When the user unchecks:
  - Custom Text is re-added to the dropdown; dropdown and count are restored to `typeBeforeMax` and `countBeforeMax`.
- Only the checkbox toggles max difficulty; the “Max difficulty” label is non-clickable (div, not label) and shows a text cursor. When the blocklist is active, the max difficulty checkbox is disabled like the other override inputs (`max-difficulty-disabled`).

**Code locations:**

- UI: `src/index.html` — Override Difficulty form group, `.override-type-row`, `#override-max-difficulty-checkbox`, `#override-max-difficulty-label`
- Styles: `src/styles.css` — `.override-type-row`, `.override-type-select` (narrower), `.max-difficulty-checkbox-option`, `.override-count-max-mode`, `.override-count-max-mode .form-input.form-input-disabled` (border preserved to avoid layout jump), `.max-difficulty-disabled`
- Logic: `src/app.js` — state (`lastOverrideCountValueBeforeMaxDifficulty`, `lastOverrideTypeValueBeforeMaxDifficulty`, `removedOverrideCustomOptionEl`), `ensureOverrideCustomOptionPresent()`, `removeOverrideCustomOption()`, checkbox and override-type change handlers, save/load/duplicate/close-modal handling, `getMaxOverrideCharsForType()`
- i18n: `overrideMaxDifficulty` in app.js strings and `setText('override-max-difficulty-label', ...)`

**Persistence and duplication:**

- On save with max difficulty checked, `count` is set to the max for the type and `countBeforeMax` / `typeBeforeMax` are persisted so reopen and uncheck restores the previous value (e.g. 20) and type (e.g. custom).
- On duplicate, `overrideDifficulty` is copied including `maxDifficulty`, `countBeforeMax`, and `typeBeforeMax`, so the duplicate inherits max difficulty and restore behavior.

### 10.2 Blocklist duplication

Blocklist duplication creates a full copy of a blocklist (and its schedule if present) with a new id and a derived name; the duplicate is never active.

**Entry point:** `duplicateBlocklist(id)` in `src/app.js`.

**What is copied:**

- **Blocklist:** `id` (new UUID), `name` (via `getNextCopyName(blocklist)`), `mode`, `color`, `emoji`, `websites`, `apps`, `showItemDetails`, `alwaysShowInSchedule`, `overrideDifficulty` (full object: `type`, `count`, `maxDifficulty`, `countBeforeMax`, `typeBeforeMax`, `customText` when applicable).
- **Schedule (if any):** New schedule id and `blocklistId` pointing at the new blocklist; segments, `repeatType`, `repeatDate` copied. No blocks are started for the duplicate.

**Naming semantics:**

- Implemented in `getNextCopyName(blocklist)`, `parseCopyRoot(name)`, `nameInChain(name, root)`, `sameBlocklistContent(idA, idB)` (`contentKey(blocklistId)`), in `src/app.js`.
- macOS-style naming: “X” → “X copy”, then “X copy 2”, “X copy 3”, … with gap-fill when copies are deleted. If the user renames a copy, the next duplicate of the original still uses the same chain; if they edit the duplicate’s content, it is treated as a new chain for naming.
- Content-based chain: duplicates that share the same content (websites, apps, override config, schedule) reuse the same copy-number chain; if content differs, the name is treated as a new base.

**Post-duplicate UX:** Selection remains on the original blocklist so the user can duplicate again without changing selection; dropdown is updated to reflect the new list.

---

## 11) Helper lifecycle and versioning (desktop)

## 11.1 Install/update

`src-tauri/src/commands/helper.rs` handles:

- helper status checks,
- install path and elevation flow,
- version compatibility checks via `EXPECTED_HELPER_VERSION`,
- reinstall/update when helper is outdated.

Before starting a block, the frontend (`src/app.js`) re-verifies helper availability when it believes the helper is available (via `check_helper_status`). This avoids using a stale “helper available” state (e.g. on Windows, where the helper is not restarted on crash). If a start-block attempt fails with a helper connection error (e.g. connection refused on Windows, os error 10061), the app clears the cached availability flag and shows a message directing the user to remove the helper in Settings and try again to reinstall, so the next Start block shows the install modal instead of repeating the raw error.

## 11.2 Runtime persistence

- macOS: launch daemon registration and privileged helper path.
- Windows: scheduled task setup and elevated helper execution path.

## 11.3 Manual helper uninstall

Uninstall command path:

- attempt graceful helper `uninstall` command,
- fallback to force cleanup path if needed.

## 11.4 Desktop helper: full UI-to-helper flow (start, stop, override, install, uninstall)

The flows below show the frontend (`src/app.js`), Tauri (`helper.rs`), and helper daemon (TCP 127.0.0.1:62222 on Windows, Unix socket on macOS). They reflect post-fix behavior: re-verify before start block when `helperAvailable` is true, and clear the cached flag plus a friendly message on connection failure.

*If diagrams render with low contrast, view this file on GitHub or in a Mermaid preview (e.g. VS Code Mermaid extension) for better visibility.*

**Start block (desktop)**

```mermaid
flowchart TD
    A[User: Start block] --> B{helperAvailable?}
    B -->|Yes| C[check_helper_status]
    C --> D{Running and version_ok?}
    D -->|No| E[helperAvailable = false]
    E --> F[check_helper_status]
    F --> G[Show install modal]
    D -->|Yes| H[start_block_via_helper]
    B -->|No| F
    H --> I{Success?}
    I -->|Yes| J[Add to activeBlocks, save]
    I -->|No| K{Connection error?}
    K -->|Yes| L[helperAvailable = false]
    L --> M[Alert: remove helper in Settings, try again]
    K -->|No| N[Alert: raw error]
```

**Stop block / Override**

```mermaid
flowchart TD
    A[User: Stop or Override] --> B{Single or override-all?}
    B -->|Single| C[clear_block_via_helper with blocklist_id]
    B -->|Override all| D[clear_block_via_helper with null]
    C --> E[Helper: clear_block, sync_hosts_file]
    D --> E
```

**Helper install**

```mermaid
flowchart TD
    A[User: Proceed in install modal] --> B[install_helper]
    B --> C[Elevated script: kill old, copy, firewall, schtasks, start]
    C --> D[Poll check_helper_status up to 15s]
    D --> E{Responding?}
    E -->|Yes| F[helperAvailable = true]
    E -->|No| G[Return error]
    F --> H[If pendingBlockData: start_block_via_helper]
    H --> I{Success?}
    I -->|No connection error| J[helperAvailable = false, friendly message]
```

**Helper uninstall**

```mermaid
flowchart TD
    A[User: Uninstall helper in Settings] --> B[uninstall_helper]
    B --> C{Helper reachable?}
    C -->|Yes| D[Helper: restore hosts, self-remove]
    C -->|No| E[force_cleanup: taskkill, delete task, remove dir]
    D --> F[Return success]
    E --> F
    F --> G[helperAvailable = false in UI]
```

**Ongoing sync to helper** (called from various flows): `set_schedules_via_helper`, `set_blocked_apps_via_helper`, `set_keep_blocking_on_uninstall_via_helper`.

- **Start block:** If we believe the helper is available we re-verify with `check_helper_status`; if that fails we set `helperAvailable = false` and show the install modal. If we then call `start_block_via_helper` and it fails with a connection error, we clear the flag and show the friendly “remove helper in Settings” message so the next attempt shows the modal.
- **Stop / Override:** Scoped clear sends `blocklist_id`; override-all sends `blocklist_id: None`. Helper updates `manual_blocks` and runs `sync_hosts_file`.
- **Install:** Elevated script installs and starts the helper; frontend polls until ping succeeds then sets `helperAvailable = true` and may start the pending block (with same connection-error handling).
- **Uninstall:** Frontend sends uninstall command; if helper is unreachable the backend runs force_cleanup and still returns success; frontend sets `helperAvailable = false`.

---

## 12) App close vs app uninstall semantics (desktop)

## 12.1 App close

Closing app window does not stop helper runtime. Helper loops continue:

- expiry,
- schedule evaluation,
- app watcher.

## 12.2 App uninstall/removal

Helper `app_existence_checker()` (5-minute cadence) decides cleanup based on:

- app presence,
- `keepBlockingOnUninstall` (helper-owned preference),
- whether active/configured enforcement state exists.

Implementation specifics (`helper-daemon/src/main.rs`):

- `check_app_exists()` probes platform install locations:
  - macOS: `/Applications/ReDD Block.app`, `~/Applications/ReDD Block.app`
  - Windows: `%LOCALAPPDATA%\Programs\redd-block\ReDD Block.exe`,
    `%PROGRAMFILES%\ReDD Block\ReDD Block.exe`
- preference read path:
  - primary: helper state (`read_keep_blocking_preference_from_helper_state`)
  - compatibility fallback: app data read path (`read_user_setting_keep_blocking_from_app_data`)
- active-manual check uses time-based predicate (`end_time > now`), not simple non-empty check.

```mermaid
flowchart TD
    checkLoop[Every5Minutes] --> appExists{AppExists}
    appExists -->|Yes| continueRun[Continue]
    appExists -->|No| readPref[ReadKeepBlockingOnUninstall_HelperState]
    readPref --> keepOn{KeepBlockingOnUninstall}
    keepOn -->|No| cleanup[ClearState_RestoreHosts_SelfRemove]
    keepOn -->|Yes| hasRules{HasBlocksAppsSchedules}
    hasRules -->|Yes| continueRun
    hasRules -->|No| cleanup
```

Cleanup path includes:

- clearing in-memory state,
- persisting empty helper state,
- restoring hosts,
- deleting helper state file,
- self-removal from OS startup mechanism.

Self-removal internals:

- `perform_self_cleanup()` executes platform-specific teardown:
  - macOS: launchd removal + plist/socket cleanup,
  - Windows: scheduled task removal + helper directory cleanup.

---

## 13) iOS architecture specifics

iOS does not use a helper daemon. Enforcement is delegated to Apple’s Screen Time APIs (FamilyControls, ManagedSettings, DeviceActivity). The app talks to these via the Tauri Screen Time plugin (`tauri-plugin-screentime`), which is implemented in Swift on iOS and invoked from `src/app.js` through `plugin:screentime|...` commands.

### 13.1 Runtime and authority model

- **No helper:** There is no privileged helper process on iOS. All blocking is done by the system via Screen Time.
- **Plugin:** `tauri-plugin-screentime` (Rust bridge in `src/mobile.rs`, native implementation in `tauri-plugin-screentime/ios/Sources/ScreentimePlugin.swift`) exposes commands that the frontend calls when `isIOS` is true.
- **Two enforcement stores:** The plugin uses two `ManagedSettingsStore` instances so manual blocks and scheduled blocks can coexist without overwriting each other:
  - **Default store** (`ManagedSettingsStore()`): used for manual (one-off) blocks. Holds websites (`webContent.blockedByFilter`), apps (`shield.applications`), and categories (`shield.applicationCategories`).
  - **Named store** (`ManagedSettingsStore(named: .init("schedule"))`): used only by the DeviceActivityMonitor extension when a scheduled time window is active. The main app writes schedule payloads to the App Group; the extension reads them and applies blocks to this named store.
- At the OS level, both stores’ settings stack: if either store blocks a domain or app, it is blocked.

### 13.2 Authorization

- **API:** `AuthorizationCenter.shared.requestAuthorization(for: .individual)` (FamilyControls). Status can be `notDetermined`, `denied`, or `approved`.
- **Frontend:** On load (`DOMContentLoaded`), when `isIOS` is true, the app calls `checkScreentimeAuth()` which invokes `plugin:screentime|check_authorization` and sets `screentimeAuthorized`. Before starting a block, if `!screentimeAuthorized`, the app calls `requestScreentimeAuth()` (`plugin:screentime|request_authorization`); if the user denies, an alert directs them to Settings > Screen Time > ReDD Block.
- **Plugin:** Every blocking command checks `isAuthorized()` (status == .approved) and returns an error if not granted. Authorization is required for website blocking, app blocking, combined start block, and scheduling.

### 13.3 Website blocking pipeline (iOS)

- **Path:** `src/app.js` computes desired blocked domains (from active non-paused blocks and, when implemented, active schedule windows). On iOS it calls `screentimeStartBlock(domains)` or `screentimeClearBlock()` via the plugin.
- **Plugin:** `blockWebsites(domains)` / `startBlock(domains)` convert domain strings to `WebDomain` and set `store.webContent.blockedByFilter = .specific(Set(webDomains))`. The Screen Time API allows at most **50 domains** per store; the plugin truncates to the first 50 and returns a `warning` in the response. Domains are not normalized (e.g. no hosts-style stripping of paths) beyond what the frontend sends.
- **Clear:** `unblockWebsites()` / `clearBlock()` set `store.webContent.blockedByFilter = nil` on the default store. `clearBlock()` also clears the named "schedule" store and calls `store.clearAllSettings()` on both so a full stop removes all blocking.
- **Persistence:** ManagedSettingsStore persists at the OS level; blocks survive app exit and device reboot until cleared by the app or the user in Settings.

### 13.4 App and category blocking (iOS)

- **Tokens:** On iOS, apps and categories are represented by opaque tokens (`ApplicationToken`, `ActivityCategoryToken`) from FamilyControls. The app never sees app names in the blocking API; it only stores and passes base64-encoded token data.
- **Activity picker:** The plugin presents Apple’s `FamilyActivityPicker` (SwiftUI) via `showActivityPicker`. The user’s selection (`FamilyActivitySelection`: applicationTokens, categoryTokens, webDomainTokens) is persisted in the App Group UserDefaults under key `redd.activitySelection` so it survives restarts and is available to the DeviceActivityMonitor extension. The picker is shown from the blocklist modal “Browse” button on iOS (instead of the desktop app picker).
- **Applying selection:** When the user starts a manual block, `startBlock(domains)` blocks the given domains and also applies the **stored** activity selection: it reads `ScreentimePlugin.currentSelection` and sets `store.shield.applications` and `store.shield.applicationCategories` from it. So the same selection is used for every manual block until the user opens the picker again. When building schedule data (`buildScheduleData`), the plugin also uses the current selection for apps/categories if not overridden by the payload.
- **Clear:** `clearBlock()` sets `store.shield.applications = nil` and `store.shield.applicationCategories = nil` on the default store and clears the schedule store. The **stored selection is intentionally not cleared** so the next block reuses the same apps/categories without re-picking.

### 13.5 Manual (one-off) block flow

1. User starts a block from the UI; frontend ensures Screen Time is authorized, then calls `screentimeStartBlock(blocklist.websites)`.
2. Plugin `startBlock(domains)`:
   - Sets `store.webContent.blockedByFilter` to the given domains (up to 50).
   - Sets `store.shield.applications` and `store.shield.applicationCategories` from `currentSelection` (App Group).
3. Frontend adds the block to `appData.activeBlocks`, saves, and updates UI. There is no separate “blocked apps” sync on iOS; `updateBlockedApps()` returns early when `isIOS`.
4. **Stop / override:** For a single-block override or “override all,” the frontend clears the relevant entries from `appData.activeBlocks` (and for override-all, clears `appData.schedules`), then calls `screentimeClearBlock()`. The plugin clears both the default and the "schedule" store. **Scoped clear by blocklist is not implemented on iOS:** one clear removes all Screen Time blocks; the frontend does not re-apply other active blocks by calling `screentimeStartBlock` again for the remaining union. So after a single-block override on iOS, only app-owned state (e.g. which blocklists are “active”) is updated; enforcement is fully cleared until the user starts a new block.
5. **Pause/resume:** Pause state lives in app data (`isPaused`, `pauseEndTime`). When the frontend recomputes effective domains (e.g. after resume or pause expiry), it calls `updateHostsFile()`, which on iOS calls `screentimeStartBlock(domainsArray)` with the union of domains from non-paused active blocks, or `screentimeClearBlock()` if none. So pause/resume for manual blocks is supported by re-applying the reduced set.

### 13.6 Scheduled blocks (DeviceActivity and extension)

- **Scheduling API:** The plugin uses `DeviceActivityCenter` to register named activities with a daily repeating `DeviceActivitySchedule` (interval start/end as `DateComponents` hour/minute). Activity names follow the pattern `redd-block-{scheduleId}`. The system invokes the **DeviceActivityMonitor** extension when an interval starts or ends; the extension runs in a separate process and has no access to the main app’s memory.
- **Data bridge:** Schedule payloads (domains, app token data, category token data) are written by the plugin to the App Group via `SharedScheduleStore` (`tauri-plugin-screentime/ios/Sources/ScheduleData.swift` and the copy in `src-tauri/gen/apple/Shared/ScheduleData.swift`). Keys: `redd.multiScheduleData` for a dictionary of schedule id → `ScheduleBlockData` (Codable); legacy key `redd.scheduleData` for a single schedule. The extension reads from the same App Group so it can apply the correct domains/apps/categories when a window starts.
- **Extension:** `ReddBlockMonitor` (`src-tauri/gen/apple/ReddBlockMonitor/DeviceActivityMonitorExtension.swift`) subclasses `DeviceActivityMonitor`. It uses the **named** store `ManagedSettingsStore(named: .init("schedule"))` for scheduled segments.
  - **intervalDidStart(for activity):** If the activity name is `redd-block-resume-{blockId}` (one-off pause resume), the extension loads manual block state and resume payload from App Group, merges them, applies to the **default** store, writes the merged state back to `redd.manualBlockState`, and removes the resume payload. If the activity name is `redd-block-end-{blockId}` (one-off block end, Option B), the extension loads current manual block state and the block-end payload (this block’s payload to **remove**), subtracts the block-end payload from current state, applies the result to the default store, writes the result back to `redd.manualBlockState`, and removes the block-end payload. Otherwise it treats the activity as a regular schedule segment: extracts schedule id, loads `ScheduleBlockData`, and applies to the **named** store.
  - **intervalDidEnd(for activity):** For one-off resume/block-end activities, the extension does nothing (to avoid clearing the default store when the 15-minute window ends). For schedule segments, it re-applies the union of remaining schedules to the named store.
- **Plugin commands:** The plugin exposes `schedule_block` (single schedule) and `set_schedules` (replace all). Both persist data via `SharedScheduleStore.save(id:, data:)` and call `center.startMonitoring(activityName, during: schedule)`. `unschedule_block(id?)` stops monitoring by id or stops all and clears `SharedScheduleStore`. **Frontend:** On iOS, `syncSchedulesToHelper()` builds `flatEntries` (one per segment) and calls `set_schedules`; the plugin registers each segment with `DeviceActivityCenter`. So scheduled time windows from the UI do activate on iOS when the app has been opened at least once after creating/editing the schedule. Segment start/end is then driven by the system (DeviceActivityMonitor) when the app is closed or backgrounded.

### 13.7 Merge semantics and store separation

- Manual blocks use the **default** store; scheduled blocks use the **named "schedule"** store. The OS enforces both: a domain or app blocked in either store is blocked.
- Within the schedule store, multiple schedules are merged by the extension on `intervalDidEnd` (union of all other schedules). Within the default store, there is only one “current” manual block set; each `startBlock` replaces the previous (no per-blocklist stacking in the store). The frontend’s `activeBlocks` array can have multiple blocklists active; on iOS the plugin is called with the **union** of all their domains in `startBlock`, and the single stored activity selection applies to all.

### 13.8 End-to-end command path (app → Screen Time)

```mermaid
flowchart TD
    ui[UserAction_src_app_js] --> branch{Platform}
    branch -->|iOS| auth{Screen Time authorized?}
    auth -->|No| requestAuth[request_authorization]
    auth -->|Yes| cmd[Plugin command]
    requestAuth --> cmd
    cmd --> startBlock[screentime_start_block / startBlock]
    cmd --> clearBlock[screentime_clear_block / clearBlock]
    cmd --> picker[show_activity_picker]
    startBlock --> defaultStore[ManagedSettingsStore default]
    startBlock --> selection[App Group currentSelection]
    clearBlock --> defaultStore
    clearBlock --> scheduleStore[Named store schedule]
    scheduleStart[DeviceActivity interval start] --> monitor[ReddBlockMonitor intervalDidStart]
    monitor --> scheduleStore
    scheduleEnd[DeviceActivity interval end] --> monitorEnd[ReddBlockMonitor intervalDidEnd]
    monitorEnd --> merge[Union of other schedules]
    merge --> scheduleStore
```

### 13.9 App Group and persistence

- **App Group ID:** `group.com.reddblock` (in `ScheduleData.swift` and extension).
- **Stored in UserDefaults(suiteName: appGroupID):**
  - `redd.activitySelection`: encoded `FamilyActivitySelection` for the activity picker.
  - `redd.multiScheduleData`: dictionary of schedule id → `ScheduleBlockData` (domains, appTokenData, categoryTokenData).
  - Legacy: `redd.scheduleBlockData` for a single schedule.
  - **Manual block one-offs:** `redd.manualBlockState` = current effective manual block state (ScheduleBlockData shape). `redd.resumePayload.{blockId}` = payload to re-apply when a paused block resumes (one-off DeviceActivity). `redd.blockEndState.{blockId}` = **this block’s payload to remove** (Option B); the extension loads manual state, subtracts this payload, applies the result to the default store, and writes the result back to `redd.manualBlockState`. The DeviceActivityMonitor extension reads these when handling `redd-block-resume-*` and `redd-block-end-*` activities and writes to the **default** store (and updates `redd.manualBlockState` after resume/block-end).
- The main app and the DeviceActivityMonitor extension both use this suite so the extension can read schedule data and the app can persist selection across launches.

### 13.10 iOS-specific constraints and limitations

- **50-domain cap:** Each ManagedSettings store can block at most 50 web domains. The plugin truncates and returns a warning; the frontend does not currently surface this.
- **No scoped clear:** Clearing a single blocklist’s block on iOS clears all Screen Time blocks; the app does not re-apply the remaining active blocklists to the store.
- **Pause resume and block end when app is closed:** The frontend registers **one-off** DeviceActivity schedules (activity names `redd-block-resume-{blockId}` and `redd-block-end-{blockId}`) that start at pauseEndTime or block endTime and end 15 minutes later (Apple’s minimum interval). The one-off schedule uses only hour/minute/second `DateComponents` (no year/month/day) so the system fires at the correct time. The plugin saves manual block state and resume/block-end payloads to App Group. When the system fires `intervalDidStart`, the extension merges (resume) or subtracts (block-end, Option B) and writes to the **default** store and back to `redd.manualBlockState`. No BGAppRefreshTask is used. On app load, `runExpiryOnce()` runs expiry (clear expired blocks and pause state) then syncs to the plugin so in-memory state matches Screen Time. **Note:** DeviceActivityMonitor one-off callbacks can be unreliable (framework limitation); if one-offs do not fire, opening the app runs `runExpiryOnce()` and corrects state.
- **Override challenge:** Override difficulty (random words, gibberish, custom text) is enforced in the frontend; Screen Time itself does not provide a challenge. So override on iOS is “confirm in app” then clear; there is no system-level friction.
- **No keep-blocking-on-uninstall:** The desktop “keep blocking after uninstall” option has no iOS equivalent; uninstalling the app removes Screen Time enforcement for the app.

Key distinction: there is no desktop-style helper engine on iOS; behavior and limitations follow Screen Time platform semantics (token-based app/category selection, single store per “kind,” DeviceActivity for schedules, and authorization required).

---

## 14) Data paths and persistence locations

## 14.1 App data

- macOS: `~/Library/Application Support/com.redd.block/redd-block-data.json`
- Windows: `%APPDATA%\com.redd.block\redd-block-data.json`
- iOS: Tauri-managed app sandbox path

## 14.2 Helper data (desktop only)

- macOS: `/var/lib/redd-block/helper-state.json`
- Windows: `%PROGRAMDATA%\ReDD Block\helper-state.json`

## 14.3 Hosts backup (desktop only)

- macOS: `/etc/hosts.redd-backup`
- Windows: `C:\Windows\System32\drivers\etc\hosts.redd-backup`

---

## 15) Safety and security mechanisms

- protected domain filtering (frontend + helper),
- protected app filtering (frontend + helper),
- hosts backup/restore safety net,
- localhost validity checks before/after writes,
- constrained privileged operations in helper lifecycle paths,
- compatibility defaults for missing fields/version drift paths.

These reduce risk of system networking breakage and self-lockout.

---

## 16) Known technical constraints and non-obvious behaviors

- schedule transitions are loop-driven (not edge-triggered interrupts), so boundary effects are interval-bounded,
- browser-level caching can delay visible effect after hosts changes even when helper completed correctly,
- helper upgrade mismatch can disable helper-available paths until reinstall/update,
- on Windows, the helper process is not restarted on crash (scheduled task runs at logon only); if the helper exits, the app re-verifies before start block and on connection failure clears cached availability and shows instructions to remove then reinstall the helper,
- desktop app-block timing still depends on effective blocked-app state transitions, not hosts model,
- **iOS:** behavior differs by Screen Time API constraints: 50-domain limit per store, no scoped clear (single-block override clears all blocks), schedules from UI not yet synced to plugin so scheduled windows do not activate, override is app-only (no system-level challenge), authorization required for all blocking.

---

## 17) Plain-language exhaustive functionality catalog

This section is intentionally non-technical and complete.

### 17.1 Blocklist authoring and management

- create, rename, recolor, decorate (emoji) blocklists,
- add/remove website targets,
- add/remove app targets,
- configure override challenge difficulty (random words, random gibberish, or custom text; character count),
- **max difficulty mode:** optional checkbox that locks override to the hardest setting (max characters for random words or gibberish); when unchecked, restores the previous type and count (including custom text),
- **duplicate blocklist:** full copy with a new name in the “X copy” / “X copy 2” chain; copies override settings (including max difficulty and restore state), schedule if present, and other blocklist properties; duplicate is never started automatically,
- delete blocklists with cleanup behavior.

### 17.2 One-off block behavior

- start immediate focus block,
- choose timed or always-on mode,
- block ends naturally when timer expires,
- pause and resume paths (manual or natural pause expiry),
- paused one-off blocks remove their domains/apps from enforcement until resumed,
- single-block override and override-all behavior.

### 17.3 Scheduled block behavior

- create schedules by day/time segments,
- support active-now and future windows,
- support recurring/date-based semantics,
- support cross-midnight schedule segments,
- support pause/resume even when currently inactive (suppresses upcoming segment activation while paused),
- schedule transitions happen automatically in background.

### 17.4 Combined and concurrent behavior

- multiple blocklists active simultaneously,
- one-off + schedule overlap,
- shared-domain correctness while overlaps exist,
- overriding one target should not incorrectly clear unrelated targets.

### 17.5 App blocking behavior

- blocked apps are hidden/minimized when launched or focused (desktop),
- app blocking can continue while app UI is closed (desktop helper running),
- self-protection prevents ReDD Block from blocking itself.

### 17.6 Website blocking behavior

- blocked domains are redirected via system-level mechanism,
- behavior applies across browsers on desktop via hosts model,
- clean-hosts recovery path exists for stale entries.

### 17.7 Helper lifecycle and controls

- install helper (with elevation),
- auto-check helper version compatibility,
- update helper when outdated,
- uninstall helper now from settings,
- helper background persistence after setup.
- if the helper is unreachable when starting a block (e.g. connection refused on Windows), the app clears cached “helper available” state and shows instructions to remove the helper in Settings and try again to reinstall, avoiding repeated raw connection errors.

### 17.8 Uninstall and persistence behavior

- if app is closed: desktop blocking can continue,
- if app is uninstalled and preserve is ON: helper can continue based on active/configured rules,
- if app is uninstalled and preserve is OFF: helper performs cleanup and self-removal.

### 17.9 iOS-specific behavior

- **Enforcement:** Website and app/category restrictions are enforced by Apple’s Screen Time APIs (ManagedSettings, DeviceActivity), not a helper daemon. The app uses the Screen Time plugin (`tauri-plugin-screentime`) from `src/app.js` when `isIOS` is true.
- **Authorization:** User must grant Screen Time access (FamilyControls). The app checks on launch and may prompt on first block; if denied, the user is directed to Settings > Screen Time > ReDD Block.
- **Manual blocks:** Start block sends the blocklist’s websites to the plugin and applies the stored activity picker selection (apps and categories) to the default ManagedSettings store. Block persists after app close. Stop or override clears both the default store and the named “schedule” store; there is no per-blocklist clear — one clear removes all blocks.
- **Activity picker:** On iOS, “Browse” in the blocklist modal opens Apple’s FamilyActivityPicker. Selection is stored in the App Group and reused for the next manual block and for schedule payloads; it is not cleared when clearing blocks.
- **Scheduled blocks:** The plugin and DeviceActivityMonitor extension support multiple schedules (domains + apps + categories per schedule, time windows via DeviceActivitySchedule). The extension applies blocks when a window starts and merges remaining schedules when a window ends. The frontend syncs schedules to the plugin on iOS via `syncSchedulesToHelper()` → `set_schedules`; scheduled time windows from the UI activate when the app has been opened at least once after creating/editing the schedule.
- **Pause/resume:** Supported for manual blocks by re-calling the plugin with the union of domains from non-paused active blocks (or clear if none).

### 17.10 User safety and trust

- protected domains/apps are never intentionally blocked,
- hosts safety checks and backups are designed to prevent system breakage,
- architecture is designed to preserve focus behavior while minimizing accidental lockout risk.

---

## 18) Contributor guidance

When implementing new behavior, define explicitly:

1. state owner (app vs helper vs iOS plugin),
2. persistence location,
3. merge semantics with existing block sources,
4. override semantics (scoped vs global),
5. app-close vs app-uninstall behavior,
6. platform divergence handling.

If these are not explicit, regressions in overlap/override/uninstall behavior are likely.

