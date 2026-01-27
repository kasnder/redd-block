# ReDD Block

Block distracting websites and apps to stay focused on what matters.

Built with [Tauri 2](https://tauri.app/) for a lightweight, native experience.

## Features

- **Website Blocking** — System-level hosts file blocking works across all browsers
- **App Blocking** — Automatically hides distracting apps when launched (macOS)
- **Flexible Blocklists** — Create multiple lists with custom names, colors, and emojis
- **Visual Timeline** — See your blocks on an interactive 24-hour timeline
- **Override Protection** — Configurable typing challenges (random words, gibberish, or custom text) to prevent impulsive unblocking
- **Background Operation** — Blocks continue even when the app is closed
- **Dark Mode** — Toggle between light and dark themes

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev
```

### Building

```bash
# Build for macOS (DMG)
npm run tauri build

# See all build options
npm run tauri build -- --help
```

## How It Works

### Website Blocking
A privileged helper daemon modifies the system hosts file (`/etc/hosts` on macOS/Linux) to redirect blocked domains to `0.0.0.0`. A backup is created before the first modification.

### App Blocking  
Uses AppleScript to monitor for blocked apps and hide them when launched or activated.

### Helper Daemon
The helper runs with root privileges and handles hosts file modifications. After initial setup (password required once), blocks start instantly.

## Architecture

```
redd-block/
├── src/                      # Frontend (HTML/JS/CSS)
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── src-tauri/                # Tauri backend (Rust)
│   ├── src/
│   │   ├── lib.rs            # App setup & window creation
│   │   └── commands/         # IPC commands
│   │       ├── helper.rs     # Helper daemon communication
│   │       ├── watcher.rs    # App blocking process watcher
│   │       └── data.rs       # Data persistence
│   └── tauri.conf.json       # Tauri configuration
└── helper-daemon/            # Privileged helper (Rust)
    └── src/main.rs           # Hosts file management
```

## Requirements

- **macOS**: 11+ (Big Sur or later)
- **Linux**: Coming soon
- **Windows**: Coming soon

## License

CC-BY-NC-ND-3.0

---

Made with ♥ by [reddfocus.org](https://reddfocus.org)
