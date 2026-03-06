import DeviceActivity
import ManagedSettings
import Foundation

/// DeviceActivityMonitor extension that applies/clears blocks when scheduled time windows start/end.
/// This runs as a separate process — it does NOT have access to the main app's memory.
/// It reads schedule data from the shared App Group UserDefaults.
@available(iOS 16.0, *)
class ReddBlockMonitor: DeviceActivityMonitor {
    
    /// Use a NAMED store for schedule-based blocks so they don't interfere
    /// with manual blocks in the default ManagedSettingsStore.
    /// The ScreentimePlugin uses ManagedSettingsStore() (default) for manual
    /// blocks — these two stores stack independently at the OS level.
    private let store = ManagedSettingsStore(named: .init("schedule"))
    
    /// Default store for manual blocks (resume/block-end one-offs write here).
    private let defaultStore = ManagedSettingsStore()
    
    /// Called by the system when a scheduled DeviceActivity interval starts.
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        
        let raw = activity.rawValue
        
        // One-off: pause resume — merge manual state + resume payload and apply to default store
        if raw.hasPrefix("redd-block-resume-") {
            let blockId = String(raw.dropFirst("redd-block-resume-".count))
            handleResumeOneOff(blockId: blockId)
            return
        }
        
        // One-off: block end — load current manual state, subtract this block's payload, apply, write back (Option B)
        if raw.hasPrefix("redd-block-end-") {
            let blockId = String(raw.dropFirst("redd-block-end-".count))
            handleBlockEndOneOff(blockId: blockId)
            return
        }
        
        // Regular schedule segment
        let scheduleId = extractScheduleId(from: activity)
        
        guard let scheduleData = SharedScheduleStore.load(id: scheduleId) else {
            // Fallback: try loading legacy single-schedule data
            guard let legacyData = SharedScheduleStore.load() else {
                return
            }
            applyBlocksIfDayMatches(from: legacyData)
            return
        }
        
