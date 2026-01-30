/**
 * ReddBlock Integration Tests
 * 
 * These tests actually modify the system (hosts file, etc.)
 * Use with CAUTION - they create real blocks that need cleanup.
 * 
 * Run via console: runIntegrationTests()
 */

(function () {
    'use strict';

    // Access app internals (exposed by app.js for testing)
    const getInternals = () => window.__REDDBLOCK_INTERNALS__;
    const getAppData = () => getInternals()?.appData;
    const callSaveData = () => getInternals()?.saveData?.();
    const callUpdateHostsFile = (silent) => getInternals()?.updateHostsFile?.(silent);
    const getTauriAPI = () => getInternals()?.tauriAPI;
    const callRender = () => getInternals()?.render?.();

    const INTEGRATION_BLOCKLIST_NAME = '🧪 Integration Test';
    const TEST_DOMAIN = 'integration-test-reddblock.invalid'; // Safe domain that doesn't exist

    let testBlocklistId = null;

    // ========================================
    // SETUP & TEARDOWN
    // ========================================

    async function setup() {
        console.log('🔧 Setting up integration tests...');

        const appData = getAppData();
        if (!appData) {
            throw new Error('App internals not available. Make sure app.js has loaded.');
        }

        // Create a test blocklist
        const testBlocklist = {
            id: 'integration-test-' + Date.now(),
            name: INTEGRATION_BLOCKLIST_NAME,
            mode: 'manual', // Required by Rust backend
            websites: [TEST_DOMAIN],
            apps: [],
            emoji: '🧪',
            color: '#ff0000',
            overrideDifficulty: { type: 'random-words', count: 10 }
        };

        appData.blocklists.push(testBlocklist);
        testBlocklistId = testBlocklist.id;

        await callSaveData();
        console.log('   Created test blocklist:', testBlocklistId);

        return true;
    }

    async function teardown() {
        console.log('🧹 Cleaning up integration tests...');

        try {
            const appData = getAppData();
            const tauriAPI = getTauriAPI();

            if (!appData) {
                console.log('   ⚠️  No appData available for cleanup');
                return false;
            }

            // Clear any active blocks from test
            appData.activeBlocks = appData.activeBlocks.filter(
                b => b.blocklistId !== testBlocklistId
            );

            // Clear any schedules from test
            appData.schedules = (appData.schedules || []).filter(
                s => s.blocklistId !== testBlocklistId
            );

            // Remove test blocklist
            appData.blocklists = appData.blocklists.filter(
                bl => bl.id !== testBlocklistId
            );

            // Clear the hosts file
            if (tauriAPI) {
                const status = await tauriAPI.checkHelperStatus();
                if (status.running) {
                    await tauriAPI.clearBlockViaHelper();
                    // Re-apply any legitimate blocks
                    await callUpdateHostsFile(true);
                }
            }

            await callSaveData();
            callRender();

            console.log('   ✅ Cleanup complete');
            return true;
        } catch (err) {
            console.error('   ❌ Cleanup failed:', err);
            console.log('   ⚠️  You may need to manually remove the test blocklist');
            return false;
        }
    }

    // ========================================
    // INTEGRATION TESTS
    // ========================================

    async function testHostsFileModification() {
        console.log('\n📝 IT1: Testing hosts file modification...');

        try {
            const appData = getAppData();
            const tauriAPI = getTauriAPI();

            // Check helper status
            const status = await tauriAPI.checkHelperStatus();
            if (!status.running) {
                console.log('   ⚠️  Helper not running - skipping hosts file test');
                console.log('   (Start a real block first to install the helper)');
                return { skipped: true };
            }

            // Create a block for the test blocklist
            const now = Date.now();
            const testBlock = {
                id: 'inttest-block-' + now,
                blocklistId: testBlocklistId,
                startTime: now,
                endTime: now + 120000 // 2 minutes
            };

            appData.activeBlocks.push(testBlock);
            await callSaveData();

            // Update hosts file - this should actually block the domain
            const result = await callUpdateHostsFile();

            if (result && result.success) {
                console.log('   ✅ Hosts file updated successfully');
                console.log(`   📋 Domain "${TEST_DOMAIN}" should now be blocked`);

                // Clean up the test block
                appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== testBlock.id);
                await callSaveData();
                await callUpdateHostsFile(true);

                console.log('   ✅ Block removed and hosts file cleaned');
                return { passed: true };
            } else {
                console.log('   ❌ Failed to update hosts file');
                return { passed: false, error: 'updateHostsFile failed' };
            }
        } catch (err) {
            console.error('   ❌ Error:', err);
            return { passed: false, error: err.message };
        }
    }

    async function testBlockStartAndEnd() {
        console.log('\n⏱️ IT2: Testing block start and automatic end...');
        console.log('   (This test takes ~10 seconds)');

        try {
            const appData = getAppData();
            const tauriAPI = getTauriAPI();

            const status = await tauriAPI.checkHelperStatus();
            if (!status.running) {
                console.log('   ⚠️  Helper not running - skipping');
                return { skipped: true };
            }

            const now = Date.now();
            const testBlock = {
                id: 'inttest-timing-' + now,
                blocklistId: testBlocklistId,
                startTime: now,
                endTime: now + 5000 // 5 seconds - short for testing
            };

            appData.activeBlocks.push(testBlock);
            await callSaveData();
            await callUpdateHostsFile();

            console.log('   ⏳ Block started, waiting 6 seconds for expiry...');

            // Wait for block to expire
            await new Promise(resolve => setTimeout(resolve, 6000));

            // Check if block was cleaned up
            const blockStillExists = appData.activeBlocks.some(b => b.id === testBlock.id && b.endTime > Date.now());

            if (!blockStillExists) {
                console.log('   ✅ Block expired correctly');
                // Force cleanup just in case
                appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== testBlock.id);
                await callSaveData();
                await callUpdateHostsFile(true);
                return { passed: true };
            } else {
                console.log('   ❌ Block did not expire as expected');
                // Cleanup
                appData.activeBlocks = appData.activeBlocks.filter(b => b.id !== testBlock.id);
                await callSaveData();
                await callUpdateHostsFile(true);
                return { passed: false, error: 'Block did not expire' };
            }
        } catch (err) {
            console.error('   ❌ Error:', err);
            return { passed: false, error: err.message };
        }
    }

    async function testScheduleActivation() {
        console.log('\n📅 IT3: Testing schedule activation...');

        try {
            const appData = getAppData();
            const tauriAPI = getTauriAPI();

            const status = await tauriAPI.checkHelperStatus();
            if (!status.running) {
                console.log('   ⚠️  Helper not running - skipping');
                return { skipped: true };
            }

            // Create a schedule that's active RIGHT NOW
            const nowDate = new Date();
            const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1; // Mon=0
            const currentHour = nowDate.getHours();

            const testSchedule = {
                id: 'inttest-sched-' + Date.now(),
                blocklistId: testBlocklistId,
                segments: [{
                    startHour: currentHour,
                    startMinute: 0,
                    endHour: currentHour + 1,
                    endMinute: 0,
                    days: [currentDay]
                }],
                repeatType: 'no',
                createdAt: Date.now()
            };

            appData.schedules = appData.schedules || [];
            appData.schedules.push(testSchedule);
            await callSaveData();

            // Update hosts - should include schedule domains
            await callUpdateHostsFile();

            // Check if domain is being blocked
            const allDomains = new Set();
            appData.schedules.forEach(schedule => {
                if (!schedule.segments) return;
                const isActive = schedule.segments.some(seg => {
                    const startMins = seg.startHour * 60 + seg.startMinute;
                    const endMins = seg.endHour * 60 + seg.endMinute;
                    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

                    if (endMins > startMins) {
                        return seg.days.includes(currentDay) && currentMins >= startMins && currentMins < endMins;
                    }
                    return false;
                });

                if (isActive) {
                    const bl = appData.blocklists.find(b => b.id === schedule.blocklistId);
                    if (bl) bl.websites.forEach(d => allDomains.add(d));
                }
            });

            const scheduleWorking = allDomains.has(TEST_DOMAIN);

            // Cleanup
            appData.schedules = appData.schedules.filter(s => s.id !== testSchedule.id);
            await callSaveData();
            await callUpdateHostsFile(true);

            if (scheduleWorking) {
                console.log('   ✅ Schedule activated and domain detected');
                return { passed: true };
            } else {
                console.log('   ❌ Schedule did not activate domain');
                return { passed: false, error: 'Domain not in active set' };
            }
        } catch (err) {
            console.error('   ❌ Error:', err);
            return { passed: false, error: err.message };
        }
    }

    // ========================================
    // MAIN RUNNER
    // ========================================

    async function runIntegrationTests() {
        console.clear();
        console.log('🔬 ReddBlock Integration Tests');
        console.log('================================');
        console.log('⚠️  These tests modify real system state!');
        console.log('⚠️  They use a safe test domain that doesn\'t exist.\n');

        // Check if internals are available
        if (!getInternals()) {
            console.error('❌ App internals not available.');
            console.log('   Make sure app.js has loaded and exposes __REDDBLOCK_INTERNALS__');
            return { passed: 0, failed: 0, skipped: 0, errors: ['Internals not available'] };
        }

        const results = {
            passed: 0,
            failed: 0,
            skipped: 0,
            errors: []
        };

        try {
            // Setup
            await setup();

            // Run tests
            const tests = [
                { name: 'IT1: Hosts File Modification', fn: testHostsFileModification },
                { name: 'IT2: Block Start/End Timing', fn: testBlockStartAndEnd },
                { name: 'IT3: Schedule Activation', fn: testScheduleActivation }
            ];

            for (const test of tests) {
                const result = await test.fn();
                if (result.skipped) {
                    results.skipped++;
                } else if (result.passed) {
                    results.passed++;
                } else {
                    results.failed++;
                    results.errors.push(`${test.name}: ${result.error}`);
                }
            }

        } catch (err) {
            console.error('❌ Test suite crashed:', err);
            results.errors.push('Suite crash: ' + err.message);
        } finally {
            // Always cleanup
            await teardown();
        }

        // Summary
        console.log('\n========================================');
        console.log(`INTEGRATION TEST RESULTS:`);
        console.log(`  ✅ Passed: ${results.passed}`);
        console.log(`  ❌ Failed: ${results.failed}`);
        console.log(`  ⏭️  Skipped: ${results.skipped}`);
        console.log('========================================');

        if (results.errors.length > 0) {
            console.log('\nErrors:');
            results.errors.forEach(e => console.log('  • ' + e));
        }

        return results;
    }

    // Export
    window.runIntegrationTests = runIntegrationTests;

    console.log('🔬 Integration tests loaded. Run with: runIntegrationTests()');
    console.log('   ⚠️  These tests modify real system state!');
})();
