use super::*;
use std::fs;

fn test_profile_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "redd_block_firefox_scan_test_{}_{name}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("mkdir");
    dir
}

fn addon_json(extra: serde_json::Map<String, Value>) -> Value {
    let mut m = serde_json::Map::new();
    m.insert("id".into(), Value::String(FIREFOX_ID.into()));
    m.insert("type".into(), Value::String("extension".into()));
    for (k, v) in extra {
        m.insert(k, v);
    }
    Value::Object(m)
}

#[test]
fn firefox_counts_disabled_addon_as_installed() {
    let dir = test_profile_dir("disabled");
    let addon = addon_json(serde_json::Map::from_iter([
        ("visible".into(), Value::Bool(true)),
        ("active".into(), Value::Bool(false)),
        ("userDisabled".into(), Value::Bool(true)),
    ]));
    assert!(firefox_addon_counts_as_installed(&addon, &dir));
    assert!(!firefox_addon_enabled(&addon));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn firefox_ignores_pending_uninstall() {
    let dir = test_profile_dir("pending_uninstall");
    let addon = addon_json(serde_json::Map::from_iter([
        ("visible".into(), Value::Bool(true)),
        ("pendingUninstall".into(), Value::Bool(true)),
        ("active".into(), Value::Bool(false)),
        ("userDisabled".into(), Value::Bool(true)),
    ]));
    assert!(!firefox_addon_counts_as_installed(&addon, &dir));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn firefox_ignores_invisible_catalog_row() {
    let dir = test_profile_dir("invisible");
    let addon = addon_json(serde_json::Map::from_iter([
        ("visible".into(), Value::Bool(false)),
        ("active".into(), Value::Bool(false)),
        ("userDisabled".into(), Value::Bool(true)),
    ]));
    assert!(!firefox_addon_counts_as_installed(&addon, &dir));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn firefox_ignores_stale_path() {
    let dir = test_profile_dir("stale_path");
    let rel = "extensions/stale.xpi";
    let addon = addon_json(serde_json::Map::from_iter([
        ("visible".into(), Value::Bool(true)),
        ("path".into(), Value::String(rel.into())),
        ("active".into(), Value::Bool(false)),
        ("userDisabled".into(), Value::Bool(true)),
    ]));
    assert!(!firefox_addon_counts_as_installed(&addon, &dir));
    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn firefox_accepts_path_on_disk() {
    let dir = test_profile_dir("on_disk");
    let rel = "extensions/redd.xpi";
    fs::create_dir_all(dir.join("extensions")).expect("mkdir");
    fs::write(dir.join(rel), b"xpi").expect("write");
    let addon = addon_json(serde_json::Map::from_iter([
        ("visible".into(), Value::Bool(true)),
        ("path".into(), Value::String(rel.into())),
        ("active".into(), Value::Bool(true)),
        ("userDisabled".into(), Value::Bool(false)),
    ]));
    assert!(firefox_addon_counts_as_installed(&addon, &dir));
    assert!(firefox_addon_enabled(&addon));
    let _ = fs::remove_dir_all(&dir);
}
