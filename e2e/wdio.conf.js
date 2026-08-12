/**
 * WebdriverIO config for the Tier 2 end-to-end run.
 *
 * Tier 2 (src/integration-tests.js) drives the *real* Tauri command layer, so
 * unlike Tier 1 it cannot run against a bare Vite page — `invoke` has to reach
 * actual Rust. This config launches a built app binary and attaches a
 * WebDriver session to its webview, which is the only way to call the suite
 * from outside the app.
 *
 * The app under test must be built with `--mode e2e` (see
 * src-tauri/tauri.e2e.conf.json): the default build strips the test runners out
 * of the bundle, so `runIntegrationTests` would not exist in the webview.
 *
 * Driver providers, per Tauri's WebDriver docs:
 *   - Windows/Linux → 'external' (tauri-driver + the platform's webview driver).
 *     No app-side dependency.
 *   - macOS → 'embedded', which requires the `tauri-plugin-wdio-webdriver`
 *     crate compiled into the binary. That plugin must stay behind a Cargo
 *     feature and out of shipped builds: an embedded remote-control server
 *     inside a blocker app is a bypass surface.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Tauri names the built binary after `productName` on some targets and after
// the Cargo package name on others, and `--debug` vs release changes the
// directory. Probe instead of guessing so a miss fails with a useful message.
const BINARY_CANDIDATES = {
    win32: [
        'src-tauri/target/debug/Digital Habits Blocker.exe',
        'src-tauri/target/debug/redd-block.exe',
        'src-tauri/target/release/Digital Habits Blocker.exe',
        'src-tauri/target/release/redd-block.exe',
    ],
    darwin: [
        'src-tauri/target/debug/bundle/macos/Digital Habits Blocker.app/Contents/MacOS/Digital Habits Blocker',
        'src-tauri/target/debug/Digital Habits Blocker',
        'src-tauri/target/debug/redd-block',
        'src-tauri/target/release/Digital Habits Blocker',
        'src-tauri/target/release/redd-block',
    ],
};

function resolveAppBinary() {
    const fromEnv = process.env.E2E_APP_BINARY;
    if (fromEnv) {
        if (!existsSync(fromEnv)) {
            throw new Error(`E2E_APP_BINARY is set but does not exist: ${fromEnv}`);
        }
        return fromEnv;
    }
    const candidates = BINARY_CANDIDATES[process.platform] || [];
    for (const rel of candidates) {
        const abs = path.join(repoRoot, rel);
        if (existsSync(abs)) return abs;
    }
    throw new Error(
        `Could not find a built app binary for ${process.platform}. Looked for:\n` +
        candidates.map((c) => `  - ${c}`).join('\n') +
        `\nBuild one with \`npm run build:e2e-app\`, or set E2E_APP_BINARY.`,
    );
}

// 'external' drives tauri-driver, which does not support macOS; the embedded
// server is what makes macOS possible at all.
const driverProvider = process.env.E2E_DRIVER_PROVIDER
    || (process.platform === 'darwin' ? 'embedded' : 'external');

export const config = {
    runner: 'local',
    specs: [fileURLToPath(new URL('./specs/**/*.e2e.js', import.meta.url))],
    maxInstances: 1,
    capabilities: [{}],
    logLevel: 'info',
    // One app launch, one long suite: the full Tier 2 profile walks 24 cases
    // through save + sync round-trips.
    waitforTimeout: 30_000,
    connectionRetryTimeout: 180_000,
    connectionRetryCount: 2,
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 600_000,
    },
    services: [
        [
            'tauri',
            {
                appBinaryPath: resolveAppBinary(),
                driverProvider,
            },
        ],
    ],
};
