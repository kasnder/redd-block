// macOS Screen Time backend for the ReDD Block desktop app.
//
// Exposes a C ABI (via @_cdecl) so the Rust side can call into
// FamilyControls + ManagedSettings without going through the iOS
// plugin-binding machinery (which Tauri doesn't use on desktop
// macOS).
//
// This file is a scaffold: the function signatures and intended call
// patterns are in place, but some authorization + scheduling paths
// need to be finalised on real hardware once the entitlement is
// approved by Apple. See // TODO markers.

#if os(macOS)

import Foundation
#if canImport(FamilyControls)
import FamilyControls
#endif
#if canImport(ManagedSettings)
import ManagedSettings
#endif
#if canImport(DeviceActivity)
import DeviceActivity
#endif

@available(macOS 14.0, *)
private let store = ManagedSettingsStore(named: .init("com.redd.block.macos"))

// MARK: - Authorization

@_cdecl("redd_screentime_request_authorization")
public func redd_screentime_request_authorization() -> Int32 {
    guard #available(macOS 14.0, *) else { return -1 }
    let sem = DispatchSemaphore(value: 0)
    var granted: Int32 = 0
    Task {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            granted = AuthorizationCenter.shared.authorizationStatus == .approved ? 1 : 0
        } catch {
            granted = -2
        }
        sem.signal()
    }
    sem.wait()
    return granted
}

@_cdecl("redd_screentime_check_authorization")
public func redd_screentime_check_authorization() -> Int32 {
    guard #available(macOS 14.0, *) else { return -1 }
    switch AuthorizationCenter.shared.authorizationStatus {
    case .approved: return 1
    case .denied: return 0
    case .notDetermined: return 2
    @unknown default: return -2
    }
}

// MARK: - Website blocking
//
// Accepts a NUL-terminated UTF-8 C string containing a newline-
// separated list of domains. Empty or NULL clears the block.
//
// On macOS 14 the ManagedSettings WebContentSettings.blockedByFilter
// takes a Set<WebDomain> (system-wide URL filter). Ownership of the
// store is held process-wide so reapplying simply overwrites.

@_cdecl("redd_screentime_block_websites")
public func redd_screentime_block_websites(_ csv: UnsafePointer<CChar>?) -> Int32 {
    guard #available(macOS 14.0, *) else { return -1 }
    let domains: [String] = {
        guard let csv else { return [] }
        let all = String(cString: csv)
        return all
            .split(whereSeparator: { $0 == "\n" || $0 == "\0" })
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }()

    if domains.isEmpty {
        store.webContent.blockedByFilter = nil
        return 0
    }

    // WebDomain expects a raw domain string; Apple matches subdomains
    // automatically when the filter entry is a bare host.
    let set = Set(domains.map { WebDomain(domain: $0) })
    store.webContent.blockedByFilter = .specific(set)
    return Int32(domains.count)
}

@_cdecl("redd_screentime_clear_websites")
public func redd_screentime_clear_websites() -> Int32 {
    guard #available(macOS 14.0, *) else { return -1 }
    store.webContent.blockedByFilter = nil
    return 0
}

// MARK: - Scheduling
//
// TODO: mirror the iOS DeviceActivityMonitor extension on macOS. The
// DeviceActivity framework is available on macOS 14+ but the
// extension packaging is different — a separate DeviceActivityMonitor
// target inside the .app bundle, similar to the iOS extension at
// `src-tauri/gen/apple/ReddBlockMonitor/`.
//
// For now we stub start/stop; the Rust side can fall back to
// evaluating schedules in-process and calling block/clear_websites
// directly when the app is running. The gap is schedules that need to
// fire while the app is force-quit; the launch-at-login + KeepAlive
// guard covers that in practice.

@_cdecl("redd_screentime_set_schedules")
public func redd_screentime_set_schedules(_ json: UnsafePointer<CChar>?) -> Int32 {
    guard #available(macOS 14.0, *) else { return -1 }
    // TODO: parse schedule payload JSON (same format as iOS) and
    // register DeviceActivityCenter schedules.
    _ = json
    return 0
}

@_cdecl("redd_screentime_clear_schedules")
public func redd_screentime_clear_schedules() -> Int32 {
    guard #available(macOS 14.0, *) else { return -1 }
    // TODO: tear down registered DeviceActivityCenter schedules.
    return 0
}

#endif  // os(macOS)
