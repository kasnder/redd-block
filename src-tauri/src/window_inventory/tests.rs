use super::{filter_user_facing_window_pids, WindowRecord};
use std::collections::HashSet;

fn record(owner_pid: u32, layer: i64, width: f64, height: f64) -> WindowRecord {
    WindowRecord {
        owner_pid,
        layer,
        width,
        height,
        alpha: 1.0,
    }
}

fn transparent_record(owner_pid: u32, width: f64, height: f64) -> WindowRecord {
    WindowRecord {
        owner_pid,
        layer: 0,
        width,
        height,
        alpha: 0.0,
    }
}

#[test]
fn filter_user_facing_window_pids_keeps_layer_zero_normal_windows() {
    let actual = filter_user_facing_window_pids(vec![record(101, 0, 900.0, 700.0)]);
    let expected = HashSet::from([101]);
    assert_eq!(actual, expected);
}

#[test]
fn filter_user_facing_window_pids_drops_nonzero_layers() {
    let actual = filter_user_facing_window_pids(vec![
        record(101, 3, 900.0, 700.0),
        record(202, 0, 900.0, 700.0),
    ]);
    let expected = HashSet::from([202]);
    assert_eq!(actual, expected);
}

#[test]
fn filter_user_facing_window_pids_drops_tiny_windows() {
    let actual = filter_user_facing_window_pids(vec![
        record(101, 0, 24.0, 300.0),
        record(202, 0, 900.0, 32.0),
        record(303, 0, 900.0, 700.0),
    ]);
    let expected = HashSet::from([303]);
    assert_eq!(actual, expected);
}

#[test]
fn filter_user_facing_window_pids_dedupes_multiple_windows_for_same_pid() {
    let actual = filter_user_facing_window_pids(vec![
        record(101, 0, 900.0, 700.0),
        record(101, 0, 1200.0, 800.0),
        record(202, 0, 900.0, 700.0),
    ]);
    let expected = HashSet::from([101, 202]);
    assert_eq!(actual, expected);
}

#[test]
fn filter_user_facing_window_pids_drops_fully_transparent_windows() {
    // Electron-style apps keep permanent invisible layer-0 windows alive
    // even when the user has closed every real window. Those must never
    // make the app count as user-facing.
    let actual = filter_user_facing_window_pids(vec![
        transparent_record(101, 900.0, 700.0),
        record(202, 0, 900.0, 700.0),
    ]);
    let expected = HashSet::from([202]);
    assert_eq!(actual, expected);
}

#[test]
fn filter_user_facing_window_pids_keeps_pid_with_one_real_window_among_noise() {
    // A single real window is enough, even when the same PID also owns
    // transparent or tiny helper surfaces.
    let actual = filter_user_facing_window_pids(vec![
        transparent_record(101, 900.0, 700.0),
        record(101, 0, 10.0, 10.0),
        record(101, 0, 800.0, 600.0),
    ]);
    let expected = HashSet::from([101]);
    assert_eq!(actual, expected);
}
