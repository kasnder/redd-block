# browser-ext-mvp

Prototypes for extension-based blocking, intended mainly for **Windows**
where users may lack admin rights so hosts-file blocking is awkward.
macOS continues to use the ScreenTime API in the main app — this folder
is disposable scaffolding to validate the extension approach.

## Subfolders

- [profile-scan/](profile-scan) — detects whether ReDD Focus is
  **installed**, **enabled**, and **private-browsing-allowed** across
  every profile of Firefox / Chrome / Brave / Edge / Safari.
- [native-host/](native-host) — Node-based native messaging host + a
  macOS install script that wires it to Chrome / Brave / Edge / Firefox.
- [enforcer/](enforcer) — macOS testbed for the intended Windows flow:
  scan → if a running browser fails → 30 s grace timer → quit.
- `reddfocus-open-source/` — the real ReDD Focus extension. Not
  committed (34 MB clone). Clone separately and apply the patch:
  ```bash
  git clone <reddfocus-repo> reddfocus-open-source
  cd reddfocus-open-source && git apply ../reddfocus-patch.diff
  ```

## Target Windows flow

A daemon inside the redd-block Tauri app runs persistently. Every ~5 s:

1. Enumerate running browser processes via `Win32_Process` (WMI) to
   recover each process's `--user-data-dir` and map it to a profile.
2. Run the profile scanner against each active profile.
3. If `installed && enabled && privateBrowsing` is not all true, start a
   30 s grace timer and show a persistent Windows toast:
   *"ReDD Focus is not fully enabled. Fix it or Chrome closes in 30 s."*
   with a "Fix now" button that opens `chrome://extensions/?id=<id>`.
4. Re-check each tick; cancel the timer if the user fixes it.
5. After 30 s, `taskkill /IM <browser>.exe` (graceful first, `/F` as
   fallback).

## TODOs

### Daemon (Rust/Tauri)
- [ ] Port `profile-scan/scan.mjs` to Rust so the daemon runs it natively.
- [ ] Windows process enumeration via `sysinfo` / WMI. Parse
      `--user-data-dir` to map each process to its profile directory.
- [ ] Multi-profile awareness: a user can open a profile that lacks the
      extension to bypass. Scan every profile a browser has open.
- [ ] Persistent toast UI with countdown + "Fix now" deep link
      (`<browser>://extensions/?id=<id>` for Chromium; `about:addons` for
      Firefox).
- [ ] Graceful quit first (`taskkill /IM`), escalate to `/F` only after
      N seconds to avoid corrupting browser state mid-save.
- [ ] First-offense grace: 60 s with a friendly message; 30 s on repeat.
- [ ] Restart-loop prevention: if the user re-opens immediately with the
      same fail, don't nag — show a blocking redd-block window instead.
- [ ] Persist state across daemon restarts so offense counts and timers
      survive a reboot.
- [ ] Edge cases: portable browsers (`--user-data-dir` on a USB stick),
      Chrome Canary/Beta, incognito-only sessions that never touch disk.

