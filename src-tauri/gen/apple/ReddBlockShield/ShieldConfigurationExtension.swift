import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Minimal Pass 1 shield configuration that proves the extension is loading.
@available(iOS 16.0, *)
final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    private static let titleLabel = ShieldConfiguration.Label(
        text: "Blocked by ReDD Block",
        color: .label
    )

    private static let subtitleLabel = ShieldConfiguration.Label(
        text: "ReDD Block",
        color: .secondaryLabel
    )

    private static let pass1Configuration = ShieldConfiguration(
        backgroundBlurStyle: .systemMaterial,
        backgroundColor: .systemGroupedBackground,
        icon: nil,
        title: titleLabel,
        subtitle: subtitleLabel,
        primaryButtonLabel: nil,
        primaryButtonBackgroundColor: nil,
        secondaryButtonLabel: nil
    )

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        Self.pass1Configuration
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        Self.pass1Configuration
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        Self.pass1Configuration
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        Self.pass1Configuration
    }
}
