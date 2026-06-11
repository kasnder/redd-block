# Safari Extension Compliance Detection

> **Historical — v2 macOS Safari only.** v3 uses Automation TCC for Safari
> (and Chromium on macOS), not extension profile scans. See
> [../architecture.md](../architecture.md) §7. Still relevant for **Windows**
> extension compliance and **macOS Firefox**.

How Fristed tells whether the Safari Web Extension is **installed**,
**enabled**, and **allowed in private browsing** — and what gets
enforced when it isn't.

This is the part of the v1.1 architecture that's not obvious from the
code, because Safari Web Extensions don't expose a clean state-query
API to a separately-distributed host app. Most of what's documented
below is *because we ruled out the alternatives*; see the bottom of
this file for the rejected options and why.

---

## Signals

Three sources, in order of authority:

### 1. The heartbeat (primary signal for *enabled* + *private browsing*)

`redd-focus-web/Shared (Extension)/Resources/background.js` writes a
status message to the App Group container every 15 s, plus on
extension load and on every `chrome.tabs.onUpdated`. The path is

```
~/Library/Group Containers/<team>.group.com.reddblock.shared/safari-status.json
```

The Swift side (`SafariWebExtensionHandler.swift`) receives the
native-message ping and atomically writes:

```json
{
  "installed": true,
  "enabled": true,
  "version": "6.0",
  "lastWriteEpochMs": 1714159200000,
  "privateBrowsing": true
}
```

