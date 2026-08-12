import AppKit
import Foundation

/// Small, deliberately boring macOS application used by the system-test
/// app-watcher suite. It has a real AppKit window so NSRunningApplication's
/// `terminate` path and the user Cmd-W/Cmd-Q paths are exercised against a
/// normal Cocoa process rather than a shell command or a helper process.
///
/// `APP_WATCHER_FIXTURE_MODE=stubborn` makes applicationShouldTerminate return
/// `.terminateCancel`. The watcher must then leave it alive through polite
/// quit and use its normal ten-second force-close fallback. The default mode
/// accepts the polite quit and exits cleanly.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let stubborn: Bool
    private var window: NSWindow?

    init(stubborn: Bool) {
        self.stubborn = stubborn
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let mode = stubborn ? "stubborn" : "normal"
        announce("READY mode=\(mode) pid=\(ProcessInfo.processInfo.processIdentifier)")

        let content = NSTextField(labelWithString: "Digital Habits Test Target\nMode: \(mode)\nPID: \(ProcessInfo.processInfo.processIdentifier)")
        content.alignment = .center
        content.font = .systemFont(ofSize: 20, weight: .medium)
        content.textColor = .labelColor
        content.translatesAutoresizingMaskIntoConstraints = false

        let frame = NSRect(x: 0, y: 0, width: 520, height: 220)
        let window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false,
        )
        window.title = "Digital Habits Test Target (\(mode))"
        window.isReleasedWhenClosed = false
        window.contentView = NSView(frame: frame)
        window.contentView?.addSubview(content)
        NSLayoutConstraint.activate([
            content.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 24),
            content.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -24),
            content.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor),
        ])
        self.window = window
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if stubborn {
            announce("POLITE_QUIT_IGNORED pid=\(ProcessInfo.processInfo.processIdentifier)")
            return .terminateCancel
        }
        announce("POLITE_QUIT_ACCEPTED pid=\(ProcessInfo.processInfo.processIdentifier)")
        return .terminateNow
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // Cmd-W closes the fixture window but must not terminate the process;
        // this lets the watcher test continue enforcing a background app.
        false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            window?.makeKeyAndOrderFront(nil)
        }
        return true
    }

    private func announce(_ message: String) {
        print("[app-watcher-fixture] \(message)")
        fflush(stdout)
    }
}

let environmentMode = ProcessInfo.processInfo.environment["APP_WATCHER_FIXTURE_MODE"]?.lowercased()
let argumentMode = CommandLine.arguments.dropFirst().first?.lowercased()
let stubborn = environmentMode == "stubborn" || argumentMode == "--stubborn"

let application = NSApplication.shared
application.setActivationPolicy(.regular)

// Install a real application menu so Cmd-Q travels through AppKit's normal
// terminate path. Cmd-W is provided by NSWindow's standard close action.
let mainMenu = NSMenu()
let applicationMenuItem = NSMenuItem()
mainMenu.addItem(applicationMenuItem)
let applicationMenu = NSMenu()
applicationMenuItem.submenu = applicationMenu
applicationMenu.addItem(
    withTitle: "Quit Digital Habits Test Target",
    action: #selector(NSApplication.terminate(_:)),
    keyEquivalent: "q",
).keyEquivalentModifierMask = .command
application.mainMenu = mainMenu

let delegate = AppDelegate(stubborn: stubborn)
application.delegate = delegate
application.run()
