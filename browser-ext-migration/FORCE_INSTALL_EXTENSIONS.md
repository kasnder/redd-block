# Force-installing the ReDD Focus extension at ReDD Block install time

> Branch: `explore-force-install-extensions`
> Status: implemented. Chrome / Brave / Edge use the user-level
> External Extensions hint mechanism. Firefox on macOS uses an
> enterprise `policies.json` written into the Firefox bundle.
> Firefox on Windows / Linux falls back to the existing onboarding
> "Install in Firefox" link (no admin-less force-install path is
> available there).
> See `src-tauri/src/extension_install.rs`.
> Out of scope: Safari (handled by the bundled `SafariWebExtensionHandler`).

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

We want ReDD Block's installer (or first-launch) to silently put the
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

ReDD Block runs as the user (no helper daemon, per `MIGRATION_PLAN.md`
§ "What we're not doing"), so the **user-level** options are the only
ones we can rely on without an installer-time UAC / sudo prompt.

### Chromium-family (Chrome, Edge, Brave, Vivaldi, Opera, Arc)

Three viable mechanisms, in increasing intrusiveness:

#### 1. External Extensions / external preferences (user-level, recommended starting point)

Browser checks a per-profile JSON manifest at startup; if it points at
a Web Store extension it auto-fetches and installs it. The JSON lives
inside the user's data directory — no admin, no policy.

- **macOS**:
  `~/Library/Application Support/<Browser>/External Extensions/<ext-id>.json`
  e.g. `~/Library/Application Support/Google/Chrome/External Extensions/hhblkhfdjijdinijakbmcpkmdfhoadcd.json`
- **Windows**:
  `HKCU\Software\Google\Chrome\Extensions\<ext-id>` registry key with an
  `update_url` value of `https://clients2.google.com/service/update2/crx`
  (or the JSON file under `%LOCALAPPDATA%\Google\Chrome\User Data\External Extensions\`).

Contents (cross-platform, JSON variant):
```json
{
  "external_update_url": "https://clients2.google.com/service/update2/crx"
}
```

What the user sees: on next browser launch the extension auto-installs
silently. The extension shows up in `chrome://extensions` like any
other store install. The user **can** disable or remove it from the
extensions UI. If we re-write the External Extensions entry on every
ReDD Block launch, a user-removed extension reinstalls on the
following browser launch — but Chrome remembers a "user uninstalled"
flag and will refuse to auto-reinstall over that for a window of
~24 hours (per Chromium docs). Acceptable for our use case, since
the scanner picks that up and re-prompts.

Per-browser registry / data dir paths follow the slugs we already use
in `native_host_install.rs` — the parent directories are the same.

#### 2. ExtensionInstallForcelist policy (user-level, stickier)

Sets the Chromium policy `ExtensionInstallForcelist` on the user. Once
in this list:

- The extension auto-installs on next browser launch.
- The extension **cannot be disabled or removed** from the browser UI
  (`chrome://extensions` shows a "Installed by your administrator" pill
  with the Disable / Remove controls greyed out).
- Survives "user uninstalled" flag — overrides it.

User-level paths:
- **macOS**: `~/Library/Preferences/com.google.Chrome.plist` etc.
  with key `ExtensionInstallForcelist` = array of `<ext-id>;<update-url>`.
  Set via `defaults write com.google.Chrome ExtensionInstallForcelist -array '<id>;<url>'`.
- **Windows**: `HKCU\Software\Policies\Google\Chrome\ExtensionInstallForcelist`,
  values `1`, `2`, ... = `<ext-id>;<url>`.

Same shape on Brave (`com.brave.Browser` / `BraveSoftware\Brave-Browser`),
Edge (`com.microsoft.Edge` / `Microsoft\Edge`), Vivaldi, Opera. The
policy schema is shared across the Chromium family.

What the user sees: extension installed, locked, "managed by your
administrator" disclaimer in the browser UI. Some users will find
this aggressive — it implies more authority than ReDD Block actually
has. Not the right default; offer it as a "stricter mode" later if
ever.

#### 3. Sideload an unpacked / packed CRX (user-level, fragile)

Drop a `.crx` into a directory and point a registry key at it. Modern
Chrome blocks this for non-Web-Store extensions unless the extension
is whitelisted. Our extension IS on the Web Store, so the External
Extensions path (#1) is the cleaner version of this — skip.

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
`/Applications`. ReDD Block runs as the user; if it has write access
to `/Applications/Firefox.app/Contents/Resources/`, it can drop the
file directly. On managed / non-admin Macs the write fails and we
fall back to the existing onboarding "Install in Firefox" link.

Trade-offs:
- Modifying the .app bundle invalidates Firefox's codesign signature.
  In practice this doesn't break anything: Gatekeeper only verifies
  at quarantine / first-launch, not every launch. Mozilla
  [officially supports](https://mozilla.github.io/policy-templates/)
  this deployment pattern. Firefox auto-updates replace the bundle
  and wipe our policy file, but we re-apply on every ReDD Block
  launch (idempotent install) so it stays in sync.
- "Managed by your administrator" UX. Some users will find it
  aggressive — implies more authority than ReDD Block actually has.
  Acceptable trade for the auto-uninstall behavior; consistent with
  the project's "annoying enough that you have to mean it" stance.

**On Windows** writing into `Program Files` requires UAC elevation,
which conflicts with our "no admin / no helper" stance. Windows
Firefox stays on the existing onboarding link path until / unless
ReDD Block ever ships a privileged installer.

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

| Browser              | Mechanism                                  | UX cost                                     | Auto-uninstall? |
|----------------------|--------------------------------------------|---------------------------------------------|-----------------|
| Chrome / Brave / Edge | External Extensions hint (user-level)     | Chrome safety dialog: "Enable Extension"   | ❌ user removes  |
| Firefox (macOS)      | `policies.json` in `Firefox.app` Resources | Silent + "Managed" badge in `about:addons` | ✅ auto          |
| Firefox (Win / Linux) | (No no-admin path — fall back to AMO link) | One "Add to Firefox" click                 | ❌ user removes  |

**Tier-2 (defer):**
- ExtensionInstallForcelist on Chromium (matches Firefox's lock-down
  + auto-uninstall behavior) — opt-in setting later.
- Firefox `policies.json` on Windows — needs admin / privileged
  installer.
- Vivaldi / Opera / Arc — same code path as Chrome; just need
  detection in `profile_scan` to also opt them in.

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
/// any existing entry (e.g. previous version of ReDD Block) so
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
   scan. The user opens ReDD Block for the first time, we drop the
   hints, and the next time they open Chrome / Firefox the extension
   appears. Onboarding then runs the scanner and most browsers come
   back as "installed" without the user having to do anything.

2. **Installer-time** — a post-install script that runs as the user
   (no UAC). On Windows: NSIS hook. On macOS: a `LaunchAgent`-based
   one-shot or a `postinstall` script in the .pkg. More plumbing for
   marginal UX gain over (1); skip for now.

### Bundling the Firefox `.xpi`

Two options:

- **Bundle it with ReDD Block** at build time — pulled from AMO's
  "latest" URL during the Tauri build. Adds ~200 KB to the bundle.
  Pinned at build time so it can drift behind the latest AMO release;
  acceptable since we can re-bundle on each ReDD Block release.

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
5. **Uninstall hygiene** — ReDD Block's existing uninstall path
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
  to "Install ReDD Focus" between the hint being written and the
  browser actually picking it up on next launch).
