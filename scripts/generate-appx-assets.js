/**
 * Generate Windows APPX tile assets from the source icon
 * Run with: node scripts/generate-appx-assets.js
 * 
 * These are required for the Windows Store APPX package build.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets');
const APPX_DIR = path.join(ASSETS_DIR, 'appx');
const ICON_PATH = path.join(ASSETS_DIR, 'icons/1024x1024.png');

// Ensure appx directory exists
if (!fs.existsSync(APPX_DIR)) {
    fs.mkdirSync(APPX_DIR, { recursive: true });
}

// Helper: Create a rounded corners mask SVG
function getRoundedMaskSvg(size, cornerRadius) {
    return `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
  </svg>`;
}

// Helper: Round corners of an icon buffer
async function roundCornersOfIcon(iconBuffer, size, cornerRadius) {
    const mask = Buffer.from(getRoundedMaskSvg(size, cornerRadius));

    // Resize icon first
    const resizedIcon = await sharp(iconBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    // Apply rounded mask
    return sharp(resizedIcon)
        .composite([{
            input: mask,
            blend: 'dest-in'
        }])
        .png()
        .toBuffer();
}

// Helper: Generate a tile with transparent background and centered icon
async function generateTile(sourceIcon, width, height, outputName) {
    const iconSize = Math.round(Math.min(width, height) * 0.80);
    const cornerRadius = Math.round(iconSize * 0.10);
    const roundedIcon = await roundCornersOfIcon(sourceIcon, iconSize, cornerRadius);

    await sharp({
        create: {
            width: width,
            height: height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    })
        .composite([{ input: roundedIcon, gravity: 'center' }])
        .png()
        .toFile(path.join(APPX_DIR, outputName));

    console.log(`✓ Generated ${outputName}`);
}

async function generateAppxAssets() {
    if (!fs.existsSync(ICON_PATH)) {
        console.error('Source icon not found at:', ICON_PATH);
        console.error('Run "node scripts/generate-icons-from-svg.js" first.');
        process.exit(1);
    }

    const sourceIcon = fs.readFileSync(ICON_PATH);
    console.log('Generating Windows APPX tile assets...\n');

    // APPX requires specific tile sizes at multiple scale factors
    const tiles = [
        // Square44x44Logo (small icon) - scales: 100, 200, 400
        { base: 44, scales: [100, 200, 400], name: 'Square44x44Logo' },
        // Square150x150Logo (medium tile) - scales: 100, 200, 400
        { base: 150, scales: [100, 200, 400], name: 'Square150x150Logo' },
        // Wide310x150Logo (wide tile) - scales: 100, 200, 400
        { base: { w: 310, h: 150 }, scales: [100, 200, 400], name: 'Wide310x150Logo' },
        // SmallTile (Square71x71) - scales: 100, 200, 400
        { base: 71, scales: [100, 200, 400], name: 'SmallTile' },
        // LargeTile (Square310x310) - scales: 100, 200, 400
        { base: 310, scales: [100, 200, 400], name: 'LargeTile' },
        // StoreLogo - scales: 100, 200, 400
        { base: 50, scales: [100, 200, 400], name: 'StoreLogo' },
    ];

    // Generate scaled tiles
    for (const tile of tiles) {
        for (const scale of tile.scales) {
            const scaleFactor = scale / 100;
            let width, height;

            if (typeof tile.base === 'object') {
                width = Math.round(tile.base.w * scaleFactor);
                height = Math.round(tile.base.h * scaleFactor);
            } else {
                width = height = Math.round(tile.base * scaleFactor);
            }

            const outputName = `${tile.name}.scale-${scale}.png`;
            await generateTile(sourceIcon, width, height, outputName);
        }
    }

    // Target size variants for Square44x44Logo (taskbar, etc.)
    const targetSizes = [16, 24, 32, 48, 256];
    for (const size of targetSizes) {
        const outputName = `Square44x44Logo.targetsize-${size}.png`;
        await generateTile(sourceIcon, size, size, outputName);

        // Also generate unplated versions (same content for now)
        const unplatedName = `Square44x44Logo.targetsize-${size}_altform-unplated.png`;
        await generateTile(sourceIcon, size, size, unplatedName);
    }

    console.log('\n✓ All APPX assets generated in assets/appx/');
}

generateAppxAssets().catch(console.error);
