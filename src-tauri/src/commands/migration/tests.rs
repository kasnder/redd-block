use super::*;

#[test]
fn strips_new_marker_block() {
    let input = "127.0.0.1 localhost\n# === BEGIN REDD BLOCK (reddfocus.org) ===\n0.0.0.0 reddit.com\n# === END REDD BLOCK (reddfocus.org) ===\n::1 localhost\n";
    let out = strip_managed_sections(input);
    assert!(!out.contains("reddit.com"));
    assert!(out.contains("localhost"));
}

#[test]
fn strips_legacy_marker_block() {
    let input = "127.0.0.1 localhost\n# ReDD Block Start\n0.0.0.0 reddit.com\n# ReDD Block End\n::1 localhost\n";
    let out = strip_managed_sections(input);
    assert!(!out.contains("reddit.com"));
    assert!(out.contains("localhost"));
}

#[test]
fn idempotent_when_nothing_managed() {
    let input = "127.0.0.1 localhost\n::1 localhost\n";
    let out = strip_managed_sections(input);
    assert_eq!(out.trim_end(), input.trim_end());
}

#[test]
fn detects_markers() {
    assert!(hosts_has_markers("foo\n# ReDD Block Start\nbar\n"));
    assert!(hosts_has_markers(
        "# === BEGIN REDD BLOCK (reddfocus.org) ===\n"
    ));
    assert!(!hosts_has_markers("127.0.0.1 localhost\n"));
}
