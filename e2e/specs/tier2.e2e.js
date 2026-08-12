/**
 * Tier 2 integration suite, driven against a real built app.
 *
 * This is a thin driver, deliberately: all the test logic lives in
 * src/integration-tests.js and stays runnable by hand from the app's dev
 * console (`runIntegrationTests('full')`). This spec only boots the app,
 * waits for the harness, kicks the suite off, and fails the run on any
 * failed case — the same contract scripts/ci/run-tier1-headless.mjs has
 * with Tier 1.
 *
 * Profile: E2E_PROFILE=core|full (default full).
 */
const PROFILE = process.env.E2E_PROFILE === 'core' ? 'core' : 'full';
const HARNESS_TIMEOUT_MS = 120_000;
const SUITE_TIMEOUT_MS = 540_000;

// A fresh runner has never accepted the EULA, and the gate stops startup before
// `runPostAcceptanceStartup()` — which is what calls `startTickInterval()`. That
// 1 s tick is what expires paused blocks and schedules (render.js), so without
// it A7 and A9 fail while every request/response case still passes. Accept the
// revision the app itself reports, persist it through the real save path, then
// relaunch so the app boots the way a returning user's would.
async function acceptEulaAndRelaunch() {
    const accepted = await browser.execute(() => {
        const internals = window.__REDDBLOCK_INTERNALS__;
        if (!internals) return { ok: false, why: 'internals missing' };
        const revision = internals.CURRENT_EULA_REVISION;
        if (typeof revision !== 'number') {
            return { ok: false, why: 'CURRENT_EULA_REVISION not exposed on internals' };
        }
        const data = internals.appData;
        data.settings = data.settings || {};
        if (data.settings.eulaAcceptedRevision === revision) {
            return { ok: true, alreadyAccepted: true, revision };
        }
        data.settings.eulaAcceptedRevision = revision;
        return { ok: true, alreadyAccepted: false, revision };
    });
    if (!accepted.ok) throw new Error(`Tier 2 setup: could not accept EULA — ${accepted.why}`);
    if (accepted.alreadyAccepted) return;

    await browser.execute(() => window.__REDDBLOCK_INTERNALS__.saveData());
    console.log(`[tier2] accepted EULA revision ${accepted.revision}; relaunching`);
    await browser.reloadSession();
    await waitForHarness();

    // Verify rather than assume: if the relaunched app did not read the
    // acceptance back, every timer-dependent case fails for a reason that has
    // nothing to do with the code under test. Fail here, loudly, with the two
    // values — a silent partial setup is what made the first fix look correct.
    const after = await browser.execute(() => {
        const i = window.__REDDBLOCK_INTERNALS__;
        return {
            accepted: i?.appData?.settings?.eulaAcceptedRevision ?? null,
            required: i?.CURRENT_EULA_REVISION ?? null,
        };
    });
    if (after.accepted !== after.required) {
        throw new Error(
            `Tier 2 setup: EULA acceptance did not survive the relaunch `
            + `(accepted=${after.accepted}, required=${after.required}). The app is still `
            + `behind the first-run gate, so runPostAcceptanceStartup() never runs and the `
            + `1 s tick that expires paused blocks/schedules never starts.`,
        );
    }
}

async function waitForHarness() {
    // __REDDBLOCK_INTERNALS__ is assigned at module top level (not inside
    // DOMContentLoaded), so its presence is the earliest reliable "app JS is
    // live" signal.
    await browser.waitUntil(
        async () => browser.execute(
            () => typeof window.runIntegrationTests === 'function'
                && !!window.__REDDBLOCK_INTERNALS__,
        ),
        {
            timeout: HARNESS_TIMEOUT_MS,
            timeoutMsg:
                'Tier 2 harness never attached. Either the app was built without '
                + '`--mode e2e` (the test scripts get stripped from normal builds), '
                + 'or the frontend failed to boot.',
        },
    );
}

