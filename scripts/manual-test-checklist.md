# ReddBlock Pre-Release Test Checklist

## Before Each Release

Run this checklist before publishing a new version. Use a test blocklist with safe, non-critical sites.  
For iOS builds, run **section 14 (iOS-Specific)** on a physical device so coverage mirrors desktop where applicable.

---

## 1. Automated Tests

- [ ] Start app in dev mode: `npm run dev`
- [ ] Run Tier 1 in the developer console: press **Cmd+Shift+T** (Mac) or **Ctrl+Shift+T** (Windows), or call `runBlockingTests()`
- [ ] Run Tier 2 `core` in the developer console: `runIntegrationTests('core')`
- [ ] If the release touches desktop helper behavior, pause/schedule behavior, overlap/clear behavior, or blocklist-management paths, also run Tier 2 `full`: `runIntegrationTests('full')`
- [ ] On desktop, run Tier 3 helper smoke if helper-specific changes were made: `npm run test:helper`
- [ ] Verify all relevant automated tests pass in the developer console / terminal output
- [ ] If tests fail, fix issues before proceeding

---

## 2. One-Off Blocks

### Basic Flow
- [ ] Create blocklist with 2 websites (e.g., example.com, test.com)
- [ ] Start a 2-minute one-off block
- [ ] Verify sites are blocked in browser (should show error page)
- [ ] If blocklist includes apps: add a safe app (e.g., Calculator, Notes), start block, open the blocked app and verify it gets minimized/hidden; end block and verify app opens normally
- [ ] Wait for expiration
- [ ] Verify sites are unblocked

### Cross-Midnight Block
- [ ] Start a block late at night that crosses midnight
- [ ] Verify block continues after midnight
- [ ] Verify correct "time left" display

### Pause / Resume (One-Off)
- [ ] Start a 10-minute one-off block
- [ ] Confirm sites are blocked (and apps if in blocklist)
- [ ] Pause the block from the block card/calendar
- [ ] Verify sites become unblocked while paused
- [ ] Verify blocklist domains are removed from hosts while paused
- [ ] Verify app blocking for that blocklist is disabled while paused
- [ ] Verify UI shows paused state and resume time countdown
- [ ] Resume before pause expiry
- [ ] Verify sites are blocked again immediately
- [ ] Verify blocklist domains are restored in hosts on resume
- [ ] Verify app blocking for that blocklist resumes on resume
- [ ] Pause again and let pause expire naturally
- [ ] Verify block auto-resumes when pause timer ends
- [ ] Verify domains/apps are restored when pause ends naturally
- [ ] Verify final block end time still works (no permanent pause)

---

## 3. Scheduled Blocks

### Basic Schedule
- [ ] Create schedule for a time segment starting in 2 minutes
- [ ] Verify schedule badge says "In X mins"
- [ ] Wait for segment to start
- [ ] Verify sites are blocked (and apps if in blocklist)
- [ ] Verify schedule badge shows "X min left"
- [ ] Wait for segment to end
- [ ] Verify sites are unblocked

### Cross-Midnight Schedule
- [ ] Create schedule segment: e.g., 23:00 → 02:00
- [ ] Test at both ends (evening and morning)
- [ ] Verify "time left" calculation is correct

### Pause / Resume (Schedule)
- [ ] Create active schedule for current time window
- [ ] Confirm sites are blocked by schedule (and apps if in blocklist)
- [ ] Pause schedule (single schedule pause action)
- [ ] Verify sites become unblocked while paused
- [ ] Verify schedule domains are removed from hosts while paused
- [ ] Verify schedule app blocking is disabled while paused
- [ ] Verify paused schedule UI state is visible
- [ ] Resume schedule manually
- [ ] Verify schedule blocking resumes immediately if still in active segment
- [ ] Verify schedule domains/apps are restored on resume when segment is active
- [ ] Pause schedule again and allow pause timer to expire
- [ ] Verify schedule auto-resumes at pause expiry
- [ ] Verify next schedule segment/day still triggers correctly after pause cycle

### Pause While Schedule Is Inactive (Upcoming Segment Suppression)
- [ ] Create a started schedule with next segment in ~5 minutes (not active yet)
- [ ] Click Pause and choose a pause duration shorter than the gap (e.g., 2 min)
- [ ] Verify prompt explains that upcoming segments are suppressed until pause ends/resume
- [ ] Verify segment still activates normally if pause ends before segment starts
- [ ] Repeat with a longer pause that overlaps segment start (e.g., 10 min)
- [ ] Verify segment activation is suppressed during pause window
- [ ] Resume during the overlapped segment window and verify enforcement begins immediately

