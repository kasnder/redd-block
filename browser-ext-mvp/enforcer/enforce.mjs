#!/usr/bin/env node
// Mac testbed for the Windows enforcement flow.
//
// Loop: every TICK seconds, run the profile scanner for each supported
// browser. If a browser is currently running and its default profile
// fails the check (extension missing, disabled, or not allowed in private
// browsing), start a GRACE-second countdown and nag the user. If the
// check is still failing when the countdown expires, quit the browser.
//
// This mirrors the intended Windows behaviour closely enough to validate
// the UX. On Windows the only replacements are:
//   - process detection (pgrep -> WMI / tasklist)
//   - quit  (osascript quit -> taskkill /IM)
//   - nag   (osascript notification -> toast)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pexec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAN = join(__dirname, "..", "profile-scan", "scan.mjs");

const TICK = 5_000;
const GRACE = 30_000;

// Browser key -> { procName (for pgrep), appName (for osascript quit) }
const BROWSERS = {
  firefox: { proc: "firefox",          app: "Firefox" },
  chrome:  { proc: "Google Chrome",    app: "Google Chrome" },
  brave:   { proc: "Brave Browser",    app: "Brave Browser" },
  edge:    { proc: "Microsoft Edge",   app: "Microsoft Edge" },
  safari:  { proc: "Safari",           app: "Safari" },
};

const timers = new Map(); // browser key -> { deadline, nagTimer }

async function isRunning(procName) {
  try {
    await pexec("/usr/bin/pgrep", ["-x", procName]);
    return true;
  } catch {
    return false;
  }
}

async function scan() {
  const { stdout } = await pexec(process.execPath, [SCAN, "--json"]);
  return JSON.parse(stdout);
}

function passes(browserResult) {
  // Require the default profile to be installed + enabled + private.
  // Unknown (null) in private counts as a fail — better to nag than miss.
  const def = browserResult.profiles?.find(p => p.isDefault) || browserResult.profiles?.[0];
  if (!def) return false;
  return def.installed === true && def.enabled === true && def.privateBrowsing === true;
}

async function notify(title, message) {
  const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`;
  try { await pexec("/usr/bin/osascript", ["-e", script]); } catch {}
}

async function quitApp(appName) {
  const script = `tell application "${appName}" to quit`;
  await pexec("/usr/bin/osascript", ["-e", script]);
}

function fmtRemaining(ms) {
  return Math.max(0, Math.ceil(ms / 1000)) + "s";
}

async function tick() {
  const scanResult = await scan();

  for (const [key, { proc, app }] of Object.entries(BROWSERS)) {
    const running = await isRunning(proc);
    const result = scanResult[key];
    const ok = result?.present && passes(result);

    if (!running) {
      clearTimer(key);
      continue;
    }

    if (ok) {
      if (timers.has(key)) {
        console.log(`[enforce] ${app} now passes — cancelling timer`);
        clearTimer(key);
        await notify("ReDD Focus", `${app} is good. Grace cancelled.`);
      }
      continue;
    }

    // Failing.
    const existing = timers.get(key);
    if (!existing) {
      const deadline = Date.now() + GRACE;
      const nagTimer = setInterval(() => {
        const left = deadline - Date.now();
        if (left <= 0) return;
        notify("ReDD Focus", `${app} will close in ${fmtRemaining(left)}. Enable extension + private browsing to stop this.`);
      }, 10_000);
      timers.set(key, { deadline, nagTimer });
      console.log(`[enforce] ${app} failed check — ${GRACE/1000}s grace started`);
      await notify("ReDD Focus", `${app} will close in ${fmtRemaining(GRACE)}. Enable extension + private browsing to stop this.`);
    } else if (Date.now() >= existing.deadline) {
      console.log(`[enforce] ${app} grace expired — quitting`);
      await notify("ReDD Focus", `Quitting ${app}.`);
      clearTimer(key);
      try { await quitApp(app); }
      catch (e) { console.warn(`[enforce] quit failed:`, e.message); }
    } else {
      console.log(`[enforce] ${app} still failing — ${fmtRemaining(existing.deadline - Date.now())} remaining`);
    }
  }
}

function clearTimer(key) {
  const t = timers.get(key);
  if (!t) return;
  clearInterval(t.nagTimer);
  timers.delete(key);
}

console.log(`[enforce] starting loop, tick=${TICK/1000}s grace=${GRACE/1000}s`);
await tick();
setInterval(tick, TICK);
