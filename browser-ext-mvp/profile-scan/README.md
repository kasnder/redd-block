# profile-scan

Detects whether the ReDD Focus browser extension is **installed**, **enabled**,
and **allowed in private/incognito mode** across every user profile of
Firefox, Chrome, Brave, Edge, and Safari.

Platform coverage:
- **macOS** — validated end-to-end against real installs.
- **Windows** — paths wired up from vendor docs, **not yet tested on a real
  machine**. The Chromium parser logic is identical across OSes, so risk is
  mostly in the path strings themselves.
- **Linux** — same caveat as Windows.
- **Safari** — macOS only (no Safari on other OSes).

This is the Cold-Turkey-style verification path: no admin required, no managed
policies, no native messaging — just read the browser profile files on disk.
The desktop app runs this periodically and can nag / fall back to OS-level
blocking when a check fails.

## Run

```bash
node scan.mjs                # pretty output
node scan.mjs --json         # machine-readable
```

Override extension IDs via env vars:

```bash
FIREFOX_EXT_ID=mindshield@example.com \
CHROMIUM_EXT_ID=abcdefghijklmnopabcdefghijklmnop \
SAFARI_EXT_BUNDLE_ID=com.example.ReddFocus.Extension \
  node scan.mjs
```

## What it reads

| Browser  | Path (per profile)                                                                 |
| -------- | ---------------------------------------------------------------------------------- |
| Firefox  | `~/Library/Application Support/Firefox/Profiles/*/extensions.json` + `extension-preferences.json` |
| Chrome   | `~/Library/Application Support/Google/Chrome/<Profile>/Preferences` + `Secure Preferences` |
| Brave    | `~/Library/Application Support/BraveSoftware/Brave-Browser/<Profile>/Preferences` + `Secure Preferences` |
| Safari   | `pluginkit -m -A -v` (system registry; no profile concept)                         |

Profile discovery:
- **Firefox**: parses `profiles.ini`, falls back to listing `Profiles/`.
- **Chromium**: parses `Local State → profile.info_cache`, falls back to dir scan.
- **Safari**: N/A.

## Known limitations / TODOs

### Correctness
- [ ] **Firefox private-browsing detection is flaky.** `extension-preferences.json`
      only tracks it in some Firefox versions. Newer Firefox stores the
      `internal:privateBrowsingAllowed` permission inside `extensions.json`
      under `addon.userPermissions.permissions` or via `incognito` on the
      addon record. Cross-check both locations and on several FF versions
      (ESR, stable, Developer Edition, Nightly).
- [ ] **Chromium `Secure Preferences` is HMAC-signed.** We currently read it
      as plain JSON, which works today because Chrome doesn't invalidate on
      *read*, only on *next write*. Long-term we should parse the signed
      format and validate, or accept that tampering resets state.
- [ ] **Safari detection is heuristic.** `pluginkit`'s `+`/`-` prefix indicates
      enabled state, but the exact format changes between macOS versions.
      Needs testing on 13/14/15/26. A cleaner path: read
      `~/Library/Safari/Extensions/Extensions.plist` (legacy) and the
      per-container `com.apple.Safari` TCC entries (modern App Extensions).
- [ ] **Safari private-browsing flag.** Safari exposes "Allow in Private
      Browsing" per extension but stores it inside the extension's container
      sandbox — likely not reachable without the host app cooperating. May
      require the extension itself to report this back via native messaging.
- [ ] **Verify the Chromium ID matches the published ReDD Focus build.**
      Currently `hhblkhfdjijdinijakbmcpkmdfhoadcd` (Chrome Web Store).
      Re-check if the listing is ever re-published under a new ID.
- [ ] **Accept multiple extension IDs.** Today the scanner only checks one
      Chromium ID at a time. During development the extension is loaded
      unpacked with a path-derived ID (e.g. `fococph...`) while the real
      one is the Web Store ID — the scanner misses unpacked installs and
      reports `installed: false`. Accept a list of IDs and treat any
      match as installed.

### Cross-platform
- [ ] **Validate Windows paths on a real Windows box.** Entries are wired up
      from vendor docs but untested:
  - Firefox: `%APPDATA%\Mozilla\Firefox`
  - Chrome: `%LOCALAPPDATA%\Google\Chrome\User Data`
  - Brave: `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data`
  - Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data`
- [ ] **Validate Linux paths.** Same caveat:
      `~/.mozilla/firefox`, `~/.config/google-chrome`,
      `~/.config/BraveSoftware/Brave-Browser`, `~/.config/microsoft-edge`.
- [ ] **Path separators on Windows.** `node:path` joins we already use handle
      this, but some of the hardcoded backslash strings (`APPDATA\\...`)
      assume `process.env.APPDATA` is set — double-check fallback behavior
      when it isn't.

### More browsers
- [ ] **Opera, Vivaldi, Arc, Zen** — all Chromium forks; same `Preferences`
      structure, just different root paths. Add to the `ROOTS` table.
- [ ] **Firefox forks** (LibreWolf, Waterfox) — same `profiles.ini` +
      `extensions.json` structure.

### Enforcement (beyond detection)
- [ ] **What to do when a check fails.** Current script only reports.
      Integrate with the main app so failure triggers a nag window, falls
      back to hosts-file blocking, or blocks the browser binary itself via
      ScreenTime on macOS.
- [ ] **Polling cadence.** How often should the desktop app re-scan? On
      profile-file change via FSEvents? On browser process start? Every N
      minutes? Cheapest: watch the relevant files with `fs.watch`.
- [ ] **Race with the browser.** Chrome holds a write lock on `Preferences`
      while running. We read fine, but parsing mid-write can yield truncated
      JSON — handle `SyntaxError` and retry.
- [ ] **Multiple users on one machine.** Script scans only `$HOME`. A
      system-wide service would iterate `/Users/*`.
- [ ] **Headless / command-line browser instances.** Chrome `--user-data-dir`
      points elsewhere; those profiles won't be detected. Probably
      acceptable for the self-binding model but worth documenting.

### Extension-side
- [ ] **Native messaging channel** so the extension can *push* liveness and
      the desktop app can *push* the current blocklist. Manifest location:
      `~/Library/Application Support/Mozilla/NativeMessagingHosts/` and
      `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
      (both user-scope, no admin).
- [ ] **Uninstall detection.** If the extension is removed entirely, the
      `extensions.json` / `Preferences` entry disappears — scanner already
      reports `installed: false`. Make sure the desktop-app reaction is
      sensible (not a crash loop).
- [ ] **Tamper surface.** A user can hand-edit `Preferences` to flip
      `state: 0 → 1` without actually re-enabling the extension in the UI.
      Chromium detects this on next browser start and resets the extension;
      until then our scanner reports a false positive. Compare against a
      liveness ping from the extension to close this gap.

### Ergonomics
- [ ] Rewrite in Rust and expose as a Tauri command, so the main app calls
      it directly instead of shelling out to Node.
- [ ] JSON schema for the output.
- [ ] Unit tests with fixture profile directories.
