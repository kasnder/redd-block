use super::*;
use serde_json::json;

fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "redd-data-cache-test-{name}-{}",
        std::process::id()
    ))
}

#[test]
fn returns_parsed_json_and_caches_by_identity() {
    let path = temp_path("basic");
    std::fs::write(&path, serde_json::to_vec(&json!({"a": 1})).unwrap()).unwrap();

    let first = read(&path).expect("first read");
    let second = read(&path).expect("second read");
    assert!(
        Arc::ptr_eq(&first, &second),
        "unchanged file must serve the cached Arc"
    );
    assert_eq!(first.get("a").and_then(|v| v.as_i64()), Some(1));

    let _ = std::fs::remove_file(&path);
}

#[test]
fn picks_up_rewrites() {
    let path = temp_path("rewrite");
    std::fs::write(&path, serde_json::to_vec(&json!({"a": 1})).unwrap()).unwrap();
    let first = read(&path).expect("first read");
    assert_eq!(first.get("a").and_then(|v| v.as_i64()), Some(1));

    // Different length guarantees a key change even if the two
    // writes land within the filesystem's timestamp granularity.
    std::fs::write(&path, serde_json::to_vec(&json!({"a": 22222})).unwrap()).unwrap();
    invalidate(&path);
    let second = read(&path).expect("second read");
    assert_eq!(second.get("a").and_then(|v| v.as_i64()), Some(22222));

    let _ = std::fs::remove_file(&path);
}

#[test]
fn missing_file_returns_none() {
    assert!(read(&temp_path("missing-never-created")).is_none());
}
