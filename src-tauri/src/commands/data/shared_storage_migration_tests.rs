use super::copy_shared_storage_forward;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_root(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("redd-block-migrate-{label}-{nanos}"));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn copies_redd_blocker_data_into_primary_when_missing() {
    let root = temp_root("copy");
    let primary = root.join("Digital Habits Blocker");
    let legacy = root.join("ReDD Blocker");
    fs::create_dir_all(&legacy).unwrap();
    fs::write(
        legacy.join("redd-block-data.json"),
        b"{\"from\":\"legacy\"}",
    )
    .unwrap();

    copy_shared_storage_forward(&primary, std::slice::from_ref(&legacy));

    let dst = primary.join("redd-block-data.json");
    assert!(dst.exists(), "expected primary data file after migration");
    assert_eq!(fs::read_to_string(dst).unwrap(), "{\"from\":\"legacy\"}");
    // Legacy kept in place (copy, not move).
    assert!(legacy.join("redd-block-data.json").exists());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn does_not_overwrite_existing_primary() {
    let root = temp_root("no-overwrite");
    let primary = root.join("Digital Habits Blocker");
    let legacy = root.join("ReDD Blocker");
    fs::create_dir_all(&primary).unwrap();
    fs::create_dir_all(&legacy).unwrap();
    fs::write(primary.join("redd-block-data.json"), b"primary-wins").unwrap();
    fs::write(legacy.join("redd-block-data.json"), b"legacy-should-lose").unwrap();

    copy_shared_storage_forward(&primary, &[legacy]);

    assert_eq!(
        fs::read_to_string(primary.join("redd-block-data.json")).unwrap(),
        "primary-wins"
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn prefers_first_legacy_that_has_the_file() {
    // Newest-first legacy order: ReDD Blocker, then ReDD Block, then Fristed.
    // First existing source wins because later copies skip once dst exists.
    let root = temp_root("order");
    let primary = root.join("Digital Habits Blocker");
    let redd_blocker = root.join("ReDD Blocker");
    let redd_block = root.join("ReDD Block");
    fs::create_dir_all(&redd_blocker).unwrap();
    fs::create_dir_all(&redd_block).unwrap();
    fs::write(
        redd_blocker.join("redd-block-data.json"),
        b"from-redd-blocker",
    )
    .unwrap();
    fs::write(redd_block.join("redd-block-data.json"), b"from-redd-block").unwrap();

    copy_shared_storage_forward(&primary, &[redd_blocker, redd_block]);

    assert_eq!(
        fs::read_to_string(primary.join("redd-block-data.json")).unwrap(),
        "from-redd-blocker"
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn copies_helper_state_too() {
    let root = temp_root("helper");
    let primary = root.join("Digital Habits Blocker");
    let legacy = root.join("Fristed");
    fs::create_dir_all(&legacy).unwrap();
    fs::write(legacy.join("helper-state.json"), b"{\"helper\":true}").unwrap();

    copy_shared_storage_forward(&primary, &[legacy]);

    assert_eq!(
        fs::read_to_string(primary.join("helper-state.json")).unwrap(),
        "{\"helper\":true}"
    );
    let _ = fs::remove_dir_all(root);
}
