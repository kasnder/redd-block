# Changelog

User-facing changes for each release. Every app upgrade adds a new entry here.

## v0.8.5 (next)

- **Duplicate blocklist** — Duplicate a blocklist from the card menu; naming follows macOS duplicate behaviour (e.g. “Copy of My List”); new list appears at end
- **Max difficulty mode** — Optional harder override challenge (highest character count)
- Blocklist card menu — Move delete and blocklist buttons into dropdown and update edit icon
- Undo — Undo recent changes; works correctly with locked website/app tags during active blocks.
- Backspace on an empty website or app field removes the last tag (if not locked).
- Paste multiple websites — Paste several URLs at once into the website field; valid ones are saved on space, Enter, or Save; invalid ones stay in the field with an error message so you can fix them.

## v0.8.4

- When updating the helper on macOS, legacy bundle id is now cleaned up too.
- Scheduled blocking: app block detection corrected so blocked apps are detected reliably.
- “Always on” block info message now stays visible when relevant.

## v0.8.1

- Press **ESC** to deselect the current blocklist or close the add/edit blocklist popup.
- "Repeat until" date picker is disabled while a schedule is active (avoids invalid picks).
- Layout improvements on smaller windows (768px) and general UI polish (footer, buttons, duration/end labels, hover states).
- Helper update for more reliable website blocking over time.

## v0.8.0

- **Windows** release brought in line with macOS (same version and behaviour).
- Clearer messages when the blocking helper isn’t running; app now re-checks and prompts to install the helper when needed.
- Schedule and app blocking made more reliable (no overlapping sources; schedule changes checked more often).
- Zoom and layout fixes on desktop (max zoom 150%, consistent behaviour on Windows).
- Uninstall flow now shows how to contact us in case of emergency.
- **Danish** translation added.
- Blocklist name and URL validation improved (inline messages instead of alerts); scroll and alignment tweaks.

## v0.7.2

- Cancel button no longer re-shows the schedule when it’s hidden.

## v0.7.1

- **Pause** works properly with schedules and one-off blocks; paused state is synced to the helper so blocks stay paused after restart or reinstall.
- Helper cleanup on macOS fixed (correct service name; all managed blocking sections removed on uninstall).
- More reliable connection to the helper (bounded timeouts on Mac and Windows).
- Schedule UI fixes: edit only when there are pending changes; no duplicate schedules in calendar; correct blocklist name on buttons.
- New dialog when pausing with no active schedule.

## v0.7.0

- Zoom support added (desktop).
- Mac menu bar items added/updated.
- Invalid blocklist URLs can no longer be saved.

## v0.6.6

- Override challenge has clear maximum difficulty (e.g. 7500 characters for custom text, 5000 for gibberish).

## v0.6.5

- Blocklist status badges now match actual blocking state and update automatically.
- App blocking more reliable on **Mac** (periodic check while running) and **Windows** (schedules refresh blocked apps immediately).
- “Keep blocking on uninstall” choice is now saved correctly.
- Support for multiple simultaneous blocks; override is tied to the correct blocklist.
- Website blocking logic simplified so the helper is the single source of truth.

## v0.6.4

- You can’t accidentally block ReDD Block itself or the domains needed for app updates.

## v0.6.3

- Windows: more reliable helper installation (correct architecture bundling, firewall handling).
- Helper updates and logging improvements.

## v0.6.2

- Helper installation on Windows improved (firewall, logging).
- Helper version kept in sync with app.

## v0.6.1

- **Pause** — Pause an active block and resume later; dialog and button placement improved.
- **Update available** banner on the main screen when a new version is released.
- Option to block **always** (no end time).
- iOS: blocking state synced when a one-off block expires; separate capabilities for iOS vs desktop.
- Schedule check interval relaxed for better performance; immediate feedback when changing blocklist settings.
- App version shown in Settings; no update prompt if helper is newer than app.

## v0.6.0

- **Pause** — Pause and resume blocks; preview of schedule changes; footer and dialog layout fixes.
- **Update available** banner; domain validation; “block always” option.
- **iOS**: Scheduled blocking stays in sync when one-off blocks end; Screen Time entitlements and capabilities fixed.
- UI polish and always-on detection improved.

## v0.5.6

- “Keep blocking on uninstall” preference now read correctly by the helper (data path fix).
- README and build script updates.

## v0.5.5

