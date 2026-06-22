const { notarize } = require('@electron/notarize');
const path = require('path');
const fs = require('fs');

module.exports = async function (params) {
    // Only notarize the app on macOS
    if (process.platform !== 'darwin') {
        return;
    }

    const { electronPlatformName, appOutDir } = params;

    // Verify that we are building for macOS
    if (electronPlatformName !== 'darwin') {
        return;
    }

    // Check for required environment variables
    if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID) {
        console.log('Skipping notarization: Missing APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, or APPLE_TEAM_ID in env.');
        return;
    }

    const appName = 'Fristed.app';
    const appPath = path.join(appOutDir, appName);

    if (!fs.existsSync(appPath)) {
        console.log(`Cannot find application at: ${appPath}`);
        return;
    }

    console.log(`Notarizing ${appName} found at ${appPath} with Apple ID ${process.env.APPLE_ID}`);

    try {
        await notarize({
            appPath,
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
            tool: 'notarytool', // Use the modern notarytool
        });
        console.log(`Notarization successful for ${appName}`);
    } catch (error) {
        console.error('Notarization failed:', error);
        // You might want to throw the error to fail the build, or just log it
        throw error;
    }
};
