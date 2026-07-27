#!/usr/bin/env node
/**
 * Stamp the app version (and optional build number) into every iOS file that
 * hardcodes it. The Xcode project under src-tauri/gen/apple is committed and
 * NOT regenerated on build, so bump-version.sh and CI must sync it explicitly:
 *
 *   - src-tauri/tauri.ios.conf.json                       version
 *   - src-tauri/gen/apple/project.yml                     CFBundleShortVersionString,
 *                                                         CFBundleVersion,
 *                                                         MARKETING_VERSION,
 *                                                         CURRENT_PROJECT_VERSION
 *   - src-tauri/gen/apple/redd-block.xcodeproj/project.pbxproj
 *                                                         MARKETING_VERSION,
 *                                                         CURRENT_PROJECT_VERSION
 *   - src-tauri/gen/apple/redd-block_iOS/Info.plist       CFBundleShortVersionString,
 *   - src-tauri/gen/apple/ReddBlockMonitor/Info.plist     CFBundleVersion
 *   - src-tauri/gen/apple/ReddBlockShield/Info.plist
 *
 * Usage:
 *   node scripts/sync-ios-version.mjs                         # version from package.json, build = version
 *   node scripts/sync-ios-version.mjs --version 3.8.5
 *   node scripts/sync-ios-version.mjs --build-number 3.8.5.1  # re-upload after a failed App Store run
 *
 * App Store Connect requires a unique (version, build) pair per upload; pass
 * --build-number only when re-uploading the SAME version after a binary with
 * the default build number was already ingested.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = arg('--version') || pkg.version;
const build = arg('--build-number') || version;

if (!/^\d+(\.\d+)*$/.test(version) || !/^\d+(\.\d+)*$/.test(build)) {
  console.error(`Invalid version (${version}) or build number (${build}) — digits and dots only.`);
  process.exit(1);
}

let failures = 0;

function edit(relPath, replacers) {
  const filePath = path.join(root, relPath);
  let text = fs.readFileSync(filePath, 'utf8');
  for (const [pattern, replacement, label] of replacers) {
    const next = text.replace(pattern, replacement);
    if (next === text && !pattern.test(text)) {
      console.error(`WARN: ${relPath}: no match for ${label}`);
      failures += 1;
    }
    text = next;
  }
  fs.writeFileSync(filePath, text, 'utf8');
  console.log(`Stamped ${relPath}`);
}

// Info.plist: replace the <string> that follows the version keys.
const plistReplacers = [
  [
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/g,
    `$1${version}$2`,
    'CFBundleShortVersionString',
  ],
  [
    /(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/g,
    `$1${build}$2`,
    'CFBundleVersion',
  ],
];

edit('src-tauri/tauri.ios.conf.json', [
  [/("version":\s*")[^"]*(")/, `$1${version}$2`, 'version'],
]);

edit('src-tauri/gen/apple/project.yml', [
  [/(CFBundleShortVersionString:\s*"?)[\d.]+("?)/g, `$1${version}$2`, 'CFBundleShortVersionString'],
  [/(CFBundleVersion:\s*"?)[\d.]+("?)/g, `$1${build}$2`, 'CFBundleVersion'],
  [/(MARKETING_VERSION:\s*"?)[\d.]+("?)/g, `$1${version}$2`, 'MARKETING_VERSION'],
  [/(CURRENT_PROJECT_VERSION:\s*"?)[\d.]+("?)/g, `$1${build}$2`, 'CURRENT_PROJECT_VERSION'],
]);

edit('src-tauri/gen/apple/redd-block.xcodeproj/project.pbxproj', [
  [/(MARKETING_VERSION = )[\d.]+(;)/g, `$1${version}$2`, 'MARKETING_VERSION'],
  [/(CURRENT_PROJECT_VERSION = )[\d.]+(;)/g, `$1${build}$2`, 'CURRENT_PROJECT_VERSION'],
]);

edit('src-tauri/gen/apple/redd-block_iOS/Info.plist', plistReplacers);
edit('src-tauri/gen/apple/ReddBlockMonitor/Info.plist', plistReplacers);
edit('src-tauri/gen/apple/ReddBlockShield/Info.plist', plistReplacers);

if (failures > 0) {
  console.error(`\n${failures} pattern(s) did not match — check the files above.`);
  process.exit(1);
}

console.log(`\niOS version stamped: ${version} (build ${build})`);
