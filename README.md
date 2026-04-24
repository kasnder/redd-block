# ReDD Block

Block distracting websites and apps with scheduled or one-off blocks and customisable difficulty to override. Stay focused on what matters.

Built by computer scientists at the University of Oxford (Dr Ulrik Lyngs) and the University of Maastricht (Dr Konrad Kollnig), as part of the Reduce Digital Distraction project ([reddfocus.org](https://reddfocus.org)).

## Features

- **Cross-Platform** — Works on macOS 14+, Windows 10+, iOS (iPad/iPhone), and Android (source code for the Android version is here: https://github.com/kasnder/redd-block-android)
- **Website Blocking** — System-level on macOS/iOS via Screen Time; on Windows via the ReDD Focus browser extension driven by a built-in native messaging host.
- **App Blocking** — Automatically blocks distracting apps (minimizes/hides on desktop via in-process watcher, Screen Time shield overlay on iOS)
- **Flexible Blocklists** — Create multiple lists with custom names, colors, and emojis
- **One-Off Blocks** — Quick blocks for immediate focus sessions
- **Scheduled Blocks** — Set recurring blocks on specific days/times (e.g., block social media Mon-Fri 9am-5pm)
- **Visual Calendar** — See all your scheduled and active blocks on an interactive weekly timeline
- **Override Protection** — Configurable typing challenges prevent impulsive unblocking
- **Background Operation** — Blocks continue even when the app is closed
- **Theme Options** — Auto, light, or dark mode

## Architecture

### Desktop

One unprivileged Tauri binary per OS. No helper daemon, no hosts file,
no admin prompt. Different website-blocking backend per OS:

- **macOS 14+** uses Apple's Screen Time API (`ManagedSettings.WebContentSettings`).
  Covers Safari and every other browser at the OS level. One user
  authorization in System Settings → Screen Time.
- **Windows** uses the ReDD Focus browser extension, spoken to via a
  native-messaging host that is the Tauri binary itself (invoked with
  `--native-host`). An in-app enforcement loop scans running browsers
  every ~5 seconds and nags / quits any browser whose ReDD Focus
  extension is missing, disabled, or not allowed in private browsing.

App blocking runs in-process on both OSes (AppleScript hide on macOS,
`SetWinEventHook` + `ShowWindow` on Windows). Scheduled blocks, pause /
resume, one-off blocks, and override challenges all work without a
separate daemon because the app launches at login and hides on close.

```mermaid
flowchart TB
    subgraph Frontend["Frontend (HTML/JS/CSS)"]
        UI[User Interface]
    end

    subgraph Tauri["Tauri Backend (Rust)"]
        IPC[IPC Commands]
        Data[Data Store]
        Watcher[App Watcher]
        Enforcer[Extension Enforcer (Windows)]
        Host[Native Host CLI Mode]
    end

    subgraph macOS["macOS 14+"]
        ST[Screen Time<br/>ManagedSettings.WebContentSettings]
    end

    subgraph Windows["Windows"]
        Ext[ReDD Focus Extension]
    end

    UI <-->|invoke/listen| IPC
    IPC --> Data
    IPC -->|macOS| ST
    Host <-->|stdio| Ext
    Enforcer -->|quit on non-compliance| Ext
    Watcher -->|hide/minimize| Apps[Running Apps]
```

### iOS (iPad / iPhone)

```mermaid
flowchart TB
    subgraph Frontend["Frontend (HTML/JS/CSS)"]
        UI[User Interface]
    end

    subgraph Tauri["Tauri Backend (Rust)"]
        IPC[IPC Commands]
        Data[Data Store]
    end

    subgraph Runtime["iOS Runtime"]
        Plugin["Screen Time Plugin (Swift)<br/>manual blocks + registration"]
        Shared["App Group Shared Store<br/>schedule payloads + timer payloads"]
        Monitor["DeviceActivityMonitor Extension<br/>boundary callbacks + shield recompute"]
    end

    subgraph System["iOS Screen Time Services"]
        ST[FamilyControls + ManagedSettings + DeviceActivityCenter]
    end

    UI <-->|invoke/listen| IPC
    IPC --> Data
    IPC <--> Plugin
    Plugin -->|manual blocks| ST
    Plugin -->|persist schedule/timer payloads| Shared
    Plugin -->|register schedules + one-off timers| ST
    ST -->|wake at boundaries| Monitor
    Monitor -->|read payloads| Shared
    Monitor -->|apply/remove shields| ST
```

## How It Works

### Website Blocking

**macOS 14+ and iOS:** Website blocking uses the Screen Time API's `WebContentSettings` to block domains at the OS level. Users type in domains to block, and the app applies them via a `ManagedSettingsStore`. One-time authorization in System Settings → Screen Time.

**Windows:** Website blocking uses the ReDD Focus browser extension. The app registers itself as a native-messaging host, derives the current blocklist from `redd-block-data.json`, and pushes it over stdio to the extension running in Chrome / Brave / Edge / Firefox. A background loop in the app scans running browsers every ~5 seconds and quits any that have the extension missing, disabled, or not allowed in private browsing.

### App Blocking

**Desktop (macOS / Windows):** The app itself uses event-driven monitoring to detect when blocked apps are launched or brought to focus, then immediately hides/minimizes them. No elevated privileges required. App blocking persists as long as the app is running — the app hides to tray on close and launches automatically at login so blocks keep firing across sessions.

**iOS:** App blocking uses the Screen Time API's `ManagedSettingsStore` to apply a shield overlay on selected apps and categories.

### Scheduled Blocking on iOS

Yes, scheduled blocking is technically supported on iOS. ReDD Block implements it through Apple's Screen Time stack:

- The app saves schedule payloads (domains/app/category tokens) in an App Group store.
- The app registers schedule windows with `DeviceActivityCenter`.
- At schedule boundaries, the system wakes the `DeviceActivityMonitor` extension (even when the app is closed), which reads the shared payloads and applies/removes shields via a named `ManagedSettingsStore`.
- Short iOS schedules still work, but under the hood they must respect Apple's 15-minute minimum `DeviceActivitySchedule` interval and use warning callbacks for the real end time.

This is why iOS scheduled blocking is possible without a desktop-style helper daemon.

| Platform | Detection Method | Hide Method |
|----------|------------------|-------------|
| macOS | NSWorkspace notifications (in-process, Accessibility TCC) | `set visible of application process to false` |
| Windows | SetWinEventHook for foreground changes (in-process) | ShowWindow with SW_FORCEMINIMIZE |
| iOS | Screen Time `ManagedSettingsStore` | Shield overlay via `ShieldSettings` |

### Authorization prompts (desktop)

- **macOS**: one-time Screen Time authorization (System Settings → Screen Time → enable for ReDD Block) is required for website blocking. The first time app blocking fires, macOS also prompts for Accessibility / Automation permission so the app can call `System Events` to hide blocked apps.
- **Windows**: users install the ReDD Focus extension from the Chrome Web Store / Firefox Add-ons / Edge Add-ons. No admin prompt; everything is user-scope.

### First launch after upgrade

An app that was previously installed at v1.0.x has a privileged helper daemon + redd-block entries in the hosts file. On first launch after upgrade the app:

1. Strips its own section from `/etc/hosts` (macOS) or `C:\Windows\System32\drivers\etc\hosts` (Windows).
2. Removes the launchd daemon / Scheduled Task and helper binary (macOS prompts once for the admin password; Windows cleans up user-scope state silently).
3. Registers itself as a launch-at-login item and a native-messaging host (Windows only).
4. On macOS, walks the user through the Screen Time authorization prompt.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri CLI](https://tauri.app/start/prerequisites/)

**Windows additional requirements:**
- Visual Studio Build Tools with C++ workload

**iOS additional requirements:**
- Xcode 15+
- An Apple Developer account
- A physical iOS device (Screen Time APIs don't work in the simulator)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/ulyngs/redd-block.git
cd redd-block

# Install dependencies
npm install

# Run in development mode (syncs helper and starts Tauri)
npm run dev

# Run on iOS device (opens Xcode, then press ⌘R to build)
npm run dev:ios
```

The app will open automatically. Hot-reloading is enabled for both frontend (Vite) and backend (Tauri).

### Building

```bash
# macOS: Universal binary (Intel + Apple Silicon) → DMG
npm run build:mac

# Windows: NSIS/MSI installers (x64 + ARM64)
npm run build:win

# iOS: Build IPA for App Store upload (via Transporter)
npm run build:ios
```

Built artifacts are copied to `for-distribution/` for upload or direct distribution.

### Testing

Testing is organized into two automated tiers plus a manual checklist:

**1. Unit Tests (in-app, instant)**

Tests blocking logic — time-based scenarios, overlaps, overrides, override-all state transitions, and challenge difficulty selection. No system modification.

```bash
npm run dev                   # Start the app
# Press Cmd+Shift+T (Mac) or Ctrl+Shift+T (Windows)
# Or type in the dev console: runBlockingTests()
```

**2. Integration Tests (in-app, profile-based)**

Creates real blocks using safe `.invalid` domains and verifies enforcement end-to-end through the app. Covers Screen Time / native-host sync, schedule activation, one-off pause/resume, overlap safety, scoped clear, and diagnostics parity.

```bash
# In the dev console:
runIntegrationTests('core')   # default, faster critical checks
runIntegrationTests('full')   # core + expanded non-UI coverage
```

**3. Manual Checklist**

See `scripts/manual-test-checklist.md` for the full pre-release checklist. Key items for the new architecture: Screen Time authorization flow (macOS), browser-extension install + enforcer grace timer (Windows), hide-on-close + launch-at-login, first-launch migration off the legacy helper.

## Project Structure

```
redd-block/
├── src/                          # Frontend (HTML/JS/CSS)
│   ├── index.html                # Main app layout
│   ├── app.js                    # App logic & UI
│   └── styles.css                # Styling
├── src-tauri/                    # Tauri backend (Rust)
│   ├── src/
│   │   ├── lib.rs                # App setup, tray, hide-on-close, autostart
│   │   ├── app_watcher.rs        # In-process app watcher (NSWorkspace / SetWinEventHook)
│   │   ├── enforcer.rs           # Browser-extension compliance loop (Windows)
│   │   ├── native_host.rs        # --native-host CLI mode (stdio framing)
│   │   ├── native_host_install.rs # Registers native-messaging manifests
│   │   ├── profile_scan.rs       # Reads browser profile files
│   │   └── commands/             # IPC commands (data, apps, migration, …)
│   ├── entitlements.macos.plist  # com.apple.developer.family-controls
│   ├── gen/apple/                # Generated Xcode project
│   ├── tauri.conf.json           # Shared Tauri config
│   ├── tauri.ios.conf.json       # iOS-specific config
│   ├── tauri.macos.conf.json     # macOS-specific config
│   └── tauri.windows.conf.json   # Windows-specific config
├── tauri-plugin-screentime/      # Screen Time plugin (iOS + macOS)
│   ├── ios/Sources/              # Swift (iOS + macOS via @_cdecl FFI)
│   ├── src/                      # Rust bindings
│   └── permissions/              # Plugin permissions
├── browser-ext-mvp/              # Reference prototypes (Node) and MIGRATION_PLAN.md
├── scripts/                      # Build and signing scripts
├── docs/                         # GitHub Pages (version info, App Store privacy policy)
└── vite.config.js                # Vite dev server config
```

## Version Management

| Component | Version Location |
|-----------|------------------|
| **App** | `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` |
| **Published versions** | `docs/latest-versions.json` (macOS, Windows, iOS) |

Use `./scripts/bump-version.sh <version>` to update the app version in all files at once.

## Data Storage

### App Data

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/com.redd.block/redd-block-data.json` |
| Windows | `%AppData%\com.redd.block\redd-block-data.json` |
| iOS | App sandbox (managed by Tauri) |

Contains blocklists, schedules, active blocks, and settings.

On Windows the built-in native-messaging host reads this file directly to derive the current blocklist for the extension — no separate IPC channel.

### Uninstall Behavior

User data is preserved unless manually deleted. Uninstalling the app also removes:

- the launch-at-login / login-item entry registered by `tauri-plugin-autostart`,
- the native-messaging manifests and registry keys (Windows) / files (macOS) written by `install_native_host`.

Active blocks stop firing once the app is gone because the app itself is now the enforcement engine. A paid-for-itself "keep blocking after uninstall" mode is no longer provided.

## Requirements

- **macOS**: 14.0+ (Sonoma or later) — required for Screen Time APIs
- **Windows**: 10+ (version 1809 or later)
- **iOS**: 16.0+ (iPhone and iPad)
- **Android**: see https://github.com/kasnder/redd-block-android
- **Linux**: Coming soon

## Tech Debt

- **Rename `updateHostsFile()`**: misleading now that no platform writes a hosts file. On macOS it calls Screen Time, on Windows it triggers a `save_data` that the native host picks up. Consider renaming to `syncWebsiteBlocking()`.
- **Frontend still calls legacy `*_via_helper` commands** via the shim in `src-tauri/src/commands/helper_shim.rs`. Rewrite `src/app.js` to call `set_blocked_apps` / Screen Time plugin commands / `scan_browser_profiles` directly and delete the shim.
- **Screen Time macOS DeviceActivity scheduling** is stubbed in `ScreentimePluginMacOS.swift` (`set_schedules` / `clear_schedules` TODOs). Near-term the app runs its own schedule evaluator in-process and calls block/clear directly; DeviceActivity wakeups are the long-term story.
