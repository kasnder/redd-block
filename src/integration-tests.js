/**
 * ReddBlock Tier 2 Integration Tests
 *
 * These tests run through the app -> Tauri -> helper pipeline
 * and can modify real system state.
 *
 * Profiles:
 * - runIntegrationTests('core')  // fast critical checks (default)
 * - runIntegrationTests('full')  // core + exhaustive non-UI checks
 */

(function () {
    'use strict';

    const PROFILE_CORE = 'core';
    const PROFILE_FULL = 'full';
    const TEST_PREFIX = 'inttest';

    // Access app internals (exposed by app.js for testing)
    const getInternals = () => window.__REDDBLOCK_INTERNALS__;
    const getAppData = () => getInternals()?.appData;
    const callSaveData = () => getInternals()?.saveData?.();
    const callUpdateHostsFile = (silent) => getInternals()?.updateHostsFile?.(silent);
    const getTauriAPI = () => getInternals()?.tauriAPI;
    const callRender = () => getInternals()?.render?.();

    const TEST_DOMAINS = {
        a: 'integration-a-reddblock.invalid',
        b: 'integration-b-reddblock.invalid',
        shared: 'integration-shared-reddblock.invalid',
        future: 'integration-future-reddblock.invalid'
    };

    function nowMs() {
        return Date.now();
    }

    function makeId(suffix) {
        return `${TEST_PREFIX}-${suffix}-${nowMs()}`;
    }

    function currentDayMon0() {
        const d = new Date().getDay();
        return d === 0 ? 6 : d - 1;
    }

    function shortWait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function assertOrThrow(condition, message) {
        if (!condition) throw new Error(message);
    }

    async function ensureHelperRunningOrSkip(testName) {
        const tauriAPI = getTauriAPI();
        if (!tauriAPI) {
            return { skipped: true, reason: `${testName}: tauriAPI unavailable` };
        }
        const status = await tauriAPI.checkHelperStatus();
        if (!status.running) {
            return { skipped: true, reason: `${testName}: helper not running` };
        }
        if (!status.version_ok) {
            return { skipped: true, reason: `${testName}: helper version mismatch` };
        }
        return null;
    }

    function addTestBlocklist({ websites = [], apps = [], name = 'Integration Test', mode = 'manual' } = {}) {
        const appData = getAppData();
        const blocklist = {
            id: makeId('bl'),
            name: `${name} ${Math.floor(Math.random() * 1000)}`,
            mode,
            websites,
            apps,
            emoji: '🧪',
            color: '#ff0000',
            overrideDifficulty: { type: 'random-words', count: 10 }
        };
        appData.blocklists.push(blocklist);
        return blocklist;
    }

    function addActiveBlock(blocklistId, { durationMs = 120000, startOffsetMs = 0, endOffsetMs = null, isPaused = false, pauseMs = 60000 } = {}) {
        const appData = getAppData();
        const now = nowMs();
        const startTime = now + startOffsetMs;
        const endTime = endOffsetMs != null ? now + endOffsetMs : startTime + durationMs;
        const block = {
            id: makeId('block'),
            blocklistId,
            startTime,
            endTime
        };
        if (isPaused) {
            block.isPaused = true;
            block.pauseEndTime = now + pauseMs;
        }
        appData.activeBlocks.push(block);
        return block;
    }

    function addSchedule(blocklistId, segments, { repeatType = 'no' } = {}) {
        const appData = getAppData();
        appData.schedules = appData.schedules || [];
        const sched = {
            id: makeId('sched'),
            blocklistId,
            segments,
            repeatType,
            createdAt: nowMs()
        };
        appData.schedules.push(sched);
        return sched;
    }

    function removeTestDataFromAppState() {
        const appData = getAppData();
        if (!appData) return;
        appData.activeBlocks = (appData.activeBlocks || []).filter(b => !String(b.id || '').startsWith(TEST_PREFIX));
        appData.schedules = (appData.schedules || []).filter(s => !String(s.id || '').startsWith(TEST_PREFIX));
        appData.blocklists = (appData.blocklists || []).filter(bl => !String(bl.id || '').startsWith(TEST_PREFIX));
    }

    async function setupSuite() {
        console.log('🔧 Setting up Tier 2 integration suite...');
        const appData = getAppData();
        assertOrThrow(appData, 'App internals not available. Ensure app.js loaded.');
        await callSaveData();
        return true;
    }

    async function teardownSuite() {
        console.log('🧹 Cleaning up Tier 2 integration suite...');
        try {
            const tauriAPI = getTauriAPI();
            removeTestDataFromAppState();
            await callSaveData();

            if (tauriAPI) {
                const status = await tauriAPI.checkHelperStatus();
                if (status.running) {
                    await tauriAPI.clearBlockViaHelper();
                    await callUpdateHostsFile(true);
                    await tauriAPI.setBlockedAppsViaHelper([]);
                }
            }
            callRender();
            console.log('   ✅ Cleanup complete');
            return true;
        } catch (err) {
            console.error('   ❌ Cleanup failed:', err);
            return false;
        }
    }

    async function runCase(name, fn) {
        try {
            const result = await fn();
            if (result?.skipped) return { status: 'skipped', error: result.reason };
            if (result?.passed) return { status: 'passed' };
            return { status: 'failed', error: result?.error || 'Unknown failure' };
        } catch (err) {
            return { status: 'failed', error: err?.message || String(err) };
        }
    }

    async function setOneOffPaused(blockId, pauseMs) {
        const appData = getAppData();
        const block = appData.activeBlocks.find(b => b.id === blockId);
        assertOrThrow(block, `pause helper: block not found (${blockId})`);
        block.isPaused = true;
        block.pauseEndTime = nowMs() + pauseMs;
        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'pause helper: one-off pause sync failed');
        return block;
    }

    async function clearOneOffPause(blockId) {
        const appData = getAppData();
        const block = appData.activeBlocks.find(b => b.id === blockId);
        assertOrThrow(block, `resume helper: block not found (${blockId})`);
        delete block.isPaused;
        delete block.pauseEndTime;
        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'resume helper: one-off resume sync failed');
        return block;
    }

    async function setSchedulePaused(blocklistId, pauseMs) {
        const appData = getAppData();
        const schedule = (appData.schedules || []).find(s => s.blocklistId === blocklistId);
        assertOrThrow(schedule, `pause helper: schedule not found (${blocklistId})`);
        schedule.isPaused = true;
        schedule.pauseEndTime = nowMs() + pauseMs;
        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'pause helper: schedule pause sync failed');
        return schedule;
    }

    async function clearSchedulePause(blocklistId) {
        const appData = getAppData();
        const schedule = (appData.schedules || []).find(s => s.blocklistId === blocklistId);
        assertOrThrow(schedule, `resume helper: schedule not found (${blocklistId})`);
        delete schedule.isPaused;
        delete schedule.pauseEndTime;
        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'resume helper: schedule resume sync failed');
        return schedule;
    }

    // ========================================
    // Testing Group A: One-off and schedule mechanics
    // ========================================

    async function testA1_hostsModificationPath() {
        const skip = await ensureHelperRunningOrSkip('A1');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a], name: 'A1' });
        addActiveBlock(bl.id, { durationMs: 120000 });
        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'A1: updateHostsFile failed');

        removeTestDataFromAppState();
        await callSaveData();
        await callUpdateHostsFile(true);
        return { passed: true };
    }

    async function testA2_blockStartEndTiming() {
        const skip = await ensureHelperRunningOrSkip('A2');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.b], name: 'A2' });
        const block = addActiveBlock(bl.id, { durationMs: 5000 });
        await callSaveData();
        await callUpdateHostsFile();

        await new Promise(resolve => setTimeout(resolve, 6200));
        const appData = getAppData();
        const stillActive = appData.activeBlocks.some(b => b.id === block.id && b.endTime > nowMs());
        assertOrThrow(!stillActive, 'A2: one-off block did not expire naturally');
        await callUpdateHostsFile(true);
        return { passed: true };
    }

    async function testA3_scheduleActiveNow() {
        const skip = await ensureHelperRunningOrSkip('A3');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.shared], name: 'A3' });
        const hour = new Date().getHours();
        addSchedule(bl.id, [{
            startHour: hour,
            startMinute: 0,
            endHour: (hour + 1) % 24,
            endMinute: 0,
            days: [currentDayMon0()]
        }]);

        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'A3: schedule activation path failed');
        return { passed: true };
    }

    async function testA4_futureScheduleDoesNotThrow() {
        const skip = await ensureHelperRunningOrSkip('A4');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.future], name: 'A4' });
        const hour = new Date().getHours();
        addSchedule(bl.id, [{
            startHour: (hour + 1) % 24,
            startMinute: 0,
            endHour: (hour + 2) % 24,
            endMinute: 0,
            days: [currentDayMon0()]
        }]);

        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'A4: future schedule update failed');
        return { passed: true };
    }

    async function testA5_pauseResumeOneOffStatePath() {
        const skip = await ensureHelperRunningOrSkip('A5');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a], name: 'A5' });
        const block = addActiveBlock(bl.id, { durationMs: 120000 });
        await callSaveData();
        await callUpdateHostsFile();

        block.isPaused = true;
        block.pauseEndTime = nowMs() + 60000;
        await callSaveData();
        const pausedResult = await callUpdateHostsFile();
        assertOrThrow(pausedResult && pausedResult.success, 'A5: paused state update failed');

        delete block.isPaused;
        delete block.pauseEndTime;
        await callSaveData();
        const resumedResult = await callUpdateHostsFile();
        assertOrThrow(resumedResult && resumedResult.success, 'A5: resume state update failed');
        return { passed: true };
    }

    async function testA6_pauseResumeOneOffEnforcementPath() {
        const skip = await ensureHelperRunningOrSkip('A6');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a], apps: ['Calculator'], name: 'A6' });
        const block = addActiveBlock(bl.id, { durationMs: 120000 });
        await callSaveData();
        await callUpdateHostsFile();

        await setOneOffPaused(block.id, 45000);
        assertOrThrow(!!block.isPaused, 'A6: block should be paused');
        assertOrThrow(block.pauseEndTime > nowMs(), 'A6: pause end time should be future');

        await clearOneOffPause(block.id);
        assertOrThrow(!block.isPaused, 'A6: block should be resumed');
        assertOrThrow(!block.pauseEndTime, 'A6: pause end time should be cleared');
        return { passed: true };
    }

    async function testA7_pauseNaturalExpiryOneOffSmoke() {
        const skip = await ensureHelperRunningOrSkip('A7');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.b], name: 'A7' });
        const block = addActiveBlock(bl.id, { durationMs: 120000 });
        await callSaveData();
        await callUpdateHostsFile();

        await setOneOffPaused(block.id, 1200);
        await shortWait(2500);
        const appData = getAppData();
        const refreshed = appData.activeBlocks.find(b => b.id === block.id);
        assertOrThrow(refreshed, 'A7: block missing after pause expiry wait');
        assertOrThrow(!refreshed.isPaused, 'A7: one-off pause should naturally expire');
        assertOrThrow(!refreshed.pauseEndTime, 'A7: one-off pauseEndTime should be cleared after natural expiry');
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'A7: post-expiry update failed');
        return { passed: true };
    }

    async function testA8_pauseResumeScheduleActivePath() {
        const skip = await ensureHelperRunningOrSkip('A8');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.shared], apps: ['Calculator'], name: 'A8' });
        const hour = new Date().getHours();
        addSchedule(bl.id, [{
            startHour: hour,
            startMinute: 0,
            endHour: (hour + 1) % 24,
            endMinute: 0,
            days: [currentDayMon0()]
        }]);
        await callSaveData();
        await callUpdateHostsFile();

        const pausedSchedule = await setSchedulePaused(bl.id, 45000);
        assertOrThrow(!!pausedSchedule.isPaused, 'A8: schedule should be paused');
        assertOrThrow(pausedSchedule.pauseEndTime > nowMs(), 'A8: schedule pause end should be future');

        const resumedSchedule = await clearSchedulePause(bl.id);
        assertOrThrow(!resumedSchedule.isPaused, 'A8: schedule should be resumed');
        assertOrThrow(!resumedSchedule.pauseEndTime, 'A8: schedule pauseEndTime should be cleared');
        return { passed: true };
    }

    async function testA9_pauseNaturalExpiryScheduleSmoke() {
        const skip = await ensureHelperRunningOrSkip('A9');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.future], name: 'A9' });
        const hour = new Date().getHours();
        addSchedule(bl.id, [{
            startHour: hour,
            startMinute: 0,
            endHour: (hour + 1) % 24,
            endMinute: 0,
            days: [currentDayMon0()]
        }]);
        await callSaveData();
        await callUpdateHostsFile();

        await setSchedulePaused(bl.id, 1200);
        await shortWait(2500);
        const appData = getAppData();
        const refreshed = (appData.schedules || []).find(s => s.blocklistId === bl.id);
        assertOrThrow(refreshed, 'A9: schedule missing after pause expiry wait');
        assertOrThrow(!refreshed.isPaused, 'A9: schedule pause should naturally expire');
        assertOrThrow(!refreshed.pauseEndTime, 'A9: schedule pauseEndTime should be cleared after natural expiry');
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'A9: post-expiry update failed');
        return { passed: true };
    }

    async function testA10_pauseInactiveScheduleSuppressionPath() {
        const skip = await ensureHelperRunningOrSkip('A10');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a, TEST_DOMAINS.future], name: 'A10' });
        const now = new Date();
        const startMinute = (now.getMinutes() + 1) % 60;
        const endMinute = (startMinute + 30) % 60;
        const startHour = startMinute < now.getMinutes() ? (now.getHours() + 1) % 24 : now.getHours();
        const endHour = endMinute < startMinute ? (startHour + 1) % 24 : startHour;

        addSchedule(bl.id, [{
            startHour,
            startMinute,
            endHour,
            endMinute,
            days: [currentDayMon0()]
        }]);
        await callSaveData();
        await callUpdateHostsFile();

        const pausedSchedule = await setSchedulePaused(bl.id, 120000);
        assertOrThrow(!!pausedSchedule.isPaused, 'A10: schedule should be paused while inactive');
        assertOrThrow(pausedSchedule.pauseEndTime > nowMs(), 'A10: schedule pause should suppress upcoming activation window');

        const resumedSchedule = await clearSchedulePause(bl.id);
        assertOrThrow(!resumedSchedule.isPaused, 'A10: schedule should resume from suppressed state');
        assertOrThrow(!resumedSchedule.pauseEndTime, 'A10: resumed schedule pause end should be cleared');
        return { passed: true };
    }

    // ========================================
    // Testing Group B: Multi-block overlap correctness
    // ========================================

    async function testB1_sharedDomainOverlap() {
        const skip = await ensureHelperRunningOrSkip('B1');
        if (skip) return skip;

        const bl1 = addTestBlocklist({ websites: [TEST_DOMAINS.a, TEST_DOMAINS.shared], name: 'B1-A' });
        const bl2 = addTestBlocklist({ websites: [TEST_DOMAINS.b, TEST_DOMAINS.shared], name: 'B1-B' });
        addActiveBlock(bl1.id, { durationMs: 120000 });
        addActiveBlock(bl2.id, { durationMs: 120000 });
        await callSaveData();

        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'B1: overlap update failed');
        return { passed: true };
    }

    async function testB2_oneOffPlusScheduleSameBlocklist() {
        const skip = await ensureHelperRunningOrSkip('B2');
        if (skip) return skip;

        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a, TEST_DOMAINS.shared], name: 'B2' });
        addActiveBlock(bl.id, { durationMs: 120000 });
        const hour = new Date().getHours();
        addSchedule(bl.id, [{
            startHour: hour,
            startMinute: 0,
            endHour: (hour + 1) % 24,
            endMinute: 0,
            days: [currentDayMon0()]
        }]);
        await callSaveData();
        const result = await callUpdateHostsFile();
        assertOrThrow(result && result.success, 'B2: one-off + schedule merge failed');
        return { passed: true };
    }

    // ========================================
    // Testing Group C: Clear and override semantics
    // ========================================

    async function testC1_scopedClearByBlocklistId() {
        const skip = await ensureHelperRunningOrSkip('C1');
        if (skip) return skip;

        const tauriAPI = getTauriAPI();
        const bl1 = addTestBlocklist({ websites: [TEST_DOMAINS.a, TEST_DOMAINS.shared], name: 'C1-A' });
        const bl2 = addTestBlocklist({ websites: [TEST_DOMAINS.b, TEST_DOMAINS.shared], name: 'C1-B' });
        addActiveBlock(bl1.id, { durationMs: 120000 });
        addActiveBlock(bl2.id, { durationMs: 120000 });
        await callSaveData();
        await callUpdateHostsFile();

        const scopedResult = await tauriAPI.clearBlockViaHelper(bl1.id);
        assertOrThrow(scopedResult && scopedResult.success, 'C1: scoped clear failed');

        const syncResult = await callUpdateHostsFile();
        assertOrThrow(syncResult && syncResult.success, 'C1: sync after scoped clear failed');
        return { passed: true };
    }

    async function testC2_clearAllManualBlocks() {
        const skip = await ensureHelperRunningOrSkip('C2');
        if (skip) return skip;

        const tauriAPI = getTauriAPI();
        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a], name: 'C2' });
        addActiveBlock(bl.id, { durationMs: 120000 });
        await callSaveData();
        await callUpdateHostsFile();

        const clearAll = await tauriAPI.clearBlockViaHelper();
        assertOrThrow(clearAll && clearAll.success, 'C2: clear-all manual blocks failed');
        const result = await callUpdateHostsFile(true);
        assertOrThrow(result && result.success, 'C2: sync after clear-all failed');
        return { passed: true };
    }

    // ========================================
    // Testing Group D: Keep-blocking preference decision inputs
    // ========================================

    async function testD1_setKeepBlockingPreferenceRoundtrip() {
        const skip = await ensureHelperRunningOrSkip('D1');
        if (skip) return skip;

        const tauriAPI = getTauriAPI();
        const setFalse = await tauriAPI.setKeepBlockingOnUninstallViaHelper(false);
        assertOrThrow(setFalse && setFalse.success, 'D1: set keepBlocking=false failed');
        const setTrue = await tauriAPI.setKeepBlockingOnUninstallViaHelper(true);
        assertOrThrow(setTrue && setTrue.success, 'D1: set keepBlocking=true failed');
        return { passed: true };
    }

    // ========================================
    // Testing Group E: Hosts safety and cleanup invariants
    // ========================================

    async function testE1_cleanHostsCommandPath() {
        const skip = await ensureHelperRunningOrSkip('E1');
        if (skip) return skip;

        const tauriAPI = getTauriAPI();
        const bl = addTestBlocklist({ websites: [TEST_DOMAINS.a], name: 'E1' });
        addActiveBlock(bl.id, { durationMs: 120000 });
        await callSaveData();
        await callUpdateHostsFile();

        const cleanResult = await tauriAPI.cleanHostsFile();
        assertOrThrow(cleanResult && cleanResult.success, 'E1: clean-hosts command failed');
        return { passed: true };
    }

    // ========================================
    // Testing Group F: App-block command-path checks (non-visual)
    // ========================================

    async function testF1_setBlockedAppsCommandPath() {
        const skip = await ensureHelperRunningOrSkip('F1');
        if (skip) return skip;

        const tauriAPI = getTauriAPI();
        const result = await tauriAPI.setBlockedAppsViaHelper(['Calculator', 'Notes']);
        assertOrThrow(result && result.success, 'F1: set blocked apps failed');

        const clear = await tauriAPI.setBlockedAppsViaHelper([]);
        assertOrThrow(clear && clear.success, 'F1: clear blocked apps failed');
        return { passed: true };
    }

    async function testF2_protectedAppPayloadPath() {
        const skip = await ensureHelperRunningOrSkip('F2');
        if (skip) return skip;

        const tauriAPI = getTauriAPI();
        // Helper should filter protected app names safely and still succeed.
        const result = await tauriAPI.setBlockedAppsViaHelper(['redd-block-helper', 'Calculator']);
        assertOrThrow(result && result.success, 'F2: protected app payload command failed');
        await tauriAPI.setBlockedAppsViaHelper([]);
        return { passed: true };
    }

    function buildProfileTests(profile) {
        const coreTests = [
            { group: 'A', name: 'A1: Hosts modification path', fn: testA1_hostsModificationPath },
            { group: 'A', name: 'A2: One-off start/end timing', fn: testA2_blockStartEndTiming },
            { group: 'A', name: 'A3: Schedule active-now path', fn: testA3_scheduleActiveNow },
            { group: 'B', name: 'B1: Shared-domain overlap', fn: testB1_sharedDomainOverlap },
            { group: 'C', name: 'C1: Scoped clear by blocklist ID', fn: testC1_scopedClearByBlocklistId },
            { group: 'D', name: 'D1: Keep-blocking preference roundtrip', fn: testD1_setKeepBlockingPreferenceRoundtrip },
            { group: 'E', name: 'E1: Clean hosts command path', fn: testE1_cleanHostsCommandPath }
        ];

        if (profile === PROFILE_CORE) return coreTests;

        return [
            ...coreTests,
            { group: 'A', name: 'A4: Future schedule path', fn: testA4_futureScheduleDoesNotThrow },
            { group: 'A', name: 'A5: Pause/resume one-off state path', fn: testA5_pauseResumeOneOffStatePath },
            { group: 'A', name: 'A6: Pause/resume one-off enforcement path', fn: testA6_pauseResumeOneOffEnforcementPath },
            { group: 'A', name: 'A7: Pause natural-expiry one-off smoke', fn: testA7_pauseNaturalExpiryOneOffSmoke },
            { group: 'A', name: 'A8: Pause/resume schedule active path', fn: testA8_pauseResumeScheduleActivePath },
            { group: 'A', name: 'A9: Pause natural-expiry schedule smoke', fn: testA9_pauseNaturalExpiryScheduleSmoke },
            { group: 'A', name: 'A10: Pause inactive schedule suppression path', fn: testA10_pauseInactiveScheduleSuppressionPath },
            { group: 'B', name: 'B2: One-off + schedule same blocklist', fn: testB2_oneOffPlusScheduleSameBlocklist },
            { group: 'C', name: 'C2: Clear-all manual blocks', fn: testC2_clearAllManualBlocks },
            { group: 'F', name: 'F1: Set blocked apps command path', fn: testF1_setBlockedAppsCommandPath },
            { group: 'F', name: 'F2: Protected app payload path', fn: testF2_protectedAppPayloadPath }
        ];
    }

    // ========================================
    // MAIN RUNNER
    // ========================================

    async function runIntegrationTests(profile = PROFILE_CORE) {
        const selectedProfile = profile === PROFILE_FULL ? PROFILE_FULL : PROFILE_CORE;

        console.clear();
        console.log('🔬 ReddBlock Tier 2 Integration Tests');
        console.log('=====================================');
        console.log(`Profile: ${selectedProfile}`);
        console.log('⚠️  These tests modify real system state.\n');

        if (!getInternals()) {
            console.error('❌ App internals not available.');
            console.log('   Make sure app.js has loaded and exposes __REDDBLOCK_INTERNALS__');
            return { passed: 0, failed: 0, skipped: 0, errors: ['Internals not available'], profile: selectedProfile };
        }

        const results = { passed: 0, failed: 0, skipped: 0, errors: [], profile: selectedProfile };
        const tests = buildProfileTests(selectedProfile);
        const groupResults = new Map();

        try {
            await setupSuite();

            for (const test of tests) {
                const groupKey = test.group || 'Unknown';
                const groupState = groupResults.get(groupKey) || {
                    total: 0,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    failures: []
                };
                groupState.total++;
                const r = await runCase(test.name, test.fn);
                if (r.status === 'passed') {
                    results.passed++;
                    groupState.passed++;
                    console.log(`✅ ${test.name}`);
                } else if (r.status === 'skipped') {
                    results.skipped++;
                    groupState.skipped++;
                    console.log(`⏭️  ${test.name} (skipped: ${r.error})`);
                } else {
                    results.failed++;
                    groupState.failed++;
                    groupState.failures.push(`${test.name}: ${r.error}`);
                    results.errors.push(`${test.name}: ${r.error}`);
                    console.error(`❌ ${test.name}: ${r.error}`);
                }
                groupResults.set(groupKey, groupState);
            }
        } catch (err) {
            console.error('❌ Test suite crashed:', err);
            results.errors.push('Suite crash: ' + (err?.message || String(err)));
        } finally {
            await teardownSuite();
        }

        console.log('\n========================================');
        console.log(`TIER 2 RESULTS (${selectedProfile.toUpperCase()}):`);
        console.log(`  ✅ Passed: ${results.passed}`);
        console.log(`  ❌ Failed: ${results.failed}`);
        console.log(`  ⏭️  Skipped: ${results.skipped}`);
        console.log('========================================');

        if (results.errors.length > 0) {
            console.log('\nErrors:');
            results.errors.forEach(e => console.log('  • ' + e));
        }

        if (selectedProfile === PROFILE_FULL && results.failed > 0) {
            console.log('\nGroup failure summary (full profile):');
            ['A', 'B', 'C', 'D', 'E', 'F'].forEach(groupKey => {
                const g = groupResults.get(groupKey);
                if (!g) return;
                const passedOverTotal = `${g.passed}/${g.total}`;
                if (g.failed > 0) {
                    const failureDetail = g.failures.join(' | ');
                    console.log(`  Group ${groupKey}: ${passedOverTotal} tests passed, ${g.failed} failed [${failureDetail}]`);
                } else {
                    console.log(`  Group ${groupKey}: ${passedOverTotal} tests passed`);
                }
            });
        }
        return results;
    }

    // Export
    window.runIntegrationTests = runIntegrationTests;
    window.runIntegrationTestsFull = () => runIntegrationTests(PROFILE_FULL);

    console.log("🔬 Tier 2 integration tests loaded. Run with:");
    console.log("   runIntegrationTests('core')  // default fast profile");
    console.log("   runIntegrationTests('full')  // expanded profile");
    console.log('   ⚠️  These tests modify real system state!');
})();