`privateBrowsing` is sourced from
`browser.extension.isAllowedIncognitoAccess()` — the WebExtension API
that returns the *configured* state of the "Allow in Private
Browsing" toggle. This is critical: it works regardless of whether
the user currently has a private window open, so we get a reliable
negative signal too. (We previously used `tab.incognito`, which only
fires when the extension actually runs in a private tab, so absence
was indistinguishable from "no private tab open." See
[#rejected-options](#rejected-options).)

The Rust side reads this file in
`src-tauri/src/app_group.rs::read_safari_status` and applies a
**45-second freshness window**
(`STATUS_STALE_MS = 45 * 1000`):

- ≤ 45 s old → fresh; trust the values directly.
- > 45 s old → stale; the extension has stopped reporting.

Heartbeat 15 s + staleness 45 s = one missed beat tolerated for
jitter. Combined with the enforcer's grace timer this gives a
worst-case detection-to-force-quit window of ~75–105 s on default
settings (5–105 s if the user dials grace down to its minimum of 5).

### 2. `pluginkit` (presence of the bundle)

`pluginkit -m -A -vvv -p com.apple.Safari.web-extension` lists every
Safari Web Extension registered with the system. We grep for our
bundle IDs (`com.ulriklyngs.mind-shield` and the dev variant). If
the line is present, the extension is **installed** at the OS level
even if Safari isn't running.

The leading `+` / `-` flag that `pluginkit` shows for old plug-in
SDKs is **not reliable for Safari Web Extensions** on modern macOS
— Safari manages the enabled state internally rather than through
pluginkit's flags, so the prefix is usually a space. We deliberately
ignore it and source enabled-state from the heartbeat instead.

### 3. Frontmost-app focus (the enforcement gate)

`scan_safari` only marks Safari as `present` (i.e.
enforcement-worthy) when both:

- the Safari process is running, **and**
- `NSWorkspace.frontmostApplication` returns
  `com.apple.Safari` — Safari is the frontmost app on the active
  Mission Control space.

The compliance gate in `compliant()` short-circuits on `!present`,
so a non-frontmost Safari (closed, minimised, hidden via cmd-H, on
another Mission Control space) is left alone regardless of what
the heartbeat says. This matters because Safari aggressively
suspends MV3 background pages for battery savings — heartbeats
stop firing as soon as the user switches away — and without the
frontmost gate the enforcer would falsely flag a healthy install
and force-quit Safari behind the user's back.

`NSWorkspace.frontmostApplication` is unprivileged Cocoa API, no
TCC consent involved.

---

## Three scenarios

The detection logic in `scan_safari` (`src-tauri/src/profile_scan.rs`)
plus `compliant()` produces three behaviours.

### A. Safari is closed

Or: not running, no process. `is_process_running` returns false →
`present = false` → gate auto-passes. The heartbeat file may still
exist on disk from a previous session, but `compliant()` short-
circuits before reading it.

### B. Safari is running but not frontmost

Minimised, hidden, on another space, or just behind another app's
windows. `safari_is_frontmost()` returns false → `present = false`
→ gate auto-passes. **This is the case the frontmost gate fixes.**
Without it, the heartbeat would go stale during background
suspension and the enforcer would force-quit Safari while the user
was just briefly away.

Trade-off: a determined user could disable the extension and let
auto-refreshing minimised tabs load blocked content silently. They
can't actually *use* Safari without making it frontmost again, at
which point enforcement resumes within ~45 s.

### C. Safari is running and frontmost

The full check applies. Heartbeat must be fresh (`STATUS_STALE_MS`
window), `enabled` must be `Some(true)`, `privateBrowsing` must be
`Some(true)`. The compliance gate is:

```rust
p.installed && p.enabled == Some(true) && p.private_browsing == Some(true)
```

Mirrors the Chromium gate exactly. Since Safari's bg page is
guaranteed to be alive when Safari is frontmost (the user is
actively looking at it), the heartbeat is reliable here and a
stale heartbeat is a real signal: the extension was just disabled
or uninstalled.

### Worst-case enforcement timeline (scenario C)

| Step | Window |
|---|---|
| Heartbeat fires | every 15 s |
| Heartbeat goes stale | after 45 s without a write |
| Compliance flips → enforcer notices | next scan tick (≤ 5 s) |
| User-configurable grace (5 s min, 60 s default, 300 s max) | 5–300 s |
| Force-quit | when grace hits zero |

**Default total**: ≈ 105 s from disable to force-quit when Safari
is frontmost.
**Tightest configurable**: ≈ 50 s.

---

## What the user can still do (and why we accept it)

Fristed is a focus app, not a security product. The model is
honor-system + significant friction, not perfect prevention.

- **Disable the extension while Safari is foreground** → ≤ 45 s
  detection, then grace, then force-quit. ✓ caught.
- **Disable while Safari is closed/minimised/hidden, then bring
  Safari to foreground** → ≤ 45 s detection from when Safari
  becomes frontmost. ✓ caught.
- **Disable + minimise + auto-refreshing background tabs** → not
  caught while Safari is in the background, because the frontmost
  gate suppresses enforcement there. The user can't actually
  interact with a minimised Safari, so this only allows passive
  background data loading (Twitter timelines, mail polling, etc.).
  The moment they bring Safari forward, enforcement resumes.
- **Park Safari on another Mission Control space** → not enforced
  while the active space is something else. Same trade as
  minimised. Switching back to Safari's space resumes enforcement.
- **Disable, browse for < grace, quit Safari before grace
  expires** → not caught this cycle, but next launch detects.
- **Force-quit-relaunch loop** → each cycle gives ~30–45 s of
  browsing while Safari is foreground. Repeat-offence grace
  tightens to 30 s, which helps.
- **Use a different browser** → outside scope; the user installs
  the extension in every browser they care about.
- **Hand-edit `safari-status.json` in the App Group container** →
  forges compliance. Requires shell access during a focus session;
  out of scope.

The minimised / multi-space limitations would all be closed by
moving to the **Full Disk Access + `Extensions.plist`** path (see
[Rejected options](#rejected-options)), which doesn't depend on
the heartbeat at all. Parked as a v2.1 cleanup.

---

## Rejected options

For posterity — if any of these is reconsidered, here's the prior art.

### Full Disk Access + parsing Safari's `Extensions.plist`

The plist at
`~/Library/Containers/com.apple.Safari/Data/Library/Safari/WebExtensions/Extensions.plist`
contains the authoritative `Enabled` and `AllowInPrivateBrowsing`
booleans, keyed by `"<bundle-id> (<team-id>)"`. Reading it requires
Full Disk Access (TCC-protected container path).

Why rejected: FDA is heavyweight UX for users (Settings → Privacy
& Security → toggle per-app), gets re-prompted on some macOS
updates, and offers no advantage over `isAllowedIncognitoAccess()`
once we discovered that API works in Safari. The original v1.1 plan
explicitly punted on FDA in favour of self-report; the gap was just
that the *self-report mechanism* used `tab.incognito` instead of the
correct API.

A full implementation existed briefly on this branch (commits
unstaged, then reverted) — `src-tauri/src/macos_fda.rs` (probe
helper, command wrappers) plus `src-tauri/src/safari_prefs.rs`
(plist parser). Recover from git history if ever needed.

### `SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier:)`

Apple's official API for querying Safari extension state from the
host app. Returns `SFSafariExtensionState.isEnabled`. Looks perfect.

Why rejected: Apple's docs say *"the extension must be bundled with
your app"* and the API returns nothing useful otherwise. Our Safari
extension is bundled inside `ReDD Focus.app` (a separate Mac App
Store app), not inside `redd-block.app`. Sharing an App Group does
not grant cross-app extension introspection.

Three theoretical workarounds, all bad:
1. Have `ReDD Focus.app` call this API and write the result to the
   App Group container. Requires the user to launch `ReDD Focus.app`,
   which is the dummy container they install once and never open.
2. Bundle a stub extension inside `redd-block.app` just to query
   state. Duplicative, two ReDD-Focus-ish entries in Safari →
   Extensions.
3. Call the API from inside `SafariWebExtensionHandler` — but the
   handler only runs when Safari has already loaded the extension,
   so the boolean is always `true`. Adds nothing.

### `tab.incognito` self-report (the original)

Self-report from the extension's tab listener, sending
`privateBrowsing: !!(tab && tab.incognito)`. The mechanism the v1.1
migration shipped with.

Why rejected: only fires when the extension actually runs in a
private tab. If the user has "Allow in Private Browsing" off, the
extension never runs there, so we never get a `false` signal — we
just get nothing. Indistinguishable from "user has no private tab
open right now." Replaced with `isAllowedIncognitoAccess()`.

---

## Files involved

- `redd-focus-web/Shared (Extension)/Resources/background.js` —
  heartbeat sender, calls `isAllowedIncognitoAccess()`.
- `redd-focus-web/Shared (Extension)/SafariWebExtensionHandler.swift`
  — receives the native message, writes
  `safari-status.json` to the App Group container.
- `src-tauri/src/app_group.rs` — `SafariStatus` struct, read +
  freshness helpers (`STATUS_STALE_MS = 45 s`).
- `src-tauri/src/profile_scan.rs` — `scan_safari` (the two-scenario
  logic above) and `compliant()` (the corrected gate).
- `src-tauri/src/enforcer.rs` — grace timer, kill mechanism. Grace
  bounds: 5–300 s, default 60 s.
- `src/app.js` — `browserComplianceStatus()` and
  `firstNonCompliantBrowser()` (UI side, kept symmetric with the
  Rust gate).
