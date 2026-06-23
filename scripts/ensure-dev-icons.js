#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const root = path.join(__dirname, '..');
const svg = path.join(root, 'assets', 'reddblock-icon.svg');
const icns = path.join(root, 'src-tauri', 'icons', 'icon.icns');
const bin = path.join(root, 'src-tauri', 'target', 'debug', 'redd-block');

if (!fs.existsSync(svg)) {
  console.error(`ensure-dev-icons: missing ${svg}`);
  process.exit(1);
}

function getMtime(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch (e) {
    return 0;
  }
}

const svgMtime = getMtime(svg);
const icnsMtime = getMtime(icns);
const binMtime = getMtime(bin);

if (!fs.existsSync(icns) || svgMtime > icnsMtime) {
  console.log('ensure-dev-icons: regenerating icons from SVG…');
  const res = spawnSync('node', [path.join(root, 'scripts', 'generate-icons-from-svg.js')], {
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

// Need to update local mtimes in case icns was updated
const updatedIcnsMtime = getMtime(icns);

if (!fs.existsSync(bin) || updatedIcnsMtime > binMtime) {
  console.log('ensure-dev-icons: rebuilding debug binary for updated icon.icns…');
  const res = spawnSync('cargo', ['build', '-q'], {
    cwd: path.join(root, 'src-tauri'),
    stdio: 'inherit',
    shell: true,
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}
