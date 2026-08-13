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
