//! Shared parse cache for the canonical data file.
//!
//! The enforcement loops re-derive state from `redd-block-data.json` on
//! every tick — the Automation watcher every 1 s (plus one
//! `blockingMethods` lookup per running browser), the app-watcher sync
//! loop every 2 s (twice: blocked + allowed apps), and the enforcer
//! every 5 s (up to three separate reads). That added up to several
//! full disk-read + JSON-parse round-trips per second in steady state.
//!
//! This module caches the *parsed* `serde_json::Value` keyed on the
//! file's (mtime, len). Derivations stay live — they depend on `now()`
//! — but the parse only happens when the file actually changed. The
//! file is only ever replaced via atomic rename
//! (`write_data_file_atomic`), which always produces a fresh mtime, so
//! the (mtime, len) key is a reliable change signal even for writes
//! from other processes (the browser-spawned native host). Same-process
//! writers additionally call [`invalidate`] so a rewrite within the
//! filesystem's timestamp granularity can't serve a stale snapshot.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;

struct Entry {
    mtime: SystemTime,
    len: u64,
    value: Arc<serde_json::Value>,
}

static CACHE: OnceLock<Mutex<HashMap<PathBuf, Entry>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<PathBuf, Entry>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Parsed snapshot of the JSON file at `path`, re-read only when the
/// file's (mtime, len) changed since the last call. Returns `None` when
/// the file is missing, unreadable, or not valid JSON — the same cases
/// where callers previously bailed to their empty defaults.
pub fn read(path: &Path) -> Option<Arc<serde_json::Value>> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta.modified().ok()?;
    let len = meta.len();

    if let Ok(guard) = cache().lock() {
        if let Some(e) = guard.get(path) {
            if e.mtime == mtime && e.len == len {
                return Some(e.value.clone());
            }
        }
    }

    let raw = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let value = Arc::new(value);
    if let Ok(mut guard) = cache().lock() {
        guard.insert(
            path.to_path_buf(),
            Entry {
                mtime,
                len,
                value: value.clone(),
            },
        );
    }
    Some(value)
}

/// Drop the cached snapshot for `path`. Called after every same-process
/// write so the next read re-parses even if the rewrite landed within
/// the filesystem's timestamp granularity.
pub fn invalidate(path: &Path) {
    if let Ok(mut guard) = cache().lock() {
        guard.remove(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("redd-data-cache-test-{name}-{}", std::process::id()))
    }

    #[test]
    fn returns_parsed_json_and_caches_by_identity() {
        let path = temp_path("basic");
        std::fs::write(&path, serde_json::to_vec(&json!({"a": 1})).unwrap()).unwrap();

        let first = read(&path).expect("first read");
        let second = read(&path).expect("second read");
        assert!(Arc::ptr_eq(&first, &second), "unchanged file must serve the cached Arc");
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
}