---

## 4. Overlap Scenarios

### Shared Domains and Apps
- [ ] Create Blocklist A with: site1.com, shared.com (and optionally a shared app, e.g. Notes)
- [ ] Create Blocklist B with: shared.com, site2.com (and the same shared app in B if used in A)
- [ ] Start block for both lists
- [ ] Stop Blocklist A
- [ ] Verify shared.com is STILL blocked (by Blocklist B)
- [ ] If using shared app: verify shared app is STILL blocked (by Blocklist B)

### One-off + Schedule (Same Blocklist)
- [ ] Start a one-off block for Blocklist X
- [ ] Start a schedule for Blocklist X (same list)
- [ ] Override the one-off block
- [ ] Verify schedule still blocks the sites
- [ ] Override the schedule
- [ ] Verify sites are now unblocked

---

## 5. Blocklist Management

### Duplication of one-off blocklists
- [ ] Create a blocklist with websites, optional apps, and override difficulty (e.g. random words, 20 chars); no schedule
- [ ] Duplicate the blocklist (e.g. from blocklist menu or context)
- [ ] Verify new blocklist appears with derived name ("X copy" or "X copy 2", …)
- [ ] Verify duplicate has same websites, apps, and override settings (including max difficulty if set)
- [ ] Verify duplicate is not started automatically
- [ ] Start the duplicate and clear by its blocklist ID; verify only that block clears (scoped clear)

### Duplication of scheduled blocklists
- [ ] Create a blocklist with websites, optional apps, override settings, and a schedule (one or more segments)
- [ ] Duplicate the blocklist
- [ ] Verify duplicate has same name derivation, same websites, apps, override settings, and full schedule (all segments copied)
- [ ] Verify duplicate is not started automatically
- [ ] Start the duplicate and verify it runs across schedule segments as expected (e.g. segment start/end, cross-midnight if applicable)
- [ ] Verify scoped clear by blocklist ID affects only the duplicate’s blocks/schedule

---

## 6. Override Functionality

Override applies to both websites and apps: overriding a block or using Override All clears blocking for all targets in that blocklist (websites and apps) equally.

### Max difficulty (Add/Edit blocklist UI)
- [ ] Create or edit a blocklist; set override to e.g. Custom text or Random words with a low count
- [ ] Enable "Max difficulty" checkbox → verify dropdown restricts to Random Words / Random Gibberish and count is locked to max
- [ ] Save and reopen blocklist → verify max difficulty state is preserved
- [ ] Uncheck "Max difficulty" → verify previous type and count are restored

### Single Block Override
- [ ] Start a block with 50-char random words override (websites and/or apps in blocklist)
- [ ] Click on block in calendar
- [ ] Type the challenge correctly
- [ ] Verify block is removed and sites/apps unblocked

### Max difficulty (override)
- [ ] Create a blocklist with "Max difficulty" enabled (Random Words or Random Gibberish, count locked to max)
- [ ] Start a one-off block
- [ ] Trigger override (single block or Override All) → verify challenge uses hardest setting (max chars for that type)
- [ ] Complete challenge → verify block clears

### Override All (Settings)
- [ ] Start multiple blocks (one-off + schedule, different blocklists; use blocklists with websites and/or apps)
- [ ] Open Settings → Advanced → Override All Blocks
- [ ] Verify it uses the HARDEST challenge from all active blocks
- [ ] Complete the challenge
- [ ] Verify ALL blocks and schedules are cleared (websites and apps)
- [ ] Verify blocklists are NOT deleted (just the active blocks/schedules)
- [ ] Verify Override All button disappears when no blocks are active

---

## 7. Edge Cases

- [ ] Start block at exact same time a schedule ends → no gap
- [ ] Close and reopen app during active block → block persists
- [ ] Pause an active one-off block or schedule, close app, reopen app → paused state and resume timer are preserved
- [ ] During a paused block, use Override All → verify paused block is still cleared correctly

---

## 8. Advanced Settings

