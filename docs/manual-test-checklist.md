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
- [ ] Delete a blocklist while it has active blocks → verify cleanup
- [ ] Close and reopen app during active block → block persists

---

## Sign-off

| Tester | Date | Version | Pass/Fail |
|--------|------|---------|-----------|
|        |      |         |           |
