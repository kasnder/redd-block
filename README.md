# ReDD Block

Block distracting websites and apps to stay focused on what matters.

## Features

- **Website Blocking**: Block distracting websites across all browsers using system-level hosts file modification
- **App Blocking**: Automatically minimize distracting apps (macOS and Windows) every 500ms while a block is running
- **Flexible Blocklists**: Create multiple blocklists with custom emojis and colors
- **Visual Timeline**: See your blocks on an interactive 24-hour timeline with smooth scrolling
- **Slider-Based Scheduling**: Intuitive duration selection (15 min to 12 hours) with visual preview
- **Override Protection**: Configurable difficulty to cancel blocks:
  - **Random Words**: Type random words to reach an exact character count (5-5000 chars)
  - **Random Gibberish**: Type random alphanumeric characters exactly as shown
  - **Custom Text**: Define your own phrase to type (e.g., a motivational statement)
  - **Anti-Circumvention**: Copy/paste disabled, text selection blocked
- **Start Confirmation**: Before starting a block, you'll see a clear warning showing what you'll need to type to override, with an estimated time to complete
- **Multiple Concurrent Blocks**: Run multiple blocklists simultaneously
- **Background Operation**: Blocks continue running even when the app is closed via a privileged helper daemon
- **Drag & Drop Reordering**: Rearrange blocklists by dragging them
- **One-Time Password**: Only requires your password once on first setup - all subsequent blocks start instantly
- **Dark Mode**: Toggle between light and dark themes with persistent preference
- **Themed UI**: Override challenge progress bar matches your blocklist's color theme

## Installation

### Development

```bash
# Install dependencies
npm install

# Compile the privileged helper binary (required for first-time setup)
# This creates helper/dist/redd-block-helper (universal binary for macOS)
npm run compile:helper

# Run in development mode
npm run dev
```

> **Note**: The helper binaries in `helper/dist/` are not committed to git and must be compiled locally. If you see "Helper binary not found", run `npm run compile:helper` first.

### Building

```bash
# Build for macOS (includes signing and notarization if configured)
npm run build:mac

# Build for other platforms
npm run build:win
npm run build:linux
```

## How It Works

### Website Blocking
ReDD Block modifies the system hosts file (`/etc/hosts` on macOS/Linux, `C:\Windows\System32\drivers\etc\hosts` on Windows) to redirect blocked domains to `127.0.0.1`. The helper daemon ensures blocks persist across app restarts and are tamper-resistant.

### App Blocking
Blocked applications are automatically hidden/minimized every 500ms while a block is active. On macOS, they are hidden; on Windows, they are minimized.

### Privileged Helper Daemon
A privileged helper daemon runs in the background with root privileges and handles all hosts file modifications. After initial setup (which requires your password once), all blocks start instantly without any prompts.

The helper is:
- **Open source**: See the code in `/helper`
- **Secure**: Communicates via IPC (Unix socket on macOS/Linux, TCP port 62222 on Windows) with the app
- **Persistent**: Runs as a background service (launchd on macOS), survives app restarts and reboots
- **Tamper-resistant**: Re-applies rules if the hosts file is modified

## Architecture

```
redd-block/
├── main.js              # Electron main process
├── src/
│   ├── index.html       # Main UI
│   ├── app.js           # Renderer process logic
│   └── styles.css       # Styling
├── helper/
│   ├── redd-block-helper.js  # Privileged daemon (runs as root)
│   ├── installer.js          # Helper installation logic
│   └── ipc-client.js         # IPC communication with daemon
└── build/               # Build configuration
```

## Requirements

- **macOS**: 10.15+ (Catalina or later)
- **Linux**: systemd-based distributions (experimental)
- **Windows**: 10+ (64-bit)

## License

CC-BY-NC-ND-3.0

---

Made with ♥ by [reddfocus.org](https://reddfocus.org)