- **Windows**: App blocking works correctly after helper install.
- App blocking fully handled by the helper (desktop); cancel on override-all returns you to settings.
- Sync-helper script and UI icons updated.

## v0.5.3

- **Clean hosts file** button in Settings (desktop) to remove leftover block entries.
- Windows: PowerShell windows hidden during app blocking; ARM64 signing fixes.
- Installers copied to `for-distribution/` with consistent filenames.
- Screen Time plugin built only for iOS.

## v0.5.2

- **iOS**: Scheduled blocking via **DeviceActivityMonitor**; multiple schedules supported; App Store signing and Xcode build fixed.
- **iOS**: Authorization check before blocking; warning when domains exceed Screen Time’s 50-domain limit; app selection preserved.
- **Windows**: Safer helper install (temp dir, auth, hosts restore, log rotation); IPC and install script fixes.
- **Desktop**: Safer hosts file updates (atomic write, backup validation); macOS force-cleanup restores hosts correctly.
- Schedule segments with start equal to end treated as “all day”.

## v0.5.1

- **Scheduled blocking** moved into the helper so blocks continue when the app is closed.
- Helper (not the app) now performs app blocking on desktop.
- Override time calculation fixed; safety check when writing to hosts file.
- **iOS** dev command added (`npm run dev:ios`).

## v0.5.0

- **iOS support** — ReDD Block on iPhone and iPad using the **Screen Time** API (website and app blocking).
- **iOS**: Responsive layout for small screens; scheduled blocking enabled; delete button and modals adjusted for iOS; input zoom prevented.
- Default “Distractions” blocklist (e.g. Instagram, YouTube, Reddit) replaces onboarding.
- **Desktop**: Overlapping schedules shown side-by-side; multiple apps selectable; “always on” block option; calendar and schedule fixes.
- Helper version separated from app version for cleaner updates.

## v0.4.5

- Option to **hide blocklist contents** on the card (e.g. for sensitive lists).
- Edit button always visible; old helper location cleaned up on upgrade.

## v0.4.4

- Helper installed in conventional location; reinstall if outdated when running dev.
- **Windows**: Helper reinstall kills old process first; elevated permissions for task commands; no visible PowerShell windows when flushing cache.
- Single-step helper installation; “Uninstall helper” wording unified; version comparison fixed.

## v0.4.3

- **Mac**: Helper syncs in development; app prompts to update helper if outdated; version shown in Settings.
- Helper uninstall requires overriding active blocks first; clearer uninstall wording.
- Mac build includes helper binary correctly; block stays selected after start; helper logs and permissions on first start.

## v0.4.2

- **Windows**: Helper installation and uninstall fixed (UAC, single process watcher, no console window).
- Hosts file backup and DNS flush logging.

## v0.4.1

- **Windows** support — ReDD Block runs on Windows: title bar with controls, scheduled blocking, app blocking (watcher), MSIX/UAC handling.
- **Scheduled blocking** (desktop): weekly calendar view, temporary and recurring segments, cross-midnight and “repeat until” fixes; schedule UI (disable edit when active, stop schedule button, exclusive temp additions).
- **Desktop**: Add apps to a block after starting; settings and distinct hosts-file markers; one-off and schedule time/duration persist.
- Electron dependency removed; Mac build script and version handling improved.

## v0.3.0

- Hosts file **backup** before making changes (restore if needed).
- README updated for Tauri 2.

## v0.2.6 — First Tauri release

ReDD Block rebuilt with **Tauri 2** (replacing Electron). Same app, leaner and more reliable.

- **Blocklists** — Create multiple lists with custom names, colors, and emojis; add websites and choose which apps to block per list.
- **Website blocking** — System-level blocking via a small helper daemon (hosts file on Mac and Windows); works in all browsers and keeps blocking when the app is closed.
- **App blocking** — Blocked apps are hidden or minimized when you try to use them (Mac: process watcher; Windows support added later).
- **One-off blocks** — Start a block now with a duration; see time remaining next to the active badge.
- **Scheduled blocks** — Set recurring blocks on specific days and times (e.g. weekday work hours).
- **Override protection** — Typing challenges (random words, gibberish, or custom text) to discourage impulsive unblocking; autocorrect disabled in the challenge field.
- **Theme** — Auto, light, or dark mode.
- **Desktop UI** — Clearer font sizes, select styling, and modal spacing; transparent titlebar with overlay traffic lights on macOS.
