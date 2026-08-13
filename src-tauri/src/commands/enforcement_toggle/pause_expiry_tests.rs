use super::any_block_currently_active;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn data_with_pause(pause_end: u64) -> serde_json::Value {
    let now = now_ms();
    json!({
        "activeBlocks": [{
            "blocklistId": "bl",
            "startTime": now.saturating_sub(60_000),
            "endTime": now + 60_000,
            "isPaused": true,
            "pauseEndTime": pause_end
        }]
    })
}

/// An elapsed pause must not keep reporting the block as inactive — the
/// frontend may not have cleared `isPaused` yet (its sweep is a 1 s JS
/// interval that macOS throttles while the window is hidden).
#[test]
fn expired_pause_counts_as_active() {
    let data = data_with_pause(now_ms().saturating_sub(60_000));
    assert!(any_block_currently_active(&data));
}

#[test]
fn live_pause_counts_as_inactive() {
    let data = data_with_pause(now_ms() + 60_000);
    assert!(!any_block_currently_active(&data));
}
