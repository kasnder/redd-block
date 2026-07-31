//! Canonical product naming for paths, packages, and migration.
//!
//! Display copy elsewhere may use a colon (`Digital Habits: Blocker`).
//! Filesystem / package basenames cannot (Windows forbids `:`; macOS
//! treats `:` as a legacy path separator), so path segments and
//! `productName` use the no-colon form.

/// Filesystem-safe product directory / `.app` basename (no colon).
pub const PRODUCT_DIR_NAME: &str = "Digital Habits Blocker";

/// User-facing product name when a colon is allowed.
#[allow(dead_code)]
pub const PRODUCT_DISPLAY_NAME: &str = "Digital Habits: Blocker";

/// Older Windows ProgramData / LocalAppData / `.app` folder names, newest first.
/// Keep Fristed / ReDD Block / ReDD Blocker so upgrades copy data forward.
pub const LEGACY_PRODUCT_DIR_NAMES: &[&str] = &["ReDD Blocker", "ReDD Block", "Fristed"];

/// Current Windows watchdog Scheduled Task name.
#[cfg(target_os = "windows")]
pub const WATCHDOG_TASK_NAME: &str = "Digital Habits Blocker Watchdog";

/// Prior watchdog task names to delete on register/unregister/uninstall.
#[cfg(target_os = "windows")]
pub const LEGACY_WATCHDOG_TASK_NAMES: &[&str] =
    &["ReDD Blocker Watchdog", "ReDD Block Watchdog"];

/// Current HKCU Run value written by tauri-plugin-autostart (`package_info().name`).
#[cfg(target_os = "windows")]
pub const AUTOSTART_RUN_VALUE: &str = "Digital Habits Blocker";

/// Prior Run values to delete on uninstall so login items do not orphan.
#[cfg(target_os = "windows")]
pub const LEGACY_AUTOSTART_RUN_VALUES: &[&str] = &["ReDD Blocker", "ReDD Block", "Fristed"];

#[cfg(target_os = "windows")]
pub fn windows_program_data_root() -> std::path::PathBuf {
    let program_data =
        std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    std::path::PathBuf::from(program_data)
}

#[cfg(target_os = "windows")]
pub fn windows_primary_shared_dir() -> std::path::PathBuf {
    windows_program_data_root().join(PRODUCT_DIR_NAME)
}

#[cfg(target_os = "windows")]
pub fn windows_legacy_shared_dirs() -> Vec<std::path::PathBuf> {
    let root = windows_program_data_root();
    LEGACY_PRODUCT_DIR_NAMES
        .iter()
        .map(|name| root.join(name))
        .collect()
}

#[cfg(target_os = "windows")]
pub fn windows_local_app_data_root() -> Option<std::path::PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(std::path::PathBuf::from)
}

#[cfg(target_os = "windows")]
pub fn windows_primary_local_product_dir() -> Option<std::path::PathBuf> {
    Some(windows_local_app_data_root()?.join(PRODUCT_DIR_NAME))
}

#[cfg(target_os = "windows")]
pub fn windows_legacy_local_product_dirs() -> Vec<std::path::PathBuf> {
    let Some(local) = windows_local_app_data_root() else {
        return Vec::new();
    };
    LEGACY_PRODUCT_DIR_NAMES
        .iter()
        .map(|name| local.join(name))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn product_dir_name_has_no_colon() {
        assert!(
            !PRODUCT_DIR_NAME.contains(':'),
            "filesystem product dir must not contain a colon"
        );
        assert_eq!(PRODUCT_DIR_NAME, "Digital Habits Blocker");
    }

    #[test]
    fn legacy_list_includes_redd_blocker() {
        assert!(LEGACY_PRODUCT_DIR_NAMES.contains(&"ReDD Blocker"));
        assert!(LEGACY_PRODUCT_DIR_NAMES.contains(&"ReDD Block"));
        assert!(LEGACY_PRODUCT_DIR_NAMES.contains(&"Fristed"));
        assert_eq!(LEGACY_PRODUCT_DIR_NAMES[0], "ReDD Blocker");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_primary_dir_uses_product_dir_name() {
        let dir = windows_primary_shared_dir();
        assert!(dir.ends_with(PRODUCT_DIR_NAME));
        for legacy in windows_legacy_shared_dirs() {
            assert!(!legacy.ends_with(PRODUCT_DIR_NAME));
        }
    }
}
