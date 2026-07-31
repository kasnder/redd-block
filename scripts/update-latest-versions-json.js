#!/usr/bin/env node
/**
 * Update docs/latest-versions.json with platform versions and installer checksums.
 *
 * Usage:
 *   node scripts/update-latest-versions-json.js --version 3.4.3
 *   node scripts/update-latest-versions-json.js --version 3.4.3 --macos-pkg ./for-distribution/Digital-Habits-Blocker-3.4.3.pkg
 *   node scripts/update-latest-versions-json.js --macos-pkg-sha256 abc123...
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'docs', 'latest-versions.json');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--version') {
            out.version = argv[++i];
        } else if (arg === '--macos-pkg') {
            out.macosPkgPath = argv[++i];
        } else if (arg === '--macos-pkg-sha256') {
            out.macosPkgSha256 = argv[++i];
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return out;
}

function sha256File(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function main() {
    const args = parseArgs(process.argv);
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

    if (args.version) {
        manifest.macos = args.version;
        manifest.windows = args.version;
        manifest.ios = args.version;
    }

    let macosPkgSha256 = args.macosPkgSha256;
    if (args.macosPkgPath) {
        if (!fs.existsSync(args.macosPkgPath)) {
            throw new Error(`macOS pkg not found: ${args.macosPkgPath}`);
        }
        macosPkgSha256 = sha256File(args.macosPkgPath);
        manifest.sizeBytes = manifest.sizeBytes || {};
        manifest.sizeBytes.macosPkg = fs.statSync(args.macosPkgPath).size;
    }

    if (macosPkgSha256) {
        manifest.sha256 = manifest.sha256 || {};
        manifest.sha256.macosPkg = String(macosPkgSha256).trim().toLowerCase();
    }

    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 4)}\n`);
    console.log(`Updated ${path.relative(ROOT, MANIFEST_PATH)}`);
    console.log(JSON.stringify(manifest, null, 4));
}

main();
