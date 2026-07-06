use std::collections::HashSet;

use core_foundation::array::CFArray;
use core_foundation::base::{CFType, TCFType};
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use core_graphics::geometry::CGRect;
use core_graphics::window::{
    copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer,
    kCGWindowListExcludeDesktopElements, kCGWindowListOptionAll, kCGWindowOwnerPID,
};

/// Ignore tiny overlays/tooltips that shouldn't make a process count as a
/// user-facing window owner for allowlist app enforcement.
const MIN_USER_WINDOW_EDGE: f64 = 50.0;

#[derive(Debug, Clone, Copy, PartialEq)]
struct WindowRecord {
    owner_pid: u32,
    layer: i64,
    width: f64,
    height: f64,
}

/// Return the set of PIDs that currently own at least one normal-sized layer-0
/// window. Uses `kCGWindowListOptionAll` so minimized windows still count as
/// user-facing for later allowlist enforcement passes.
#[allow(dead_code)]
pub(crate) fn user_facing_window_pids() -> HashSet<u32> {
    let Some(window_info) =
        copy_window_info(kCGWindowListOptionAll | kCGWindowListExcludeDesktopElements, kCGNullWindowID)
    else {
        return HashSet::new();
    };

    filter_user_facing_window_pids(window_records_from_cf_array(&window_info))
}

fn window_records_from_cf_array(window_info: &CFArray) -> Vec<WindowRecord> {
    let pid_key = unsafe { CFString::wrap_under_get_rule(kCGWindowOwnerPID) };
    let layer_key = unsafe { CFString::wrap_under_get_rule(kCGWindowLayer) };
    let bounds_key = unsafe { CFString::wrap_under_get_rule(kCGWindowBounds) };
    let mut out = Vec::new();

    for raw in window_info.get_all_values() {
        let dict: CFDictionary<CFString, CFType> =
            unsafe { TCFType::wrap_under_get_rule(raw as *const _) };

        let Some(owner_pid) = dict
            .find(pid_key.clone())
            .and_then(|value| value.downcast::<CFNumber>())
            .and_then(|n| n.to_i64())
            .and_then(|n| u32::try_from(n).ok())
        else {
            continue;
        };

        let Some(layer) = dict
            .find(layer_key.clone())
            .and_then(|value| value.downcast::<CFNumber>())
            .and_then(|n| n.to_i64())
        else {
            continue;
        };

        let Some(rect) = dict.find(bounds_key.clone()).and_then(|value| {
            let bounds_dict: CFDictionary =
                unsafe { TCFType::wrap_under_get_rule(value.as_CFTypeRef() as *const _) };
            CGRect::from_dict_representation(&bounds_dict)
        }) else {
            continue;
        };

        out.push(WindowRecord {
            owner_pid,
            layer,
            width: rect.size.width,
            height: rect.size.height,
        });
    }

    out
}

fn filter_user_facing_window_pids(records: Vec<WindowRecord>) -> HashSet<u32> {
    records
        .into_iter()
        .filter(|record| record.owner_pid > 0)
        .filter(|record| record.layer == 0)
        .filter(|record| {
            record.width >= MIN_USER_WINDOW_EDGE && record.height >= MIN_USER_WINDOW_EDGE
        })
        .map(|record| record.owner_pid)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{filter_user_facing_window_pids, WindowRecord};
    use std::collections::HashSet;

    fn record(owner_pid: u32, layer: i64, width: f64, height: f64) -> WindowRecord {
        WindowRecord {
            owner_pid,
            layer,
            width,
            height,
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
}
