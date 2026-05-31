# Safari extension bundling — branch handoff

> **Obsolete — not shipped in v3.** Bundled Safari Web Extension, App Group
> bridge, and Full Disk Access paths were removed in v3.0. Kept for git
> archaeology only. Current macOS Safari blocking: Automation in
> `src-tauri/src/web_automation.rs`.

Snapshot of `bundle-safari-extension` at the point you paused for
your weekend solo work. Written so you don't have to reconstruct the
context from chat scrollback.

## TL;DR

ReDD Focus's Safari Web Extension is now built into and shipped
inside `ReDD Block.app/Contents/PlugIns/`. Installing ReDD Block on
macOS lights up ReDD Focus in Safari → Settings → Extensions
automatically — no separate App Store install, no Full Disk Access
prompt to "verify the extension is installed". That part works
end-to-end.

What's still rough is (a) the `.dmg` Tauri packs pre-embed, (b) the
onboarding UI copy still says "click Details on ReDD Focus", and
(c) full state-detection (enabled / private / all-sites) still
requires FDA — Phase 4b would drop that requirement via in-process
SafariServices, source for which is vendored but not wired up.

## Branch state

```
bundle-safari-extension @ b1aa86d
   based on: claude/plan-extension-migration-J9CTL @ 4bf184f
```

Commits on this branch (oldest → newest):

