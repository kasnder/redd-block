require('dotenv').config();
const builder = require('electron-builder');
const fs = require('fs');
const path = require('path');
const Platform = builder.Platform;
const Arch = builder.Arch;

// Check command line arguments
const buildMac = process.argv.includes('--mac');
const buildWin = process.argv.includes('--win');
const buildLinux = process.argv.includes('--linux');

// Detect implicit "current platform" builds (when no flags are provided)
const noExplicitPlatformFlags = !buildMac && !buildWin && !buildLinux;
const isImplicitWin = noExplicitPlatformFlags && process.platform === 'win32';
const isImplicitLinux = noExplicitPlatformFlags && process.platform === 'linux';

// Read package.json
const pkgJsonPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

// If no flags, default to current platform
const targets = [];
if (buildMac) targets.push(Platform.MAC);
if (buildWin) targets.push(Platform.WINDOWS);
if (buildLinux) targets.push(Platform.LINUX);

if (targets.length === 0) {
  console.log("No platform flags detected (--mac, --win, --linux). Building for current platform only.");
}

// Determine Mac targets
let macTargets = [
  {
    target: 'dmg',
    arch: ['universal']
  },
  {
    target: 'zip',
    arch: ['universal']
  }
];

builder.build({
  targets: (buildWin && targets.length === 1 && targets[0] === Platform.WINDOWS)
    ? Platform.WINDOWS.createTarget(['nsis', 'zip', 'appx'], Arch.x64)
    : (targets.length > 0 ? builder.createTargets(targets) : undefined),
  config: {
    appId: 'com.redd.block',
    productName: 'ReDD Block',
    copyright: 'Copyright © 2025 Reduce Digital Distraction Ltd',
    directories: {
      output: 'dist',
      buildResources: 'assets'
    },
    // Put helper files in extraResources (outside ASAR)
    // - On macOS: use architecture-specific binaries (arm64 or x64)
    // - On Windows: use the -win.exe binary
    // Also include helper JS files for the installer module
    extraResources: buildMac ? [
      {
        from: 'helper/dist/redd-block-helper-${arch}',
        to: 'helper/dist/redd-block-helper'
      },
      { from: 'helper/redd-block-helper.js', to: 'helper/redd-block-helper.js' },
      { from: 'helper/ipc-client.js', to: 'helper/ipc-client.js' },
      { from: 'helper/installer.js', to: 'helper/installer.js' }
    ] : (buildWin || isImplicitWin) ? [
      {
        from: 'helper/dist/redd-block-helper-win.exe',
        to: 'helper/dist/redd-block-helper-win.exe'
      },
      { from: 'helper/redd-block-helper.js', to: 'helper/redd-block-helper.js' },
      { from: 'helper/ipc-client.js', to: 'helper/ipc-client.js' },
      { from: 'helper/installer.js', to: 'helper/installer.js' }
    ] : [
      {
        from: 'helper/dist/redd-block-helper-${arch}',
        to: 'helper/dist/redd-block-helper'
      },
      { from: 'helper/redd-block-helper.js', to: 'helper/redd-block-helper.js' },
      { from: 'helper/ipc-client.js', to: 'helper/ipc-client.js' },
      { from: 'helper/installer.js', to: 'helper/installer.js' }
    ],
    // Exclude helper binaries from app packaging to avoid universal build merge conflicts on Mac
    // They are included via extraResources instead
    // On Windows/Linux, we need them in the package
    files: buildMac ? [
      '**/*',
      '!helper/dist/redd-block-helper-*'
    ] : [
      '**/*'
    ],
    afterSign: 'scripts/notarize.js',
    dmg: {
      backgroundColor: '#ffffff',
      iconSize: 100,
      window: {
        width: 600,
        height: 400
      },
      contents: [
        {
          x: 150,
          y: 200,
          type: 'file'
        },
        {
          x: 450,
          y: 200,
          type: 'link',
          path: '/Applications'
        }
      ],
      title: 'Install ReDD Block'
    },
    mac: {
      artifactName: 'reddblock-${version}-${arch}.${ext}',
      identity: process.env.APPLE_IDENTITY,
      category: 'public.app-category.productivity',
      // Build separate arm64 and x64 binaries (not universal) to avoid helper merge conflicts
      target: [
        {
          target: 'dmg',
          arch: ['arm64', 'x64']
        },
        {
          target: 'zip',
          arch: ['arm64', 'x64']
        }
      ],
      icon: 'assets/icon.icns',
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: 'build/entitlements.mac.plist',
      entitlementsInherit: 'build/entitlements.mac.plist',
      extendInfo: {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    win: {
      artifactName: 'reddblock-${version}-${arch}.${ext}',
      target: [
        {
          target: 'nsis',
          arch: ['x64']
        },
        {
          target: 'zip',
          arch: ['x64']
        },
        {
          target: 'appx',
          arch: ['x64']
        }
      ],
      icon: 'assets/icon.ico'
    },
    appx: {
      applicationId: 'ReDDBlock',
      identityName: process.env.WINDOWS_IDENTITY_NAME,
      publisher: process.env.WINDOWS_PUBLISHER,
      publisherDisplayName: process.env.WINDOWS_PUBLISHER_DISPLAY_NAME
    },
    linux: {
      target: [
        {
          target: 'AppImage',
          arch: ['x64', 'arm64']
        },
        {
          target: 'deb',
          arch: ['x64', 'arm64']
        }
      ],
      category: 'Utility',
      icon: 'assets/icon.png',
      artifactName: 'reddblock-${version}-${arch}.${ext}'
    },
    defaultArch: 'x64'
  }
}).then(() => {
  console.log('Build complete!');

  // Rename linux files to enforce consistent 'x64' naming
  if (buildLinux) {
    const distDir = path.join(__dirname, 'dist');
    try {
      const files = fs.readdirSync(distDir);
      files.forEach(file => {
        if (file.includes('amd64')) {
          const newName = file.replace('amd64', 'x64');
          fs.renameSync(path.join(distDir, file), path.join(distDir, newName));
          console.log(`Renamed ${file} to ${newName}`);
        } else if (file.includes('x86_64')) {
          const newName = file.replace('x86_64', 'x64');
          fs.renameSync(path.join(distDir, file), path.join(distDir, newName));
          console.log(`Renamed ${file} to ${newName}`);
        }
      });
    } catch (e) {
      console.error('Error renaming linux files:', e);
    }
  }
}).catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});
