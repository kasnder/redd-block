import DeviceActivity
import ManagedSettings
import Foundation

/// DeviceActivityMonitor extension that applies/clears blocks when scheduled time windows start/end.
/// This runs as a separate process — it does NOT have access to the main app's memory.
/// It reads schedule data from the shared App Group UserDefaults.
@available(iOS 16.0, *)
class ReddBlockMonitor: DeviceActivityMonitor {
    
    private let store = ManagedSettingsStore()
    
    /// Called by the system when a scheduled DeviceActivity interval starts.
    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        
        guard let scheduleData = SharedScheduleStore.load() else {
            // No schedule data found — nothing to block
            return
        }
        
        // Block websites
        if !scheduleData.domains.isEmpty {
            let webDomains = Set(scheduleData.domains.prefix(50).map { WebDomain(domain: $0) })
            store.webContent.blockedByFilter = .specific(webDomains)
        }
        
        // Block apps (decode from base64 token data)
        var appTokens = Set<ApplicationToken>()
        for tokenString in scheduleData.appTokenData {
            if let data = Data(base64Encoded: tokenString),
               let token = try? JSONDecoder().decode(ApplicationToken.self, from: data) {
                appTokens.insert(token)
            }
        }
        if !appTokens.isEmpty {
            store.shield.applications = appTokens
        }
        
        // Block categories (decode from base64 token data)
        var categoryTokens = Set<ActivityCategoryToken>()
        for tokenString in scheduleData.categoryTokenData {
            if let data = Data(base64Encoded: tokenString),
               let token = try? JSONDecoder().decode(ActivityCategoryToken.self, from: data) {
                categoryTokens.insert(token)
            }
        }
        if !categoryTokens.isEmpty {
            store.shield.applicationCategories = .specific(categoryTokens)
        }
    }
    
    /// Called by the system when a scheduled DeviceActivity interval ends.
    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        
        // Clear all blocks
        store.webContent.blockedByFilter = nil
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.clearAllSettings()
    }
}
