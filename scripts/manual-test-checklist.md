# ReddBlock Pre-Release Test Checklist

## Before Each Release

Run this checklist before publishing a new version. Use a test blocklist with safe, non-critical sites.

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
- [ ] Wait for expiration
- [ ] Verify sites are unblocked

### Cross-Midnight Block
- [ ] Start a block late at night that crosses midnight
- [ ] Verify block continues after midnight
- [ ] Verify correct "time left" display

---

## 3. Scheduled Blocks

### Basic Schedule
- [ ] Create schedule for a time segment starting in 2 minutes
- [ ] Verify schedule badge says "In X mins"
- [ ] Wait for segment to start
- [ ] Verify sites are blocked
- [ ] Verify schedule badge shows "X min left"
- [ ] Wait for segment to end
- [ ] Verify sites are unblocked

### Cross-Midnight Schedule
- [ ] Create schedule segment: e.g., 23:00 → 02:00
- [ ] Test at both ends (evening and morning)
- [ ] Verify "time left" calculation is correct

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

## 5. Override Functionality

### Single Block Override
- [ ] Start a block with 50-char random words override
- [ ] Click on block in calendar
- [ ] Type the challenge correctly
- [ ] Verify block is removed and sites unblocked

### Override All (Settings)
- [ ] Start multiple blocks (one-off + schedule)
- [ ] Open Settings → Advanced → Override All Blocks
- [ ] Verify it uses the HARDEST challenge from all active blocks
- [ ] Complete the challenge
- [ ] Verify ALL blocks and schedules are cleared

---

## 6. App Blocking

- [ ] Add a safe app to blocklist (e.g., Calculator, Notes)
- [ ] Start block
- [ ] Open the blocked app
- [ ] Verify it gets minimized/hidden
- [ ] End block
- [ ] Verify app opens normally

---

## 7. Edge Cases

- [ ] Start block at exact same time a schedule ends → no gap
- [ ] Close and reopen app during active block → block persists

---

## 8. Advanced Settings

### Override All Blocks
- [ ] Start multiple blocks (one-off + schedule, different blocklists)
- [ ] Open Settings → Advanced → Override All Blocks
- [ ] Verify the override challenge uses the **hardest** difficulty among all active blocks
- [ ] Complete the challenge
- [ ] Verify ALL blocks AND schedules are cleared
- [ ] Verify blocklists are NOT deleted (just the active blocks/schedules)
- [ ] Verify Override All button disappears when no blocks are active

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

### Screen Time Permissions
- [ ] Fresh install: start a block → verify Screen Time permission prompt appears
- [ ] Grant permission → verify blocking starts
- [ ] Check Settings → Screen Time → verify ReDD Block appears

### Blocking Flow
- [ ] Create blocklist with a website
- [ ] Start one-off block → verify website is blocked in Safari
- [ ] Wait for expiry → verify website is accessible

### Schedule
- [ ] Create a scheduled block for current time
- [ ] Verify blocking activates
- [ ] Verify override challenge works

### Override All
- [ ] Start blocks, use Override All from Settings
- [ ] Verify all blocks clear
- [ ] Verify Screen Time restrictions are removed

---

## Sign-off

| Tester | Date | Version | Platform | Pass/Fail |
|--------|------|---------|----------|-----------|
|        |      |         |          |           |
