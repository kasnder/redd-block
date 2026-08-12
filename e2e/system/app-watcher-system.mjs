/**
 * Callable macOS app-watcher suite used by scripts/run-system-test-macos.mjs.
 *
 * The WDIO `*.e2e.js` file is useful when running the regular WDIO service,
 * but the one-command system runner already owns the signed app process. This
 * adapter attaches directly to that app's embedded WebDriver server instead
 * of launching a second app or using name-based process cleanup.
 */
/* global window */
import console from 'node:console';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';
import { remote } from 'webdriverio';
import {
    closeFixtureWindow,
    isFixtureAlive,
    killFixture,
    launchFixture,
    quitFixture,
    waitForFixtureExit,
    waitForFixtureReady,
    fixtureBinary,
} from './app-watcher-harness.js';

const TARGET_NAME = 'Digital Habits Test Target';
const DEFAULT_DRIVER_PORT = 4445;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function artifactDir(options) {
    const root = options.artifactsDir
        || process.env.SYSTEM_TEST_ARTIFACTS_DIR
        || path.join(os.tmpdir(), 'redd-block-system-test');
    mkdirSync(root, { recursive: true });
    return root;
}

function ensureFixture(options) {
    process.env.SYSTEM_TEST_ARTIFACTS_DIR = artifactDir(options);
    const configured = options.fixtureBinary || process.env.APP_WATCHER_FIXTURE_BINARY;
    if (configured) {
        process.env.APP_WATCHER_FIXTURE_BINARY = configured;
        return;
    }
    if (existsSync(fixtureBinary())) return;
    const outputDir = path.join(artifactDir(options), 'app-watcher-fixture');
    const script = path.resolve(new URL('../../e2e/fixtures/build-app-watcher-target.sh', import.meta.url).pathname);
    const result = spawnSync('bash', [script], {
        cwd: path.resolve(new URL('../..', import.meta.url).pathname),
        env: {
            ...process.env,
            APP_WATCHER_FIXTURE_OUTPUT_DIR: outputDir,
            SYSTEM_TEST_ARTIFACTS_DIR: artifactDir(options),
        },
        encoding: 'utf8',
        stdio: 'inherit',
    });
    if (result.error || result.status !== 0 || !existsSync(fixtureBinary())) {
        throw new Error(`Could not build app-watcher fixture (status=${result.status}): ${result.error?.message || ''}`);
    }
}

async function attachDriver(options) {
    const port = Number(
        options.webdriverPort
        || process.env.TAURI_WEBDRIVER_PORT
        || process.env.SYSTEM_TEST_WEBDRIVER_PORT
        || DEFAULT_DRIVER_PORT,
    );
    const deadline = Date.now() + 30_000;
    let lastError;
    while (Date.now() < deadline) {
        try {
            return await remote({
                hostname: '127.0.0.1',
                port,
                logLevel: 'warn',
                connectionRetryTimeout: 5_000,
                connectionRetryCount: 0,
                capabilities: { browserName: 'tauri' },
            });
        } catch (error) {
            lastError = error;
            await sleep(250);
        }
    }
    throw new Error(`Could not attach to Tauri WebDriver on 127.0.0.1:${port}: ${lastError?.message || lastError}`);
}

async function warningRows(driver) {
    return driver.execute(() => {
        const rows = window.__REDDBLOCK_INTERNALS__?.appBlockingWarningRows;
        if (!(rows instanceof Map)) return [];
        return [...rows.entries()].map(([pid, row]) => ({
            pid,
            name: row?.name,
            ackedDeadlineMs: row?.ackedDeadlineMs ?? null,
        }));
    });
}

async function waitUntil(driver, predicate, timeoutMs, message) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(250);
    }
    throw new Error(message);
}

async function setBlocked(driver, apps) {
    const result = await driver.executeAsync((targetName, targetApps, done) => {
        const internals = window.__REDDBLOCK_INTERNALS__;
        if (!internals?.appData || typeof internals.updateBlockedApps !== 'function') {
            done({ error: 'app state/updateBlockedApps test seam is unavailable' });
            return;
        }
        const testId = 'system-test-app-watcher';
        const appData = internals.appData;
        appData.blocklists = (appData.blocklists || []).filter((item) => item.id !== testId);
        appData.activeBlocks = (appData.activeBlocks || []).filter((item) => item.id !== testId);
        if (targetApps.length > 0) {
            appData.blocklists.push({
                id: testId,
                name: 'System test app watcher',
                mode: 'blocklist',
                websites: [],
                apps: targetApps,
            });
            appData.activeBlocks.push({
                id: testId,
                blocklistId: testId,
                startTime: Date.now() - 1_000,
                endTime: Date.now() + 5 * 60_000,
            });
        }
        Promise.resolve(internals.saveData())
            .then(() => internals.updateBlockedApps())
            .then(() => done({ success: true, targetName }))
            .catch((error) => done({ error: String(error?.message || error) }));
    }, TARGET_NAME, apps);
    if (result?.error) throw new Error(result.error);
}

async function clearBlocked(driver) {
    await setBlocked(driver, []);
    await waitUntil(
        driver,
        async () => (await warningRows(driver)).every((row) => row.name !== TARGET_NAME),
        8_000,
        'app-blocking warning row did not clear',
    ).catch(() => {});
}

