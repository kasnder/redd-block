#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertProductionBrowserCompatible,
  assertProductionSafe,
  assertSafeSystemTestPath,
  dataFileFor,
  defaultSystemTestPaths,
  ensureMac,
} from './system-test-common.mjs';

ensureMac();
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const paths = defaultSystemTestPaths(process.env);
assertSafeSystemTestPath(paths, paths.dataDir, 'SYSTEM_TEST_DATA_DIR');
assertSafeSystemTestPath(paths, paths.profileDir, 'SYSTEM_TEST_PROFILE_DIR');
assertSafeSystemTestPath(paths, paths.artifactsDir, 'SYSTEM_TEST_ARTIFACTS_DIR');

if (!existsSync(paths.appPath)) {
  throw new Error(`System-test app is missing: ${paths.appPath}. Run pnpm build:system:mac first.`);
}

const defaultBrowserSuitesSelected = !process.env.SYSTEM_TEST_SPEC?.trim()
  && process.env.SYSTEM_TEST_NO_SPEC !== '1'
  && process.env.SYSTEM_TEST_SKIP_BROWSERS !== '1';
const defaultAppWatcherSelected = !process.env.SYSTEM_TEST_SPEC?.trim()
  && process.env.SYSTEM_TEST_NO_SPEC !== '1'
  && process.env.SYSTEM_TEST_SKIP_APP_WATCHER !== '1';
if (defaultBrowserSuitesSelected) {
  for (const name of ['SYSTEM_TEST_URL', 'SYSTEM_TEST_ALLOWED_URL', 'SYSTEM_TEST_OUTSIDE_URL']) {
    const value = process.env[name];
    if (value && !new URL(value).hostname.endsWith('.invalid')) {
      throw new Error(`${name} must use a reserved .invalid host in browser system tests`);
    }
  }
}
if (defaultAppWatcherSelected) {
  assertProductionSafe(process.env);
} else if (defaultBrowserSuitesSelected) {
  assertProductionBrowserCompatible([
    'redd-block-system-test.invalid',
    'redd-block-allowed-system-test.invalid',
    'redd-block-outside-system-test.invalid',
  ], process.env);
}

const staleTestApps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).stdout
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.includes(`${paths.appPath}/Contents/MacOS/`));
if (staleTestApps.length > 0) {
  throw new Error(`A stale system-test app is already running: ${staleTestApps.join('; ')}`);
}

rmSync(paths.dataDir, { recursive: true, force: true });
rmSync(paths.profileDir, { recursive: true, force: true });
mkdirSync(paths.dataDir, { recursive: true });
mkdirSync(paths.profileDir, { recursive: true });
mkdirSync(paths.artifactsDir, { recursive: true });

const dataFile = dataFileFor(paths);
writeFileSync(dataFile, `${JSON.stringify({
  blocklists: [],
  activeBlocks: [],
  schedules: [],
  settings: {
    onboardingComplete: true,
    welcomeOnboardingShown: true,
    digitalHabitsRebrandNoticeShown: true,
    macAutomationIntroShown: true,
    eulaAcceptedRevision: 1,
    eulaAcceptedAt: Date.now(),
  },
}, null, 2)}\n`);
const appEnvironment = {
  ...process.env,
  REDD_BLOCK_SYSTEM_TEST_DATA_PATH: dataFile,
  TAURI_WEBDRIVER_PORT: process.env.SYSTEM_TEST_WEBDRIVER_PORT || '4445',
  SYSTEM_TEST_APP: paths.appPath,
  SYSTEM_TEST_DATA_DIR: paths.dataDir,
  SYSTEM_TEST_PROFILE_DIR: paths.profileDir,
  SYSTEM_TEST_ARTIFACTS_DIR: paths.artifactsDir,
  SYSTEM_TEST_BRAVE_PORT: String(paths.bravePort),
  SYSTEM_TEST_RUNNER: '1',
};

let appChild = null;
let appPid = null;

function appExecutable(appPath) {
  const macosDir = path.join(appPath, 'Contents', 'MacOS');
  const candidates = readdirSync(macosDir)
    .map((name) => path.join(macosDir, name))
    .filter((candidate) => statSync(candidate).isFile());
  const preferred = candidates.find((candidate) => path.basename(candidate) === 'redd-block');
  if (preferred) return preferred;
  if (candidates.length === 1) return candidates[0];
  throw new Error(`Could not identify the system-test executable in ${macosDir}`);
}

