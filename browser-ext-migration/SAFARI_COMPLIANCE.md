# Safari Extension Compliance Detection

How ReDD Block tells whether the Safari Web Extension is **installed**,
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

### 3. The cached heartbeat file (last-known-good state when Safari is closed)

When Safari isn't running, the heartbeat is necessarily stale, but
the file still contains the last successfully-reported state. We
treat that as authoritative for the migration UI ("did the user
ever set Safari up?"). The enforcer doesn't care — it short-circuits
on `!present` (Safari not running ⇒ nothing to enforce).

---

## Two scenarios, two behaviours

The detection logic in `scan_safari` (`src-tauri/src/profile_scan.rs`)
splits on whether Safari is currently running.

### A. Static check — Safari is closed

Used by the migration onboarding UI ("Safari ✓ Set up" badge).

- `installed` = `pluginkit` registered the bundle **or** a heartbeat
  file exists.
- `enabled` = `Some(true)` if a heartbeat file exists at all (we
  observed it running successfully at some point).
- `privateBrowsing` = the boolean from the cached heartbeat file.

Trade-off: if the user disables the extension while Safari is
**closed**, the migration UI keeps showing "Set up" until Safari is
reopened. Self-corrects within ~45 s of relaunch. We don't have any
signal we could use to detect a disable-while-closed without either
Full Disk Access or a different app architecture.

### B. Runtime enforcement — Safari is running

Used by the compliance gate (`compliant()` in `profile_scan.rs`)
which the enforcer
(`src-tauri/src/enforcer.rs`) consumes.

- `installed` = same as above.
- `enabled` = `Some(true)` only if the heartbeat is **fresh**.
  Stale → `Some(false)`. The user just disabled or uninstalled the
  extension while Safari is open.
- `privateBrowsing` = the boolean from the heartbeat *only when
  fresh*; otherwise `None` (so the gate fails closed).

The compliance gate requires:

```rust
p.installed && p.enabled == Some(true) && p.private_browsing == Some(true)
```

(see `compliant()` in `profile_scan.rs`). This mirrors the Chromium
gate exactly — the asymmetric "trust Safari to self-report" version
that landed during the v1.1 migration was wrong and silently passed
every Safari install; it's now corrected.

### Worst-case enforcement timeline

| Step | Window |
|---|---|
| Heartbeat fires | every 15 s |
| Heartbeat goes stale | after 45 s without a write |
| Compliance flips → enforcer notices | next scan tick (≤ 5 s) |
| User-configurable grace (5 s min, 60 s default, 300 s max) | 5–300 s |
| Force-quit | when grace hits zero |

**Default total**: ≈ 105 s before Safari is force-quit when the user
disables the extension.
**Tightest configurable**: ≈ 50 s.

---

## What the user can still do (and why we accept it)

ReDD Block is a focus app, not a security product. The model is
honor-system + significant friction, not perfect prevention.

- **Disable the extension while Safari is open** → ≤ 45 s detection,
  then grace, then force-quit. ✓ caught.
- **Disable the extension while Safari is closed, then reopen** →
  ≤ 45 s detection from reopen. ✓ caught.
- **Disable, browse for ≤ 30 s, quit Safari before grace expires** →
  not caught this cycle, but next launch detects within 45 s.
- **Force-quit-relaunch loop** → each cycle gives ~30–45 s of browsing.
  Repeat-offence grace tightens to 30 s, which helps.
- **Use a different browser** → outside scope; the user installs the
  extension in every browser they care about.
- **Hand-edit `safari-status.json` in the App Group container** →
  forges compliance. Requires shell access during a focus session;
  out of scope.

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