| SHA       | What                                                        |
|-----------|-------------------------------------------------------------|
| `b5eeae4` | Vendor `redd-focus-web@21bdfd4` (v6.1.1) into the repo      |
| `87b797e` | `scripts/build-safari-extension.sh` — `xcodebuild` → `.appex` |
| `e816ae4` | `scripts/embed-safari-extension.sh` — copy into `PlugIns/`, inner-out re-sign |
| `18f1af0` | Wire embed into `scripts/build-mac.sh`                      |
| `e1e9ae9` | Add `notarize-app.sh` + `safari-extension.entitlements.plist` (Tahoe pkd needs sandboxed appex + stapled host) |
| `a3014a7` | `profile_scan` recognizes embedded copy without FDA          |
| `b130607` | `notarize-app.sh` self-heals from interrupted notarize runs (stapler tries Apple's servers first) |
| `b1aa86d` | Vendor Swift `safari-tool.swift` + build script (Phase 4b prep) |

## What works end-to-end

- `npm run build:mac` builds, embeds, signs inner-out, notarizes,
  staples. (`scripts/build-mac.sh` line 64 is the embed call.)
- `npm run build:mac-pkg -- --release` wraps the post-embed `.app`
  into a notarized `.pkg`. Confirmed `ditto` preserves the staple
  ticket and embedded `.appex`.
- Onboarding panel reports **Safari: Extension installed** when the
  bundled `.appex` is present, regardless of FDA — see
  `embedded_safari_extension_present()` in `profile_scan.rs`.
- `pluginkit -m -i com.reddblock.SafariExtension` finds the entry.
- Safari → Settings → Extensions shows "ReDD Focus 6.1.1 from ReDD
  Block" — host attribution is correct.

## Open items

### 1. `.dmg` is stale after embed — **DONE**

`scripts/build-mac.sh` now passes `--bundles app` to Tauri, which
skips the `.dmg` target entirely. `.pkg` from
`scripts/build-mac-pkg.sh` is the shippable installer; the `.app`
in `for-distribution/` is the right one for ad-hoc testing.

If a `.dmg` is ever wanted again (e.g. for a "drag to /Applications"
install option), the right path is to add it AFTER
`embed-safari-extension.sh` runs — `hdiutil create` from the
post-embed `.app` + sign + `notarize-app.sh` (which already handles
`.pkg`/`.dmg` the same way as `.app`). Don't go back to letting
Tauri build the `.dmg` pre-embed — that was the source of the
stale-artifact bug.

### 2. Onboarding UI copy still says "click Details on ReDD Focus"

**Status:** decided shape, not implemented.

**Where:** `src/app.js`, lines 1804–1817 in `renderBrowserInstallButtons`.

**Decided structure (from chat):** for Safari, replace the single
instruction line with a 3-step checklist:

```
✓ Extension installed
1. Click ReDD Focus → enable the extension       [done|next|pending]
2. Click "Allow in Private Browsing"             [done|next|pending]
3. Click "Always Allow on Every Website…"        [done|next|pending]
[Open Safari → Extensions]   [Show me how >]
```

Each step's marker comes from the plist scan:
- `step 1 done` ⟺ `profile.enabled === true`
- `step 2 done` ⟺ `profile.privateBrowsing === true`
- `step 3 done` ⟺ `profile.websiteAccessAll === true`

The "click Details" wording is wrong on macOS 26 anyway — Safari
shows the per-extension panel inline when you select the extension
in the left list.

Other browsers (Chrome / Firefox / etc.) keep their current
single-action format.

### 3. Phase 4b — SafariServices in-process (drops FDA)

**Status:** Swift source vendored, integration not done.

**Why:** `SFSafariExtensionManager.getStateOfSafariExtension(...)`
gives `isEnabled` without needing Full Disk Access. Combined with
`SFSafariApplication.showPreferencesForExtension(...)` for a true
deep-link to the extension's row in Safari, this would let us drop
the FDA prompt from the Safari onboarding flow entirely.

**What's in place:**
- `src-tauri/safari-bridge/safari-tool.swift` — Swift CLI source
  for both subcommands (`state`, `open`).
- `scripts/build-safari-bridge.sh` — universal arm64+x86_64 swiftc
  + lipo. Verified to produce a working binary.

**What's not in place — and why the obvious approach failed:**

The sidecar approach (run `safari-tool` as a child process from Rust
via `std::process::Command`) does NOT work. SFSafariExtensionManager
returns `SFErrorDomain error 1` (extensionNotFound) even when the
binary lives inside `ReDD Block.app/Contents/MacOS/` and
`Bundle.main.bundleIdentifier` correctly resolves to `com.reddblock`.
The framework appears to require the call to come from the
*registered main executable* of the host bundle, which is `redd-block`
(the Tauri-built Rust binary), not a sibling Swift binary.

**The proper fix:** compile the Swift source as a static or dynamic
library exposing `@_cdecl` functions, link from the Rust crate, and
call via `extern "C"`. Sketch:

```swift
@_cdecl("safari_extension_state")
public func safari_extension_state(
    _ bundleIdPtr: UnsafePointer<CChar>,
    _ outPtr: UnsafeMutablePointer<CChar>,
    _ outLen: Int
) -> Int32 { … }
```

Build: `swiftc -emit-library -static -framework SafariServices -o libsafari_bridge.a safari-tool.swift`.
Rust side: `build.rs` invokes swiftc, emits `cargo:rustc-link-lib=static=safari_bridge`,
declares `extern "C"` shims.

Watch out for: SFSafariExtensionManager uses a completion-handler
pattern → need a `DispatchSemaphore` or `RunLoop` inside the Swift
function to make the C-ABI shim synchronous. The vendored
`safari-tool.swift` already has this pattern for the CLI.

**Once Phase 4b lands, also drop:**
- `commands/safari_bridge.rs` (the FDA-onboarding Tauri command)
- The `'needs-fda'` branch in `src/app.js`'s `browserComplianceStatus`
- The `'Full Disk Access required'` notes from `profile_scan.rs`

### 4. Build pipeline edge cases

**Re-runnability after interrupted notarize:**

`scripts/notarize-app.sh` now self-heals via stapler-first fast
path — if a previous run uploaded but didn't staple (OOM kill,
closed terminal), re-running notarize-app.sh against the same
bytes will fetch the cached ticket from Apple's servers and
staple it without re-uploading. ~1s vs ~5min. Confirmed working.

But: this only fires if you run `notarize-app.sh` directly on the
already-signed `.app`. If you re-run the full `npm run build:mac`,
embed-safari-extension.sh's `codesign --force` invalidates the
CDHash, defeats the cache, and you pay the 5-min round trip again.

