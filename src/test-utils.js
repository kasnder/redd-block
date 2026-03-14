/**
 * ReddBlock Test Utilities
 * 
 * Provides mock data factories and assertion helpers for testing blocking logic
 * without affecting real app data.
 */

// ========================================
// TIME MOCKING
// ========================================

/**
 * Create a mock Date that returns a specific time
 * @param {number} hours - Hour (0-23)
 * @param {number} minutes - Minutes (0-59)
 * @param {number} dayOfWeek - Day (0=Sun, 1=Mon, ... 6=Sat) - JS format
 * @returns {Date}
 */
function createMockDate(hours, minutes, dayOfWeek = 1) {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    // Adjust to target day of week
    const currentDay = date.getDay();
    const diff = dayOfWeek - currentDay;
    date.setDate(date.getDate() + diff);
    return date;
}

/**
 * Create a mock "now" timestamp
 * @param {number} hours 
 * @param {number} minutes 
 * @param {number} dayOfWeek 
 * @returns {number} - Timestamp in milliseconds
 */
function createMockNow(hours, minutes, dayOfWeek = 1) {
    return createMockDate(hours, minutes, dayOfWeek).getTime();
}

// ========================================
// DATA FACTORIES
// ========================================

let idCounter = 0;

function generateTestId(prefix = 'test') {
    return `${prefix}-${++idCounter}`;
}

/**
 * Create a mock blocklist
 */
function createMockBlocklist(overrides = {}) {
    return {
        id: generateTestId('bl'),
        name: 'Test Blocklist',
        websites: ['facebook.com', 'twitter.com'],
        apps: [],
        emoji: '🚫',
        color: '#ff6b6b',
        overrideDifficulty: { type: 'random-words', count: 50 },
        ...overrides
    };
}

/**
 * Create a mock one-off block
 */
function createMockBlock(blocklistId, startTime, endTime, overrides = {}) {
    return {
        id: generateTestId('block'),
        blocklistId,
        startTime,
        endTime,
        ...overrides
    };
}

/**
 * Create a mock schedule
 */
function createMockSchedule(blocklistId, segments, overrides = {}) {
    return {
        id: generateTestId('sched'),
        blocklistId,
        segments,
        repeatType: 'forever',
        createdAt: Date.now(),
        ...overrides
    };
}

/**
 * Create a mock schedule segment
 * @param {number} startHour 
 * @param {number} startMinute 
 * @param {number} endHour 
 * @param {number} endMinute 
 * @param {number[]} days - Array of days (0=Mon, 1=Tue, ... 6=Sun) - App format
 */
function createMockSegment(startHour, startMinute, endHour, endMinute, days) {
    return {
        startHour,
        startMinute,
        endHour,
        endMinute,
        days
    };
}

/**
 * Create a complete mock appData object
 */
function createMockAppData(overrides = {}) {
    return {
        blocklists: [],
        activeBlocks: [],
        schedules: [],
        settings: { onboardingComplete: true },
        ...overrides
    };
}

// ========================================
// DOMAIN AGGREGATION LOGIC (extracted for testing)
// ========================================

/**
 * Calculate which domains should be blocked at a given time
 * This mirrors the logic in updateHostsFile() but is pure and testable
 * 
 * @param {Object} appData - Mock app data
 * @param {number} now - Timestamp to check
 * @param {Date} nowDate - Date object for schedule checking
 * @returns {Set<string>} - Set of domains that should be blocked
 */
function getBlockedDomains(appData, now, nowDate) {
    const allDomains = new Set();

    // Check active one-off blocks
    appData.activeBlocks
        .filter(block => block.startTime <= now && block.endTime > now)
        .forEach(block => {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist && blocklist.websites) {
                blocklist.websites.forEach(domain => allDomains.add(domain));
            }
        });

    // Check scheduled blocks
    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1; // Convert to Mon=0 format
    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

    if (appData.schedules) {
        appData.schedules.forEach(schedule => {
            if (!schedule.segments) return;

            const isActive = schedule.segments.some(seg => {
                const startMins = seg.startHour * 60 + seg.startMinute;
                const endMins = seg.endHour * 60 + seg.endMinute;

                if (endMins > startMins) {
                    // Same-day segment
                    return seg.days.includes(currentDay) &&
                        currentMins >= startMins &&
                        currentMins < endMins;
                } else {
                    // Cross-midnight segment
                    const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;
                    const inEveningPortion = seg.days.includes(currentDay) && currentMins >= startMins;
                    const inMorningPortion = seg.days.includes(yesterdayDay) && currentMins < endMins;
                    return inEveningPortion || inMorningPortion;
                }
            });

            if (isActive) {
                const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
                if (blocklist && blocklist.websites) {
                    blocklist.websites.forEach(domain => allDomains.add(domain));
                }
            }
        });
    }

    return allDomains;
}

