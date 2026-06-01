#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const targetTriple = process.argv[2] || 'x86_64-pc-windows-msvc';
const targetDir = path.join(repoRoot, 'for-distribution', targetTriple);

const STORE_EXTENSIONS = [
  '.msix',
  '.msixbundle',
  '.msixupload',
  '.appx',
  '.appxbundle',
  '.appxupload',
];

function listFilesRecursively(rootDir) {
  const files = [];
  function walk(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current)) {
      const full = path.join(current, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  }
  walk(rootDir);
  return files;
}

if (!fs.existsSync(targetDir)) {
  console.error(`[build:win-store] Missing distribution directory: ${targetDir}`);
  process.exit(1);
}

const files = listFilesRecursively(targetDir);
const storePackages = files.filter((filePath) =>
  STORE_EXTENSIONS.some((ext) => filePath.toLowerCase().endsWith(ext))
);

if (storePackages.length === 0) {
  console.error(
    '[build:win-store] No Microsoft Store package found (.msix / .msixupload, etc.).\n' +
      'Ensure scripts/build-msix.ps1 ran successfully after the Tauri build.'
  );
  process.exit(1);
}

console.log('[build:win-store] Microsoft Store package(s) found:');
storePackages.forEach((artifact) => {
  console.log(`  - ${path.relative(repoRoot, artifact)}`);
});