**Optional follow-up:** make `embed-safari-extension.sh` skip the
.appex rebuild + re-sign when the existing `.app` already has a
valid embed under our team's signature. Gate behind
`REBUILD_SAFARI_EXTENSION=1` for when the extension source did
change. Saves the 5-min round trip on a true full-pipeline re-run.
Not done yet — not sure how often interrupted builds will happen
in practice.

## Things tried and ruled out

- **External Extensions hint for Safari** (analogue of the Chromium
  approach in `extension_install.rs`): doesn't exist. Safari Web
  Extensions can only be installed by being inside a host app's
  `Contents/PlugIns/`.
- **XPI-style Firefox sideload for Safari**: also doesn't exist.
- **Modifying the upstream `redd-focus-web` entitlements file** to
  add app-sandbox: deliberately not done. We override at sign time
  via `src-tauri/safari-extension.entitlements.plist` to keep the
  standalone ReDD Focus Xcode build untouched. The standalone app
  has its own (App-Store-driven) sandbox config.
- **Sidecar Swift binary calling SFSafariExtensionManager**: see
  §3 above. Failed with extensionNotFound regardless of bundle path.
- **Telling Tauri to skip its own DMG step via `--bundles app`**:
  not tried, would let us own the DMG flow end-to-end. Reasonable
  if we go with §1 option (a) instead of (b).

## Local-environment caveats

- **`/Applications/ReDD Block.app` was hand-modified during the
  bring-up debugging.** Specifically: re-embedded with sandboxed
  entitlements and re-notarized in place via `embed-safari-extension.sh
  /Applications/ReDD Block.app`. Owned by root from the .pkg install,
  so further hand-modifications need sudo. **Recommendation:**
  blow it away and reinstall from a fresh `.pkg` once the branch
  is in shape — `sudo rm -rf "/Applications/ReDD Block.app"` then
  install from `for-distribution/ReDD-Block-X.Y.Z.pkg`.
- The Chromium tombstone scrub fix (commit on
  `explore-force-install-extensions`) cleared
  `extensions.external_uninstalls` from your Chrome Default profile.
  Backup is at `Default/Preferences.reddbak` — safe to delete once
  things look good.
- `redd-focus-web/` is now a tracked directory (was a leftover
  submodule before — we deleted `.git/modules/redd-focus-web` and
  the `submodule.redd-focus-web` entry from `.git/config`). If you
  ever want to pull upstream changes, just go in and `git pull`
  in that dir, then commit the resulting diff in this repo. Or
  re-add as a real submodule when the time comes to merge the apps.

## Quick reference — what each script does

| Script | Job |
|---|---|
| `scripts/build-safari-extension.sh` | Run xcodebuild on macOS Extension target → universal `.appex` |
| `scripts/embed-safari-extension.sh` | Build .appex → copy into `<app>/Contents/PlugIns/` → inner-out re-sign → notarize → staple |
| `scripts/notarize-app.sh` | Submit `.app` to Apple notary, wait, staple. Stapler-first fast path on re-runs. |
| `scripts/build-safari-bridge.sh` | Compile `safari-tool.swift` → universal CLI binary (currently unused; Phase 4b prep) |
| `scripts/build-mac.sh` | Tauri build → embed (calls embed script) → copy to `for-distribution/` |
| `scripts/build-mac-pkg.sh` | Wrap the post-embed `.app` into a signed/notarized `.pkg` |

## Quick reference — environment knobs

| Env var | Effect |
|---|---|
| `SKIP_SAFARI_EXTENSION=1` | Skip the embed step in `build-mac.sh` (smoke tests / cross-build) |
| `SAFARI_EXT_SKIP_NOTARIZE=1` | Skip Apple notary call (fast dev iteration; extension WILL NOT load on Tahoe without notarization) |
| `SAFARI_EXT_BUNDLE_ID` | Override `com.reddblock.SafariExtension` |
| `SAFARI_EXT_SIGNING_IDENTITY` | Override the Developer ID |
| `SAFARI_EXT_CONFIGURATION` | `Release` (default) or `Debug` |
| `BUILD_MAC_TARGET` | Target triple — `universal-apple-darwin` (default) or single-arch |