// A7 and A9 are the only cases that need the app's 1 s tick (render.js) to
// expire a paused block/schedule within a few seconds. When they fail and the
// other 23 pass, there are exactly two candidate causes, and they need opposite
// fixes — so measure rather than guess:
//
//   1. The tick never started: the app is still behind the first-run gate, so
//      `runPostAcceptanceStartup()` (which calls `startTickInterval`) never ran.
//      Then `eula.accepted` will not equal `eula.required`.
//   2. The tick started but WKWebView is throttling timers, which macOS does
//      for hidden/occluded windows — render.js's `kickClockNow` exists for
//      exactly that reason, and a headless runner has no real display. Then the
//      probe delivers far fewer ticks than the ~6 a live webview would.
async function reportStartupDiagnostics() {
    const eula = await browser.execute(() => {
        const i = window.__REDDBLOCK_INTERNALS__;
        return {
            accepted: i?.appData?.settings?.eulaAcceptedRevision ?? null,
            required: i?.CURRENT_EULA_REVISION ?? null,
        };
    });
    console.log(`[tier2] eula: accepted=${eula.accepted} required=${eula.required}`);

    await browser.execute(() => {
        window.__TIER2_TIMER_PROBE__ = 0;
        const id = setInterval(() => { window.__TIER2_TIMER_PROBE__ += 1; }, 500);
        setTimeout(() => clearInterval(id), 3000);
    });
    await browser.pause(3300);
    const ticks = await browser.execute(() => window.__TIER2_TIMER_PROBE__);
    console.log(`[tier2] webview timer probe: ${ticks} ticks in 3 s (a live webview gives ~6)`);

    // The webview delivering timers does not mean the *app* started its own.
    // A7/A9 need `startTickInterval()` to have run — from
    // runPostAcceptanceStartup(), behind two conditional call sites in app.js.
    const tickRunning = await browser.execute(
        () => window.__REDDBLOCK_INTERNALS__?.isClockTickRunning?.() ?? null,
    );
    console.log(`[tier2] app clock tick running: ${tickRunning}`);
    if (tickRunning === false) {
        throw new Error(
            'Tier 2 setup: the app never started its 1 s clock tick, so nothing sweeps '
            + 'expired pauses. startTickInterval() is called from runPostAcceptanceStartup() '
            + 'behind conditional branches in src/app.js — the EULA is accepted and the '
            + 'webview delivers timers, so the gate and throttling are both ruled out.',
        );
    }

    // Assert, don't just log. A bare console line gets buried in CI output, and
    // the whole point is that the next failure names its own cause instead of
    // costing another round trip. A7/A9 give the app ~2.5 s to sweep a 1.2 s
    // pause, so fewer than 3 ticks in 3 s means the environment cannot deliver
    // the timers those two cases need, and the suite result says nothing about
    // the code.
    if (ticks < 3) {
        throw new Error(
            `Tier 2 setup: the webview delivered only ${ticks} timer ticks in 3 s. `
            + `WKWebView throttles timers for hidden/occluded windows (see kickClockNow in `
            + `src/render.js), so A7/A9 cannot pass here regardless of app correctness. `
            + `Exclude them from the CI profile rather than weakening them.`,
        );
    }
}

// Both diagnostics above now pass and A7/A9 still fail, on Windows (WebView2)
// as well as macOS (WKWebView) — so it is neither the first-run gate nor timer
// throttling. The remaining candidate is that the 1 s tick throws before it
// reaches the pause-expiry branch (`src/render.js`), which would abort that
// iteration silently every second and leave `isPaused` set. Capture anything
// the app throws while the suite runs so the next failure carries the reason.
async function installErrorCapture() {
    await browser.execute(() => {
        window.__TIER2_ERRORS__ = [];
        const push = (kind, message) => {
            if (window.__TIER2_ERRORS__.length < 40) {
                window.__TIER2_ERRORS__.push(`${kind}: ${message}`);
            }
        };
        window.addEventListener('error', (e) => push('error', (e.error && e.error.stack) || e.message));
        window.addEventListener('unhandledrejection', (e) => {
            const r = e.reason;
            push('unhandledrejection', String((r && r.stack) || r));
        });
        const originalError = console.error;
        console.error = function (...args) {
            push('console.error', args.map((a) => (a && a.stack) || String(a)).join(' '));
            return originalError.apply(this, args);
        };
    });
}

async function reportCapturedErrors() {
    const errors = await browser.execute(() => window.__TIER2_ERRORS__ || []);
    if (!errors.length) {
        console.log('[tier2] app reported no errors during the run');
        return;
    }
    console.log(`[tier2] app errors during the run (${errors.length}):`);
    errors.forEach((e) => console.log(`[tier2]   ! ${e}`));
}

describe('Tier 2 integration suite', () => {
    it('runs against the real Tauri command layer with zero failures', async () => {
        await waitForHarness();
        await acceptEulaAndRelaunch();
        await reportStartupDiagnostics();
        await installErrorCapture();

        // runIntegrationTests is async and long-running. Kick it off, stash the
        // result on window, and poll — driving a multi-minute promise straight
        // through a single execute() invites a driver-side timeout.
        await browser.execute((profile) => {
            window.__TIER2_RESULT__ = undefined;
            window.__TIER2_ERROR__ = undefined;
            Promise.resolve(window.runIntegrationTests(profile))
                .then((r) => { window.__TIER2_RESULT__ = r; })
                .catch((e) => { window.__TIER2_ERROR__ = String((e && e.message) || e); });
        }, PROFILE);

        await browser.waitUntil(
            async () => browser.execute(
                () => window.__TIER2_RESULT__ !== undefined || window.__TIER2_ERROR__ !== undefined,
            ),
            {
                timeout: SUITE_TIMEOUT_MS,
                timeoutMsg: `Tier 2 ('${PROFILE}') did not finish within ${SUITE_TIMEOUT_MS}ms`,
            },
        );

        const crash = await browser.execute(() => window.__TIER2_ERROR__);
        if (crash) throw new Error(`Tier 2 suite threw: ${crash}`);

        const results = await browser.execute(() => window.__TIER2_RESULT__);
        console.log(
            `[tier2] profile=${results.profile} passed=${results.passed} `
            + `failed=${results.failed} skipped=${results.skipped}`,
        );
        (results.errors || []).forEach((e) => console.log('[tier2]   •', e));
        await reportCapturedErrors();

        // A suite that ran nothing is a harness failure wearing a green hat.
        if (results.passed === 0 && results.failed === 0) {
            throw new Error('Tier 2 reported no results — harness loaded but no cases ran');
        }
        if (results.failed > 0) {
            throw new Error(`Tier 2: ${results.failed} case(s) failed`);
        }
    });
});
