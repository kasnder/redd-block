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
 * Both platforms use the embedded WebDriver server, which requires the
 * `tauri-plugin-wdio-webdriver` crate compiled in via the `e2e-webdriver`
 * Cargo feature. That feature must stay out of shipped builds — an embedded
 * remote-control server inside a blocker app is a bypass surface — so it is
 * off by default and `lib.rs` fails to compile if it is ever combined with a
 * release profile.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
// This repo redirects Cargo's target dir out of the worktree so linked
// worktrees share one dependency graph, so the binary is NOT under
// src-tauri/target unless CARGO_TARGET_DIR says so. Reuse the same resolver
// the build scripts use rather than duplicating the rule here.
const { getCargoTargetDir } = createRequire(import.meta.url)('../scripts/build-env.js');

// Within the target dir, `--debug` vs release changes the profile directory,
// and Tauri names the binary after either the Cargo package or productName
// depending on the target. Probe rather than guess, and report every path
// tried when nothing matches.
function binaryCandidates() {
    const exe = process.platform === 'win32' ? '.exe' : '';
    const names = ['redd-block', 'Digital Habits Blocker'];
    const roots = [getCargoTargetDir(process.env), path.join(repoRoot, 'src-tauri', 'target')];
    const candidates = [];
    for (const root of roots) {
        for (const profile of ['debug', 'release']) {
            for (const name of names) {
                candidates.push(path.join(root, profile, `${name}${exe}`));
                if (process.platform === 'darwin') {
                    candidates.push(path.join(
                        root, profile, 'bundle', 'macos',
                        `${name}.app`, 'Contents', 'MacOS', name,
                    ));
                }
            }
        }
    }
    return candidates;
}

function resolveAppBinary() {
    const fromEnv = process.env.E2E_APP_BINARY;
    if (fromEnv) {
        if (!existsSync(fromEnv)) {
            throw new Error(`E2E_APP_BINARY is set but does not exist: ${fromEnv}`);
        }
        return fromEnv;
    }
    const candidates = binaryCandidates();
    for (const abs of candidates) {
        if (existsSync(abs)) return abs;
    }
    throw new Error(
        `Could not find a built app binary for ${process.platform}. Looked for:\n` +
        candidates.map((c) => `  - ${c}`).join('\n') +
        `\nBuild one with \`npm run build:e2e-app\`, or set E2E_APP_BINARY.`,
    );
}

// Embedded on every platform. Windows started on 'external' (tauri-driver +
// msedgedriver) because that is the path Tauri's CI guide documents, but it
// never established a session there — POST /session to :4444 timed out after
// 180 s, twice, with the suite never running. The embedded server was already
// green on macOS and the plugin lists WebView2 as fully supported, so both
// jobs now use the mechanism that demonstrably works. That also drops the
// `cargo install tauri-driver` step and leaves one code path to reason about.
const driverProvider = process.env.E2E_DRIVER_PROVIDER || 'embedded';

export const config = {
    runner: 'local',
    specs: [fileURLToPath(new URL('./specs/**/*.e2e.js', import.meta.url))],
    maxInstances: 1,
    capabilities: [{}],
    // 'info' logs every WebDriver command, which buries the suite's own output
    // hundreds of lines up in a CI log — the reason the first probe run told us
    // nothing. Full detail still lands in outputDir, which the workflow uploads
    // as an artifact on failure.
    logLevel: 'warn',
    outputDir: fileURLToPath(new URL('../logs', import.meta.url)),
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
