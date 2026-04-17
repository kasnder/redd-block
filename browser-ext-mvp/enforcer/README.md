# enforcer

Mac testbed for the Windows enforcement flow. Loops every 5s, scans each
supported browser's default profile, and if a browser is running but its
extension check fails (missing / disabled / not allowed in private browsing),
starts a 30s grace countdown and then quits the browser.

This is disposable code — a fidelity prototype to validate the UX before
building the real version in Rust/Tauri for Windows.

## Run

```bash
node enforce.mjs
```

Leave it in a terminal. Open Brave/Chrome/Firefox. If the ReDD Focus
extension is missing, disabled, or not private-browsing-enabled, a macOS
notification appears and a 30s countdown starts. Fix the extension within
30s and the timer cancels; otherwise the browser quits cleanly.

Tick interval and grace are currently hardcoded constants at the top of
`enforce.mjs` — change them there.

## What maps to Windows

| Mac                                         | Windows                                    |
| ------------------------------------------- | ------------------------------------------ |
| `pgrep -x "Brave Browser"`                  | `tasklist /FI "IMAGENAME eq brave.exe"` or WMI `Win32_Process` |
| `osascript -e 'tell app ... to quit'`       | `taskkill /IM brave.exe` (graceful) or `/F` |
| `osascript -e 'display notification'`       | Windows toast (via Tauri or PowerShell)    |
| `~/Library/Application Support/...`         | `%APPDATA%` / `%LOCALAPPDATA%`             |

## Known limits in this prototype

- Checks only the **default** profile. A user with multiple Chrome profiles
  can trivially bypass by opening a non-default one.
- Notification nags every 10s during grace — real UX should be a persistent
  window with a countdown and a "Fix now" button that deep-links to
  `chrome://extensions/?id=<id>`.
- No state across runs: quitting the script resets all timers.
- No allow/dismiss: once the browser's bad, there's no way to say "I'm
  installing right now, give me longer."
- Safari's `enabled` and `privateBrowsing` status come back as `?` (null)
  from the scanner, which this script treats as a fail. Users with Safari
  will get nagged even when the extension is fine. Fix by cooperating with
  the Safari extension handler (see native-host README).
