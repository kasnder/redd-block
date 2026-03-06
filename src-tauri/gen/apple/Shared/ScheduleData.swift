import Foundation
import ManagedSettings

/// App Group identifier shared between the main app and the DeviceActivityMonitor extension.
let appGroupID = "group.com.reddblock"

/// Key used to store schedule block data in the shared UserDefaults.
let scheduleDataKey = "redd.scheduleBlockData"

/// Key used to store the multi-schedule dictionary.
let multiScheduleDataKey = "redd.multiScheduleData"

/// Key prefix for manual block state (current effective state for default store).
let manualBlockStateKey = "redd.manualBlockState"
/// Key prefix for resume payloads: "redd.resumePayload.{blockId}"
let resumePayloadKeyPrefix = "redd.resumePayload."
/// Key prefix for block-end state: "redd.blockEndState.{blockId}"
let blockEndStateKeyPrefix = "redd.blockEndState."

/// Data model describing what to block during a scheduled time window.
/// Stored in the App Group's UserDefaults so the extension can read it.
struct ScheduleBlockData: Codable {
    /// Domain strings to block via WebContent filter
    let domains: [String]
    /// Base64-encoded ApplicationToken data
    let appTokenData: [String]
    /// Base64-encoded ActivityCategoryToken data
    let categoryTokenData: [String]
    /// Optional weekday filter: Mon=0 … Sun=6. If present and non-empty, extension only applies when current day is in this list.
    let days: [Int]?
}

/// Helper to read/write schedule data from the shared App Group container.
/// Supports both the legacy single-schedule key and the new multi-schedule dictionary.
struct SharedScheduleStore {
    private static var sharedDefaults: UserDefaults? {
        return UserDefaults(suiteName: appGroupID)
    }
    
    // MARK: - Multi-schedule API
    
    /// Save schedule data for a specific schedule ID.
    static func save(id: String, data: ScheduleBlockData) {
        var all = loadAll()
        all[id] = data
        saveAll(all)
    }
    
    /// Load schedule data for a specific schedule ID.
    static func load(id: String) -> ScheduleBlockData? {
        return loadAll()[id]
    }
    
    /// Load all schedule data entries.
    static func loadAll() -> [String: ScheduleBlockData] {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: multiScheduleDataKey) else {
            // Fall back to legacy single-schedule key for backward compatibility
            if let legacyData = loadLegacy() {
                return ["default": legacyData]
            }
            return [:]
        }
        return (try? JSONDecoder().decode([String: ScheduleBlockData].self, from: data)) ?? [:]
    }
    
    /// Remove a specific schedule by ID.
    static func remove(id: String) {
        var all = loadAll()
        all.removeValue(forKey: id)
        saveAll(all)
    }
    
    /// Remove all schedule data.
    static func clear() {
        sharedDefaults?.removeObject(forKey: multiScheduleDataKey)
        sharedDefaults?.removeObject(forKey: scheduleDataKey)
    }
    
    // MARK: - Legacy single-schedule API (backward compatibility)
    
    /// Save schedule block data using the legacy single-schedule key.
    static func save(_ data: ScheduleBlockData) {
        save(id: "default", data: data)
    }
    
    /// Load schedule block data from the legacy single-schedule key.
    static func load() -> ScheduleBlockData? {
        // Prefer multi-schedule, fall back to legacy
        if let multi = loadAll().first?.value {
            return multi
        }
        return loadLegacy()
    }
    
    // MARK: - Private
    
    private static func saveAll(_ schedules: [String: ScheduleBlockData]) {
        guard let defaults = sharedDefaults else { return }
        if let encoded = try? JSONEncoder().encode(schedules) {
            defaults.set(encoded, forKey: multiScheduleDataKey)
        }
    }
    
    private static func loadLegacy() -> ScheduleBlockData? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: scheduleDataKey) else { return nil }
        return try? JSONDecoder().decode(ScheduleBlockData.self, from: data)
    }
}

// MARK: - Manual block state (for one-off resume/block-end)

/// Same shape as ScheduleBlockData: used for manual block state and resume/block-end payloads in App Group.
typealias ManualBlockStatePayload = ScheduleBlockData

/// Read/write manual block state and one-off payloads for DeviceActivityMonitor extension.
struct SharedManualBlockStore {
    private static var sharedDefaults: UserDefaults? {
        return UserDefaults(suiteName: appGroupID)
    }
    
    static func saveManualBlockState(_ data: ManualBlockStatePayload) {
        guard let defaults = sharedDefaults,
              let encoded = try? JSONEncoder().encode(data) else { return }
        defaults.set(encoded, forKey: manualBlockStateKey)
    }
    
    static func loadManualBlockState() -> ManualBlockStatePayload? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: manualBlockStateKey) else { return nil }
        return try? JSONDecoder().decode(ManualBlockStatePayload.self, from: data)
    }
    
    static func saveResumePayload(blockId: String, _ data: ManualBlockStatePayload) {
        guard let defaults = sharedDefaults,
              let encoded = try? JSONEncoder().encode(data) else { return }
        defaults.set(encoded, forKey: resumePayloadKeyPrefix + blockId)
    }
    
    static func loadResumePayload(blockId: String) -> ManualBlockStatePayload? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: resumePayloadKeyPrefix + blockId) else { return nil }
        return try? JSONDecoder().decode(ManualBlockStatePayload.self, from: data)
    }
    
    static func removeResumePayload(blockId: String) {
        sharedDefaults?.removeObject(forKey: resumePayloadKeyPrefix + blockId)
    }
    
    static func saveBlockEndState(blockId: String, _ data: ManualBlockStatePayload) {
        guard let defaults = sharedDefaults,
              let encoded = try? JSONEncoder().encode(data) else { return }
        defaults.set(encoded, forKey: blockEndStateKeyPrefix + blockId)
    }
    
    static func loadBlockEndState(blockId: String) -> ManualBlockStatePayload? {
        guard let defaults = sharedDefaults,
              let data = defaults.data(forKey: blockEndStateKeyPrefix + blockId) else { return nil }
        return try? JSONDecoder().decode(ManualBlockStatePayload.self, from: data)
    }
    
    static func removeBlockEndState(blockId: String) {
        sharedDefaults?.removeObject(forKey: blockEndStateKeyPrefix + blockId)
    }
}
