# Changelog

User-facing changes for each release. Every app upgrade adds a new entry here.

## v1.1.0 (unreleased)

- **New blocking architecture on desktop.** No more privileged helper
  daemon, no more hosts-file edits, no admin/UAC prompt on install.
  - Website blocking on both macOS and Windows now goes through the
    ReDD Focus browser extension. Chrome / Brave / Edge / Firefox
    speak to the app via a built-in native messaging host that's
    just the app binary in a `--native-host` CLI mode. Safari
    (macOS) routes through a handler inside the signed `.app`.
  - App blocking runs in-process on both OSes. First use of app
    blocking on macOS prompts for Accessibility / Automation
    permission.
- **Minimum macOS is now 11 (Big Sur),** for Safari Web Extension
  support. Still supports the same Windows versions.
- **App hides to tray on close** and launches at login so schedules
  keep firing across sessions.
- **Automatic migration on first launch.** The app cleans its old
  entries out of the hosts file, removes the privileged helper
  daemon, and moves onto the new backend. macOS prompts once for the
  admin password to remove the old helper.
- **"Keep blocking after uninstall" removed.** Uninstalling the app
  now stops blocking cleanly.

## v1.0.1

- fix bug where EULA was showing on every opening of the app
- fix iOS UI issues

## v1.0.0

- **EULA onboarding** — Added a licence-agreement step during onboarding
- Non-repeating schedules now behave consistently across desktop and iOS: previews, saved schedules, active-state checks, and helper sync all resolve the same one-off occurrences.
- Calendar rendering for one-off schedules now uses the correct local day, including overnight cases, instead of drifting because of timezone handling.
- iOS schedule handling is more reliable in the background: paused schedules resume correctly, and one-off activities that cross midnight are handled properly.
- macOS helper install now prefers the helper binary for the current architecture.

## v0.9.7

- **Helper troubleshooting** — Desktop helper install, update, repair, diagnostics, and uninstall flows are clearer and more reliable.
- Settings and Diagnostics now show more accurate helper states (for example active, idle, or installed but not reachable) and refresh live while open.
- Emergency stop and helper cleanup are more robust even when the helper is stale or not running.
- Shared desktop data-path handling is more stable across install, uninstall, and reinstall.
- Settings opens faster thanks to cached helper-status checks.

## v0.9.6

- Blocklist names now wrap correctly on the schedule.

## v0.9.5

- Blocklist card text is larger for readability.
- Schedule repeats now default to **forever**.
- Added a suggestions link.
- iPad styling tweaks.
- Version checks are no longer cached, so update prompts stay current more reliably.

## v0.9.4

- Desktop block data is now stored in a shared system-wide location, so blocks can be seen and edited more reliably across users.
- Backwards compatibility added for the storage changes, making updates smoother on existing installs.
- iOS no longer repeatedly asks for Screen Time access.
- iOS app blocking inside schedules is fixed.

## v0.9.3

- The override dialog now lists the same number of websites as the blocklist cards.
- Added a note that changes can take a little time to apply.
- Emergency handling is simpler and clearer.

## v0.9.2

- **Diagnostics** — Added a diagnostics section in Settings to make helper/support troubleshooting easier.
- Manual website blocking now updates the hosts file atomically for safer desktop blocking changes.

## v0.9.0

- **iOS scheduled blocking** — Fixed a long list of reliability issues: future segments activate correctly, schedule transitions resync properly, and date-limited or non-repeating windows are enforced as expected.
- iOS overriding and pausing now behave properly with overlapping schedules and active blocks, so clearing one restriction no longer accidentally clears others.
- Timed blocks and paused blocks on iOS now update in real time even when the app is closed, so they can end or resume in the background.
- iOS now supports app-only blocklists.
- Screen Time permission is now part of onboarding on iOS.
- Schedule previews now match the actual running blocks more closely, including always-on schedules.
- iOS app-picker and scrolling behaviour improved when there are many apps or blocklists.

## v0.8.6

- Fixed duplicated blocklists being active by default.
- Better preview for override text.
- Polished max difficulty challenge behaviour and copy, including more accurate typing estimates for random words and gibberish.
- Max difficulty controls are now hidden when using custom override text.

## v0.8.5

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
