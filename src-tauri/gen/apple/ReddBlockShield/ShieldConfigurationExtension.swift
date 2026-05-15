import ManagedSettings
import ManagedSettingsUI
import UIKit

// MARK: - Pass 7: map system shielding context → App Group snapshot → labels

@available(iOS 16.0, *)
private enum ShieldSnapshotPresenter {
    /// Apple warns slow shield configuration falls back to defaults — keep work bounded.
    private static let maxSubtitleCharacters = 360

    /// Bundled in `ReddBlockShield.appex` (`Assets.xcassets` / `ShieldBrand`).
    private static let brandIcon: UIImage? = UIImage(named: "ShieldBrand")

    private static let titleLabel = ShieldConfiguration.Label(
        text: "Blocked by ReDD Block",
        color: .label
    )

    private static let fallbackSubtitle = ShieldConfiguration.Label(
        text: "This content is restricted by ReDD Block.",
        color: .secondaryLabel
    )

    private static let fallbackConfiguration = ShieldConfiguration(
        backgroundBlurStyle: .systemMaterial,
        backgroundColor: .systemGroupedBackground,
        icon: brandIcon,
        title: titleLabel,
        subtitle: fallbackSubtitle,
        primaryButtonLabel: ShieldConfiguration.Label(text: "OK", color: .secondaryLabel),
        primaryButtonBackgroundColor: nil,
        secondaryButtonLabel: nil
    )

    static func configuration(
        shielding application: Application,
        category: ActivityCategory?
    ) -> ShieldConfiguration {
        guard let snapshot = SharedShieldSnapshotStore.load() else {
            return fallbackConfiguration
        }
        var rows: [ShieldAttribution] = []
        if let row = appAttribution(snapshot: snapshot, application: application) {
            rows.append(row)
        }
        if let category, let row = categoryAttribution(snapshot: snapshot, category: category) {
            rows.append(row)
        }
        guard let picked = bestAttribution(rows) else {
            return fallbackConfiguration
        }
        return buildConfiguration(
            contextLine: application.localizedDisplayName.map { "\($0) isn’t available right now." }
                ?? "This app isn’t available right now.",
            attribution: picked
        )
    }

    static func configuration(
        shielding webDomain: WebDomain,
        category: ActivityCategory?
    ) -> ShieldConfiguration {
        guard let snapshot = SharedShieldSnapshotStore.load() else {
            return fallbackConfiguration
        }
        var rows: [ShieldAttribution] = []
        if let row = domainAttribution(snapshot: snapshot, webDomain: webDomain) {
            rows.append(row)
        }
        if let category, let row = categoryAttribution(snapshot: snapshot, category: category) {
            rows.append(row)
        }
        guard let picked = bestAttribution(rows) else {
            return fallbackConfiguration
        }
        let raw = webDomain.domain?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let displayHost = raw.isEmpty ? "This site" : raw
        return buildConfiguration(
            contextLine: "\(displayHost) isn’t available in Safari right now.",
            attribution: picked
        )
    }

    // MARK: - Lookups (keys must match Pass 4–6 writers)

    private static func appAttribution(snapshot: ShieldUISnapshot, application: Application) -> ShieldAttribution? {
        let token = application.token
        guard let data = try? JSONEncoder().encode(token) else { return nil }
        let key = data.base64EncodedString()
        return ShieldAttributionPicker.winningAppRow(tokenDataKey: key, snapshot: snapshot)
    }

    private static func domainAttribution(snapshot: ShieldUISnapshot, webDomain: WebDomain) -> ShieldAttribution? {
        guard let raw = webDomain.domain?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        let key = ShieldSnapshotNormalization.normalizedWebHost(raw)
        guard !key.isEmpty else { return nil }
        return ShieldAttributionPicker.winningDomainRow(normalizedHost: key, snapshot: snapshot)
    }

    private static func categoryAttribution(snapshot: ShieldUISnapshot, category: ActivityCategory) -> ShieldAttribution? {
        let token = category.token
        guard let data = try? JSONEncoder().encode(token) else { return nil }
        let key = data.base64EncodedString()
        return ShieldAttributionPicker.winningCategoryRow(tokenDataKey: key, snapshot: snapshot)
    }

