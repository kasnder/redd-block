# Bundled resources

Files copied into the Tauri bundle's resource directory at build time
and read at runtime via `app.path().resource_dir()`.

## `redd-focus.xpi` — bundled Firefox extension

`extension_install::install_firefox` sideloads this signed XPI into
the user's Firefox Extensions directory at first launch so the
extension auto-installs (with one Firefox confirmation prompt).
Without this file in place, the Firefox sideload step silently
no-ops and the user falls back to the existing onboarding "Install
in Firefox" link.

### How to refresh

1. Visit https://addons.mozilla.org/firefox/addon/reddfocus/
2. Right-click "Add to Firefox" → "Save link as…" — saves the latest
   signed XPI from AMO.
   (Or use the AMO redirect:
   `https://addons.mozilla.org/firefox/downloads/latest/reddfocus/latest.xpi`)
3. Save the file as `redd-focus.xpi` in this directory, overwriting
   the previous version.
4. Commit it. The next ReDD Block release picks it up at build time.

The XPI is keyed on the `browser_specific_settings.gecko.id` from the
extension's manifest (currently `mindshield@example.com`). At runtime
we copy this file to
`~/Library/Application Support/Mozilla/Extensions/{ec8030f7-c20a-464f-9b0e-13a3a9e97384}/mindshield@example.com.xpi`
on macOS, or the equivalent path on Windows / Linux.

### Why we bundle rather than fetch on first run

- Works offline / behind a corporate firewall that blocks AMO.
- Avoids a per-launch HTTP call.
- Version is locked to the ReDD Block release the user installed,
  so any extension breakage is reproducible against a known XPI.

The trade-off: ReDD Block releases need to re-bundle a fresh XPI
when the Firefox extension ships a meaningful update. If the user's
bundled XPI is older than the latest published one, Firefox will
still auto-update via AMO once the user has accepted it (just like
any other store install) — so this is a "first install" concern
only.
