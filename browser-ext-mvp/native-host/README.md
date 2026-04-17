# native-host

MVP native messaging host for the ReDD Focus extension. Sits on disk, the
browser launches it when the extension calls `runtime.connectNative(...)`,
and it streams a blocklist to the extension over stdin/stdout.

## Install / uninstall (macOS, user scope — no sudo)

```bash
./install.sh              # install
./install.sh --uninstall  # remove
```

Install writes `com.ulriklyngs.mind-shield.json` to:

- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`
- `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts/`
- `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts/`
- `~/Library/Application Support/Mozilla/NativeMessagingHosts/`

Uninstall removes each of those files and, only when the resulting
`NativeMessagingHosts/` directory is empty, removes the directory too —
other vendors' hosts are never touched.

Restart the browser after either operation.

## Test

1. Build/sideload the extension from `../reddfocus-open-source/`.
2. Restart the browser. Open the extension's background-page console
   (Firefox: `about:debugging` → Inspect; Chrome/Brave: `chrome://extensions`
   → service worker **inspect**).
3. You should see `[redd-block] blocklist updated: [...]` logged.
4. Visit `reddit.com` — tab should redirect to `blocked.html`.

## Protocol

Chrome/Firefox native messaging framing: each message is a **4-byte
little-endian length** followed by a **UTF-8 JSON payload** on stdin
(extension → host) and stdout (host → extension). `stderr` is free for
logging; the installed browser writes host stderr to its own log.

Host → extension messages handled today:

```json
{ "blocklist": ["reddit.com", "youtube.com", ...] }
```

Extension → host messages are echoed back as `{ "echo": <msg> }` for
debugging — replace with real handlers once the app integration lands.

## Safari

Safari does **not** use this host. Safari Web Extensions route
`browser.runtime.sendNativeMessage` to the containing app's
`SafariWebExtensionHandler.swift`. The same `{ blocklist: [...] }` wire
format should be implemented there when we wire Safari up.

## TODOs

- [ ] Replace the hardcoded `BLOCKLIST` in `host.mjs` with a read from the
      redd-block desktop app (IPC, socket, or shared file).
- [ ] Rewrite the host as a small Rust binary so we don't depend on Node
      being installed on end-user machines.
- [ ] Windows install script (writes registry keys under
      `HKCU\Software\<Vendor>\<Browser>\NativeMessagingHosts\<name>`
      pointing to a `.bat` shim around the host binary).
- [ ] Mirror the host logic inside `SafariWebExtensionHandler.swift` for
      Safari parity.
- [ ] Add a heartbeat so the extension can tell the desktop app is alive.
- [ ] Sign and notarize once shipping — unsigned binaries trip Gatekeeper
      on first launch by the browser.
