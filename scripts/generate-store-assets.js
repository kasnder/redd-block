const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../assets');
const STORE_DIR = path.join(ASSETS_DIR, 'store');
const ICON_PATH = path.join(ASSETS_DIR, 'icons/1024x1024.png');

// Ensure store directory exists
if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
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
            blend: 'dest-in' // Use mask to cut out rounded shape
        }])
        .png()
        .toBuffer();
}

async function generateAssets() {
    const iconExists = fs.existsSync(ICON_PATH);
    if (!iconExists) {
        console.error('Source icon not found at:', ICON_PATH);
        process.exit(1);
    }

    const sourceIcon = fs.readFileSync(ICON_PATH);

    console.log('Generating store assets with TRANSPARENT background and ROUNDED corners...');

    // --- Store Display Assets (for manual upload to Partner Center) ---
    // These use transparent backgrounds.

    // 1. Poster Art (720x1080)
    const posterWidth = 720;
    const posterHeight = 1080;
    const posterIconSize = 400;
    const posterCornerRadius = Math.round(posterIconSize * 0.10); // ~10% corner radius

    try {
        const roundedIcon = await roundCornersOfIcon(sourceIcon, posterIconSize, posterCornerRadius);

        // Create transparent canvas and place icon in center
        await sharp({
            create: {
                width: posterWidth,
                height: posterHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White for poster
            }
        })
            .composite([{ input: roundedIcon, gravity: 'center' }])
            .png()
            .toFile(path.join(STORE_DIR, 'PosterArt.png'));

        console.log('Generated assets/store/PosterArt.png (White BG, Rounded Icon)');
    } catch (err) {
        console.error('Error generating PosterArt:', err);
    }

    // 2. Box Art / Store Logo (1080x1080)
    const boxWidth = 1080;
    const boxHeight = 1080;
    const boxIconSize = 600;
    const boxCornerRadius = Math.round(boxIconSize * 0.10);

    try {
        const roundedIcon = await roundCornersOfIcon(sourceIcon, boxIconSize, boxCornerRadius);

        await sharp({
            create: {
                width: boxWidth,
                height: boxHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White for box
            }
        })
            .composite([{ input: roundedIcon, gravity: 'center' }])
            .png()
            .toFile(path.join(STORE_DIR, 'BoxArt.png'));

        console.log('Generated assets/store/BoxArt.png (White BG, Rounded Icon)');
    } catch (err) {
        console.error('Error generating BoxArt:', err);
    }

    // 3. Super Hero Art (1920x1080) - 16:9
    // Appears at the top of Store listing on Windows 10 v1607+
    const heroWidth = 1920;
    const heroHeight = 1080;
    const heroIconSize = 500;
    const heroCornerRadius = Math.round(heroIconSize * 0.10);

    try {
        const roundedIcon = await roundCornersOfIcon(sourceIcon, heroIconSize, heroCornerRadius);

        await sharp({
            create: {
                width: heroWidth,
                height: heroHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
            }
        })
            .composite([{ input: roundedIcon, gravity: 'center' }])
            .png()
            .toFile(path.join(STORE_DIR, 'SuperHeroArt.png'));

        console.log('Generated assets/store/SuperHeroArt.png (White BG, 1920x1080)');
    } catch (err) {
        console.error('Error generating SuperHeroArt:', err);
    }

    // --- AppX Assets (for electron-builder to pick up automatically) ---
    // These MUST have transparent backgrounds, so the store renders them correctly.
    console.log('Generating AppX specific assets in assets/store/ (TRANSPARENT)...');

    const appxAssets = [
        { name: 'Square150x150Logo.png', size: 150 },
        { name: 'Square44x44Logo.png', size: 44 },
        { name: 'Wide310x150Logo.png', width: 310, height: 150 },
        { name: 'StoreLogo.png', size: 50 },
        { name: 'Square71x71Logo.png', size: 71 },
        { name: 'Square310x310Logo.png', size: 310 }
    ];

    for (const asset of appxAssets) {
        try {
            const width = asset.width || asset.size;
            const height = asset.height || asset.size;

            // Icon size roughly 80% of the smaller dimension to give padding
            const iconSize = Math.round(Math.min(width, height) * 0.80);
            const cornerRadius = Math.round(iconSize * 0.10);

            const roundedIcon = await roundCornersOfIcon(sourceIcon, iconSize, cornerRadius);

            // Transparent background
            await sharp({
                create: {
                    width: width,
                    height: height,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Fully transparent
                }
            })
                .composite([{ input: roundedIcon, gravity: 'center' }])
                .png()
                .toFile(path.join(STORE_DIR, asset.name));

            console.log(`Generated assets/${asset.name} (Transparent)`);
        } catch (err) {
            console.error(`Error generating ${asset.name}:`, err);
        }
    }

    // --- Manual Store Display Tiles (also transparent for consistency) ---
    const manualTiles = [
        { size: 300, name: 'SmallLogo300x300.png' },
        { size: 150, name: 'SmallLogo150x150.png' },
        { size: 71, name: 'SmallLogo71x71.png' }
    ];

    for (const tile of manualTiles) {
        try {
            const iconSize = Math.round(tile.size * 0.80);
            const cornerRadius = Math.round(iconSize * 0.10);
            const roundedIcon = await roundCornersOfIcon(sourceIcon, iconSize, cornerRadius);

            // Transparent background
            await sharp({
                create: {
                    width: tile.size,
                    height: tile.size,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
            })
                .composite([{ input: roundedIcon, gravity: 'center' }])
                .png()
                .toFile(path.join(STORE_DIR, tile.name));

            console.log(`Generated assets/store/${tile.name} (Transparent)`);
        } catch (err) {
            console.error(`Error generating manual tile ${tile.name}:`, err);
        }
    }

    console.log('\\nDone! Remember to rebuild your app with `npm run build:win`.');
}

generateAssets();
