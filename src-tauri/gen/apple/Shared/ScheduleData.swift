import Foundation
import ManagedSettings

/// App Group identifier shared between the main app and the DeviceActivityMonitor extension.
let appGroupID = "group.com.redd.block"

/// Key used to store schedule block data in the shared UserDefaults.
let scheduleDataKey = "redd.scheduleBlockData"

/// Data model describing what to block during a scheduled time window.
/// Stored in the App Group's UserDefaults so the extension can read it.
struct ScheduleBlockData: Codable {
    /// Domain strings to block via WebContent filter
    let domains: [String]
    /// Base64-encoded ApplicationToken data
    let appTokenData: [String]
    /// Base64-encoded ActivityCategoryToken data
    let categoryTokenData: [String]
}

/// Helper to read/write schedule data from the shared App Group container.
struct SharedScheduleStore {
    private static var sharedDefaults: UserDefaults? {
        return UserDefaults(suiteName: appGroupID)
    }
    
    /// Save schedule block data to the shared container.
    static func save(_ data: ScheduleBlockData) {
        guard let defaults = sharedDefaults else { return }
        if let encoded = try? JSONEncoder().encode(data) {
            defaults.set(encoded, forKey: scheduleDataKey)
        }
    }
    
    /// Load schedule block data from the shared container.
    static func load() -> ScheduleBlockData? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: scheduleDataKey) else { return nil }
        return try? JSONDecoder().decode(ScheduleBlockData.self, from: data)
    }
    
    /// Remove schedule block data from the shared container.
    static func clear() {
        sharedDefaults?.removeObject(forKey: scheduleDataKey)
    }
}
