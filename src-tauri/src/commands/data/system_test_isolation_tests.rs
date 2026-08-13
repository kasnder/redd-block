use super::{
    apply_system_test_override, canonical_data_path_static, should_import_legacy_data,
    system_test_data_path, wipe_path,
};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const ENV_NAME: &str = "REDD_BLOCK_SYSTEM_TEST_DATA_PATH";
static ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn with_override<T>(path: &PathBuf, f: impl FnOnce() -> T) -> T {
    let _guard = ENV_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap();
    // Rust 2024 treats process-environment mutation as unsafe because it
    // races with foreign threads. The lock makes this test's mutation
    // deterministic; production code only reads the variable.
    unsafe { std::env::set_var(ENV_NAME, path) };
    let result = f();
    unsafe { std::env::remove_var(ENV_NAME) };
    result
}

#[test]
fn missing_override_fails_closed_to_process_temp_storage() {
    let _guard = ENV_LOCK.get_or_init(|| Mutex::new(())).lock().unwrap();
    unsafe { std::env::remove_var(ENV_NAME) };
    let path = system_test_data_path().expect("system-test path");
    assert!(path.starts_with(std::env::temp_dir()));
    assert!(path
        .to_string_lossy()
        .contains(&std::process::id().to_string()));
    assert!(path.ends_with("redd-block-data.json"));
}

#[test]
fn override_precedes_both_resolver_fallbacks() {
    let path = std::env::temp_dir().join("redd-block-system-test-data.json");
    with_override(&path, || {
        // The handle-based and handle-free production resolvers both feed
        // their fallback through apply_system_test_override. Distinct
        // fallbacks here model their otherwise different path sources;
        // the actual AppHandle is intentionally not needed to exercise
        // this pure path-selection contract.
        assert_eq!(system_test_data_path(), Some(path.clone()));
        assert_eq!(canonical_data_path_static(), path);
        assert_eq!(
            apply_system_test_override(|| PathBuf::from("handle-fallback")),
            path
        );
    });
}

#[test]
fn missing_system_test_data_cannot_import_legacy_files() {
    let root = std::env::temp_dir().join(format!(
        "redd-block-system-test-isolation-{}",
        std::process::id()
    ));
    let isolated = root.join("isolated").join("redd-block-data.json");
    let legacy = root.join("legacy").join("redd-block-data.json");
    fs::create_dir_all(legacy.parent().unwrap()).unwrap();
    fs::write(&legacy, b"{\"legacy\":true}").unwrap();

    with_override(&isolated, || {
        // The missing-file branch in load_data returns defaults whenever
        // this predicate is false, so it cannot copy the legacy fixture.
        assert!(!isolated.exists());
        assert!(system_test_data_path().is_some());
        assert!(!should_import_legacy_data());
        assert!(!isolated.exists());
        assert_eq!(fs::read_to_string(&legacy).unwrap(), "{\"legacy\":true}");
    });

    let _ = fs::remove_dir_all(root);
}

#[test]
fn cleanup_fixture_removes_only_the_isolated_file() {
    let root = std::env::temp_dir().join(format!(
        "redd-block-system-test-cleanup-{}",
        std::process::id()
    ));
    let isolated = root.join("isolated").join("redd-block-data.json");
    let production_sentinel = root.join("production").join("redd-block-data.json");
    fs::create_dir_all(isolated.parent().unwrap()).unwrap();
    fs::create_dir_all(production_sentinel.parent().unwrap()).unwrap();
    fs::write(&isolated, b"isolated").unwrap();
    fs::write(&production_sentinel, b"production").unwrap();

    // This is the exact operation used by wipe_user_data's system-test
    // early return; no shared/legacy path enumeration is involved.
    with_override(&isolated, || wipe_path(&isolated));

    assert!(!isolated.exists());
    assert_eq!(
        fs::read_to_string(&production_sentinel).unwrap(),
        "production"
    );
    let _ = fs::remove_dir_all(root);
}
