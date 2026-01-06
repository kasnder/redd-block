const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '..', 'assets', 'icon.png');
const outputDir = path.join(__dirname, '..', 'assets');

// AppX assets required by Windows Store
// See: https://www.electron.build/configuration/appx#appx-assets
const netAssets = [
    { name: 'StoreLogo.png', width: 50, height: 50 },
    { name: 'Square150x150Logo.png', width: 150, height: 150 },
    { name: 'Square44x44Logo.png', width: 44, height: 44 },
    { name: 'Wide310x150Logo.png', width: 310, height: 150 },
    { name: 'Square310x310Logo.png', width: 310, height: 310 }, // Optional but good for large tiles
    { name: 'Square71x71Logo.png', width: 71, height: 71 },     // Optional small tile
];

async function generate() {
    if (!fs.existsSync(sourceIcon)) {
        console.error(`Source icon not found at ${sourceIcon}`);
        process.exit(1);
    }

    console.log(`Generating AppX assets from ${sourceIcon}...`);

    for (const asset of netAssets) {
        const outputPath = path.join(outputDir, asset.name);
        try {
            await sharp(sourceIcon)
                .resize(asset.width, asset.height, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background if possible, or could utilize specific background color
                })
                .toFile(outputPath);
            console.log(`Generated ${asset.name}`);
        } catch (error) {
            console.error(`Error generating ${asset.name}:`, error);
        }
    }

    // Also generate checking badge/splash screen assets if needed, but the main rejection was about tile icons.
    // Electron-builder usually handles generating the package "Assets" folder content from these base files if they exist in buildResources.
}

generate();