        applyBlocksIfDayMatches(from: scheduleData)
    }
    
    /// Handle one-off resume: load manual state + resume payload, merge, apply to default store, write back to App Group, remove payload.
    private func handleResumeOneOff(blockId: String) {
        guard let resumePayload = SharedManualBlockStore.loadResumePayload(blockId: blockId) else {
            return
        }
        let base = SharedManualBlockStore.loadManualBlockState()
        let merged = mergePayloads(base: base, extra: resumePayload)
        applyToDefaultStore(from: merged)
        SharedManualBlockStore.saveManualBlockState(merged)
        SharedManualBlockStore.removeResumePayload(blockId: blockId)
    }
    
    /// Handle one-off block end (Option B): load current manual state, subtract this block's payload, apply to default store, write back to App Group.
    private func handleBlockEndOneOff(blockId: String) {
        guard let toRemove = SharedManualBlockStore.loadBlockEndState(blockId: blockId) else {
            return
        }
        let current = SharedManualBlockStore.loadManualBlockState()
        let emptyPayload = ManualBlockStatePayload(domains: [], appTokenData: [], categoryTokenData: [], days: nil)
        let newState = subtractPayloads(current: current ?? emptyPayload, subtract: toRemove)
        applyToDefaultStore(from: newState)
        SharedManualBlockStore.saveManualBlockState(newState)
        SharedManualBlockStore.removeBlockEndState(blockId: blockId)
    }
    
    /// Subtract "to remove" payload from current (set difference for domains; filter out matching app/category tokens).
    private func subtractPayloads(current: ManualBlockStatePayload, subtract: ManualBlockStatePayload) -> ManualBlockStatePayload {
        let domainSet = Set(current.domains).subtracting(subtract.domains)
        let subtractAppSet = Set(subtract.appTokenData)
        let appTokenData = current.appTokenData.filter { !subtractAppSet.contains($0) }
        let subtractCategorySet = Set(subtract.categoryTokenData)
        let categoryTokenData = current.categoryTokenData.filter { !subtractCategorySet.contains($0) }
        return ManualBlockStatePayload(
            domains: Array(domainSet),
            appTokenData: appTokenData,
            categoryTokenData: categoryTokenData,
            days: nil
        )
    }
    
    /// Merge two payloads (union of domains, appTokenData, categoryTokenData).
    private func mergePayloads(base: ManualBlockStatePayload?, extra: ManualBlockStatePayload) -> ManualBlockStatePayload {
        let domains = Set(base?.domains ?? []).union(extra.domains)
        var appTokenData = base?.appTokenData ?? []
        for s in extra.appTokenData where !appTokenData.contains(s) {
            appTokenData.append(s)
        }
        var categoryTokenData = base?.categoryTokenData ?? []
        for s in extra.categoryTokenData where !categoryTokenData.contains(s) {
            categoryTokenData.append(s)
        }
        return ManualBlockStatePayload(
            domains: Array(domains),
            appTokenData: appTokenData,
            categoryTokenData: categoryTokenData,
            days: nil
        )
    }
    
    /// Apply payload to the default (manual) store.
    private func applyToDefaultStore(from data: ManualBlockStatePayload) {
        if data.domains.isEmpty && data.appTokenData.isEmpty && data.categoryTokenData.isEmpty {
            defaultStore.webContent.blockedByFilter = nil
            defaultStore.shield.applications = nil
            defaultStore.shield.applicationCategories = nil
            defaultStore.clearAllSettings()
            return
        }
        if !data.domains.isEmpty {
            let webDomains = Set(data.domains.prefix(50).map { WebDomain(domain: $0) })
            defaultStore.webContent.blockedByFilter = .specific(webDomains)
        } else {
            defaultStore.webContent.blockedByFilter = nil
        }
        var appTokens = Set<ApplicationToken>()
        for tokenString in data.appTokenData {
            if let tokenData = Data(base64Encoded: tokenString),
               let token = try? JSONDecoder().decode(ApplicationToken.self, from: tokenData) {
                appTokens.insert(token)
            }
        }
        if appTokens.isEmpty {
            defaultStore.shield.applications = nil
        } else {
            defaultStore.shield.applications = appTokens
        }
        var categoryTokens = Set<ActivityCategoryToken>()
        for tokenString in data.categoryTokenData {
            if let tokenData = Data(base64Encoded: tokenString),
               let token = try? JSONDecoder().decode(ActivityCategoryToken.self, from: tokenData) {
                categoryTokens.insert(token)
            }
        }
        if categoryTokens.isEmpty {
            defaultStore.shield.applicationCategories = nil
        } else {
            defaultStore.shield.applicationCategories = .specific(categoryTokens)
        }
    }
    
    /// Called by the system when a scheduled DeviceActivity interval ends.
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        
        let raw = activity.rawValue
        // One-off resume/block-end: we only care about intervalDidStart; do not clear default store when interval ends
        if raw.hasPrefix("redd-block-resume-") || raw.hasPrefix("redd-block-end-") {
            return
        }
        
        // Instead of clearing everything unconditionally, check if any OTHER
        // schedules are still active and re-apply their blocks.
        let endedId = extractScheduleId(from: activity)
        let allSchedules = SharedScheduleStore.loadAll()
        
        // Collect blocks from all schedules EXCEPT the one that just ended
        var remainingDomains = Set<WebDomain>()
        var remainingAppTokens = Set<ApplicationToken>()
        var remainingCategoryTokens = Set<ActivityCategoryToken>()
        
        for (id, data) in allSchedules where id != endedId {
            for domain in data.domains.prefix(50) {
                remainingDomains.insert(WebDomain(domain: domain))
            }
            for tokenString in data.appTokenData {
                if let tokenData = Data(base64Encoded: tokenString),
                   let token = try? JSONDecoder().decode(ApplicationToken.self, from: tokenData) {
                    remainingAppTokens.insert(token)
                }
            }
            for tokenString in data.categoryTokenData {
                if let tokenData = Data(base64Encoded: tokenString),
                   let token = try? JSONDecoder().decode(ActivityCategoryToken.self, from: tokenData) {
                    remainingCategoryTokens.insert(token)
                }
            }
        }
        
        // Re-apply remaining blocks, or clear if none
        if remainingDomains.isEmpty {
            store.webContent.blockedByFilter = nil
        } else {
            store.webContent.blockedByFilter = .specific(remainingDomains)
        }
        
        if remainingAppTokens.isEmpty {
            store.shield.applications = nil
        } else {
            store.shield.applications = remainingAppTokens
        }
        
        if remainingCategoryTokens.isEmpty {
            store.shield.applicationCategories = nil
        } else {
            store.shield.applicationCategories = .specific(remainingCategoryTokens)
        }
        
        // If nothing remains, clear all settings for a clean state
        if remainingDomains.isEmpty && remainingAppTokens.isEmpty && remainingCategoryTokens.isEmpty {
            store.clearAllSettings()
        }
    }
    
    // MARK: - Helpers
    
    /// Current weekday in same encoding as frontend/helper: Mon=0 … Sun=6.
    private static func currentWeekdayMon0() -> Int {
        // Calendar.weekday: 1=Sun, 2=Mon, …, 7=Sat
        let weekday = Calendar.current.component(.weekday, from: Date())
        return (weekday - 2 + 7) % 7
    }
    
    /// If data.days is present and non-empty, only apply when today is in that list. Otherwise apply.
    private func applyBlocksIfDayMatches(from data: ScheduleBlockData) {
        if let days = data.days, !days.isEmpty {
            let today = Self.currentWeekdayMon0()
            if !days.contains(today) {
                return
            }
        }
        applyBlocks(from: data)
    }
    
    /// Apply blocks from a schedule data entry.
    private func applyBlocks(from data: ScheduleBlockData) {
        // Block websites
        if !data.domains.isEmpty {
            let webDomains = Set(data.domains.prefix(50).map { WebDomain(domain: $0) })
            store.webContent.blockedByFilter = .specific(webDomains)
        }
        
        // Block apps (decode from base64 token data)
        var appTokens = Set<ApplicationToken>()
        for tokenString in data.appTokenData {
            if let tokenData = Data(base64Encoded: tokenString),
               let token = try? JSONDecoder().decode(ApplicationToken.self, from: tokenData) {
                appTokens.insert(token)
            }
        }
        if !appTokens.isEmpty {
            store.shield.applications = appTokens
        }
        
        // Block categories (decode from base64 token data)
        var categoryTokens = Set<ActivityCategoryToken>()
        for tokenString in data.categoryTokenData {
            if let tokenData = Data(base64Encoded: tokenString),
               let token = try? JSONDecoder().decode(ActivityCategoryToken.self, from: tokenData) {
                categoryTokens.insert(token)
            }
        }
        if !categoryTokens.isEmpty {
            store.shield.applicationCategories = .specific(categoryTokens)
        }
    }
    
    /// Extract a schedule ID from a DeviceActivityName.
    /// Activity names follow the format "redd-block-{id}".
    /// Falls back to "default" for the legacy "redd-block-schedule" name.
    private func extractScheduleId(from activity: DeviceActivityName) -> String {
        let raw = activity.rawValue
        if raw.hasPrefix("redd-block-") {
            let id = String(raw.dropFirst("redd-block-".count))
            return id.isEmpty ? "default" : id
        }
        // Legacy name
        return "default"
    }
}
