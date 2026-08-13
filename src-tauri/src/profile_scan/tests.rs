use super::*;

fn parse(body: &str) -> SafariPlistStatus {
    let keys = vec!["com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)".to_string()];
    parse_safari_extensions_plist(body.as_bytes(), &keys).expect("plist parses")
}

fn plist(entries: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
{entries}
</dict>
</plist>"#
    )
}

fn entry(
    key: &str,
    enabled: bool,
    private: bool,
    website_access_all: bool,
    revoked_all: bool,
    removed: bool,
) -> String {
    let removed_date = if removed {
        "<key>RemovedDate</key><date>2026-04-26T17:33:08Z</date>"
    } else {
        ""
    };
    let granted_origins = if website_access_all {
        r#"<key>GrantedPermissionOrigins</key>
  <dict>
    <key>*://*/*</key><date>4001-01-01T00:00:00Z</date>
  </dict>"#
    } else {
        r#"<key>GrantedPermissionOrigins</key><dict/>"#
    };
    let revoked_origins = if revoked_all {
        r#"<key>RevokedPermissionOrigins</key>
  <dict>
    <key>*://*/*</key><date>4001-01-01T00:00:00Z</date>
  </dict>"#
    } else {
        r#"<key>RevokedPermissionOrigins</key><dict/>"#
    };
    format!(
        r#"<key>{key}</key>
<dict>
  <key>Enabled</key><{enabled}/>
  <key>AllowInPrivateBrowsing</key><{private}/>
  {granted_origins}
  <key>GrantedPermissions</key>
  <dict/>
  {revoked_origins}
  {removed_date}
</dict>"#,
        enabled = if enabled { "true" } else { "false" },
        private = if private { "true" } else { "false" },
    )
}

#[test]
fn safari_plist_enabled_and_private_allowed() {
    let status = parse(&plist(&entry(
        "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
        true,
        true,
        true,
        false,
        false,
    )));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(true));
    assert_eq!(status.private_browsing, Some(true));
    assert_eq!(status.website_access_all, Some(true));
}

#[test]
fn safari_plist_enabled_private_denied() {
    let status = parse(&plist(&entry(
        "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
        true,
        false,
        true,
        false,
        false,
    )));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(true));
    assert_eq!(status.private_browsing, Some(false));
    assert_eq!(status.website_access_all, Some(true));
}

#[test]
fn safari_plist_disabled() {
    let status = parse(&plist(&entry(
        "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
        false,
        true,
        true,
        false,
        false,
    )));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(false));
    assert_eq!(status.private_browsing, Some(true));
    assert_eq!(status.website_access_all, Some(true));
}

#[test]
fn safari_plist_requires_all_website_access() {
    let status = parse(&plist(&entry(
        "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
        true,
        true,
        false,
        false,
        false,
    )));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(true));
    assert_eq!(status.private_browsing, Some(true));
    assert_eq!(status.website_access_all, Some(false));
}

#[test]
fn safari_plist_all_website_access_revoked_fails() {
    let status = parse(&plist(&entry(
        "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
        true,
        true,
        true,
        true,
        false,
    )));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(true));
    assert_eq!(status.private_browsing, Some(true));
    assert_eq!(status.website_access_all, Some(false));
}

#[test]
fn safari_plist_ignores_removed_entries() {
    let entries = format!(
        "{}\n{}",
        entry(
            "com.ulriklyngs.mind-shield.old (7YEYWQKK25)",
            true,
            true,
            true,
            false,
            true
        ),
        entry(
            "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
            true,
            false,
            false,
            false,
            false
        ),
    );
    let status = parse(&plist(&entries));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(true));
    assert_eq!(status.private_browsing, Some(false));
    assert_eq!(status.website_access_all, Some(false));
}

fn parse_duplicate(body: &str) -> SafariDuplicatePlistScan {
    parse_safari_duplicate_extensions(body.as_bytes()).expect("plist parses")
}

#[test]
fn safari_duplicate_detects_both_enabled() {
    let entries = format!(
        "{}\n{}",
        entry(SAFARI_BUNDLED_PLIST_KEY, true, true, true, false, false,),
        entry(SAFARI_STANDALONE_PLIST_KEY, true, true, true, false, false,),
    );
    let scan = parse_duplicate(&plist(&entries));
    assert!(scan.bundled.present && scan.bundled.enabled);
    assert!(scan.standalone.present && scan.standalone.enabled);
    assert!(safari_extensions_both_enabled_conflict(
        true,
        scan.bundled.present,
        scan.bundled.enabled,
        scan.standalone.present,
        scan.standalone.enabled,
    ));
}

#[test]
fn safari_duplicate_clears_when_standalone_disabled() {
    let entries = format!(
        "{}\n{}",
        entry(SAFARI_BUNDLED_PLIST_KEY, true, true, true, false, false,),
        entry(SAFARI_STANDALONE_PLIST_KEY, false, true, true, false, false,),
    );
    let scan = parse_duplicate(&plist(&entries));
    assert!(scan.bundled.present && scan.bundled.enabled);
    assert!(scan.standalone.present && !scan.standalone.enabled);
    assert!(!safari_extensions_both_enabled_conflict(
        true,
        scan.bundled.present,
        scan.bundled.enabled,
        scan.standalone.present,
        scan.standalone.enabled,
    ));
}

#[test]
fn safari_duplicate_ignores_removed_standalone() {
    let entries = format!(
        "{}\n{}",
        entry(SAFARI_BUNDLED_PLIST_KEY, true, true, true, false, false,),
        entry(SAFARI_STANDALONE_PLIST_KEY, true, true, true, false, true,),
    );
    let scan = parse_duplicate(&plist(&entries));
    assert!(scan.bundled.present);
    assert!(!scan.standalone.present);
}

#[test]
fn safari_plist_ignores_stale_team_id_entry() {
    let entries = format!(
        "{}\n{}",
        entry(
            "com.ulriklyngs.mind-shield.mind-shield (7YEYWQKK25)",
            true,
            true,
            true,
            false,
            false
        ),
        entry(
            "com.ulriklyngs.mind-shield.mind-shield (JD647S9RT6)",
            true,
            true,
            false,
            true,
            false
        ),
    );
    let status = parse(&plist(&entries));
    assert!(status.installed);
    assert_eq!(status.enabled, Some(true));
    assert_eq!(status.private_browsing, Some(true));
    assert_eq!(status.website_access_all, Some(false));
}
