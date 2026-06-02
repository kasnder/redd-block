#!/usr/bin/env node
/**
 * Run the Tauri CLI with repo-root .env loaded (Windows signing needs AZURE_*).
 * Usage: node scripts/run-tauri.js build --target x86_64-pc-windows-msvc ...
 */
const { spawnSync } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const repoRoot = path.join(__dirname, '..');
const args = ['tauri', ...process.argv.slice(2)];
const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(cmd, args, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status === null ? 1 : result.status);