/**
 * Find the hardest challenge among blocklists (mirrors findHardestChallenge)
 */
function getHardestChallenge(appData, now) {
    const nowDate = new Date(now);
    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1;
    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();
    let hardest = null;

    // Check active blocks
    for (const block of appData.activeBlocks) {
        if (block.startTime <= now && block.endTime > now) {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist?.overrideDifficulty) {
                hardest = hardest
                    ? compareDifficulties(hardest, blocklist.overrideDifficulty)
                    : blocklist.overrideDifficulty;
            }
        }
    }

    // Check active schedules
    for (const schedule of appData.schedules || []) {
        if (!schedule.segments) continue;
        const isActive = schedule.segments.some(seg => {
            const startMins = seg.startHour * 60 + seg.startMinute;
            const endMins = seg.endHour * 60 + seg.endMinute;
            if (endMins > startMins) {
                return seg.days.includes(currentDay) &&
                    currentMins >= startMins &&
                    currentMins < endMins;
            }
            const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;
            return (seg.days.includes(currentDay) && currentMins >= startMins) ||
                (seg.days.includes(yesterdayDay) && currentMins < endMins);
        });
        if (!isActive) continue;

        const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
        if (blocklist?.overrideDifficulty) {
            hardest = hardest
                ? compareDifficulties(hardest, blocklist.overrideDifficulty)
                : blocklist.overrideDifficulty;
        }
    }

    if (!hardest) return { type: 'random-words', count: 50 };

    // Resolve effective count for maxDifficulty
    if (hardest.maxDifficulty === true && hardest.count === undefined) {
        const effectiveCount = hardest.type === 'gibberish' ? 5000 : 7500;
        return { ...hardest, count: effectiveCount };
    }
    return hardest;
}

/**
 * Compare two difficulties (mirrors compareDifficulties)
 * When maxDifficulty is true, effective count matches app.js getMaxOverrideCharsForType (keep in sync).
 */
function compareDifficulties(a, b) {
    if (!a) return b;
    if (!b) return a;

    const MAX_CHARS_RANDOM_WORDS = 7500;  // 250 * 30, match app.js getMaxOverrideCharsForType
    const MAX_CHARS_GIBBERISH = 5000;    // match app.js getMaxOverrideCharsForType

    const getEffectiveCount = (difficulty) => {
        if (difficulty.type === 'custom' && typeof difficulty.customText === 'string') {
            return difficulty.customText.length;
        }
        if (difficulty.maxDifficulty === true) {
            if (difficulty.type === 'gibberish') return MAX_CHARS_GIBBERISH;
            if (difficulty.type === 'random-words') return MAX_CHARS_RANDOM_WORDS;
        }
        const parsed = Number(difficulty.count);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
    };

    const getTypeRank = (difficulty) => {
        if (difficulty.type === 'custom') return 3;
        if (difficulty.type === 'gibberish') return 2;
        if (difficulty.type === 'random-words') return 1;
        return 0;
    };

    const aCount = getEffectiveCount(a);
    const bCount = getEffectiveCount(b);

    let winner;
    if (bCount > aCount) winner = b;
    else if (aCount > bCount) winner = a;
    else {
        const aRank = getTypeRank(a);
        const bRank = getTypeRank(b);
        if (bRank > aRank) winner = b;
        else if (aRank > bRank) winner = a;
        else winner = a;
    }

    // Return with effective count resolved (so maxDifficulty is reflected in .count)
    const winnerCount = getEffectiveCount(winner);
    if (winner.count !== winnerCount) {
        return { ...winner, count: winnerCount };
    }
    return winner;
}

// ========================================
// ASSERTION HELPERS
// ========================================

const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

function resetTestResults() {
    testResults.passed = 0;
    testResults.failed = 0;
    testResults.errors = [];
    idCounter = 0;
}

function assert(condition, message) {
    if (condition) {
        testResults.passed++;
        return true;
    } else {
        testResults.failed++;
        testResults.errors.push(message);
        console.error(`❌ FAIL: ${message}`);
        return false;
    }
}

function assertEqual(actual, expected, message) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) {
        console.error(`  Expected: ${JSON.stringify(expected)}`);
        console.error(`  Actual: ${JSON.stringify(actual)}`);
    }
    return assert(pass, message);
}

function assertSetEquals(actualSet, expectedArray, message) {
    const actual = Array.from(actualSet).sort();
    const expected = expectedArray.slice().sort();
    return assertEqual(actual, expected, message);
}

function assertSetContains(actualSet, domain, message) {
    return assert(actualSet.has(domain), message);
}

function assertSetEmpty(actualSet, message) {
    return assert(actualSet.size === 0, `${message} (got ${actualSet.size} items: ${Array.from(actualSet).join(', ')})`);
}

