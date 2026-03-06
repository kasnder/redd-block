import SwiftRs
import Tauri
import UIKit
import SwiftUI
import FamilyControls
import ManagedSettings
import DeviceActivity

// MARK: - Argument Types

class AuthorizationArgs: Decodable {}

class BlockWebsitesArgs: Decodable {
    let domains: [String]
}

class UnblockWebsitesArgs: Decodable {}

class BlockAppsForTokensArgs: Decodable {
    let tokenData: [String]  // Base64-encoded ApplicationToken data
}

class UnblockAppsArgs: Decodable {}

class ScheduleBlockArgs: Decodable {
    let id: String?
    let startHour: Int
    let startMinute: Int
    let endHour: Int
    let endMinute: Int
    let domains: [String]?
    let appTokenData: [String]?  // Base64-encoded ApplicationToken data
}

class UnscheduleBlockArgs: Decodable {
    let id: String?  // If nil, unschedule all
}

class ScheduleEntry: Decodable {
    let id: String
    let startHour: Int
    let startMinute: Int
    let endHour: Int
    let endMinute: Int
    let domains: [String]?
    let appTokenData: [String]?
    /// Optional weekday filter: Mon=0 … Sun=6
    let days: [Int]?
}

class SetSchedulesArgs: Decodable {
    let schedules: [ScheduleEntry]
}

class ShowActivityPickerArgs: Decodable {}

// One-off DeviceActivity (pause resume / block end)
class RegisterOneOffActivityArgs: Decodable {
    let activityName: String
    let startTimestampMs: Double
}

class SetResumePayloadArgs: Decodable {
    let blockId: String
    let domains: [String]
}

class SetBlockEndStateArgs: Decodable {
    let blockId: String
    let domains: [String]
}

// MARK: - Activity Picker SwiftUI View

@available(iOS 16.0, *)
struct ActivityPickerView: View {
    @State private var selection: FamilyActivitySelection
    let initialSelection: FamilyActivitySelection
    
    init(initialSelection: FamilyActivitySelection = FamilyActivitySelection(), onDone: @escaping (FamilyActivitySelection) -> Void, onCancel: @escaping () -> Void) {
        self._selection = State(initialValue: initialSelection)
        self.initialSelection = initialSelection
        self.onDone = onDone
        self.onCancel = onCancel
    }
    @State private var searchText = ""
    private let onDone: (FamilyActivitySelection) -> Void
    private let onCancel: () -> Void
    
