/**
 * Vite dev-server lifecycle for headless runners.
 *
 * Shared by scripts/ci/run-tier1-headless.mjs and scripts/ui/shoot.mjs, both of
 * which need the same thing: a dev server on a known port, torn down reliably
 * when the run ends.
 *
 * The detached process group is load-bearing, not defensive style. `npx vite`
 * forks a child that survives a SIGTERM sent only to the wrapper, so killing the
 * wrapper alone leaks a dev server holding the port — and the next run fails on
 * `--strictPort` instead of on anything to do with the code under test.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

export const DEFAULT_BOOT_TIMEOUT_MS = 60_000;

export async function waitForServer(url, timeoutMs = DEFAULT_BOOT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url, { method: 'GET' });
            if (res.ok) return true;
        } catch { /* not up yet */ }
        await sleep(500);
    }
    return false;
}

/**
 * Spawn `vite` on `port` and resolve once it answers.
 *
 * Returns `{ url, stop() }`. Callers should also register `stop` on process
 * exit — an uncaught throw between boot and teardown would otherwise leak the
 * server for the same reason described above.
 */
export async function startDevServer({ port, bootTimeoutMs = DEFAULT_BOOT_TIMEOUT_MS, log = () => {} } = {}) {
    const url = `http://localhost:${port}/`;

    const vite = spawn(
        'npx',
        ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
        { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env }, detached: true },
    );

    const stop = (signal = 'SIGTERM') => {
        try { process.kill(-vite.pid, signal); } catch { /* already gone */ }
    };

    log('starting Vite dev server on port', port);
    if (!(await waitForServer(url, bootTimeoutMs))) {
        stop('SIGKILL');
        throw new Error(`Vite dev server did not come up at ${url} within ${bootTimeoutMs}ms`);
    }
    log('dev server up at', url);

    return { url, stop };
}
