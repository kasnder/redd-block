# ReDD Block (Beta)

Block distracting websites and apps with scheduled or one-off blocks. Stay focused on what matters.

Built by reddfocus.org with <3 (and with [Tauri 2](https://tauri.app/) for a lightweight, cross-platform app!).

## Features

- **Website Blocking** — System-level hosts file blocking works across all browsers
- **App Blocking** — Automatically minimizes/hides distracting apps when launched or focused
- **Flexible Blocklists** — Create multiple lists with custom names, colors, and emojis
- **Scheduled Blocks** — Set recurring blocks on specific days/times (e.g., block social media Mon-Fri 9am-5pm)
- **One-Off Blocks** — Quick blocks for immediate focus sessions
- **Visual Calendar** — See all your scheduled and active blocks on an interactive weekly timeline
- **Override Protection** — Configurable typing challenges prevent impulsive unblocking
- **Background Operation** — Blocks continue even when the app is closed
- **Cross-Platform** — Works on macOS and Windows
- **Dark Mode** — Toggle between light and dark themes

## How It Works

### Website Blocking

A privileged helper daemon modifies the system hosts file to redirect blocked domains to `0.0.0.0`. Blocks persist across app restarts and work in all browsers.

| Platform | Hosts File | Helper Location |
|----------|------------|-----------------|
| macOS | `/etc/hosts` | launchd daemon |
| Windows | `C:\Windows\System32\drivers\etc\hosts` | Scheduled Task (runs at logon) |

### App Blocking

Uses event-driven monitoring to detect when blocked apps are launched or brought to focus, then immediately hides/minimizes them.

| Platform | Detection Method | Hide Method |
|----------|------------------|-------------|
| macOS | NSWorkspace notifications (AppleScript) | `set visible of application process to false` |
| Windows | SetWinEventHook for foreground changes | ShowWindow with SW_MINIMIZE |

### Helper Daemon

Runs with elevated privileges to manage hosts file changes. On first use, requests admin credentials once. After setup, blocks start instantly without prompts.

- **macOS**: Installed as a launchd daemon, authorized via password prompt
- **Windows**: Installed as a Scheduled Task with highest privileges, authorized via UAC prompt

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

**Windows additional requirements:**
- Visual Studio Build Tools with C++ workload

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ulyngs/redd-block.git
cd redd-block

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

The app will open automatically. Hot-reloading is enabled for both frontend (Vite) and backend (Tauri).

### Building

```bash
# Build for current platform
npm run tauri build

# macOS: Build universal binary (Intel + Apple Silicon)
npm run tauri build -- --target universal-apple-darwin

# Windows: Build for Microsoft Store (APPX)
npm run build:win
```

## Project Structure

```
redd-block/
├── src/                      # Frontend (HTML/JS/CSS)
│   ├── index.html            # Main app layout
│   ├── app.js                # App logic & UI
│   └── styles.css            # Styling
├── src-tauri/                # Tauri backend (Rust)
│   ├── src/
│   │   ├── lib.rs            # App setup & window config
│   │   └── commands/         # IPC commands
│   │       ├── helper.rs     # Helper daemon communication
│   │       ├── watcher.rs    # App blocking process watcher
│   │       └── data.rs       # Data persistence
│   └── tauri.conf.json       # Tauri configuration
└── helper-daemon/            # Privileged helper (Rust)
    └── src/main.rs           # Hosts file management
```

## Data Storage

### User Data

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/ReddBlock/redd-block-data.json` |
| Windows | `%AppData%\ReddBlock\redd-block-data.json` |

Contains blocklists, schedules, active blocks, and settings.

### Helper State

| Platform | Location |
|----------|----------|
| macOS | `/var/lib/redd-block/helper-state.json` |
| Windows | `C:\ProgramData\ReDD Block\helper-state.json` |

Tracks blocking state so blocks persist across app restarts.

### Uninstall Behavior

User data is preserved unless manually deleted. Reinstalling restores your blocklists and settings automatically.

## Requirements

- **macOS**: 11+ (Big Sur or later)
- **Windows**: 10+ (version 1809 or later)
- **Linux**: Coming soon

## License

CC-BY-NC-ND-3.0

---

Made with ♥ by [reddfocus.org](https://reddfocus.org)
