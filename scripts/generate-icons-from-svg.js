/**
 * Generate all app icons from assets/fristed-icon.svg
 * Run with: node scripts/generate-icons-from-svg.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SVG_PATH = path.join(__dirname, '../assets/fristed-icon.svg');
const ASSETS_DIR = path.join(__dirname, '../assets');
const ICONS_DIR = path.join(ASSETS_DIR, 'icons');
const SRC_SVG_PATH = path.join(__dirname, '../src/fristed-icon.svg');
const BLOCKED_SVG_PATH = path.join(__dirname, '../src-tauri/blocked/fristed-icon.svg');

function syncFristedIconCopies() {
    if (!fs.existsSync(SVG_PATH)) {
        console.error('SVG not found at:', SVG_PATH);
        process.exit(1);
    }

    fs.copyFileSync(SVG_PATH, SRC_SVG_PATH);
    console.log('✓ Synced src/fristed-icon.svg');

    fs.mkdirSync(path.dirname(BLOCKED_SVG_PATH), { recursive: true });
    fs.copyFileSync(SVG_PATH, BLOCKED_SVG_PATH);
    console.log('✓ Synced src-tauri/blocked/fristed-icon.svg');
}

// Icon sizes needed for various platforms
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function generatePngIcons() {
    console.log('=== Generating PNG icons from SVG ===');

    if (!fs.existsSync(SVG_PATH)) {
        console.error('SVG not found at:', SVG_PATH);
        process.exit(1);
    }

    // Ensure icons directory exists
    if (!fs.existsSync(ICONS_DIR)) {
        fs.mkdirSync(ICONS_DIR, { recursive: true });
    }

    const svgBuffer = fs.readFileSync(SVG_PATH);

    // Generate each size
    for (const size of ICON_SIZES) {
        const outputPath = path.join(ICONS_DIR, `${size}x${size}.png`);
        try {
            await sharp(svgBuffer)
                .resize(size, size, { fit: 'contain' })
                .png()
                .toFile(outputPath);
            console.log(`✓ Generated ${size}x${size}.png`);
        } catch (err) {
            console.error(`✗ Error generating ${size}x${size}.png:`, err);
        }
    }

    // Also generate the main icon.png (1024x1024) in assets root
    const mainIconPath = path.join(ASSETS_DIR, 'icon.png');
    try {
        await sharp(svgBuffer)
            .resize(1024, 1024, { fit: 'contain' })
            .png()
            .toFile(mainIconPath);
        console.log('✓ Generated assets/icon.png (1024x1024)');
    } catch (err) {
        console.error('✗ Error generating icon.png:', err);
    }

    // Generate src/images/icon.png as well
    const srcImagesDir = path.join(__dirname, '../src/images');
    if (!fs.existsSync(srcImagesDir)) {
        fs.mkdirSync(srcImagesDir, { recursive: true });
    }
    const srcIconPath = path.join(srcImagesDir, 'icon.png');
    try {
        await sharp(svgBuffer)
            .resize(256, 256, { fit: 'contain' })
            .png()
            .toFile(srcIconPath);
        console.log('✓ Generated src/images/icon.png (256x256)');
    } catch (err) {
        console.error('✗ Error generating src/images/icon.png:', err);
    }
}

async function generateIco() {
    console.log('\n=== Generating ICO file ===');

    const sourceIcon = path.join(ICONS_DIR, '256x256.png');

    if (!fs.existsSync(sourceIcon)) {
        console.error('256x256.png not found, cannot generate ICO');
        return;
    }

    try {
        // Use dynamic import for ES module
        const pngToIcoModule = await import('png-to-ico');
        const pngToIco = pngToIcoModule.default;

        // Use multiple sizes for better quality ICO
        const iconSizes = [16, 24, 32, 48, 64, 128, 256].map(size =>
            path.join(ICONS_DIR, `${size}x${size}.png`)
        ).filter(p => fs.existsSync(p));

        const icoBuffer = await pngToIco(iconSizes);

        // Write to both locations
        fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), icoBuffer);
        fs.writeFileSync(path.join(ASSETS_DIR, 'icon.ico'), icoBuffer);

        console.log('✓ Generated icon.ico');
    } catch (err) {
        console.error('✗ Error generating ICO:', err);
    }
}

async function generateIcns() {
    console.log('\n=== Generating ICNS file (macOS) ===');

    // electron-icon-builder can generate ICNS from PNG
    const source1024 = path.join(ICONS_DIR, '1024x1024.png');

    if (!fs.existsSync(source1024)) {
        console.error('1024x1024.png not found, cannot generate ICNS');
        return;
    }

    try {
        // Use iconutil on macOS to create .icns
        const iconsetDir = path.join(ICONS_DIR, 'icon.iconset');

        // Create iconset directory
        if (!fs.existsSync(iconsetDir)) {
            fs.mkdirSync(iconsetDir);
        }

        // Generate all required sizes for iconset
        const icnsRequiredSizes = [
            { size: 16, scale: 1, name: 'icon_16x16.png' },
            { size: 16, scale: 2, name: 'icon_16x16@2x.png' },
            { size: 32, scale: 1, name: 'icon_32x32.png' },
            { size: 32, scale: 2, name: 'icon_32x32@2x.png' },
            { size: 128, scale: 1, name: 'icon_128x128.png' },
            { size: 128, scale: 2, name: 'icon_128x128@2x.png' },
            { size: 256, scale: 1, name: 'icon_256x256.png' },
            { size: 256, scale: 2, name: 'icon_256x256@2x.png' },
            { size: 512, scale: 1, name: 'icon_512x512.png' },
            { size: 512, scale: 2, name: 'icon_512x512@2x.png' },
        ];

        const svgBuffer = fs.readFileSync(SVG_PATH);

        for (const entry of icnsRequiredSizes) {
            const actualSize = entry.size * entry.scale;
            await sharp(svgBuffer)
                .resize(actualSize, actualSize, { fit: 'contain' })
                .png()
                .toFile(path.join(iconsetDir, entry.name));
        }

        // Run iconutil to create .icns
        execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(ICONS_DIR, 'icon.icns')}"`);

        // Clean up iconset directory
        fs.rmSync(iconsetDir, { recursive: true });

        console.log('✓ Generated icon.icns');
    } catch (err) {
        console.error('✗ Error generating ICNS:', err);
        console.error('  (This is only possible on macOS)');
    }
}

async function main() {
    console.log('Starting icon generation from:', SVG_PATH);
    console.log('');

    syncFristedIconCopies();
    console.log('');

    await generatePngIcons();
    await generateIco();
    await generateIcns();

    console.log('\n=== Icon generation complete ===');
    console.log('');
    console.log('Now run the store assets generator:');
    console.log('  node scripts/generate-store-assets.js');
}

main().catch(console.error);
