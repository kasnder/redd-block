# safari-handler

`SafariWebExtensionHandler.swift` — native messaging handler for the
Safari target of the ReDD Focus extension. Safari routes
`browser.runtime.sendNativeMessage` directly to this class inside
the containing `.app` bundle, so no native-messaging manifest JSON /
registry key is involved (unlike Chrome/Firefox/Edge, which go
through the Rust `--native-host` CLI mode on the main binary).

The wire format it emits matches what the Rust host emits on other
browsers:

```json
{ "blocklist": ["reddit.com", "x.com", …] }
```

so the patched ReDD Focus extension doesn't need a Safari-specific
code path.

## How to integrate

1. Open the Tauri-generated Xcode project.
2. File → New → Target → macOS → Safari Extension. Embed in the
   ReDD Block app target.
3. Replace Xcode's auto-generated `SafariWebExtensionHandler.swift`
   with the one in this folder.
4. Copy the patched ReDD Focus extension resources from
   `browser-ext-mvp/reddfocus-open-source/Shared (Extension)/Resources/`
   into the Safari extension target's Resources.
5. Confirm the extension bundle identifier matches the one
   `src-tauri/src/profile_scan.rs` checks for
   (`SAFARI_BUNDLE_ID`, default
   `com.ulriklyngs.mind-shield.mind-shield`).

## Limitations

- `nativeMessaging` is finicky in Safari's extension review. If
  `safari-web-extension-converter` rejects the manifest, move the
  permission to `optional_permissions` and request at runtime with a
  platform check (see `browser-ext-mvp/README.md`).
- Safari ignores the `name` argument to `connectNative(name)`. Don't
  install a manifest JSON under Apple's bundle paths — Safari never
  reads them and doing so may trip other protections.
