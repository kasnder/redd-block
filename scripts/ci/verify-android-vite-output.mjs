#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distRoot = path.join(repoRoot, 'dist');
const prunableAssetPattern = /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i;

const desktopOnlyElementIds = [
    'window-controls',
    'update-banner',
    'app-blocking-closedown-banner',
    'behaviour-change-banner',
    'welcome-demo-panel',
    'fda-onboarding',
    'migration-onboarding',
    'ios-screentime-onboarding',
    'schedule-overlay-customise-modal',
    'schedule-overlay-discard-modal',
    'schedule-overlay-delete-modal',
    'settings-enforcement-panel',
    'uninstall-confirm-modal',
    'mac-automation-intro-modal',
    'app-blocking-warning-overlay',
];

// These imports are desktop/iOS-only and must not leak into the Android
// bundle. Keep this list tied to the static assets, not implementation names,
// so the check remains valid when the source modules are reorganized.
const desktopOnlyAssetStems = [
    'reddblock-video-',
    'automation-settings-',
    'enable-fda-',
    'mac-extension-settings-',
    'toggle-chrome-incognito-windows-',
    'toggle-edge-incognito-windows-',
    'toggle-firefox-private-windows-',
];

function walk(directory) {
    const files = [];
    for (const entry of readdirSync(directory)) {
        const file = path.join(directory, entry);
        if (statSync(file).isDirectory()) files.push(...walk(file));
        else files.push(file);
    }
    return files;
}

function fail(message) {
    console.error(`[verify:android-bundle] ${message}`);
    process.exitCode = 1;
}

const outputFiles = walk(distRoot);
const textFiles = outputFiles.filter((file) => /\.(html|js|css|svg|woff2)$/i.test(file));
const emittedText = textFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const indexHtml = readFileSync(path.join(distRoot, 'index.html'), 'utf8');
const assets = outputFiles.filter((file) => file.includes(`${path.sep}assets${path.sep}`));
const prunableAssets = assets.filter((file) => prunableAssetPattern.test(file));

if (prunableAssets.length === 0) {
    fail('expected at least one runtime image asset, but none were emitted');
}

for (const file of prunableAssets) {
    const basename = path.basename(file);
    if (!emittedText.includes(basename)) {
        fail(`emitted asset is not referenced by the Android bundle: ${basename}`);
    }
}

for (const file of prunableAssets) {
    const basename = path.basename(file);
    if (desktopOnlyAssetStems.some((stem) => basename.startsWith(stem))) {
        fail(`desktop-only asset leaked into Android output: ${basename}`);
    }
}

for (const id of desktopOnlyElementIds) {
    if (indexHtml.includes(`id="${id}"`) || indexHtml.includes(`id='${id}'`)) {
        fail(`desktop-only element remained in Android index.html: #${id}`);
    }
}

const snoozeAsset = prunableAssets.find((file) => path.basename(file).startsWith('snooze-'));
if (!snoozeAsset) {
    fail('the Android snooze asset was pruned even though Android uses it');
} else if (!emittedText.includes(path.basename(snoozeAsset))) {
    fail(`the Android snooze asset is not referenced: ${path.basename(snoozeAsset)}`);
}

if (process.exitCode) process.exit(1);
console.log(`[verify:android-bundle] checked ${prunableAssets.length} runtime asset(s); desktop-only UI and media are absent`);
