# Force-installing the Digital Habits: Focus extension at Digital Habits: Blocker install time

> **Historical — partial v3 relevance.** Windows Chromium auto-install hints
> still apply. macOS Chromium/Safari use **Automation** in v3 (no extension).
> macOS Firefox is **manual install only**. See [../architecture.md](../architecture.md).

> Branch: `explore-force-install-extensions`
> Status: implemented. The mechanism per browser ended up being
> different by platform once we discovered the OS-level constraints
> empirically:
> - **Chromium-family on macOS**: External Extensions hint (per-user
>   JSON in the browser's user data dir). User-removable; no
>   auto-uninstall.
> - **Chromium-family on Windows**: `ExtensionSettings` policy via
>   HKCU\Software\Policies\* — Mandatory scope, locked install,
>   auto-uninstall.
> - **Firefox on macOS**: `policies.json` inside `Firefox.app` —
>   Mandatory scope, locked install, auto-uninstall, plus auto-grant
>   private-browsing access.
> - **Firefox on Windows / Linux**: existing onboarding "Install in
>   Firefox" link (no admin-less force-install path).
> See `src-tauri/src/extension_install.rs`.
> Out of scope: Safari (handled by the bundled `SafariWebExtensionHandler`).

## Why Chromium on macOS is "External Extensions" and not policy

We initially shipped the `ExtensionSettings` policy approach for
Chromium on macOS (writing to `~/Library/Preferences/<bundle-id>.plist`)
to match Firefox. The plist write succeeded and `chrome://policy`
showed our entry — but with **Source: Platform / Level:
Recommended**. Chromium's macOS policy loader reads user-level
CFPreferences only at Recommended scope; `installation_mode: force_installed`
needs Mandatory scope to take effect, so Chromium silently ignored
the directive and the extension never installed.

The only Mandatory-scope paths on macOS are:
- `/Library/Managed Preferences/<bundle-id>.plist` — admin-only
- Configuration Profiles (`.mobileconfig` installed via System
  Settings → Profiles) — require user UI interaction + admin on
  macOS Sonoma+

We're a no-admin / no-helper app, so neither fits. We reverted to
External Extensions on macOS — same mechanism that's been working
since the earliest commits on this branch. The Windows path stays
on `ExtensionSettings` policy because `HKCU\Software\Policies\*` IS
Mandatory scope without admin on Windows.

The leftover plist entry from that brief release is cleaned up on
install + uninstall by `cleanup_failed_policy_plist_entry` so users
upgrading don't see a stale ignored Recommended entry forever in
`chrome://policy`.

## Known limitation: Chromium has no incognito policy field

Firefox's `ExtensionSettings` schema has a `private_browsing: true`
field that auto-grants the extension access to private windows AND
locks the toggle. Chromium's equivalent schema does NOT have an
incognito field — there's been an [open Chromium request since
2018](https://bugs.chromium.org/p/chromium/issues/detail?id=826712)
that hasn't shipped. Even when an extension is fully managed (e.g.
on Windows where our policy approach actually does take effect),
the "Allow in Incognito" toggle in `chrome://extensions` remains
user-controlled.

So onboarding still has to nag once for "Allow in Incognito" on
Chrome / Brave / Edge. Firefox onboarding is fully automated.

## Note: the original Firefox plan (XPI sideload) doesn't work

An earlier draft of this document proposed sideloading a signed XPI
into `~/Library/Application Support/Mozilla/Extensions/{guid}/`.
That mechanism was deprecated in Firefox 73 and **removed in Firefox
74** (released early 2020). Modern Firefox no longer reads that
directory; sideloaded XPIs sit there but never trigger an install
prompt. We tried this initially and discovered the issue empirically
— the prior version of `extension_install.rs` carried the dead path
+ a bundled XPI in `src-tauri/resources/` which we've since removed.

The current implementation uses Firefox's enterprise `policies.json`
mechanism instead — see "Recommended path" below.

## Why

The current onboarding flow opens the extension store URL for each
detected browser and asks the user to click "Add to {browser}" + flip
the per-extension toggles for incognito / private browsing / "all
sites". On any clean machine that's roughly 4 clicks per browser and
a per-browser walk-through. Users often:

- skip the install step ("I'll do it later"), then are confused when
  websites aren't being blocked,
- install the extension but miss the private-browsing toggle (we have
  the compliance scanner to detect this, but it still requires the
  user to take an extra action),
- forget which browsers they've done.

We want Digital Habits: Blocker's installer (or first-launch) to silently put the
extension in place across every detected non-Safari browser, so the
extension is **already there** when the user's first onboarding scan
runs.

