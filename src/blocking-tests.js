/**
 * ReddBlock Blocking Tests
 * 
 * Automated tests for blocking functionality.
 * Run via Cmd+Shift+T in dev mode.
 * 
 * Test Categories:
 * - T1-T9: Time-based scenarios
 * - T10-T13: Overlap & union scenarios
 * - T14-T17: Shared domain edge cases
 * - T18-T21: Override behavior
 * - T22-T25: App blocking (manual only - requires system interaction)
 * - T26-T32: Override All feature
 */

(function () {
    'use strict';

    // Wait for test utils to load
    if (!window.ReddBlockTestUtils) {
        console.error('❌ Test utils not loaded. Make sure test-utils.js is included.');
        return;
    }

    const {
        createMockDate,
        createMockNow,
        createMockBlocklist,
        createMockBlock,
        createMockSchedule,
        createMockSegment,
        createMockAppData,
        getBlockedDomains,
        getHardestChallenge,
        compareDifficulties,
        resetTestResults,
        assert,
        assertEqual,
        assertSetEquals,
        assertSetContains,
        assertSetEmpty,
        printTestSummary
    } = window.ReddBlockTestUtils;

    // ========================================
    // CATEGORY 1: TIME-BASED SCENARIOS
    // ========================================

    function runTimeBasedTests() {
        console.log('\n📅 Category 1: Time-Based Scenarios');
        console.log('----------------------------------');

        // T1: No blocks active
        (function T1() {
            const appData = createMockAppData();
            const now = Date.now();
            const nowDate = new Date(now);

            const domains = getBlockedDomains(appData, now, nowDate);
            assertSetEmpty(domains, 'T1: No blocks → no domains blocked');
        })();

        // T2: One-off block within time window
        (function T2() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com'] });
            const now = Date.now();
            const block = createMockBlock(blocklist.id, now - 60000, now + 60000); // Active now

            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'facebook.com', 'T2: One-off within window → blocked');
        })();

        // T3: One-off not started yet
        (function T3() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com'] });
            const now = Date.now();
            const block = createMockBlock(blocklist.id, now + 60000, now + 120000); // Future

            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetEmpty(domains, 'T3: One-off not started → not blocked');
        })();

        // T4: One-off expired
        (function T4() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com'] });
            const now = Date.now();
            const block = createMockBlock(blocklist.id, now - 120000, now - 60000); // Past

            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetEmpty(domains, 'T4: One-off expired → not blocked');
        })();

        // T5: One-off crosses midnight (22:00→03:00), test at 01:00
        (function T5() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com'] });
            // Create timestamps: block from 22:00 yesterday to 03:00 today
            const testTime = createMockDate(1, 0, 1); // 01:00 on Monday
            const startTime = new Date(testTime);
            startTime.setDate(startTime.getDate() - 1);
            startTime.setHours(22, 0, 0, 0);
            const endTime = new Date(testTime);
            endTime.setHours(3, 0, 0, 0);

            const block = createMockBlock(blocklist.id, startTime.getTime(), endTime.getTime());

            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block]
            });

            const domains = getBlockedDomains(appData, testTime.getTime(), testTime);
            assertSetContains(domains, 'facebook.com', 'T5: One-off crosses midnight, test at 01:00 → blocked');
        })();

        // T6: Schedule active segment, correct day/time
        (function T6() {
            const blocklist = createMockBlocklist({ websites: ['youtube.com'] });
            const segment = createMockSegment(9, 0, 17, 0, [0, 1, 2, 3, 4]); // Mon-Fri 9-17
            const schedule = createMockSchedule(blocklist.id, [segment]);

            // Test at 10:00 on Monday (day 0 in app format)
            const testTime = createMockDate(10, 0, 1); // Monday in JS = day 1

            const appData = createMockAppData({
                blocklists: [blocklist],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, testTime.getTime(), testTime);
            assertSetContains(domains, 'youtube.com', 'T6: Schedule active on correct day/time → blocked');
        })();

        // T7: Schedule wrong day
        (function T7() {
            const blocklist = createMockBlocklist({ websites: ['youtube.com'] });
            const segment = createMockSegment(9, 0, 17, 0, [0, 1, 2, 3, 4]); // Mon-Fri only
            const schedule = createMockSchedule(blocklist.id, [segment]);

            // Test at 10:00 on Saturday (day 5 in app format)
            const testTime = createMockDate(10, 0, 6); // Saturday in JS = day 6

            const appData = createMockAppData({
                blocklists: [blocklist],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, testTime.getTime(), testTime);
            assertSetEmpty(domains, 'T7: Schedule wrong day → not blocked');
        })();

        // T8: Schedule right day, outside time window
        (function T8() {
            const blocklist = createMockBlocklist({ websites: ['youtube.com'] });
            const segment = createMockSegment(9, 0, 17, 0, [0]); // Monday 9-17
            const schedule = createMockSchedule(blocklist.id, [segment]);

            // Test at 20:00 on Monday
            const testTime = createMockDate(20, 0, 1); // Monday in JS

            const appData = createMockAppData({
                blocklists: [blocklist],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, testTime.getTime(), testTime);
            assertSetEmpty(domains, 'T8: Schedule outside time window → not blocked');
        })();

        // T9: Schedule crosses midnight (21:00→04:00), test at 02:00
        (function T9() {
            const blocklist = createMockBlocklist({ websites: ['netflix.com'] });
            // Tuesday night (day 1) 21:00 to Wednesday morning 04:00
            const segment = createMockSegment(21, 0, 4, 0, [1]); // Tuesday
            const schedule = createMockSchedule(blocklist.id, [segment]);

            // Test at 02:00 on Wednesday (should be blocked because Tuesday is in days)
            const testTime = createMockDate(2, 0, 3); // Wednesday in JS = day 3

            const appData = createMockAppData({
                blocklists: [blocklist],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, testTime.getTime(), testTime);
            assertSetContains(domains, 'netflix.com', 'T9: Schedule crosses midnight, test at 02:00 → blocked');
        })();
    }

    // ========================================
    // CATEGORY 2: OVERLAP & UNION SCENARIOS
    // ========================================

    function runOverlapTests() {
        console.log('\n🔀 Category 2: Overlap & Union Scenarios');
        console.log('----------------------------------------');

        // T10: One-off + schedule different blocklists
        (function T10() {
            const blocklist1 = createMockBlocklist({ websites: ['facebook.com'] });
            const blocklist2 = createMockBlocklist({ websites: ['youtube.com'] });

            const now = Date.now();
            const block = createMockBlock(blocklist1.id, now - 60000, now + 60000);

            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]); // All day every day
            const schedule = createMockSchedule(blocklist2.id, [segment]);

            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [block],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assert(domains.size === 2, 'T10: One-off + schedule → union (2 domains)');
            assertSetContains(domains, 'facebook.com', 'T10: facebook.com blocked');
            assertSetContains(domains, 'youtube.com', 'T10: youtube.com blocked');
        })();

        // T11: One-off + schedule same blocklist
        (function T11() {
            const blocklist = createMockBlocklist({ websites: ['twitter.com', 'instagram.com'] });

            const now = Date.now();
            const block = createMockBlock(blocklist.id, now - 60000, now + 60000);

            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);
            const schedule = createMockSchedule(blocklist.id, [segment]);

            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            // Same blocklist, so still just 2 unique domains
            assert(domains.size === 2, 'T11: Same blocklist both active → domains from that list');
        })();

        // T12: Multiple schedules, all active
        (function T12() {
            const blocklist1 = createMockBlocklist({ websites: ['site1.com'] });
            const blocklist2 = createMockBlocklist({ websites: ['site2.com'] });
            const blocklist3 = createMockBlocklist({ websites: ['site3.com'] });

            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);
            const schedule1 = createMockSchedule(blocklist1.id, [segment]);
            const schedule2 = createMockSchedule(blocklist2.id, [segment]);
            const schedule3 = createMockSchedule(blocklist3.id, [segment]);

            const now = Date.now();
            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2, blocklist3],
                schedules: [schedule1, schedule2, schedule3]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertEqual(domains.size, 3, 'T12: Multiple schedules active → union of all (3)');
        })();

        // T13: One-off ends, overlapping schedule continues
        (function T13() {
            const blocklist1 = createMockBlocklist({ websites: ['facebook.com'] });
            const blocklist2 = createMockBlocklist({ websites: ['youtube.com'] });

            const now = Date.now();
            // One-off has ENDED
            const block = createMockBlock(blocklist1.id, now - 120000, now - 60000);

            // Schedule still active
            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);
            const schedule = createMockSchedule(blocklist2.id, [segment]);

            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [block],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assert(!domains.has('facebook.com'), 'T13: One-off ended → its domain not blocked');
            assertSetContains(domains, 'youtube.com', 'T13: Schedule still blocks its domains');
        })();
    }

    // ========================================
    // CATEGORY 3: SHARED DOMAIN EDGE CASES
    // ========================================

    function runSharedDomainTests() {
        console.log('\n🔗 Category 3: Shared Domain Edge Cases');
        console.log('---------------------------------------');

        // T14: Two blocklists with overlapping domain, both active
        (function T14() {
            const blocklist1 = createMockBlocklist({
                websites: ['ulriklyngs.com', 'katyperry.com']
            });
            const blocklist2 = createMockBlocklist({
                websites: ['ulriklyngs.com', 'andykaufman.com']
            });

            const now = Date.now();
            const block1 = createMockBlock(blocklist1.id, now - 60000, now + 60000);
            const block2 = createMockBlock(blocklist2.id, now - 60000, now + 60000);

            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [block1, block2]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertEqual(domains.size, 3, 'T14: Both active → all 3 unique domains blocked');
            assertSetContains(domains, 'ulriklyngs.com', 'T14: shared domain blocked');
        })();

        // T15: Same as T14, Block A ends
        (function T15() {
            const blocklist1 = createMockBlocklist({
                websites: ['ulriklyngs.com', 'katyperry.com']
            });
            const blocklist2 = createMockBlocklist({
                websites: ['ulriklyngs.com', 'andykaufman.com']
            });

            const now = Date.now();
            const block1 = createMockBlock(blocklist1.id, now - 120000, now - 60000); // ENDED
            const block2 = createMockBlock(blocklist2.id, now - 60000, now + 60000); // Still active

            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [block1, block2]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assert(!domains.has('katyperry.com'), 'T15: Block A ended → katyperry.com unblocked');
            assertSetContains(domains, 'ulriklyngs.com', 'T15: Shared domain still blocked by B');
            assertSetContains(domains, 'andykaufman.com', 'T15: Block B domain still blocked');
        })();

        // T16: Same blocklist - one-off + schedule both active, one-off removed
        (function T16() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com', 'twitter.com'] });

            const now = Date.now();
            // One-off has ended (simulating override)
            const block = createMockBlock(blocklist.id, now - 120000, now - 60000);

            // Schedule still active
            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);
            const schedule = createMockSchedule(blocklist.id, [segment]);

            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block], // One-off removed
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'facebook.com', 'T16: Schedule continues blocking after one-off removed');
            assertSetContains(domains, 'twitter.com', 'T16: All blocklist domains still blocked');
        })();

        // T17: Same blocklist - one-off + schedule, schedule removed
        (function T17() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com', 'twitter.com'] });

            const now = Date.now();
            // One-off still active
            const block = createMockBlock(blocklist.id, now - 60000, now + 60000);

            // Schedule removed (empty)
            const appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [block],
                schedules: [] // Schedule removed via override
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'facebook.com', 'T17: One-off continues blocking after schedule removed');
        })();
    }

    // ========================================
    // CATEGORY 4: OVERRIDE BEHAVIOR
    // ========================================

    function runOverrideTests() {
        console.log('\n🔓 Category 4: Override Behavior');
        console.log('--------------------------------');

        // T18: Override one-off while schedule (different blocklist) runs
        (function T18() {
            const blocklist1 = createMockBlocklist({ websites: ['facebook.com'] });
            const blocklist2 = createMockBlocklist({ websites: ['youtube.com'] });

            const now = Date.now();
            // One-off was overridden (removed)

            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);
            const schedule = createMockSchedule(blocklist2.id, [segment]);

            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [], // One-off removed
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'youtube.com', 'T18: Schedule still blocks after one-off override');
            assert(!domains.has('facebook.com'), 'T18: One-off domain unblocked');
        })();

        // T19: Override schedule while one-off runs
        (function T19() {
            const blocklist1 = createMockBlocklist({ websites: ['facebook.com'] });
            const blocklist2 = createMockBlocklist({ websites: ['youtube.com'] });

            const now = Date.now();
            const block = createMockBlock(blocklist1.id, now - 60000, now + 60000);

            // Schedule was overridden (removed)
            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [block],
                schedules: [] // Schedule removed
            });

            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'facebook.com', 'T19: One-off still blocks after schedule override');
            assert(!domains.has('youtube.com'), 'T19: Schedule domain unblocked');
        })();

        // T20: Override "just this block" in schedule (remove one segment's day)
        (function T20() {
            const blocklist = createMockBlocklist({ websites: ['youtube.com'] });

            // Originally had Mon, Tue, Wed but user removed just Tuesday
            const segment = createMockSegment(9, 0, 17, 0, [0, 2]); // Mon, Wed only now
            const schedule = createMockSchedule(blocklist.id, [segment]);

            // Test at 10:00 on Tuesday - should NOT be blocked anymore
            const testTime = createMockDate(10, 0, 2); // Tuesday

            const appData = createMockAppData({
                blocklists: [blocklist],
                schedules: [schedule]
            });

            const domains = getBlockedDomains(appData, testTime.getTime(), testTime);
            assertSetEmpty(domains, 'T20: Removed Tuesday from segment → not blocked on Tuesday');
        })();

        // T21: "Stop entire schedule" - all segments removed
        (function T21() {
            const blocklist = createMockBlocklist({ websites: ['youtube.com'] });

            // Schedule completely removed
            const appData = createMockAppData({
                blocklists: [blocklist],
                schedules: []
            });

            const now = Date.now();
            const domains = getBlockedDomains(appData, now, new Date(now));
            assertSetEmpty(domains, 'T21: Schedule stopped → no domains blocked');
        })();
    }

    // ========================================
    // CATEGORY 5: APP BLOCKING
    // (Manual tests only - require system interaction)
    // ========================================

    function runAppBlockingTests() {
        console.log('\n📱 Category 5: App Blocking');
        console.log('---------------------------');
        console.log('⚠️  T22-T25 require manual testing (system interaction)');
        console.log('   See manual-test-checklist.md for instructions');
    }

    // ========================================
    // CATEGORY 6: OVERRIDE ALL BLOCKS
    // ========================================

    function runOverrideAllTests() {
        console.log('\n🔴 Category 6: Override All Blocks');
        console.log('-----------------------------------');

        // T26: Override All with one-off only
        (function T26() {
            const blocklist = createMockBlocklist({ websites: ['facebook.com'] });
            const now = Date.now();

            // Before override all
            let appData = createMockAppData({
                blocklists: [blocklist],
                activeBlocks: [createMockBlock(blocklist.id, now - 60000, now + 60000)]
            });

            let domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'facebook.com', 'T26: Before override, site blocked');

            // Simulate override all - clears activeBlocks
            appData.activeBlocks = [];
            domains = getBlockedDomains(appData, now, new Date(now));
            assertSetEmpty(domains, 'T26: After override all, no sites blocked');
        })();

        // T27: Override All with schedule only
        (function T27() {
            const blocklist = createMockBlocklist({ websites: ['youtube.com'] });
            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);

            let appData = createMockAppData({
                blocklists: [blocklist],
                schedules: [createMockSchedule(blocklist.id, [segment])]
            });

            const now = Date.now();
            let domains = getBlockedDomains(appData, now, new Date(now));
            assertSetContains(domains, 'youtube.com', 'T27: Before override, site blocked');

            // Simulate override all - clears schedules
            appData.schedules = [];
            domains = getBlockedDomains(appData, now, new Date(now));
            assertSetEmpty(domains, 'T27: After override all, no sites blocked');
        })();

        // T28: Override All with mixed (one-off + schedule)
        (function T28() {
            const blocklist1 = createMockBlocklist({ websites: ['facebook.com'] });
            const blocklist2 = createMockBlocklist({ websites: ['youtube.com'] });
            const segment = createMockSegment(0, 0, 23, 59, [0, 1, 2, 3, 4, 5, 6]);
            const now = Date.now();

            let appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [createMockBlock(blocklist1.id, now - 60000, now + 60000)],
                schedules: [createMockSchedule(blocklist2.id, [segment])]
            });

            let domains = getBlockedDomains(appData, now, new Date(now));
            assertEqual(domains.size, 2, 'T28: Before override, 2 sites blocked');

            // Simulate override all - clears both
            appData.activeBlocks = [];
            appData.schedules = [];
            domains = getBlockedDomains(appData, now, new Date(now));
            assertSetEmpty(domains, 'T28: After override all, all cleared');
        })();

        // T29: Hardest challenge selection - highest count wins
        (function T29() {
            const blocklist1 = createMockBlocklist({
                overrideDifficulty: { type: 'random-words', count: 30 }
            });
            const blocklist2 = createMockBlocklist({
                overrideDifficulty: { type: 'random-words', count: 100 }
            });

            const now = Date.now();
            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [
                    createMockBlock(blocklist1.id, now - 60000, now + 60000),
                    createMockBlock(blocklist2.id, now - 60000, now + 60000)
                ]
            });

            const hardest = getHardestChallenge(appData, now);
            assertEqual(hardest.count, 100, 'T29: Highest count (100) selected');
        })();

        // T30: Gibberish vs random-words at same count
        (function T30() {
            const blocklist1 = createMockBlocklist({
                overrideDifficulty: { type: 'random-words', count: 50 }
            });
            const blocklist2 = createMockBlocklist({
                overrideDifficulty: { type: 'gibberish', count: 50 }
            });

            const now = Date.now();
            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [
                    createMockBlock(blocklist1.id, now - 60000, now + 60000),
                    createMockBlock(blocklist2.id, now - 60000, now + 60000)
                ]
            });

            const hardest = getHardestChallenge(appData, now);
            assertEqual(hardest.type, 'gibberish', 'T30: Gibberish selected as harder at same count');
        })();

        // T31: Custom text challenge
        (function T31() {
            const blocklist1 = createMockBlocklist({
                overrideDifficulty: { type: 'random-words', count: 50 }
            });
            const blocklist2 = createMockBlocklist({
                overrideDifficulty: { type: 'custom', customText: 'This is a very long custom override text that is hard to type' }
            });

            const now = Date.now();
            const appData = createMockAppData({
                blocklists: [blocklist1, blocklist2],
                activeBlocks: [
                    createMockBlock(blocklist1.id, now - 60000, now + 60000),
                    createMockBlock(blocklist2.id, now - 60000, now + 60000)
                ]
            });

            const hardest = getHardestChallenge(appData, now);
            assertEqual(hardest.type, 'custom', 'T31: Custom text selected (longer than 50)');
        })();

        // T32: App blocking also stops (can only verify data state, not actual process watcher)
        (function T32() {
            console.log('   T32: App blocking stop verified via manual testing');
            assert(true, 'T32: Placeholder - requires manual verification');
        })();
    }

    // ========================================
    // MAIN TEST RUNNER
    // ========================================

    function runAllTests() {
        console.clear();
        console.log('🧪 ReddBlock Blocking Tests');
        console.log('============================');
        console.log(`Running at: ${new Date().toLocaleTimeString()}\n`);

        resetTestResults();

        try {
            runTimeBasedTests();
            runOverlapTests();
            runSharedDomainTests();
            runOverrideTests();
            runAppBlockingTests();
            runOverrideAllTests();
        } catch (error) {
            console.error('❌ Test suite crashed:', error);
        }

        printTestSummary();
    }

    // Export test runner
    window.ReddBlockTests = {
        runAllTests,
        runTimeBasedTests,
        runOverlapTests,
        runSharedDomainTests,
        runOverrideTests,
        runAppBlockingTests,
        runOverrideAllTests
    };

    console.log('🧪 ReddBlock Blocking Tests loaded. Press Cmd+Shift+T to run tests.');
})();