async function warning(driver, acknowledged = false) {
    await waitUntil(
        driver,
        async () => (await warningRows(driver)).some((row) => row.name === TARGET_NAME
            && (acknowledged ? Number.isFinite(row.ackedDeadlineMs) : true)),
        12_000,
        'app-blocking warning row did not appear',
    );
}

async function acknowledgeWarning(driver) {
    const clicked = await driver.execute(() => {
        const button = window.document.getElementById('app-blocking-lets-go-btn');
        if (!button) return false;
        button.click();
        return true;
    });
    if (!clicked) throw new Error("app-blocking Let's go button is unavailable");
    await warning(driver, true);
}

async function runCase(name, driver, fn) {
    let fixture;
    try {
        fixture = await fn((mode) => {
            fixture = launchFixture({ mode });
            return fixture;
        });
    } catch (error) {
        error.message = `${name}: ${error.message}`;
        throw error;
    } finally {
        await clearBlocked(driver).catch(() => {});
        await killFixture(fixture).catch((error) => {
            console.error(`[app-watcher] exact-PID cleanup failed: ${error.message}`);
        });
    }
}

export async function runAppWatcherSystemSuite(options = {}) {
    if (process.platform !== 'darwin') throw new Error('macOS app-watcher system tests require Darwin');
    ensureFixture(options);
    const driver = await attachDriver(options);
    try {
        await waitUntil(
            driver,
            async () => driver.execute(() => !!window.__REDDBLOCK_INTERNALS__),
            20_000,
            'Tauri frontend internals never attached',
        );

        await runCase('warning before acknowledgement', driver, async (start) => {
            const fixture = start('normal');
            await waitForFixtureReady(fixture);
            await setBlocked(driver, [TARGET_NAME]);
            await warning(driver);
            await sleep(2_000);
            if (!isFixtureAlive(fixture)) throw new Error('normal fixture quit before acknowledgement');
            return fixture;
        });

        await runCase('30-second pre-quit', driver, async (start) => {
            const fixture = start('normal');
            await waitForFixtureReady(fixture);
            await setBlocked(driver, [TARGET_NAME]);
            await warning(driver);
            await acknowledgeWarning(driver);
            await sleep(5_000);
            if (!isFixtureAlive(fixture)) throw new Error('normal fixture quit before pre-quit elapsed');
            if (!await waitForFixtureExit(fixture, 45_000)) throw new Error(`normal fixture survived polite quit (pid=${fixture.pid})`);
            return fixture;
        });

        await runCase('stubborn force-close', driver, async (start) => {
            const fixture = start('stubborn');
            await waitForFixtureReady(fixture);
            await setBlocked(driver, [TARGET_NAME]);
            await warning(driver);
            await acknowledgeWarning(driver);
            await sleep(35_000);
            if (!isFixtureAlive(fixture)) throw new Error('stubborn fixture exited before force-close grace');
            if (!await waitForFixtureExit(fixture, 28_000)) throw new Error(`stubborn fixture survived force-close (pid=${fixture.pid})`);
            return fixture;
        });

        await runCase('mid-block launch', driver, async (start) => {
            await setBlocked(driver, [TARGET_NAME]);
            const fixture = start('normal');
            await waitUntil(driver, () => !isFixtureAlive(fixture), 12_000, 'mid-block fixture remained alive');
            if ((await warningRows(driver)).some((row) => row.name === TARGET_NAME)) {
                throw new Error('mid-block launch unexpectedly raised a warning');
            }
            return fixture;
        });

        await runCase('effective pause/resume/expiry policy sync', driver, async (start) => {
            const fixture = start('normal');
            await waitForFixtureReady(fixture);
            await setBlocked(driver, [TARGET_NAME]);
            await warning(driver);
            await clearBlocked(driver);
            if (!isFixtureAlive(fixture)) throw new Error('target quit while policy was paused');
            await sleep(1_500);
            await setBlocked(driver, [TARGET_NAME]);
            await warning(driver);
            await clearBlocked(driver);
            if (!isFixtureAlive(fixture)) throw new Error('target quit when policy expired');
            return fixture;
        });

        await runCase('Cmd-W/Cmd-Q lifecycle', driver, async (start) => {
            const fixture = start('normal');
            await waitForFixtureReady(fixture);
            await setBlocked(driver, [TARGET_NAME]);
            await warning(driver);
            closeFixtureWindow();
            await sleep(1_000);
            if (!isFixtureAlive(fixture)) throw new Error('Cmd-W terminated the target');
            quitFixture();
            await waitUntil(driver, () => !isFixtureAlive(fixture), 8_000, 'Cmd-Q did not terminate target');
            return fixture;
        });
        console.log('[system-test] app watcher: 6 cases passed');
    } catch (error) {
        const dir = artifactDir(options);
        writeFileSync(path.join(dir, 'app-watcher-system-failure.json'), JSON.stringify({
            message: error.message,
            stack: error.stack,
        }, null, 2));
        throw error;
    } finally {
        await driver.deleteSession().catch(() => {});
    }
}

export default runAppWatcherSystemSuite;
