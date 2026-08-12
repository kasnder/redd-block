import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const FIXTURE_APP_NAME = 'Digital Habits Test Target';
export const FIXTURE_BUNDLE_ID = 'org.digitalhabits.reddblock.appwatcherfixture';

const DEFAULT_ARTIFACT_ROOT = path.join(os.tmpdir(), 'redd-block-system-test');

function artifactRoot() {
    const root = process.env.SYSTEM_TEST_ARTIFACTS_DIR || DEFAULT_ARTIFACT_ROOT;
    mkdirSync(root, { recursive: true });
    return root;
}

/** Resolve either a fixture executable or the containing .app. */
export function fixtureBinary() {
    const configured = process.env.APP_WATCHER_FIXTURE_BINARY;
    const defaultApp = path.join(artifactRoot(), 'app-watcher-fixture', `${FIXTURE_APP_NAME}.app`);
    const candidate = configured || defaultApp;
    if (candidate.endsWith('.app')) {
        return path.join(candidate, 'Contents', 'MacOS', FIXTURE_APP_NAME);
    }
    return candidate;
}

function fixtureAppPath() {
    const binary = fixtureBinary();
    const suffix = `${path.sep}Contents${path.sep}MacOS${path.sep}${FIXTURE_APP_NAME}`;
    const suffixAt = binary.lastIndexOf(suffix);
    if (suffixAt >= 0) return binary.slice(0, suffixAt);
    return path.dirname(path.dirname(path.dirname(binary)));
}

export function fixtureLogFiles() {
    return artifactRoot();
}

export function launchFixture({ mode = 'normal' } = {}) {
    const binary = fixtureBinary();
    if (!existsSync(binary)) {
        throw new Error(
            `App-watcher fixture is missing: ${binary}. `
            + 'Build it with e2e/fixtures/build-app-watcher-target.sh.',
        );
    }

    const logPath = path.join(
        artifactRoot(),
        `app-watcher-fixture-${mode}-${Date.now()}.log`,
    );
    writeFileSync(logPath, '');
    const child = spawn(binary, [], {
        cwd: path.dirname(binary),
        env: {
            ...process.env,
            APP_WATCHER_FIXTURE_MODE: mode,
            APP_WATCHER_FIXTURE_BUNDLE_ID: FIXTURE_BUNDLE_ID,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!child.pid) throw new Error('App-watcher fixture did not return a PID');
    child.stdout?.on('data', (chunk) => appendFileSync(logPath, chunk));
    child.stderr?.on('data', (chunk) => appendFileSync(logPath, chunk));

    const handle = {
        child,
        pid: child.pid,
        mode,
        binary,
        appPath: fixtureAppPath(),
        logPath,
    };
    child.once('error', (error) => {
        appendFileSync(logPath, `\n[launcher-error] ${error.stack || error}\n`);
    });
    return handle;
}

export function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error?.code === 'EPERM';
    }
}

export function isFixtureAlive(handle) {
    if (!handle) return false;
    if (handle.child?.exitCode !== null && handle.child?.exitCode !== undefined) return false;
    if (handle.child?.signalCode) return false;
    return isPidAlive(handle.pid);
}

export async function waitForFixtureReady(handle, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isFixtureAlive(handle)) {
            const log = readFileSync(handle.logPath, 'utf8');
            throw new Error(`App-watcher fixture exited before READY (pid=${handle.pid})\n${log}`);
        }
        if (readFileSync(handle.logPath, 'utf8').includes('READY mode=')) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`App-watcher fixture did not report READY (pid=${handle.pid}); see ${handle.logPath}`);
}

export async function waitForFixtureExit(handle, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!isFixtureAlive(handle)) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return false;
}

/**
 * Last-resort cleanup for this fixture only. The caller supplies the exact
 * PID returned by spawn; there is intentionally no name-based kill fallback.
 */
export async function killFixture(handle) {
    if (!handle || !isFixtureAlive(handle)) return;
    try {
        process.kill(handle.pid, 'SIGKILL');
    } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
    }
    const exited = await waitForFixtureExit(handle, 5_000);
    if (!exited) throw new Error(`Could not clean up fixture PID ${handle.pid}`);
}

export function runFixtureAppleScript(source, { timeoutMs = 10_000 } = {}) {
    const result = spawnSync('/usr/bin/osascript', ['-e', source], {
        encoding: 'utf8',
        timeout: timeoutMs,
    });
    const record = {
        command: source,
        status: result.status,
        signal: result.signal,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
    const pathForRun = path.join(artifactRoot(), 'last-app-watcher-applescript.json');
    writeFileSync(pathForRun, JSON.stringify(record, null, 2));
    if (result.error) throw new Error(`osascript failed: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error(`osascript exited ${result.status}: ${result.stderr || result.stdout}`);
    }
    return record;
}

export function closeFixtureWindow() {
    return runFixtureAppleScript(
        `tell application id "${FIXTURE_BUNDLE_ID}" to activate\n`
        + `tell application "System Events" to keystroke "w" using {command down}`,
    );
}

export function quitFixture() {
    return runFixtureAppleScript(
        `tell application id "${FIXTURE_BUNDLE_ID}" to activate\n`
        + `tell application "System Events" to keystroke "q" using {command down}`,
    );
}
