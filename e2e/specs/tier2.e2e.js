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

describe('Tier 2 integration suite', () => {
    it('runs against the real Tauri command layer with zero failures', async () => {
        await waitForHarness();
        await acceptEulaAndRelaunch();

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

        // A suite that ran nothing is a harness failure wearing a green hat.
        if (results.passed === 0 && results.failed === 0) {
            throw new Error('Tier 2 reported no results — harness loaded but no cases ran');
        }
        if (results.failed > 0) {
            throw new Error(`Tier 2: ${results.failed} case(s) failed`);
        }
    });
});