    private static func bestAttribution(_ rows: [ShieldAttribution]) -> ShieldAttribution? {
        rows.min { a, b in
            if a.enforcementStartedAtMs != b.enforcementStartedAtMs {
                return a.enforcementStartedAtMs < b.enforcementStartedAtMs
            }
            return a.sourceId < b.sourceId
        }
    }

    // MARK: - Shield.Configuration assembly

    private static func buildConfiguration(contextLine: String, attribution: ShieldAttribution) -> ShieldConfiguration {
        let subtitleText = truncate(makeSubtitle(contextLine: contextLine, attribution: attribution))
        let subtitleColor = colorFromHex(attribution.blocklistColorHex) ?? .secondaryLabel
        let subtitle = ShieldConfiguration.Label(text: subtitleText, color: subtitleColor)
        return ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            backgroundColor: .systemGroupedBackground,
            icon: brandIcon,
            title: titleLabel,
            subtitle: subtitle,
            primaryButtonLabel: ShieldConfiguration.Label(text: "OK", color: .secondaryLabel),
            primaryButtonBackgroundColor: nil,
            secondaryButtonLabel: nil
        )
    }

    private static func makeSubtitle(contextLine: String, attribution: ShieldAttribution) -> String {
        var lines: [String] = [contextLine]
        let pill = pillLine(attribution: attribution)
        if !pill.isEmpty {
            lines.append(pill)
        }
        if let timing = timingLine(attribution: attribution), !timing.isEmpty {
            lines.append(timing)
        }
        return lines.joined(separator: "\n")
    }

    private static func pillLine(attribution: ShieldAttribution) -> String {
        let name = (attribution.blocklistName?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
        let emoji = (attribution.blocklistEmoji?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
        switch (emoji, name) {
        case let (e?, n?):
            return "\(e) \(n)"
        case let (e?, nil):
            return e
        case let (nil, n?):
            return n
        default:
            return "Blocklist: \(shortSource(attribution.sourceId))"
        }
    }

    private static func shortSource(_ sourceId: String) -> String {
        if sourceId == "manual" { return "manual block" }
        if sourceId.hasPrefix("schedule:") {
            return "schedule"
        }
        return sourceId
    }

    private static func timingLine(attribution: ShieldAttribution) -> String? {
        let nowMs = Date().timeIntervalSince1970 * 1000
        if let endMs = attribution.blockEndsAtMs {
            let end = Date(timeIntervalSince1970: endMs / 1000)
            if endMs > nowMs {
                let rel = relativeFormatter.localizedString(for: end, relativeTo: Date())
                return "Ends \(rel)."
            }
            let abs = timeFormatter.string(from: end)
            return "Ended \(abs)."
        }
        if let startMs = attribution.blockStartedAtMs {
            let start = Date(timeIntervalSince1970: startMs / 1000)
            let abs = timeFormatter.string(from: start)
            return "Started \(abs)."
        }
        return nil
    }

    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .short
        return f
    }()

    private static let timeFormatter: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f
    }()

    private static func truncate(_ s: String) -> String {
        guard s.count > maxSubtitleCharacters else { return s }
        let idx = s.index(s.startIndex, offsetBy: maxSubtitleCharacters - 1)
        return String(s[..<idx]) + "…"
    }

    /// `#RRGGBB` or `RRGGBB` → `UIColor`; invalid → nil
    private static func colorFromHex(_ raw: String?) -> UIColor? {
        guard var s = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let value = UInt32(s, radix: 16) else { return nil }
        let r = CGFloat((value >> 16) & 0xff) / 255
        let g = CGFloat((value >> 8) & 0xff) / 255
        let b = CGFloat(value & 0xff) / 255
        return UIColor(red: r, green: g, blue: b, alpha: 1)
    }
}

/// Shield configuration: reads `ShieldUISnapshot` from the App Group and maps `shielding` to labels.
@available(iOS 16.0, *)
final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        ShieldSnapshotPresenter.configuration(shielding: application, category: nil)
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        ShieldSnapshotPresenter.configuration(shielding: application, category: category)
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        ShieldSnapshotPresenter.configuration(shielding: webDomain, category: nil)
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        ShieldSnapshotPresenter.configuration(shielding: webDomain, category: category)
    }
}