## What "force install" actually means per browser

Force-install is browser-specific. There's no single API. The relevant
mechanisms split along two axes:

- **Privilege required** — does it need admin (HKLM / `/Library/Managed Preferences`)
  or does it work at the user level (HKCU / `~/Library/Preferences`)?
- **User-defeatable** — can the user uninstall the extension afterwards
  via the browser's UI, and does our install survive that?

Digital Habits: Blocker runs as the user (no helper daemon, per `MIGRATION_PLAN.md`
§ "What we're not doing"), so the **user-level** options are the only
ones we can rely on without an installer-time UAC / sudo prompt.

### Chromium-family (Chrome, Edge, Brave, Vivaldi, Opera, Arc)

Two viable user-level mechanisms; we use the first.

#### 1. ExtensionSettings policy (user-level, locked install) — what we ship

Chromium's modern enterprise-policy schema. Per-extension dict with
`installation_mode: "force_installed"` + `update_url` causes the
browser to silently auto-install the extension on next launch and
lock it ("Managed by your organization" pill, disable / remove
controls greyed out). Same role as Firefox's `policies.json`
`ExtensionSettings` entry — same field name, same shape, just
different transport.

User-level paths:
- **macOS**: per-browser `~/Library/Preferences/<bundle-id>.plist`
  (Chromium reads enterprise policies from here alongside its user
  prefs). We write a top-level `ExtensionSettings` dict via the
  `plist` crate and merge into anything already in the file.
  Bundle IDs: `com.google.Chrome`, `com.brave.Browser`,
  `com.microsoft.Edge`.
- **Windows**: nested registry keys at
  `HKCU\Software\Policies\<vendor>\<browser>\ExtensionSettings\<ext-id>`
  with `installation_mode` + `update_url` REG_SZ values.

Auto-uninstall: when Digital Habits: Blocker uninstalls, our uninstall hook
strips the `ExtensionSettings.<ext-id>` entry — Chromium then
auto-uninstalls the extension on next launch. Same lifecycle
ownership as Firefox.

