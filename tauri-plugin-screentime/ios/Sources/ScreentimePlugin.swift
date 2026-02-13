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
    let startHour: Int
    let startMinute: Int
    let endHour: Int
    let endMinute: Int
    let domains: [String]?
    let appTokenData: [String]?  // Base64-encoded ApplicationToken data
}

class UnscheduleBlockArgs: Decodable {}

class ShowActivityPickerArgs: Decodable {}

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
    
    // Persist the current selection to UserDefaults so it survives app restarts.
    // ManagedSettingsStore persists blocks at the OS level, but we need to also
    // persist the selection so we can re-apply blocks and show the picker state.
    private static let selectionKey = "redd.activitySelection"
    
    private static var currentSelection: FamilyActivitySelection {
        get {
            if let data = UserDefaults.standard.data(forKey: selectionKey),
               let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data) {
                return selection
            }
            return FamilyActivitySelection()
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: selectionKey)
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
                    for token in selection.applicationTokens {
                        if let data = try? JSONEncoder().encode(token) {
                            encodedAppTokens.append(data.base64EncodedString())
                        }
                    }
                    
                    // Encode category tokens
                    var encodedCategoryTokens: [String] = []
                    for token in selection.categoryTokens {
                        if let data = try? JSONEncoder().encode(token) {
                            encodedCategoryTokens.append(data.base64EncodedString())
                        }
                    }
                    
                    // Dismiss the picker
                    topVC.dismiss(animated: true) {
                        invoke.resolve([
                            "cancelled": false,
                            "applicationTokens": encodedAppTokens,
                            "categoryTokens": encodedCategoryTokens,
                            "applicationCount": selection.applicationTokens.count,
                            "categoryCount": selection.categoryTokens.count
                        ])
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
        for tokenString in args.tokenData {
            if let data = Data(base64Encoded: tokenString) {
                if let token = try? JSONDecoder().decode(ApplicationToken.self, from: data) {
                    tokens.insert(token)
                }
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
        
        invoke.resolve([
            "success": true,
            "blockedCount": tokens.count
        ])
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
        
        // Block websites
        let truncated = args.domains.count > 50
        let webDomains = Set(args.domains.prefix(50).map { WebDomain(domain: $0) })
        if !webDomains.isEmpty {
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
        // Clear all managed settings (stops blocking)
        store.webContent.blockedByFilter = nil
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.clearAllSettings()
        
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
        
        let startComponents = DateComponents(hour: args.startHour, minute: args.startMinute)
        let endComponents = DateComponents(hour: args.endHour, minute: args.endMinute)
        let schedule = DeviceActivitySchedule(
            intervalStart: startComponents,
            intervalEnd: endComponents,
            repeats: true
        )
        
        let activityName = DeviceActivityName("redd-block-schedule")
        
        do {
            try center.startMonitoring(activityName, during: schedule)
            invoke.resolve(["success": true])
        } catch {
            invoke.resolve([
                "success": false,
                "error": error.localizedDescription
            ])
        }
    }
    
    @objc public func unscheduleBlock(_ invoke: Invoke) throws {
        center.stopMonitoring([DeviceActivityName("redd-block-schedule")])
        invoke.resolve(["success": true])
    }
    
    // MARK: - Helpers
    
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
