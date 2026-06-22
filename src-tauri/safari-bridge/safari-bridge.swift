// In-process Swift bridge into SafariServices, built as a dylib and
// linked into the main `redd-block` Rust binary. Two C-ABI exports:
//
//   redd_safari_extension_state
//     Calls SFSafariExtensionManager.getStateOfSafariExtension and
//     writes a JSON status object into the caller-provided buffer.
//     Returns 0 on success, non-zero on error. The output is always
//     a valid JSON object — error cases serialize as
//     `{"error": "<localized message>"}`. Crucially, this works
//     WITHOUT Full Disk Access — Apple specifically intends host
//     apps to use this API to introspect their own bundled
//     extension's state, so it bypasses the TCC gate that protects
//     Safari's WebExtensions plist (which the older plist-scanning
//     path needs).
//
//   redd_safari_open_extension_settings
//     Calls SFSafariApplication.showPreferencesForExtension to deep-
//     link the user straight to the extension's row in Safari →
//     Settings → Extensions. Saves them ~3 navigation clicks vs
//     opening Safari, hitting Cmd+,, clicking the Extensions tab,
//     and scrolling to find ReDD Focus.
//
// SFSafariExtensionState on macOS only exposes `isEnabled`; private-
// browsing access and per-site permissions can't be queried from the
// host app at all (Apple has not provided an API). The onboarding
// panel still reads those from the plist when FDA is granted, and
// otherwise tells the user to verify in Safari Settings themselves.
//
// Why a dylib (and not a CLI sidecar): SFSafariExtensionManager
// requires the call to come from the *registered main executable*
// of the host bundle. A sidecar binary in Contents/MacOS/ — even
// when NSBundle.main resolves to Fristed correctly — fails with
// SFErrorDomain error 1 (extensionNotFound). Linking the Swift code
// directly into the main redd-block binary places the call in the
// right process context.

import AppKit
import Foundation
import SafariServices

/// Copies a UTF-8-encoded string into a caller-provided buffer with
/// a NUL terminator, returning the number of bytes written (excluding
/// the NUL). If the string doesn't fit, the buffer is filled and the
/// last byte is set to NUL — the caller can detect truncation by
/// comparing the return value to (out_len - 1).
private func writeString(
    _ s: String,
    into outPtr: UnsafeMutablePointer<UInt8>,
    capacity outLen: Int
) -> Int {
    guard outLen > 0 else { return 0 }
    let bytes = Array(s.utf8)
    let copyLen = min(bytes.count, outLen - 1)
    bytes.withUnsafeBufferPointer { src in
        outPtr.update(from: src.baseAddress!, count: copyLen)
    }
    outPtr.advanced(by: copyLen).pointee = 0
    return copyLen
}

private func writeJson(
    _ object: [String: Any],
    into outPtr: UnsafeMutablePointer<UInt8>,
    capacity outLen: Int
) {
    let data = (try? JSONSerialization.data(withJSONObject: object, options: []))
        ?? Data("{}".utf8)
    let s = String(data: data, encoding: .utf8) ?? "{}"
    _ = writeString(s, into: outPtr, capacity: outLen)
}

/// Query the current state of the Safari Web Extension with the given
/// bundle identifier. Writes a JSON object to `out_ptr` (must point
/// to at least `out_len` bytes). Returns 0 on success, 1 on a
/// SafariServices error (the JSON will contain an `error` key).
@_cdecl("redd_safari_extension_state")
public func redd_safari_extension_state(
    _ bundleIdPtr: UnsafePointer<CChar>,
    _ outPtr: UnsafeMutablePointer<UInt8>,
    _ outLen: Int
) -> Int32 {
    let bundleId = String(cString: bundleIdPtr)
    // SFSafariExtensionManager dispatches its completion handler on
    // an internal queue. The Rust caller is synchronous, so we block
    // on a semaphore until the handler fires. Apple's docs don't
    // promise the handler is called on any particular queue, so we
    // can't run a RunLoop here without risk of deadlocking against
    // ourselves.
    let semaphore = DispatchSemaphore(value: 0)
    var exitCode: Int32 = 0

    SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: bundleId) {
        state, error in
        if let error = error {
            writeJson(["error": error.localizedDescription],
                      into: outPtr, capacity: outLen)
            exitCode = 1
        } else if let state = state {
            writeJson(["enabled": state.isEnabled],
                      into: outPtr, capacity: outLen)
        } else {
            writeJson(["error": "no state and no error"],
                      into: outPtr, capacity: outLen)
            exitCode = 1
        }
        semaphore.signal()
    }
    semaphore.wait()
    return exitCode
}

/// Launch Safari without stealing focus from Fristed. Returns true
/// when the open request succeeded.
private func launchSafari() -> Bool {
    guard let safariURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
        return false
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    let semaphore = DispatchSemaphore(value: 0)
    var launched = false
    NSWorkspace.shared.openApplication(at: safariURL, configuration: configuration) { _, error in
        launched = (error == nil)
        semaphore.signal()
    }
    semaphore.wait()
    return launched
}

/// `showPreferencesForExtension` often fails with SFErrorDomain code 1
/// when Safari hasn't been launched yet. Launch Safari, wait for the
/// system to register extensions, then retry once — same pattern as
/// the standalone ReDD Focus macOS app.
private func openSafariExtensionPreferences(bundleId: String, retryCount: Int) -> Int32 {
    let semaphore = DispatchSemaphore(value: 0)
    var exitCode: Int32 = 0
    var shouldRetry = false

    SFSafariApplication.showPreferencesForExtension(withIdentifier: bundleId) { error in
        if let nsError = error as NSError?,
           nsError.domain == "SFErrorDomain",
           nsError.code == 1,
           retryCount == 0 {
            shouldRetry = true
            semaphore.signal()
            return
        }
        exitCode = (error != nil) ? 1 : 0
        semaphore.signal()
    }
    semaphore.wait()

    if shouldRetry {
        _ = launchSafari()
        Thread.sleep(forTimeInterval: 1.5)
        return openSafariExtensionPreferences(bundleId: bundleId, retryCount: 1)
    }
    return exitCode
}

/// Deep-link Safari to the row for the given extension in
/// Settings → Extensions. Returns 0 on success, 1 on error.
@_cdecl("redd_safari_open_extension_settings")
public func redd_safari_open_extension_settings(
    _ bundleIdPtr: UnsafePointer<CChar>
) -> Int32 {
    let bundleId = String(cString: bundleIdPtr)
    return openSafariExtensionPreferences(bundleId: bundleId, retryCount: 0)
}
