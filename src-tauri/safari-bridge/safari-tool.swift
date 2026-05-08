// Tiny Swift CLI bundled alongside ReDD Block on macOS so the Rust
// side can call into SafariServices APIs that have no Objective-C-
// runtime-friendly equivalent. Two subcommands:
//
//   safari-tool state <bundle-id>
//     Queries SFSafariExtensionManager.getStateOfSafariExtension and
//     prints a JSON object on stdout describing the current state.
//     Exits 0 on success (even when the extension is disabled), 1 on
//     a SafariServices error. Crucially, this works WITHOUT Full
//     Disk Access — Apple specifically intends host apps to use this
//     API to introspect their own bundled extension's state, so it
//     bypasses the TCC gate that protects Safari's WebExtensions
//     plist (which the older plist-scanning path needs).
//
//   safari-tool open <bundle-id>
//     Calls SFSafariApplication.showPreferencesForExtension to deep-
//     link the user straight to the extension's row in Safari →
//     Settings → Extensions. Saves them ~3 navigation clicks vs
//     opening Safari, hitting Cmd+,, clicking the Extensions tab,
//     and scrolling to find ReDD Focus.
//
// Output schema for `state`:
//   {"enabled": <Bool>}                  — happy path
//   {"error": "<localized message>"}     — SafariServices errored
//
// We deliberately keep the shape minimal — SFSafariExtensionState on
// macOS only exposes `isEnabled`. Private-browsing access and per-
// site permissions can't be queried from the host app at all
// (Apple has not provided an API), so the onboarding panel still
// reads those from the plist when FDA is granted, and falls back
// to "let the user verify it themselves in Safari Settings".

import Foundation
import SafariServices

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write(
        Data("usage: safari-tool {state|open} <bundle-id>\n".utf8))
    exit(2)
}
let cmd = args[1]
let bundleId = args[2]

func writeJson(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object, options: []) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
    }
}

switch cmd {
case "state":
    // Both the API call and its completion handler land on whatever
    // queue SafariServices feels like. Use a semaphore to block the
    // CLI's main thread until we have a result, since the binary's
    // job is "print one line and exit".
    let semaphore = DispatchSemaphore(value: 0)
    var exitCode: Int32 = 0
    SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: bundleId) {
        state, error in
        if let error = error {
            writeJson(["error": error.localizedDescription])
            exitCode = 1
        } else if let state = state {
            writeJson(["enabled": state.isEnabled])
        } else {
            writeJson(["error": "no state and no error"])
            exitCode = 1
        }
        semaphore.signal()
    }
    semaphore.wait()
    exit(exitCode)

case "open":
    let semaphore = DispatchSemaphore(value: 0)
    var exitCode: Int32 = 0
    SFSafariApplication.showPreferencesForExtension(withIdentifier: bundleId) {
        error in
        if let error = error {
            FileHandle.standardError.write(
                Data("\(error.localizedDescription)\n".utf8))
            exitCode = 1
        }
        semaphore.signal()
    }
    semaphore.wait()
    exit(exitCode)

default:
    FileHandle.standardError.write(
        Data("unknown command: \(cmd) (expected: state | open)\n".utf8))
    exit(2)
}