function printTestSummary() {
    console.log('\n========================================');
    console.log(`TEST RESULTS: ${testResults.passed} passed, ${testResults.failed} failed`);
    console.log('========================================');

    if (testResults.failed > 0) {
        console.log('\nFailed tests:');
        testResults.errors.forEach((err, i) => {
            console.log(`  ${i + 1}. ${err}`);
        });
    } else {
        console.log('\n✅ All tests passed!');
    }
}

// ========================================
// ADVANCED FEATURE LOGIC (extracted for testing)
// ========================================

/**
 * Check if there are any active blocks or schedules at the given time
 * Mirrors hasAnyActiveBlocks() in app.js but is pure and testable
 */
function hasAnyActiveBlocks(appData, now, nowDate) {
    // Check one-off blocks
    const hasActiveOneOff = appData.activeBlocks.some(block =>
        block.startTime <= now && block.endTime > now
    );
    if (hasActiveOneOff) return true;

    // Check schedules
    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1;
    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();

    if (appData.schedules) {
        for (const schedule of appData.schedules) {
            if (!schedule.segments) continue;
            const isActive = schedule.segments.some(seg => {
                const startMins = seg.startHour * 60 + seg.startMinute;
                const endMins = seg.endHour * 60 + seg.endMinute;
                if (endMins > startMins) {
                    return seg.days.includes(currentDay) &&
                        currentMins >= startMins &&
                        currentMins < endMins;
                } else {
                    const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;
                    return (seg.days.includes(currentDay) && currentMins >= startMins) ||
                        (seg.days.includes(yesterdayDay) && currentMins < endMins);
                }
            });
            if (isActive) return true;
        }
    }

    return false;
}

/**
 * Find the hardest challenge among all active blocks and schedules
 * Mirrors findHardestChallenge() in app.js but accepts time parameter
 */
function findHardestChallengeAtTime(appData, now) {
    const nowDate = new Date(now);
    const currentDay = nowDate.getDay() === 0 ? 6 : nowDate.getDay() - 1;
    const currentMins = nowDate.getHours() * 60 + nowDate.getMinutes();
    let hardest = null;

    // Check active one-off blocks
    for (const block of appData.activeBlocks) {
        if (block.startTime <= now && block.endTime > now) {
            const blocklist = appData.blocklists.find(bl => bl.id === block.blocklistId);
            if (blocklist?.overrideDifficulty) {
                hardest = hardest
                    ? compareDifficulties(hardest, blocklist.overrideDifficulty)
                    : blocklist.overrideDifficulty;
            }
        }
    }

    // Check active schedules
    for (const schedule of appData.schedules || []) {
        if (!schedule.segments) continue;
        const isActive = schedule.segments.some(seg => {
            const startMins = seg.startHour * 60 + seg.startMinute;
            const endMins = seg.endHour * 60 + seg.endMinute;
            if (endMins > startMins) {
                return seg.days.includes(currentDay) &&
                    currentMins >= startMins &&
                    currentMins < endMins;
            }
            const yesterdayDay = currentDay === 0 ? 6 : currentDay - 1;
            return (seg.days.includes(currentDay) && currentMins >= startMins) ||
                (seg.days.includes(yesterdayDay) && currentMins < endMins);
        });
        if (!isActive) continue;

        const blocklist = appData.blocklists.find(bl => bl.id === schedule.blocklistId);
        if (blocklist?.overrideDifficulty) {
            hardest = hardest
                ? compareDifficulties(hardest, blocklist.overrideDifficulty)
                : blocklist.overrideDifficulty;
        }
    }

    if (!hardest) return { type: 'random-words', count: 50 };

    // Resolve effective count for maxDifficulty
    if (hardest.maxDifficulty === true && hardest.count === undefined) {
        const effectiveCount = hardest.type === 'gibberish' ? 5000 : 7500;
        return { ...hardest, count: effectiveCount };
    }
    return hardest;
}

/**
 * Simulate performOverrideAll — clears blocks and schedules, leaves blocklists intact
 * Returns the resulting appData (mutated)
 */
function simulateOverrideAll(appData) {
    appData.activeBlocks = [];
    appData.schedules = [];
    return appData;
}

// Export for use in blocking-tests.js
window.ReddBlockTestUtils = {
    // Time mocking
    createMockDate,
    createMockNow,

    // Data factories
    generateTestId,
    createMockBlocklist,
    createMockBlock,
    createMockSchedule,
    createMockSegment,
    createMockAppData,

    // Logic under test
    getBlockedDomains,
    getHardestChallenge,
    compareDifficulties,
    hasAnyActiveBlocks,
    findHardestChallengeAtTime,
    simulateOverrideAll,

    // Assertions
    resetTestResults,
    assert,
    assertEqual,
    assertSetEquals,
    assertSetContains,
    assertSetEmpty,
    printTestSummary,
    testResults
};

console.log('🧪 ReddBlock Test Utils loaded');
