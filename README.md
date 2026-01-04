# ReDD Block

Block distracting websites and apps to stay focused on what matters.

## Features

- **Website Blocking**: Block distracting websites across all browsers using system-level hosts file modification
- **App Blocking**: Automatically minimize distracting macOS apps every 500ms while a block is running
- **Flexible Blocklists**: Create multiple blocklists with custom emojis and colors
- **Visual Timeline**: See your blocks on an interactive 24-hour timeline with smooth scrolling
- **Slider-Based Scheduling**: Intuitive duration selection (15 min to 12 hours) with visual preview
- **Override Protection**: Configurable difficulty to cancel blocks (random words, gibberish, or custom text)
- **Multiple Concurrent Blocks**: Run multiple blocklists simultaneously
- **Background Operation**: Blocks continue running even when the app is closed via a privileged helper daemon
- **Drag & Drop Reordering**: Rearrange blocklists by dragging them
- **One-Time Password**: Only requires your password once on first setup - all subsequent blocks start instantly
- **Dark Mode**: Toggle between light and dark themes with persistent preference

## Installation

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

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
ReDD Block modifies `/etc/hosts` to redirect blocked domains to `127.0.0.1`. The helper daemon ensures blocks persist across app restarts and are tamper-resistant.

### App Blocking
On macOS, blocked applications are automatically hidden every 500ms while a block is active.

### Privileged Helper Daemon
A privileged helper daemon runs in the background with root privileges and handles all hosts file modifications. After initial setup (which requires your password once), all blocks start instantly without any prompts.

The helper is:
- **Open source**: See the code in `/helper`
- **Secure**: Communicates via Unix domain socket with the app
- **Persistent**: Runs as a launchd daemon, survives app restarts and reboots
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
- **Windows**: 10+ (experimental)

## License

CC-BY-NC-ND-3.0

---

Made with ♥ by [reddfocus.org](https://reddfocus.org)