**Known gap: incognito access can't be auto-granted.** Chromium's
`ExtensionSettings` schema doesn't have a `private_browsing` /
`incognito_enabled` field (Firefox does). The "Allow in Incognito"
toggle in `chrome://extensions` remains user-controlled even for
fully-managed installs. There's an [open Chromium feature request
since 2018](https://bugs.chromium.org/p/chromium/issues/detail?id=826712)
that hasn't shipped. So onboarding still has to nag once for
"Allow in Incognito" on Chrome / Brave / Edge.

#### 2. External Extensions hint (user-level, lighter touch) — superseded

Earlier install-era versions used this. Browser checks a per-profile
JSON manifest at startup; if it points at a Web Store extension it
auto-fetches and installs it. JSON lives inside the user data dir;
no admin needed; no policy lock-in.

- **macOS**: `~/Library/Application Support/<Browser>/External Extensions/<ext-id>.json`
- **Windows**: `HKCU\Software\<vendor>\<browser>\Extensions\<ext-id>`

Contents:
```json
{ "external_update_url": "https://clients2.google.com/service/update2/crx" }
```

UX is lighter — extension shows up in `chrome://extensions` like a
normal store install, user can disable or remove it from the UI.
Trade-off: no auto-uninstall when Digital Habits: Blocker goes away (extension
stays unless user removes it). We replaced this with the policy
approach for symmetry with Firefox, locked install, and clean
uninstall hygiene. The current install path also cleans up any
stale External Extensions hints from earlier install-era versions.

#### 3. Sideload an unpacked / packed CRX (user-level, fragile)

Drop a `.crx` into a directory and point a registry key at it.
Modern Chrome blocks this for non-Web-Store extensions unless the
extension is whitelisted. Our extension IS on the Web Store, so the
policy path (#1) is the right answer — skip.

### Firefox

Firefox is materially stricter than Chromium. The shortlist:

#### 1. Sideload via Extensions directory — REMOVED in Firefox 74

Historically Firefox watched:
- **macOS**: `~/Library/Application Support/Mozilla/Extensions/{...}/`
- **Windows**: `%APPDATA%\Mozilla\Firefox\Extensions\{...}\`

XPIs dropped here triggered a one-time install prompt on next launch.
Mozilla [removed this mechanism in Firefox 74](https://blog.mozilla.org/addons/2019/10/31/firefox-to-discontinue-sideloaded-extensions/)
(released early 2020). Modern Firefox simply doesn't read these
directories anymore — XPIs placed there sit forever doing nothing.
**Don't use this path.**

#### 2. policies.json — admin on Windows, USABLE on macOS

`distribution/policies.json` next to the Firefox binary:

- **macOS**: `/Applications/Firefox.app/Contents/Resources/distribution/policies.json`
- **Windows**: `%PROGRAMFILES%\Mozilla Firefox\distribution\policies.json` (admin-only)

```json
{ "policies": { "ExtensionSettings": { "<gecko-id>": {
  "installation_mode": "force_installed",
  "install_url": "https://addons.mozilla.org/firefox/downloads/latest/reddfocus/latest.xpi"
}}}}
```

On Firefox launch: silent install from AMO, "Managed by your
administrator" badge in `about:addons`, user can't disable/remove
from the UI. When the policy entry is removed, Firefox auto-uninstalls
the extension on its next launch — clean install + uninstall hygiene.

**On macOS this is feasible without `sudo`** because consumer Macs
typically grant the logged-in user admin group write access to
`/Applications`. Digital Habits: Blocker runs as the user; if it has write access
to `/Applications/Firefox.app/Contents/Resources/`, it can drop the
file directly. On managed / non-admin Macs the write fails and we
fall back to the existing onboarding "Install in Firefox" link.

Trade-offs:
- Modifying the .app bundle invalidates Firefox's codesign signature.
  In practice this doesn't break anything: Gatekeeper only verifies
  at quarantine / first-launch, not every launch. Mozilla
  [officially supports](https://mozilla.github.io/policy-templates/)
  this deployment pattern. Firefox auto-updates replace the bundle
  and wipe our policy file, but we re-apply on every Digital Habits: Blocker
  launch (idempotent install) so it stays in sync.
- "Managed by your administrator" UX. Some users will find it
  aggressive — implies more authority than Digital Habits: Blocker actually has.
  Acceptable trade for the auto-uninstall behavior; consistent with
  the project's "annoying enough that you have to mean it" stance.

**On Windows** writing into `Program Files` requires UAC elevation,
which conflicts with our "no admin / no helper" stance. Windows
Firefox stays on the existing onboarding link path until / unless
Digital Habits: Blocker ever ships a privileged installer.

#### 3. Sideload via Extensions directory — REMOVED in Firefox 74

(See above.)

### Browsers we'd skip / treat as best-effort

- **Arc**: Chromium-family but uses a non-standard data layout in
  some versions. External Extensions path *should* work since Arc
  honors the Chromium directory; verify in testing.
- **Vivaldi / Opera**: same — Chromium under the hood, External
  Extensions path applies; light testing needed.
- **Tor Browser / LibreWolf / Waterfox**: Firefox forks. Sideload via
  Extensions dir likely works but the extension may need to be
  re-signed by Mozilla *for that fork's app ID*. Skip for now.

## Recommended path

**Tier-1 default (covered by this work):**

| Browser                       | Mechanism                                                                          | UX cost                                                                                            | Auto-uninstall? |
|-------------------------------|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|-----------------|
| Chrome / Brave / Edge (macOS)   | External Extensions hint JSON (per-user, in browser user-data dir)                | Chrome safety dialog: "Enable Extension"; manual "Allow in Incognito"                              | ❌ user removes  |
| Chrome / Brave / Edge (Windows) | `ExtensionSettings` policy (`HKCU\Software\Policies\<vendor>\<browser>\...`)      | Silent + "Managed by your organization" in `chrome://extensions`; manual "Allow in Incognito"     | ✅ auto          |
| Firefox (macOS)                 | `policies.json` in `Firefox.app` Resources                                        | Silent + "Managed" badge in `about:addons`; private-browsing auto-granted                          | ✅ auto          |
| Firefox (Windows / Linux)       | (No no-admin path — fall back to AMO link)                                        | One "Add to Firefox" click                                                                         | ❌ user removes  |

**Tier-2 (defer):**
- Firefox `policies.json` on Windows — needs admin / privileged
  installer.
- Chromium force-install on macOS — needs Configuration Profile
  installed via System Settings + admin (or MDM enrollment); not
  feasible from a no-helper user-mode app.
- Vivaldi / Opera / Arc — same code path as Chromium; just need
  detection in `profile_scan` to also opt them in.
- Auto-grant Chromium incognito access — pending [Chromium feature
  request](https://bugs.chromium.org/p/chromium/issues/detail?id=826712);
  no shippable workaround.

## Implementation sketch

The existing `native_host_install` module is the closest analogue —
it already enumerates Chromium-family browsers, picks per-browser
install paths, writes JSON to platform-specific directories, and
handles the Windows registry case. The new module would mirror it
fairly closely.

### New module `src-tauri/src/extension_install.rs`

Public surface:
```rust
/// Browsers we can target. Same list as `native_host_install` plus
/// any Chromium-fork detection we want to add.
pub enum BrowserTarget { Chrome, Edge, Brave, /* Vivaldi, Opera, ... */, Firefox }

/// Place the install hint for one browser. Idempotent — overwrites
/// any existing entry (e.g. a previous install) so
/// updates stay clean.
pub fn install_one(browser: BrowserTarget) -> std::io::Result<()>;

/// Walk every detected browser (re-using `profile_scan::find_browser_exe`
/// or similar) and install hints for all. Returns the per-browser
/// outcome so the UI can show "installed in 3 browsers" and surface
/// failures.
pub fn install_all() -> InstallReport;

/// Tear down — called from the existing uninstall path. Removes
/// External Extensions JSONs and the Firefox XPI we sideloaded.
pub fn uninstall_all() -> std::io::Result<()>;
```

Per-browser implementation:
- **Chromium-family**: write `<ExternalExtensionsDir>/<ext-id>.json`
  with `{"external_update_url": "..."}`. The dir + extension ID we
  already know from the existing scan + native-host install code.
- **Firefox**: bundle the signed `.xpi` (downloaded from AMO at build
  time, or fetched on first run) and copy it into the user's
  Firefox Extensions dir. The XPI filename must match the
  extension's internal ID.

### Hooking into the install / first-run flow

Two reasonable trigger points:

1. **First-launch install (preferred for v1)** — call `install_all()`
   from the existing onboarding flow, just before the compliance
   scan. The user opens Digital Habits: Blocker for the first time, we drop the
   hints, and the next time they open Chrome / Firefox the extension
   appears. Onboarding then runs the scanner and most browsers come
   back as "installed" without the user having to do anything.

2. **Installer-time** — a post-install script that runs as the user
   (no UAC). On Windows: NSIS hook. On macOS: a `LaunchAgent`-based
   one-shot or a `postinstall` script in the .pkg. More plumbing for
   marginal UX gain over (1); skip for now.

### Bundling the Firefox `.xpi`

Two options:

- **Bundle it with Digital Habits: Blocker** at build time — pulled from AMO's
  "latest" URL during the Tauri build. Adds ~200 KB to the bundle.
  Pinned at build time so it can drift behind the latest AMO release;
  acceptable since we can re-bundle on each Digital Habits: Blocker release.

- **Download on first run** — fetch from
  `https://addons.mozilla.org/firefox/downloads/latest/reddfocus/latest.xpi`
  the first time we install the hint for Firefox. Always current.
  Requires network; slows onboarding.

Bundling is simpler and more robust offline; lean toward that.

## Open questions

1. **Brave's "Brave Web Store"** — Brave detects the Chromium External
   Extensions path the same way Chrome does, but its update URL
   resolves through Brave's own mirror. Verify the
   `clients2.google.com/service/update2/crx` URL works for Brave. (It
   should — Brave preserves Chrome compatibility for this — but worth
   testing.)
2. **Edge** uses `https://edge.microsoft.com/extensionwebstorebase/v1/crx`
   as its preferred update URL. Test whether Chrome's URL also works
   on Edge (it usually does via Edge's compat path) before deciding
   per-browser update URL handling.
3. **Per-profile vs per-browser** — Chromium reads External Extensions
   from a per-*browser* dir (not per-profile), so one drop covers all
   profiles. Confirm.
4. **What if the user already has the extension installed?** External
   Extensions hint is a no-op in that case — Chrome dedupes by ID.
   Verify Firefox sideload behavior is the same (probably: re-prompt
   if version differs).
5. **Uninstall hygiene** — Digital Habits: Blocker's existing uninstall path
   (`commands/uninstall.rs`) needs to also remove these hints so a
   clean uninstall doesn't leave hooks pointing at a non-existent app.

## Next steps for this branch

- Spike the Chromium External Extensions path on Chrome (macOS first,
  it's the easiest substrate to verify): write the JSON, launch
  Chrome, observe the extension appear in `chrome://extensions`.
- Repeat on Brave + Edge to confirm path layout.
- Write the Windows HKCU equivalent and test on a Windows VM.
- Spike the Firefox XPI sideload — confirm the one-time prompt UX.
- Fold the spike code into `extension_install.rs` and wire it into
  the onboarding flow.
- Update `commands/uninstall.rs` to clean up the hints.
- Update `profile_scan.rs` so the compliance scanner doesn't re-prompt
  for installs we know we've already hinted (avoid prompting the user
  to "Install Digital Habits: Focus" between the hint being written and the
  browser actually picking it up on next launch).
