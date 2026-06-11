const COMMANDS: &[&str] = &[
    "get_state",
    "save_schedule",
    "delete_schedule",
    "toggle_schedule",
    "get_installed_apps",
    "open_accessibility_settings",
    "open_notification_settings",
    "open_battery_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