    var body: some View {
        NavigationView {
            HStack(spacing: 0) {
                // Left: Apple's picker
                FamilyActivityPicker(selection: $selection)
                    .frame(maxWidth: .infinity)
                    .searchable(text: $searchText, prompt: "Search apps")
                
                // Right: Selected items panel
                Divider()
                
                VStack(alignment: .leading, spacing: 0) {
                    // Header with counts
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Selected")
                            .font(.headline)
                        
                        let totalApps = selection.applicationTokens.count
                        let totalCats = selection.categoryTokens.count
                        let totalWebs = selection.webDomainTokens.count
                        
                        if totalApps == 0 && totalCats == 0 && totalWebs == 0 {
                            Text("No items selected")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        } else {
                            Text(summaryText(apps: totalApps, categories: totalCats, domains: totalWebs))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 10)
                    
                    Divider()
                    
                    // Selected items list
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 2) {
                            // Categories
                            if !selection.categoryTokens.isEmpty {
                                Text("Categories")
                                    .font(.caption2)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.secondary)
                                    .textCase(.uppercase)
                                    .padding(.horizontal)
                                    .padding(.top, 8)
                                
                                ForEach(Array(selection.categoryTokens), id: \.self) { token in
                                    Label(token)
                                        .labelStyle(.titleAndIcon)
                                        .font(.subheadline)
                                        .padding(.horizontal)
                                        .padding(.vertical, 6)
                                }
                            }
                            
                            // Apps
                            if !selection.applicationTokens.isEmpty {
                                Text("Apps")
                                    .font(.caption2)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.secondary)
                                    .textCase(.uppercase)
                                    .padding(.horizontal)
                                    .padding(.top, 8)
                                
                                ForEach(Array(selection.applicationTokens), id: \.self) { token in
                                    Label(token)
                                        .labelStyle(.titleAndIcon)
                                        .font(.subheadline)
                                        .padding(.horizontal)
                                        .padding(.vertical, 6)
                                }
                            }
                            
                            // Web domains
                            if !selection.webDomainTokens.isEmpty {
                                Text("Websites")
                                    .font(.caption2)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.secondary)
                                    .textCase(.uppercase)
                                    .padding(.horizontal)
                                    .padding(.top, 8)
                                
                                ForEach(Array(selection.webDomainTokens), id: \.self) { token in
                                    Label(token)
                                        .labelStyle(.titleAndIcon)
                                        .font(.subheadline)
                                        .padding(.horizontal)
                                        .padding(.vertical, 6)
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity)
                .background(Color(.systemGroupedBackground))
            }
            .navigationTitle("Select Apps")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onDone(selection)
                    }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        onCancel()
                    }
                }
            }
        }
        .navigationViewStyle(.stack)
    }
    
    private func summaryText(apps: Int, categories: Int, domains: Int) -> String {
        var parts: [String] = []
        if apps > 0 { parts.append("\(apps) app\(apps > 1 ? "s" : "")") }
        if categories > 0 { parts.append("\(categories) categor\(categories > 1 ? "ies" : "y")") }
        if domains > 0 { parts.append("\(domains) domain\(domains > 1 ? "s" : "")") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Screen Time Plugin

@available(iOS 16.0, *)
class ScreentimePlugin: Plugin {
    
    private let store = ManagedSettingsStore()
    private let center = DeviceActivityCenter()
    
    // Persist the current selection to the App Group's UserDefaults so it survives
    // app restarts AND is accessible to the DeviceActivityMonitor extension.
    // ManagedSettingsStore persists blocks at the OS level, but we need the selection
    // to re-apply blocks and show the picker state.
    private static let selectionKey = "redd.activitySelection"
    
    private static var sharedDefaults: UserDefaults? {
        return UserDefaults(suiteName: appGroupID)
    }
    
    private static var currentSelection: FamilyActivitySelection {
        get {
            if let data = sharedDefaults?.data(forKey: selectionKey),
               let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
                return selection
            }
            return FamilyActivitySelection()
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                sharedDefaults?.set(data, forKey: selectionKey)
            }
        }
    }
    
    // MARK: - Authorization
    
    @objc public func requestAuthorization(_ invoke: Invoke) throws {
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                let status = AuthorizationCenter.shared.authorizationStatus
                invoke.resolve([
                    "granted": status == .approved,
                    "status": self.statusString(status)
                ])
            } catch {
                invoke.resolve([
                    "granted": false,
                    "status": "error",
                    "error": error.localizedDescription
                ])
            }
        }
    }
    
    @objc public func checkAuthorization(_ invoke: Invoke) throws {
        let status = AuthorizationCenter.shared.authorizationStatus
        invoke.resolve([
            "granted": status == .approved,
            "status": statusString(status)
        ])
    }
    
    // MARK: - Activity Picker
    
    @objc public func showActivityPicker(_ invoke: Invoke) throws {
        Task { @MainActor in
            guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let rootVC = windowScene.windows.first?.rootViewController else {
                invoke.resolve([
                    "cancelled": true,
                    "error": "No root view controller found"
                ])
                return
            }
            
            // Find the topmost presented view controller
            var topVC = rootVC
            while let presented = topVC.presentedViewController {
                topVC = presented
            }
            
            let pickerView = ActivityPickerView(
                initialSelection: ScreentimePlugin.currentSelection,
                onDone: { selection in
                    // Store the selection
                    ScreentimePlugin.currentSelection = selection
                    
                    // Encode application tokens
                    var encodedAppTokens: [String] = []
                    var failedAppTokens = 0
                    for token in selection.applicationTokens {
                        if let data = try? JSONEncoder().encode(token) {
                            encodedAppTokens.append(data.base64EncodedString())
                        } else {
                            failedAppTokens += 1
                        }
                    }
                    
                    // Encode category tokens
                    var encodedCategoryTokens: [String] = []
                    var failedCategoryTokens = 0
                    for token in selection.categoryTokens {
                        if let data = try? JSONEncoder().encode(token) {
                            encodedCategoryTokens.append(data.base64EncodedString())
                        } else {
                            failedCategoryTokens += 1
                        }
                    }
                    
                    // Dismiss the picker
                    topVC.dismiss(animated: true) {
                        var response: [String: Any] = [
                            "cancelled": false,
                            "applicationTokens": encodedAppTokens,
                            "categoryTokens": encodedCategoryTokens,
                            "applicationCount": selection.applicationTokens.count,
                            "categoryCount": selection.categoryTokens.count
                        ]
                        if failedAppTokens > 0 || failedCategoryTokens > 0 {
                            response["warning"] = "Failed to encode \(failedAppTokens) app token(s) and \(failedCategoryTokens) category token(s)"
                        }
                        invoke.resolve(response)
                    }
                },
                onCancel: {
                    topVC.dismiss(animated: true) {
                        invoke.resolve([
                            "cancelled": true,
                            "applicationCount": 0,
                            "categoryCount": 0
                        ])
                    }
                }
            )
            
            let hostingController = UIHostingController(rootView: pickerView)
            hostingController.modalPresentationStyle = .pageSheet
            topVC.present(hostingController, animated: true)
        }
    }
    
    // MARK: - Website Blocking
    
    /// Check if Screen Time authorization is granted
    private func isAuthorized() -> Bool {
        return AuthorizationCenter.shared.authorizationStatus == .approved
    }
    
    @objc public func blockWebsites(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(BlockWebsitesArgs.self)
        
        // Convert domain strings to WebDomain objects
        // Screen Time API supports up to 50 domains per store
        let truncated = args.domains.count > 50
        let webDomains = Set(args.domains.prefix(50).map { WebDomain(domain: $0) })
        
        store.webContent.blockedByFilter = .specific(webDomains)
        
        var response: [String: Any] = [
            "success": true,
            "blockedCount": webDomains.count
        ]
        if truncated {
            response["warning"] = "Only first 50 of \(args.domains.count) domains blocked (Screen Time API limit)"
        }
        invoke.resolve(response)
    }
    
    @objc public func unblockWebsites(_ invoke: Invoke) throws {
        store.webContent.blockedByFilter = nil
        invoke.resolve(["success": true])
    }
    
    // MARK: - App Blocking
    
    @objc public func blockApps(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(BlockAppsForTokensArgs.self)
        
        // Decode ApplicationToken from base64-encoded data
        var tokens = Set<ApplicationToken>()
        var failedDecodes = 0
        for tokenString in args.tokenData {
            if let data = Data(base64Encoded: tokenString) {
                if let token = try? JSONDecoder().decode(ApplicationToken.self, from: data) {
                    tokens.insert(token)
                } else {
                    failedDecodes += 1
                }
            } else {
                failedDecodes += 1
            }
        }
        
        guard !tokens.isEmpty else {
            invoke.resolve([
                "success": false,
                "error": "No valid app tokens provided"
            ])
            return
        }
        
        store.shield.applications = tokens
        
        var response: [String: Any] = [
            "success": true,
            "blockedCount": tokens.count
        ]
        if failedDecodes > 0 {
            response["warning"] = "Failed to decode \(failedDecodes) of \(args.tokenData.count) app token(s)"
        }
        invoke.resolve(response)
    }
    
    @objc public func unblockApps(_ invoke: Invoke) throws {
        store.shield.applications = nil
        invoke.resolve(["success": true])
    }
    
    // MARK: - Combined Block (websites + apps from stored selection)
    
    @objc public func startBlock(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(BlockWebsitesArgs.self)
        
        // Block websites (only when domains provided); for app-only blocks, clear web filter
        let truncated = args.domains.count > 50
        let webDomains = Set(args.domains.prefix(50).map { WebDomain(domain: $0) })
        if webDomains.isEmpty {
            store.webContent.blockedByFilter = nil
        } else {
            store.webContent.blockedByFilter = .specific(webDomains)
        }
        
        // Also block any apps from the stored selection
        let appTokens = ScreentimePlugin.currentSelection.applicationTokens
        let categoryTokens = ScreentimePlugin.currentSelection.categoryTokens
        if !appTokens.isEmpty {
            store.shield.applications = appTokens
        }
        if !categoryTokens.isEmpty {
            store.shield.applicationCategories = .specific(categoryTokens)
        }
        
        // Persist current manual block state to App Group so extension can merge on resume/block-end
        let manualState = buildScheduleData(domains: args.domains, appTokenData: nil, days: nil)
        SharedManualBlockStore.saveManualBlockState(manualState)
        
        var response: [String: Any] = [
            "success": true,
            "websitesBlocked": webDomains.count,
            "appsBlocked": appTokens.count,
            "categoriesBlocked": categoryTokens.count
        ]
        if truncated {
            response["warning"] = "Only first 50 of \(args.domains.count) domains blocked (Screen Time API limit)"
        }
        invoke.resolve(response)
    }
    
    @objc public func clearBlock(_ invoke: Invoke) throws {
        // Clear the default store (manual blocks)
        store.webContent.blockedByFilter = nil
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.clearAllSettings()
        
        // Clear manual block state in App Group so extension has no stale data
        SharedManualBlockStore.saveManualBlockState(ScheduleBlockData(domains: [], appTokenData: [], categoryTokenData: [], days: nil))
        
        // Also clear the named "schedule" store used by DeviceActivityMonitor
        // Since we use separate stores for manual vs schedule blocks, both
        // must be cleared for a complete "stop everything" action.
        let scheduleStore = ManagedSettingsStore(named: .init("schedule"))
        scheduleStore.clearAllSettings()
        
        // Note: We intentionally do NOT clear currentSelection here.
        // The selection should persist so the user doesn't have to re-pick
        // apps for the next block cycle. This matches desktop behavior where
        // blocklists persist across block cycles.
        
        invoke.resolve(["success": true])
    }
    
    // MARK: - Scheduling
    
    @objc public func scheduleBlock(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(ScheduleBlockArgs.self)
        let scheduleId = args.id ?? "default"
        
        let scheduleData = buildScheduleData(
            domains: args.domains,
            appTokenData: args.appTokenData
        )
        SharedScheduleStore.save(id: scheduleId, data: scheduleData)
        
        let startComponents = DateComponents(hour: args.startHour, minute: args.startMinute)
        let endComponents = DateComponents(hour: args.endHour, minute: args.endMinute)
        let schedule = DeviceActivitySchedule(
            intervalStart: startComponents,
            intervalEnd: endComponents,
            repeats: true
        )
        
        let activityName = DeviceActivityName("redd-block-\(scheduleId)")
        
        do {
            try center.startMonitoring(activityName, during: schedule)
            invoke.resolve(["success": true, "scheduleId": scheduleId])
        } catch {
            invoke.resolve([
                "success": false,
                "error": error.localizedDescription
            ])
        }
    }
    
    /// Set multiple schedules at once (mirrors desktop set-schedules command).
    /// Replaces all existing schedules with the provided list.
    @objc public func setSchedules(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(SetSchedulesArgs.self)
        
        // Get current schedule IDs to determine which to remove
        let existingIds = Set(SharedScheduleStore.loadAll().keys)
        let newIds = Set(args.schedules.map { $0.id })
        
        // Remove schedules that are no longer in the list
        let removedIds = existingIds.subtracting(newIds)
        for id in removedIds {
            center.stopMonitoring([DeviceActivityName("redd-block-\(id)")])
            SharedScheduleStore.remove(id: id)
        }
        
        // If any schedules were removed, clear the named "schedule" ManagedSettingsStore.
        // The DeviceActivityMonitor extension writes blocks to this store when intervalDidStart
        // fires — those blocks persist at the OS level even after monitoring stops.
        // Remaining active schedules will re-apply their blocks when the system re-fires
        // intervalDidStart for their re-registered monitoring.
        if !removedIds.isEmpty {
            let scheduleStore = ManagedSettingsStore(named: .init("schedule"))
            scheduleStore.clearAllSettings()
        }
        
        // Add/update schedules
        var errors: [String] = []
        for entry in args.schedules {
            let scheduleData = buildScheduleData(
                domains: entry.domains,
                appTokenData: entry.appTokenData,
                days: entry.days
            )
            SharedScheduleStore.save(id: entry.id, data: scheduleData)
            
            let startComponents = DateComponents(hour: entry.startHour, minute: entry.startMinute)
            let endComponents = DateComponents(hour: entry.endHour, minute: entry.endMinute)
            let schedule = DeviceActivitySchedule(
                intervalStart: startComponents,
                intervalEnd: endComponents,
                repeats: true
            )
            
            let activityName = DeviceActivityName("redd-block-\(entry.id)")
            
            do {
                try center.startMonitoring(activityName, during: schedule)
            } catch {
                errors.append("Schedule \(entry.id): \(error.localizedDescription)")
            }
        }
        
        if !args.schedules.isEmpty {
            reapplyActiveScheduleBlocksToStore(entries: args.schedules)
        }
        
        if errors.isEmpty {
            invoke.resolve([
                "success": true,
                "scheduledCount": args.schedules.count
            ])
        } else {
            invoke.resolve([
                "success": false,
                "error": errors.joined(separator: "; ")
            ])
        }
    }
    
    @objc public func unscheduleBlock(_ invoke: Invoke) throws {
        // Try to parse args to check if a specific ID was provided
        let args = try? invoke.parseArgs(UnscheduleBlockArgs.self)
        
        if let specificId = args?.id {
            // Remove only the specified schedule
            center.stopMonitoring([DeviceActivityName("redd-block-\(specificId)")])
            SharedScheduleStore.remove(id: specificId)
        } else {
            // Remove all schedules
            let allIds = SharedScheduleStore.loadAll().keys
            let activityNames = allIds.map { DeviceActivityName("redd-block-\($0)") }
            if !activityNames.isEmpty {
                center.stopMonitoring(activityNames)
            }
            // Also stop the legacy name
            center.stopMonitoring([DeviceActivityName("redd-block-schedule")])
            SharedScheduleStore.clear()
        }
        
        // Clear the named "schedule" ManagedSettingsStore to remove OS-level blocks
        // that were applied by the DeviceActivityMonitor extension.
        let scheduleStore = ManagedSettingsStore(named: .init("schedule"))
        scheduleStore.clearAllSettings()
        invoke.resolve(["success": true])
    }
    
    // MARK: - One-off DeviceActivity (pause resume / block end)
    
    /// Register a one-off DeviceActivity that starts at startTimestampMs and ends 15 minutes later.
    /// The extension will fire intervalDidStart at that time. Activity name e.g. "redd-block-resume-{blockId}" or "redd-block-end-{blockId}".
    @objc public func registerOneOffActivity(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(RegisterOneOffActivityArgs.self)
        let startDate = Date(timeIntervalSince1970: args.startTimestampMs / 1000.0)
        let endDate = startDate.addingTimeInterval(15 * 60)
        let calendar = Calendar.current
        let components: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let intervalStart = calendar.dateComponents(components, from: startDate)
        let intervalEnd = calendar.dateComponents(components, from: endDate)
        let schedule = DeviceActivitySchedule(
            intervalStart: intervalStart,
            intervalEnd: intervalEnd,
            repeats: false
        )
        let activityName = DeviceActivityName(args.activityName)
        do {
            try center.startMonitoring(activityName, during: schedule)
            invoke.resolve(["success": true])
        } catch {
            invoke.resolve(["success": false, "error": error.localizedDescription])
        }
    }
    
    /// Save resume payload for a block so the extension can re-apply it when the one-off activity fires.
    @objc public func setResumePayload(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(SetResumePayloadArgs.self)
        let payload = buildScheduleData(domains: args.domains, appTokenData: nil, days: nil)
        SharedManualBlockStore.saveResumePayload(blockId: args.blockId, payload)
        invoke.resolve(["success": true])
    }
    
    /// Save state to apply when a block ends (effective state without this block) so extension can apply at endTime.
    @objc public func setBlockEndState(_ invoke: Invoke) throws {
        guard isAuthorized() else {
            invoke.resolve(["success": false, "error": "Screen Time authorization not granted"])
            return
        }
        let args = try invoke.parseArgs(SetBlockEndStateArgs.self)
        let payload = buildScheduleData(domains: args.domains, appTokenData: nil, days: nil)
        SharedManualBlockStore.saveBlockEndState(blockId: args.blockId, payload)
        invoke.resolve(["success": true])
    }
    
    /// Build a ScheduleBlockData from optional domains/appTokenData, encoding
    /// category tokens from the current stored selection. Optional days (Mon=0 … Sun=6)
    /// is stored for the extension to filter by weekday.
    private func buildScheduleData(domains: [String]?, appTokenData: [String]?, days: [Int]? = nil) -> ScheduleBlockData {
        let selection = ScreentimePlugin.currentSelection
        
        // Encode category tokens from the current selection
        var encodedCategoryTokens: [String] = []
        for token in selection.categoryTokens {
            if let data = try? JSONEncoder().encode(token) {
                encodedCategoryTokens.append(data.base64EncodedString())
            }
        }
        
        // Use provided app tokens, or encode from current selection
        let finalAppTokenData: [String]
        if let provided = appTokenData, !provided.isEmpty {
            finalAppTokenData = provided
        } else {
            var encodedAppTokens: [String] = []
            for token in selection.applicationTokens {
                if let data = try? JSONEncoder().encode(token) {
                    encodedAppTokens.append(data.base64EncodedString())
                }
            }
            finalAppTokenData = encodedAppTokens
        }
        
        return ScheduleBlockData(
            domains: domains ?? [],
            appTokenData: finalAppTokenData,
            categoryTokenData: encodedCategoryTokens,
            days: days
        )
    }
    
    // MARK: - Re-apply active schedule blocks after clear (pause / setSchedules with removal)
    
    /// Current weekday in same encoding as frontend/extension: Mon=0 … Sun=6.
    private static func currentWeekdayMon0() -> Int {
        let weekday = Calendar.current.component(.weekday, from: Date())
        return (weekday - 2 + 7) % 7
    }
    
    /// True if the segment's time window and day filter include the current time.
    private func isSegmentActiveNow(entry: ScheduleEntry) -> Bool {
        let today = Self.currentWeekdayMon0()
        if let days = entry.days, !days.isEmpty {
            if !days.contains(today) {
                return false
            }
        }
        let now = Date()
        let currentMins = Calendar.current.component(.hour, from: now) * 60 + Calendar.current.component(.minute, from: now)
        let startMins = entry.startHour * 60 + entry.startMinute
        let endMins = entry.endHour * 60 + entry.endMinute
        if endMins > startMins {
            return currentMins >= startMins && currentMins < endMins
        }
        let yesterdayDay = today == 0 ? 6 : today - 1
        if let days = entry.days, !days.isEmpty {
            let inEvening = days.contains(today) && currentMins >= startMins
            let inMorning = days.contains(yesterdayDay) && currentMins < endMins
            return inEvening || inMorning
        }
        return currentMins >= startMins || currentMins < endMins
    }
    
    /// After clearing the schedule store, re-apply the union of blocks for all remaining
    /// segments that are currently in their active time window.
    private func reapplyActiveScheduleBlocksToStore(entries: [ScheduleEntry]) {
        var allDomains = Set<WebDomain>()
        var allAppTokens = Set<ApplicationToken>()
        var allCategoryTokens = Set<ActivityCategoryToken>()
        for entry in entries where isSegmentActiveNow(entry: entry) {
            guard let data = SharedScheduleStore.load(id: entry.id) else { continue }
            for domain in data.domains.prefix(50) {
                allDomains.insert(WebDomain(domain: domain))
            }
            for tokenString in data.appTokenData {
                if let tokenData = Data(base64Encoded: tokenString),
                   let token = try? JSONDecoder().decode(ApplicationToken.self, from: tokenData) {
                    allAppTokens.insert(token)
                }
            }
            for tokenString in data.categoryTokenData {
                if let tokenData = Data(base64Encoded: tokenString),
                   let token = try? JSONDecoder().decode(ActivityCategoryToken.self, from: tokenData) {
                    allCategoryTokens.insert(token)
                }
            }
        }
        let scheduleStore = ManagedSettingsStore(named: .init("schedule"))
        if allDomains.isEmpty && allAppTokens.isEmpty && allCategoryTokens.isEmpty {
            scheduleStore.clearAllSettings()
            return
        }
        let domainArray = Array(allDomains.prefix(50))
        if domainArray.isEmpty {
            scheduleStore.webContent.blockedByFilter = nil
        } else {
            scheduleStore.webContent.blockedByFilter = .specific(Set(domainArray))
        }
        if allAppTokens.isEmpty {
            scheduleStore.shield.applications = nil
        } else {
            scheduleStore.shield.applications = allAppTokens
        }
        if allCategoryTokens.isEmpty {
            scheduleStore.shield.applicationCategories = nil
        } else {
            scheduleStore.shield.applicationCategories = .specific(allCategoryTokens)
        }
    }
    
    private func statusString(_ status: AuthorizationStatus) -> String {
        switch status {
        case .notDetermined:
            return "notDetermined"
        case .denied:
            return "denied"
        case .approved:
            return "approved"
        @unknown default:
            return "unknown"
        }
    }
}

// MARK: - Plugin Init

@_cdecl("init_plugin_screentime")
func initPlugin() -> Plugin {
    if #available(iOS 16.0, *) {
        return ScreentimePlugin()
    } else {
        // Fallback for iOS < 16 (shouldn't happen with deployment target 16.0)
        fatalError("Screen Time plugin requires iOS 16.0+")
    }
}