### Diagnostics
- [ ] Open Settings → Diagnostics
- [ ] Verify diagnostics modal opens and loads without error
- [ ] Verify per-browser extension status shows Installed / Enabled / Allowed in private browsing for each detected browser (Chrome, Brave, Edge, Firefox, Safari)
- [ ] Verify the native-messaging manifest paths (`~/Library/Application Support/<browser>/NativeMessagingHosts/com.ulriklyngs.mindshield.json`) are listed and present on disk
- [ ] Verify Automation permission status (macOS) is shown
- [ ] Click "Copy to Clipboard" → verify diagnostic text is copied

### Still Not Working
- [ ] Open Settings → "Something still not working?"
- [ ] Verify the support modal opens on top of Settings
- [ ] Click "Close" → verify only the "Something still not working?" modal closes and Settings remains open

### Shared Desktop Data / Reinstall Persistence
- [ ] On desktop, create or edit a blocklist and confirm settings save successfully
- [ ] Close and reopen the app → verify blocklists and settings are still present
- [ ] If testing reinstall on desktop: reinstall/open again → verify data restores from the active desktop app-data location as expected

---

## 9. First-Launch Upgrade Migration (from v1.0.x)

Run this on a fresh user profile that already has a v1.0.x install (or simulate by hand-crafting `/etc/hosts` markers and stubbing the launchd plist).

- [ ] `/etc/hosts` contains `# ReDD Block start ...` markers before launch
- [ ] Old launchd daemon (`com.reddblock.helper.plist`) installed in `/Library/LaunchDaemons` before launch
- [ ] Launch the new build → admin password prompt to bootout the legacy daemon (osascript / AppleScript)
- [ ] After auth: `/etc/hosts` markers gone, `/Library/LaunchDaemons/com.reddblock.helper.plist` removed, `/var/lib/redd-block/` (or its contents) cleaned up
- [ ] Native-messaging manifests written to `~/Library/Application Support/{Google/Chrome,BraveSoftware/Brave-Browser,Microsoft Edge,Mozilla}/NativeMessagingHosts/com.ulriklyngs.mindshield.json`
- [ ] `redd-block-data.json::settings.migrationRanAtVersion` equals the running app version
- [ ] Quit and relaunch → no admin re-prompt, migration is idempotent

---

## 10. Browser-Extension Compliance & Enforcer

Run with at least two of {Chrome, Brave, Edge, Firefox, Safari} installed.

### Compliance Banner
- [ ] Fresh launch with the ReDD Focus extension **uninstalled** in browser X → "ReDD Focus extension is missing in X" banner appears
- [ ] Click Install in banner → opens X's extension store / Safari extensions pane
- [ ] Install + enable the extension in X → return to ReDD Block window → banner clears within ~2 s of the focus listener firing
- [ ] Disable the extension in X → banner reappears
- [ ] Disable "Allow in private browsing" (Chrome/Firefox/Edge) → banner reappears

### Enforcer Grace Timer
- [ ] Start an active block → enforcer is running (debug: tick logs every 5 s)
- [ ] In browser X, disable the ReDD Focus extension while a block is active
- [ ] Toast appears: "X is non-compliant — quitting in 60 s" (first offense) with countdown
- [ ] Re-enable the extension before zero → toast clears, browser stays open (`enforcer://grace-resolved`)
- [ ] Disable again → toast shows 30 s grace (repeat offense)
- [ ] Let the timer expire → browser X gets `osascript quit` (macOS) / `taskkill` (Windows)

### Native-Messaging Connectivity
- [ ] Trigger an active block from ReDD Block → in browser X (extension installed), navigate to a blocked domain → redirected to extension's `blocked.html`
- [ ] `blocked.html` shows: emoji + name pill, source ("schedule" or "active block"), countdown to `endsAt`, started-at row
- [ ] Repeat for each browser X in {Chrome, Brave, Edge, Firefox}
- [ ] Native host log present at `~/Library/Application Support/com.reddblock/native-host.log` (or whichever path `resolve_data_path` resolved to) with `spawned pid=...` lines

---

## 11. App Watcher (in-process, macOS)

- [ ] Add a safe blocked app (e.g. Calculator, Notes) to a blocklist
- [ ] Start an active block
- [ ] Launch the blocked app → app gets hidden via System Events within ~1 s
- [ ] Quit and relaunch the app → it gets hidden again
- [ ] End the block → the app opens normally without being hidden
- [ ] Run `ps -ax | grep osascript` → verify the persistent NSWorkspace watcher subprocess is alive (single instance, owned by ReDD Block)
- [ ] Leave ReDD Block running for >10 minutes → watcher subprocess still alive

