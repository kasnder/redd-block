// SafariWebExtensionHandler.swift
//
// Native messaging handler for the Safari target of the ReDD Focus
// extension. Safari routes `browser.runtime.sendNativeMessage` /
// `browser.runtime.connectNative` to this class inside the
// containing .app bundle instead of spawning a separate native host
// binary (like Chrome/Firefox/Edge do).
//
// The wire format matches what the Rust native host
// (`src-tauri/src/native_host.rs`) sends on other browsers:
//
//   host -> extension:  { "blocklist": ["reddit.com", "x.com", ...] }
//
// On Safari we don't use length-prefix framing. Each `beginRequest`
// invocation delivers exactly one message, and we reply with one
// response via `NSExtensionItem.userInfo`.
//
// --- How to integrate (Xcode) ---
//
// 1. File -> New -> Target -> macOS -> Safari Extension.
//    Embed in the ReDD Block app target.
// 2. Replace Xcode's generated `SafariWebExtensionHandler.swift`
//    with this file.
// 3. Copy the patched ReDD Focus extension from
//    `browser-ext-mvp/reddfocus-open-source/Shared (Extension)/Resources/`
//    into the extension target's Resources.
// 4. Confirm the extension bundle identifier matches what
//    `src-tauri/src/profile_scan.rs::SAFARI_BUNDLE_ID` expects
//    (`com.ulriklyngs.mind-shield.mind-shield` by default).
//
// --- Limitations (documented in browser-ext-mvp/README.md) ---
//
// - Safari ignores the `name` argument to `connectNative(name)`;
//   it always routes to this handler. No native-messaging manifest
//   JSON is needed (and we must not try to install one).
// - The `nativeMessaging` permission is finicky on Safari. If the
//   Xcode `safari-web-extension-converter` pipeline rejects the
//   manifest, move the permission to `optional_permissions` and
//   request at runtime with a platform check.

import SafariServices
import Foundation

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        // Safari wraps the extension's payload in the first input
        // item's userInfo dictionary under "message".
        let request = context.inputItems.first as? NSExtensionItem
        let incoming = request?.userInfo?[SFExtensionMessageKey]

        // Log for debugging (shows up in Console.app under the
        // extension process). Remove before shipping.
        NSLog("ReDDFocus native message: %@", String(describing: incoming))

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: buildBlocklistMessage()]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    /// Derive the current blocklist from redd-block-data.json. Mirrors
    /// `native_host::derive_blocklist` in Rust so the two hosts behave
    /// identically across browsers.
    private func buildBlocklistMessage() -> [String: Any] {
        let domains = deriveBlocklist()
        return ["blocklist": domains]
    }

    private func deriveBlocklist() -> [String] {
        guard let url = reddBlockDataURL(),
              let data = try? Data(contentsOf: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return []
        }

        let nowMs = UInt64(Date().timeIntervalSince1970 * 1000)
        let blocklists = root["blocklists"] as? [[String: Any]] ?? []
        let active = root["activeBlocks"] as? [[String: Any]] ?? []
        let schedules = root["schedules"] as? [[String: Any]] ?? []

        func websitesFor(_ id: String) -> [String] {
            guard let b = blocklists.first(where: { ($0["id"] as? String) == id }) else { return [] }
            let arr = b["websites"] as? [String] ?? []
            return arr.map { $0.lowercased() }
        }

        var out = Set<String>()

        for ab in active {
            let start = (ab["startTime"] as? NSNumber)?.uint64Value ?? 0
            let end = (ab["endTime"] as? NSNumber)?.uint64Value ?? 0
            let paused = ab["isPaused"] as? Bool ?? false
            if paused || nowMs < start || nowMs >= end { continue }
            if let id = ab["blocklistId"] as? String {
                for w in websitesFor(id) { out.insert(w) }
            }
        }

        for sch in schedules {
            if !isScheduleActiveNow(sch, nowMs: nowMs) { continue }
            if let id = sch["blocklistId"] as? String {
                for w in websitesFor(id) { out.insert(w) }
            }
        }

        return Array(out).sorted()
    }

    private func isScheduleActiveNow(_ schedule: [String: Any], nowMs: UInt64) -> Bool {
        let paused = schedule["isPaused"] as? Bool ?? false
        let pauseEnd = (schedule["pauseEndTime"] as? NSNumber)?.uint64Value ?? 0
        if paused && pauseEnd > nowMs { return false }

        let segments = schedule["segments"] as? [[String: Any]] ?? []
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        let now = Date(timeIntervalSince1970: TimeInterval(nowMs) / 1000)
        let comps = cal.dateComponents([.weekday, .hour, .minute], from: now)
        // Foundation's weekday is 1=Sunday..7=Saturday; JS 0=Sun..6=Sat.
        let wd = UInt8(((comps.weekday ?? 1) - 1) & 7)
        let nowMin = UInt32((comps.hour ?? 0) * 60 + (comps.minute ?? 0))

        for seg in segments {
            let sh = (seg["startHour"] as? NSNumber)?.uint32Value ?? 0
            let sm = (seg["startMinute"] as? NSNumber)?.uint32Value ?? 0
            let eh = (seg["endHour"] as? NSNumber)?.uint32Value ?? 0
            let em = (seg["endMinute"] as? NSNumber)?.uint32Value ?? 0
            let startMin = sh * 60 + sm
            let endMin = eh * 60 + em
            let days = (seg["days"] as? [NSNumber])?.map { $0.uint8Value } ?? []
            let allDay = startMin == endMin
            if allDay {
                if days.contains(wd) { return true }
                continue
            }
            if startMin < endMin {
                if days.contains(wd) && nowMin >= startMin && nowMin < endMin { return true }
            } else {
                let yesterday = UInt8((wd + 6) % 7)
                if days.contains(wd) && nowMin >= startMin { return true }
                if days.contains(yesterday) && nowMin < endMin { return true }
            }
        }
        return false
    }

    /// Locate redd-block-data.json. Prefers the shared system-wide
    /// location if it exists, otherwise falls back to the per-user
    /// Application Support path.
    private func reddBlockDataURL() -> URL? {
        let shared = URL(fileURLWithPath: "/var/lib/redd-block/redd-block-data.json")
        if FileManager.default.fileExists(atPath: shared.path) { return shared }
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home
            .appendingPathComponent("Library/Application Support/com.redd.block/redd-block-data.json")
    }
}
