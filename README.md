# ReDD Block

Block distracting websites and apps to stay focused on what matters.

## Features

- **Website Blocking**: Block distracting websites across all browsers using system-level hosts file modification with IPv4 and IPv6 blocking
- **App Blocking**: Automatically hide distracting apps when launched or activated (macOS hides apps; Windows minimizes them)
- **Flexible Blocklists**: Create multiple blocklists with custom emojis and colors
- **Visual Timeline**: See your blocks on an interactive 24-hour timeline with click-to-scroll-to-now
- **Duration-Based Scheduling**: Set block duration (1 minute to 99,999 minutes) with quick presets and manual end time selection
- **Override Protection**: Configurable difficulty to cancel blocks:
  - **Random Words**: Type random words to reach an exact character count (1-5000 chars)
  - **Random Gibberish**: Type random alphanumeric characters exactly as shown
  - **Custom Text**: Define your own phrase to type (e.g., a motivational statement)
  - **Anti-Circumvention**: Copy/paste disabled, text selection blocked
- **Start Confirmation**: Before starting a block, see a clear warning showing what you'll need to type to override
- **Multiple Concurrent Blocks**: Run multiple blocklists simultaneously
- **Background Operation**: Blocks continue running even when the app is closed via a privileged helper daemon
- **Drag & Drop Reordering**: Rearrange blocklists by dragging them
- **One-Time Password**: Only requires your password once on first setup - all subsequent blocks start instantly
- **Dark Mode**: Toggle between light and dark themes with persistent preference
- **Themed UI**: Override challenge progress bar matches your blocklist's color theme
- **Event-Driven Process Monitoring**: Uses platform-specific APIs (NSWorkspace on macOS, polling on Windows) for efficient app detection
- **System Tray**: Background operation with tray icon for quick access

## Installation

### Development

```bash
# Install dependencies
npm install

# Run in development mode (helper runs via Node.js, no compilation needed)
npm run dev
```

> **Note**: In development mode, the helper script runs directly via Node.js. For production builds, helper binaries are compiled automatically.

### Building

```bash
# Build for macOS (separate arm64 and x64 DMGs, includes signing and notarization if configured)
npm run build:mac

# Build for Windows (NSIS installer, ZIP, and AppX)
npm run build:win

# Build for Linux (AppImage and DEB for x64 and arm64)
npm run build:linux
```

## How It Works

### Website Blocking
ReDD Block modifies the system hosts file (`/etc/hosts` on macOS/Linux, `C:\Windows\System32\drivers\etc\hosts` on Windows) to redirect blocked domains to `0.0.0.0` (IPv4) and `::` (IPv6). On macOS, it also configures pf (packet filter) firewall rules for additional protection. The helper daemon ensures blocks persist across app restarts and are tamper-resistant.

### App Blocking
Blocked applications are automatically hidden (macOS) or minimized (Windows) using event-driven process monitoring:
- **macOS**: NSWorkspace notifications detect both app launches and app activations
- **Windows**: Polling checks for new processes and foreground window changes

When a blocked app is detected, it's hidden immediately with retry attempts to ensure the window is fully hidden.

### Privileged Helper Daemon
A privileged helper daemon runs in the background with root privileges and handles all hosts file modifications. After initial setup (which requires your password once), all blocks start instantly without any prompts.

The helper is:
- **Open source**: See the code in `/helper`
- **Secure**: Communicates via IPC (Unix socket on macOS/Linux, TCP port on Windows) with the app
- **Persistent**: Runs as a background service (launchd on macOS, systemd on Linux, Windows Service on Windows), survives app restarts and reboots

## Architecture

```
redd-block/
├── main.js                  # Electron main process
├── processWatcher.js        # Event-driven app monitoring
├── src/
│   ├── index.html           # Main UI
│   ├── app.js               # Renderer process logic
│   └── styles.css           # Styling
├── helper/
│   ├── redd-block-helper.js # Privileged daemon (runs as root)
│   ├── installer.js         # Helper installation logic (cross-platform)
│   └── ipc-client.js        # IPC communication with daemon
├── scripts/
│   ├── notarize.js          # macOS notarization
│   ├── predev.js            # Development setup
│   └── generate-*.js        # Asset generation scripts
├── build.js                 # Build configuration
└── assets/                  # App icons and assets
```

## Requirements

- **macOS**: 10.15+ (Catalina or later) - native arm64 and x64 builds
- **Linux**: systemd-based distributions (x64 and arm64)
- **Windows**: 10+ (64-bit)

## License

CC-BY-NC-ND-3.0

---

Made with ♥ by [reddfocus.org](https://reddfocus.org)
