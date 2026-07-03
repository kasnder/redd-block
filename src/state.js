// Shared mutable application state.
//
// ES module import bindings are read-only, so every variable that is
// REASSIGNED from more than one module lives here as a property of the
// exported `state` object (`state.foo = x` works from any importer).
// Module-private state stays as plain `let` inside its own module.
// Leaf module: must not import from any other app module.
export const state = {
    appData: {
        blocklists: [],
        activeBlocks: [],
        schedules: [],
        startOverlays: [],
        settings: {}
    },
    selectedBlocklistId: null,
    /** Session flag set when the user actively deselects (click-outside / ESC).
     *  Read by the sole-blocklist auto-selector so it stops fighting an
     *  intentional deselect — cleared again when the user picks anything via
     *  the dropdown or creates a new blocklist. */
    userExplicitlyDeselected: false,
    helperAvailable: false, // Track if the privileged helper daemon is running
    isIOS: false, // Track if running on iOS
    isAndroid: false, // Track if running on Android
    // True on macOS desktop (i.e. Mac platform AND not the iOS Tauri
    // runtime). Set in `detectPlatform`. Used to gate macOS-only Tauri
    // commands and onboarding copy.
    isMacOSDesktop: false,
    /** MSIX / Microsoft Store install — updates come from the Store, not GitHub. */
    isMicrosoftStorePackage: null,
    screentimeAuthorized: false, // Track if Screen Time is authorized (iOS)
    androidPermissionsGranted: false, // Track if Accessibility is granted (Android)
};