### Blocklist data flow
Reuse the existing `redd-block-data.json` that the Tauri app already
writes — no new file format, no new persistence path. On every platform,
Tauri's `app_data_dir()` resolves to the right per-user location
(`~/Library/Application Support/com.reddblock/` on macOS,
`%APPDATA%\com.reddblock\` on Windows, `~/.config/com.reddblock/` on
Linux). The file already contains `blocklists[]`, `activeBlocks[]`, and
`schedules[]`.

The "currently-blocked domains at time T" is a pure derivation:
intersect `activeBlocks` whose `[startTime, endTime)` contains `now()`
with their `blocklists[*].websites`.

- [ ] Host reads the file at startup, derives the current domain list,
      sends to the extension.
- [ ] Host triggers a re-derivation on two events:
  - `fs.watch` on the data file — catches user toggles, new blocks,
    pause/resume (any write redd-block does).
  - 30 s poll — catches time-only transitions (a scheduled block
    ending at 5 pm doesn't write the file; it just crosses `endTime`).
- [ ] Drop writes to the empty set when no block is active, so the
      extension clears cleanly when a session ends.

### Migration away from hosts-file blocking
Today redd-block blocks by rewriting `/etc/hosts` (macOS) and the
Windows `hosts` file via the helper daemon. The extension-based path
replaces that on Windows and supplements it on macOS. Migration needs:

- [ ] Feature flag in `redd-block-data.json` recording the blocking
      backend (`"hosts"` | `"extension"` | `"both"`). Default to
      `"both"` during rollout so an unenrolled user loses no coverage.
- [ ] On first launch after upgrade, check whether the ReDD Focus
      extension is installed + enabled in every running browser. If
      yes, flip to `"extension"` and stop touching the hosts file. If
      no, stay on `"hosts"` and show the install-the-extension prompt.
- [ ] One-shot cleanup: strip redd-block's existing markers from the
      hosts file when a user moves off `"hosts"`. Leave unrelated
      entries untouched.
- [ ] Keep the helper daemon around during the transition — it still
      owns the hosts-file path for users who haven't migrated.
- [ ] Telemetry (or at least local logs) on which backend is active
      when a block fires, so we can debug "why didn't this block."

### Standalone-safety requirements for the extension patch
The patched ReDD Focus must keep working when redd-block is **not**
installed — it ships to many users who won't have the desktop app. Rules
for any change to `reddfocus-open-source/`:

- [ ] The blocklist starts empty, so zero redirects happen until the
      native host explicitly delivers domains. All existing content-
      script behaviour (hiding distractions on a page) is independent
      of this code path and must stay that way.
- [ ] Guard every `chrome.runtime.connectNative` call with a feature
      check — some platforms/builds lack the API. Current code logs
      "standalone mode" and returns cleanly in that case.
- [ ] Exponential backoff (5 s → 5 min cap) on reconnection attempts
      so "redd-block not installed" doesn't spam logs or burn CPU.
      Reset the backoff on any successful message.
- [ ] No new required permissions beyond `nativeMessaging`. Extra
      permissions trigger a re-review on all three stores and scare
      users on upgrade.

### Safari compile risks
The `nativeMessaging` permission is supported by Safari 14+, routed to
the containing app's `SafariWebExtensionHandler.swift`. Two gotchas to
watch for when building the Safari target in Xcode:

- [ ] The Xcode `safari-web-extension-converter` pipeline is stricter
      than Chrome/Firefox about manifest validity. If a build fails on
      `nativeMessaging`, move it from `permissions` to
      `optional_permissions` and request at runtime via
      `chrome.permissions.request({ permissions: ["nativeMessaging"] })`
      guarded by a platform check.
- [ ] `connectNative(name)` on Safari ignores `name` and always routes
      to the host app's extension handler. The current hardcoded
      `com.ulriklyngs.mindshield` is a no-op there — fine, but worth
      documenting so nobody tries to "fix" it.
- [ ] No native-messaging manifest JSON on Safari; never attempt to
      install one (Safari doesn't look there, and creating one under
      Apple's bundle paths may trip other protections).

### Extension side
- [ ] **Shipping blocker: replace the Node native host with Rust.** End
      users don't have Node, and bundling a Node runtime is a non-starter.
      Two options:
      1. A tiny dedicated binary next to the Tauri app (e.g.,
         `redd-block-host`), shipped in the same `.app` / installer. Clean
         separation, one file to sign + notarize.
      2. A CLI mode on the existing Tauri binary — when the native-host
         manifest's `path` invokes it with `--native-host`, `main()`
         branches into the stdio loop instead of launching the UI. No
         extra binary to ship, but the Tauri app has to start up cheaply
         in headless mode.
      Option 2 is probably cleaner: one signed binary, and the host mode
      can reuse the same blocklist-derivation code the rest of the app
      uses rather than parsing the JSON twice in two languages.
- [ ] Safari parity: port the native-host protocol into
      `SafariWebExtensionHandler.swift`.
- [ ] Bridge native host stdio ↔ a Unix/named-pipe socket owned by the
      daemon (mode 0600). Current `host.mjs` ships a hardcoded blocklist.
- [ ] Heartbeat from the extension so the daemon distinguishes "browser
      closed" / "extension disabled" / "native host crashed."

### Force-install (hardening layer)
Once enforcement works, additionally consider per-browser force-install
policies. ReDD Focus is on both stores, so this needs no self-hosted
update URL — just the store ID. All user-scope on Windows (no admin).

**Force-install covers installed + enabled. It does NOT auto-grant
private-browsing access on Chromium** — users still have to toggle
"Allow in Incognito" themselves. Chromium has no policy for this by
design, so the enforcement loop (scan → nag → quit if private-browsing
still off) is required even with force-install in place.

#### Chrome / Brave / Edge
`HKCU\Software\Policies\Google\Chrome\ExtensionInstallForcelist`
= `"hhblkhfdjijdinijakbmcpkmdfhoadcd;https://clients2.google.com/service/update2/crx"`

Brave/Edge use the same Chromium key under their own vendor paths:
`BraveSoftware\Brave`, `Microsoft\Edge`. No way to auto-enable incognito.

#### Firefox
`HKCU\Software\Policies\Mozilla\Firefox\ExtensionSettings` can set
**both** `installation_mode: "force_installed"` and
`private_browsing: true` for `mindshield@example.com`. Firefox policy
actually covers all three attributes end-to-end — force-install here
is a full solution and reduces the enforcement loop to a safety net.

Force-installed extensions can't be disabled or removed from the browser
UI. A determined user can still delete the registry keys themselves —
acceptable for self-binding, not for adversarial enforcement.

On macOS, force-install requires `sudo` (managed-preferences plist), so
we use the enforcement loop instead.
