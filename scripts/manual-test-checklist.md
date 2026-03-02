# ReddBlock Pre-Release Test Checklist

## Before Each Release

Run this checklist before publishing a new version. Use a test blocklist with safe, non-critical sites.  
For iOS builds, run **section 10 (iOS-Specific)** on a physical device so coverage mirrors desktop where applicable.

---

## 1. Automated Tests

- [ ] Start app in dev mode: `npm run dev`
- [ ] Press **Cmd+Shift+T** (Mac) or **Ctrl+Shift+T** (Windows)
- [ ] Verify all tests pass in the developer console
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

### Shared Domains
- [ ] Create Blocklist A with: site1.com, shared.com
- [ ] Create Blocklist B with: shared.com, site2.com
- [ ] Start block for both lists
- [ ] Stop Blocklist A
- [ ] Verify shared.com is STILL blocked (by Blocklist B)

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
- [ ] Pause an active one-off block, close app, reopen app → paused state and resume timer are preserved
- [ ] Pause an active schedule, close app, reopen app → paused schedule state is preserved
- [ ] During a paused block, use Override All → verify paused block is still cleared correctly

---

## 8. Advanced Settings

### Clean Hosts File
- [ ] Verify "Clean hosts file" button is **disabled** when blocks are running
- [ ] Stop all blocks
- [ ] Click "Clean hosts file" → verify confirmation dialog appears
- [ ] Confirm → verify success message
- [ ] Check that hosts file no longer has ReDD Block entries

### Keep Blocking on Uninstall
- [ ] Enable "Keep blocking after app removal" toggle (default: on)
- [ ] Start a block, then **move the .app to Trash** (Mac) or uninstall (Windows)
- [ ] Wait ~5 minutes (helper checks every 5 min)
- [ ] Verify block continues running (sites still blocked)
- [ ] Re-install app, stop the block

- [ ] Disable "Keep blocking after app removal" toggle
- [ ] Start a block, then **move the .app to Trash** (Mac) or uninstall (Windows)
- [ ] Wait ~5 minutes
- [ ] Verify helper cleans up and removes itself
- [ ] Verify hosts file is restored

---

## 9. Helper Lifecycle

### Installation & Status
- [ ] Fresh install: start a block → verify helper installs (UAC on Windows)
- [ ] Open Settings → verify helper status shows "Running"
- [ ] Verify version matches expected version

### Upgrade
- [ ] With older helper running, open the app
- [ ] Verify "Update available" status appears
- [ ] Click Update → verify helper restarts with new version

### Uninstall Helper
- [ ] With NO active blocks: click "Uninstall Helper" → verify confirmation dialog → confirm
- [ ] Verify helper status changes to "Not installed"
- [ ] Verify helper process is no longer running (`ps aux | grep redd-block-helper` on Mac, Task Manager on Windows)
- [ ] Verify hosts file is clean (no ReDD Block entries)

- [ ] With active blocks: verify "Uninstall Helper" button is disabled
- [ ] Verify tooltip says "Override all running blocks first"

---

## 10. iOS-Specific (Physical Device Only)

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
- [ ] Shared domains: Blocklist A (site1.com, shared.com), Blocklist B (shared.com, site2.com); start both; stop A → shared.com still blocked by B
- [ ] One-off + schedule (same blocklist): start one-off and schedule for same list; override one-off → schedule still blocks; override schedule → sites/apps unblocked

### Blocklist Management
- [ ] Create blocklist with name, color, emoji; add website and app targets; configure override difficulty (random words, gibberish, custom; character count)
- [ ] Max difficulty: enable max difficulty, start block, override with hardest challenge; disable and verify restore of previous type/count
- [ ] Duplicate blocklist → verify copy has "X copy" name, same content and override settings; duplicate is not started; verify duplication of one-off and of scheduled blocklists (schedule segments copied)
- [ ] Rename, recolor, delete blocklist

### Override Functionality
- [ ] Single block: start block with 50-char random-words override (websites and/or apps) → open block in calendar → complete challenge → block removed and sites/apps unblocked
- [ ] Override All: start multiple blocks (one-off + schedule) → Settings → Advanced → Override All → complete hardest challenge → all blocks/schedules cleared (websites and apps), blocklists remain

### Edge Cases
- (iOS uses Screen Time API; app closing and persistence behave differently than on desktop. Leave blank if no known iOS-specific edge cases; retain section for future additions.)

### Advanced Settings
- [ ] No desktop-only options (Clean hosts file, Keep blocking on uninstall) apply on iOS. Override All behavior is covered under Override Functionality above.

---

## Sign-off

| Tester | Date | Version | Platform | Pass/Fail |
|--------|------|---------|----------|-----------|
|        |      |         |          |           |