### Automation TCC Permission
- [ ] On a clean user (or after revoking via System Settings → Privacy & Security → Automation): launch ReDD Block
- [ ] "Automation permission needed" banner appears with "Grant" button
- [ ] Click Grant → macOS shows the system-events authorization prompt
- [ ] Allow → banner clears (re-checked on window `focus` event)
- [ ] Revoke in System Settings → return to ReDD Block window → banner reappears with "Open Settings" button (denied state)
- [ ] Click Open Settings → System Settings opens to the Automation pane
- [ ] Re-grant in Settings → return to app → banner clears

---

## 12. Persistence: Hide-on-Close + Launch-at-Login (macOS)

- [ ] Click ⌘W or the red close button → window hides instead of quitting
- [ ] Tray icon remains in the menu bar; clicking it reopens the window
- [ ] Quit ReDD Block from the tray menu → window and tray icon gone
- [ ] `launchctl list | grep com.reddblock` → LaunchAgent is registered
- [ ] Log out and log back in → ReDD Block launches automatically (hidden, tray-only)
- [ ] Disable "Launch at login" in Settings → `launchctl list | grep com.reddblock` returns nothing after next launch

---

## 13. Safari Extension via App Group

Requires the ReDD Focus Safari extension built locally from `redd-focus-web/` and enabled in Safari → Settings → Extensions. Both bundles must declare the `group.com.reddblock.shared` App Group entitlement.

- [ ] Build `redd-focus-web` in Xcode (Product → Run on macOS target). App launches and exposes the extension to Safari
- [ ] Grant ReDD Block Full Disk Access in System Settings → Privacy & Security → Full Disk Access
- [ ] Open Safari → Settings → Extensions → enable ReDD Focus
- [ ] Enable "Allow in Private Browsing" for ReDD Focus
- [ ] Allow ReDD Focus on "All Websites"
- [ ] Confirm `~/Library/Group Containers/group.com.reddblock.shared/redd-block-data.json` exists and is fresh after a save in ReDD Block
- [ ] Confirm ReDD Block reports Safari as set up from `~/Library/Containers/com.apple.Safari/Data/Library/Safari/WebExtensions/Extensions.plist`
- [ ] Trigger an active block in ReDD Block → in Safari, navigate to a blocked domain → redirected to extension's `blocked.html` with metadata
- [ ] `Console.app` filtered on `ReDDFocus native message` shows the handler firing on each navigation
- [ ] Modify the block's name/emoji in ReDD Block → re-navigate in Safari → updated metadata appears in `blocked.html` (proves App Group write↔read round-trip)
- [ ] End the block in ReDD Block → previously-blocked tabs in Safari unblock on next navigation / sweep

### Strict Safari enforcement

Safari is enforced whenever its process is running, matching Chrome / Brave / Edge / Firefox. Missing Full Disk Access is non-compliant because ReDD Block cannot verify Safari extension settings.

- [ ] With Safari running and the extension correctly configured, no in-session compliance banner appears
- [ ] Revoke Full Disk Access, launch Safari → grace timer fires, Safari force-quits at zero, and ReDD Block opens in front
- [ ] Cmd-M (minimise) Safari with ReDD Focus disabled → grace timer still fires and Safari force-quits at zero
- [ ] Cmd-H (hide) Safari with ReDD Focus disabled → grace timer still fires and Safari force-quits at zero
- [ ] Park Safari on Mission Control space 2 with ReDD Focus disabled → grace timer still fires and Safari force-quits at zero
- [ ] Disable ReDD Focus in Safari → Settings → Extensions → in-session banner appears, grace timer fires, Safari force-quits at zero, and ReDD Block opens in front
- [ ] Re-enable the extension while the grace timer is counting down → banner clears, Safari stays open

---

## 14. iOS-Specific (Physical Device Only)

iOS uses Screen Time APIs instead of the desktop helper; there is no hosts file or helper daemon. Blocking and override behavior apply to both websites and apps in the same way. Test the same behaviors where they apply. Skip: Clean hosts file, Keep blocking on uninstall, Helper lifecycle (install/upgrade/uninstall).