function appIsAlive(pid) {
  if (!pid || !Number.isInteger(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForAppExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (appIsAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return !appIsAlive(pid);
}

function launchApp() {
  const executable = appExecutable(paths.appPath);
  const logFd = openSync(path.join(paths.artifactsDir, `app-${Date.now()}.log`), 'a');
  try {
    appChild = spawn(executable, [], {
      cwd: repoRoot,
      env: appEnvironment,
      detached: false,
      stdio: ['ignore', logFd, logFd],
    });
  } finally {
    closeSync(logFd);
  }
  appPid = appChild.pid;
  if (!appPid) throw new Error('The system-test app did not provide a PID when launched.');
  appEnvironment.SYSTEM_TEST_APP_PID = String(appPid);
  process.env.SYSTEM_TEST_APP_PID = String(appPid);
  console.log(`[system-test] launched app PID ${appPid}`);
  return appChild;
}

async function killExactAppPid() {
  const pid = appPid;
  if (!pid) return;
  if (appIsAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') console.warn(`[system-test] failed to kill app PID ${pid}: ${error.message}`);
    }
  }
  if (!(await waitForAppExit(pid))) {
    throw new Error(`System-test app PID ${pid} did not exit after SIGKILL.`);
  }
  console.log(`[system-test] cleaned app PID ${pid}`);
  appPid = null;
}

async function restartApp() {
  await killExactAppPid();
  launchApp();
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  return appPid;
}

async function runExternalSpec(command) {
  const child = spawn('/bin/sh', ['-c', command], {
    cwd: repoRoot,
    env: appEnvironment,
    stdio: 'inherit',
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`SYSTEM_TEST_SPEC failed (${signal || `exit ${code}`})`));
    });
  });
}

async function importIfPresent(...relativePaths) {
  for (const relativePath of relativePaths) {
    const absolute = path.join(repoRoot, relativePath);
    if (existsSync(absolute)) return import(pathToFileURL(absolute).href);
  }
  return null;
}

async function runDefaultSpecs() {
  if (process.env.SYSTEM_TEST_NO_SPEC === '1') {
    console.log('[system-test] SYSTEM_TEST_NO_SPEC=1: lifecycle smoke only');
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    return;
  }

  const options = {
    appPath: paths.appPath,
    appPid,
    dataDir: paths.dataDir,
    dataFile,
    profileDir: paths.profileDir,
    artifactsDir: paths.artifactsDir,
    bravePort: paths.bravePort,
    restartApp,
  };
  let ran = false;
  const testedBrowsers = [];
  if (process.env.SYSTEM_TEST_SKIP_BROWSERS !== '1') {
    const safari = await importIfPresent('e2e/system/safari-system.js');
    if (!safari || typeof safari.runSafariSystemSuite !== 'function') {
      throw new Error('Safari system spec is missing: e2e/system/safari-system.js');
    }
    const safariResult = await safari.runSafariSystemSuite(options);
    if (safariResult?.tested) testedBrowsers.push('Safari');

    const braveInstalled = existsSync(
      process.env.SYSTEM_TEST_BRAVE_BINARY
        || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    );
    if (braveInstalled) {
      const brave = await importIfPresent('e2e/system/brave-system.mjs', 'e2e/system/brave-system.js');
      if (!brave) throw new Error('Brave system spec is missing: e2e/system/brave-system.mjs');
      const run = brave.runBraveSystemSuite || brave.default;
      if (typeof run !== 'function') throw new Error('Brave system spec must export runBraveSystemSuite(options).');
      await run(options);
      testedBrowsers.push('Brave');
    }
    if (testedBrowsers.length === 0) {
      throw new Error('Browser system tests did not exercise any real browser.');
    }
    console.log(`[system-test] real browser coverage: ${testedBrowsers.join(', ')}`);
    ran = true;
  }
  if (process.env.SYSTEM_TEST_SKIP_APP_WATCHER !== '1') {
    const appWatcher = await importIfPresent(
      'e2e/system/app-watcher-system.mjs',
      'e2e/system/app-watcher-system.js',
    );
    if (!appWatcher) throw new Error('App watcher system spec is missing: e2e/system/app-watcher-system.mjs');
    const run = appWatcher.runAppWatcherSystemSuite
      || appWatcher.runAppWatcherSuite
      || appWatcher.default;
    if (typeof run !== 'function') throw new Error('App watcher system spec has no supported runner export.');
    await run(options);
    ran = true;
  }
  if (!ran) throw new Error('No system-test suites selected.');
}

let exitCode = 0;
try {
  launchApp();
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  if (process.env.SYSTEM_TEST_SPEC?.trim()) await runExternalSpec(process.env.SYSTEM_TEST_SPEC.trim());
  else await runDefaultSpecs();
  console.log('[system-test] completed');
} catch (error) {
  exitCode = 1;
  console.error(`[system-test] failed: ${error.stack || error.message}`);
} finally {
  try {
    await killExactAppPid();
  } catch (error) {
    exitCode = 1;
    console.error(`[system-test] cleanup failed: ${error.message}`);
  }
  rmSync(paths.dataDir, { recursive: true, force: true });
  rmSync(paths.profileDir, { recursive: true, force: true });
  console.log(`[system-test] artifacts retained at ${paths.artifactsDir}`);
}
process.exit(exitCode);
