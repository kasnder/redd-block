#!/usr/bin/env node
/**
 * Pre-dev script that ensures the helper binary exists before running the app.
 * Attempts to compile if missing, with helpful error messages.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Project root is one level up from scripts/
const PROJECT_ROOT = path.join(__dirname, '..');
const HELPER_DIR = path.join(PROJECT_ROOT, 'helper', 'dist');
const ARM64_BINARY = path.join(HELPER_DIR, 'redd-block-helper-arm64');
const X64_BINARY = path.join(HELPER_DIR, 'redd-block-helper-x64');
const UNIVERSAL_BINARY = path.join(HELPER_DIR, 'redd-block-helper');

// Determine current architecture
const arch = process.arch; // 'arm64' or 'x64'
const neededBinary = arch === 'arm64' ? ARM64_BINARY : X64_BINARY;

console.log(`\n🔍 Checking for helper binary (${arch})...`);

// Check if helper binaries exist
const hasNeededBinary = fs.existsSync(neededBinary);
const hasUniversal = fs.existsSync(UNIVERSAL_BINARY);

if (hasNeededBinary || hasUniversal) {
    console.log('✅ Helper binary found. Starting app...\n');
    process.exit(0);
}

console.log('⚠️  Helper binary not found. Attempting to compile...\n');

// Ensure dist directory exists
if (!fs.existsSync(HELPER_DIR)) {
    fs.mkdirSync(HELPER_DIR, { recursive: true });
}

// Try to compile the helper
try {
    console.log('📦 Compiling helper binary with pkg...');

    // Compile for current architecture only (faster)
    const target = arch === 'arm64' ? 'node18-macos-arm64' : 'node18-macos-x64';
    const output = arch === 'arm64' ? ARM64_BINARY : X64_BINARY;

    execSync(`npx pkg helper/redd-block-helper.js -t ${target} -o "${output}"`, {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
    });

    // Also create the universal binary (just copy for now, lipo if both exist)
    if (arch === 'arm64' && fs.existsSync(X64_BINARY)) {
        execSync(`lipo -create -output "${UNIVERSAL_BINARY}" "${ARM64_BINARY}" "${X64_BINARY}"`, { cwd: __dirname });
    } else if (arch === 'x64' && fs.existsSync(ARM64_BINARY)) {
        execSync(`lipo -create -output "${UNIVERSAL_BINARY}" "${ARM64_BINARY}" "${X64_BINARY}"`, { cwd: __dirname });
    } else {
        // Just copy the single-arch binary as universal for now
        fs.copyFileSync(output, UNIVERSAL_BINARY);
    }

    console.log('\n✅ Helper compiled successfully! Starting app...\n');
    process.exit(0);

} catch (error) {
    console.error('\n❌ Failed to compile helper binary.\n');

    // Check for common issues
    if (error.message && error.message.includes('-86')) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('🍎 It looks like you need to install Rosetta 2.');
        console.error('');
        console.error('   Run this command in your terminal:');
        console.error('');
        console.error('   softwareupdate --install-rosetta');
        console.error('');
        console.error('   Then try again: npm run dev');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else if (error.message && error.message.includes('ENOENT')) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('📦 The pkg tool might not be installed.');
        console.error('');
        console.error('   Try running: npm install');
        console.error('   Then try again: npm run dev');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } else {
        console.error('Error details:', error.message);
        console.error('');
        console.error('Try running manually: npm run compile:helper');
    }

    process.exit(1);
}
