const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '..', 'assets', 'icon.png');
const outputDir = path.join(__dirname, '..', 'assets', 'appx');

// Scale factors required by Microsoft Store
const SCALES = [100, 200, 400];

// AppX assets required by Windows Store with their BASE dimensions (scale-100)
// See: https://www.electron.build/appx#appx-assets
// See: https://learn.microsoft.com/en-us/windows/uwp/app-resources/images-tailored-for-scale-theme-contrast
const baseAssets = [
    { name: 'StoreLogo', width: 50, height: 50 },
    { name: 'Square150x150Logo', width: 150, height: 150 },
    { name: 'Square44x44Logo', width: 44, height: 44 },
    { name: 'Wide310x150Logo', width: 310, height: 150 },
    { name: 'LargeTile', width: 310, height: 310 },      // Square310x310Logo
    { name: 'SmallTile', width: 71, height: 71 },        // Square71x71Logo
];

// Additional targetsize assets for Square44x44Logo (used in taskbar, start menu, etc.)
const targetSizes = [16, 24, 32, 48, 256];

async function generate() {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(sourceIcon)) {
        console.error(`Source icon not found at ${sourceIcon}`);
        process.exit(1);
    }

    console.log(`Generating AppX assets from ${sourceIcon}...`);
    console.log(`Output directory: ${outputDir}\n`);

    // Generate scaled versions for each base asset
    for (const asset of baseAssets) {
        for (const scale of SCALES) {
            const scaledWidth = Math.round(asset.width * scale / 100);
            const scaledHeight = Math.round(asset.height * scale / 100);
            const filename = `${asset.name}.scale-${scale}.png`;
            const outputPath = path.join(outputDir, filename);

            try {
                await sharp(sourceIcon)
                    .resize(scaledWidth, scaledHeight, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .toFile(outputPath);
                console.log(`Generated ${filename} (${scaledWidth}x${scaledHeight})`);
            } catch (error) {
                console.error(`Error generating ${filename}:`, error);
            }
        }
    }

    console.log('');

    // Generate targetsize versions for Square44x44Logo (unplated for taskbar/start)
    for (const size of targetSizes) {
        const filename = `Square44x44Logo.targetsize-${size}.png`;
        const outputPath = path.join(outputDir, filename);

        try {
            await sharp(sourceIcon)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFile(outputPath);
            console.log(`Generated ${filename} (${size}x${size})`);
        } catch (error) {
            console.error(`Error generating ${filename}:`, error);
        }

        // Also generate unplated version (same image, different name for Windows to pick up)
        const unplatedFilename = `Square44x44Logo.targetsize-${size}_altform-unplated.png`;
        const unplatedOutputPath = path.join(outputDir, unplatedFilename);

        try {
            await sharp(sourceIcon)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toFile(unplatedOutputPath);
            console.log(`Generated ${unplatedFilename} (${size}x${size})`);
        } catch (error) {
            console.error(`Error generating ${unplatedFilename}:`, error);
        }
    }

    console.log('\n✅ AppX asset generation complete!');
    console.log(`   Total files generated in: ${outputDir}`);
}

generate();