### Permissions and Screen Time connection
- [ ] Fresh install: start a block → verify Screen Time permission prompt appears
- [ ] Grant permission → verify blocking starts
- [ ] Check Settings → Screen Time → verify ReDD Block appears

### One-Off Blocklists
- [ ] Create blocklist with 2 websites (and optionally a safe app); start 2-minute one-off block
- [ ] Verify sites are blocked in Safari (or restricted)
- [ ] If blocklist includes apps: verify blocked app is restricted (Screen Time behavior)
- [ ] Wait for expiration → verify sites/apps are unblocked
- [ ] Cross-midnight: start block late that crosses midnight → verify block continues and "time left" is correct
- [ ] Pause/Resume (one-off): start ~10 min block → pause → verify sites/apps unblocked while paused and UI shows paused state
- [ ] Resume before pause expiry → verify sites/apps blocked again
- [ ] Pause again and let pause expire naturally → verify block auto-resumes and final block end time still applies

### Scheduled Blocklists
- [ ] Create schedule for a segment starting in ~2 minutes → verify "In X mins"
- [ ] Wait for segment to start → verify sites (and apps if in blocklist) blocked and "X min left"
- [ ] Wait for segment to end → verify sites/apps unblocked
- [ ] Cross-midnight schedule (e.g., 23:00 → 02:00) → verify time-left at both ends
- [ ] Pause/Resume (schedule): with active schedule, pause → verify sites/apps unblocked; resume → verify blocking resumes
- [ ] Pause and let pause timer expire → verify schedule auto-resumes and next segment still triggers
- [ ] Pause while schedule inactive (next segment in ~5 min): pause shorter than gap → verify segment still activates after pause ends; pause overlapping segment start → verify activation suppressed until resume

### Overlap Scenarios
- [ ] Shared domains and apps: Blocklist A (site1.com, shared.com, and optionally a shared app), Blocklist B (shared.com, site2.com, same shared app if used); start both; stop A → shared.com still blocked by B; if shared app used, verify it is still blocked by B
- [ ] One-off + schedule (same blocklist): start one-off and schedule for same list; override one-off → schedule still blocks; override schedule → sites/apps unblocked

### Blocklist Management

#### Duplication of one-off blocklists
- [ ] Create blocklist with websites, optional apps, override difficulty (e.g. random words, 20 chars); no schedule
- [ ] Duplicate blocklist → verify derived name ("X copy" / "X copy 2"), same websites, apps, override settings (incl. max difficulty if set); duplicate not started
- [ ] Start duplicate, clear by blocklist ID → verify only that block clears (scoped clear)

#### Duplication of scheduled blocklists
- [ ] Create blocklist with websites, optional apps, override settings, and a schedule (one or more segments)
- [ ] Duplicate blocklist → verify same name derivation, websites, apps, override, full schedule (all segments); duplicate not started
- [ ] Start duplicate → verify it runs across schedule segments as expected; scoped clear by blocklist ID affects only duplicate’s blocks/schedule

### Override Functionality

Override applies to both websites and apps: overriding a block or using Override All clears blocking for all targets in that blocklist (websites and apps) equally.

#### Max difficulty (Add/Edit blocklist UI)
- [ ] Create or edit blocklist; set override to e.g. Custom text or Random words (low count)
- [ ] Enable "Max difficulty" → verify dropdown restricts to Random Words / Random Gibberish, count locked to max; save and reopen → state preserved
- [ ] Uncheck "Max difficulty" → verify previous type and count restored

#### Single Block Override
- [ ] Start block with 50-char random words override (websites and/or apps) → open block in calendar → complete challenge → block removed, sites/apps unblocked

#### Max difficulty (override)
- [ ] Blocklist with "Max difficulty" enabled → start one-off block → trigger override (single or Override All) → verify challenge uses hardest setting → complete → block clears


### Edge Cases
- (iOS uses Screen Time API; app closing and persistence behave differently than on desktop. Leave blank if no known iOS-specific edge cases; retain section for future additions.)

### Advanced Settings
- [ ] No desktop-only options (Clean hosts file, Keep blocking on uninstall) apply on iOS. Override All behavior is covered under Override Functionality above.

---

## Sign-off

| Tester | Date | Version | Platform | Pass/Fail |
|--------|------|---------|----------|-----------|
|        |      |         |          |           |
