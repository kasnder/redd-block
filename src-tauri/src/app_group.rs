#[cfg(target_os = "macos")]
use std::fs;
#[cfg(target_os = "macos")]
use std::io;
#[cfg(target_os = "macos")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(target_os = "macos")]
use objc2_foundation::{NSFileManager, NSString};

#[cfg(target_os = "macos")]
const APP_GROUP_ID: &str = "group.com.reddblock.shared";
#[cfg(target_os = "macos")]
const BLOCKLIST_FILENAME: &str = "redd-block-data.json";

#[cfg(target_os = "macos")]
static GROUP_DIR: OnceLock<Option<PathBuf>> = OnceLock::new();

#[cfg(target_os = "macos")]
pub fn path() -> Option<PathBuf> {
    GROUP_DIR.get_or_init(resolve_group_dir).clone()
}

#[cfg(target_os = "macos")]
pub fn blocklist_path() -> Option<PathBuf> {
    path().map(|dir| dir.join(BLOCKLIST_FILENAME))
}

#[cfg(target_os = "macos")]
pub fn write_blocklist_bytes(bytes: &[u8]) -> io::Result<()> {
    let Some(target) = blocklist_path() else {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "App Group container unavailable",
        ));
    };
    atomic_write(&target, bytes)
}

#[cfg(target_os = "macos")]
pub fn sync_blocklist_from(source: &Path) -> io::Result<()> {
    let bytes = fs::read(source)?;
    write_blocklist_bytes(&bytes)
}

#[cfg(target_os = "macos")]
pub fn start_sync_loop(source: PathBuf) {
    std::thread::spawn(move || {
        let mut last = mtime(&source);

        if let Err(e) = sync_blocklist_from(&source) {
            log::warn!("initial App Group sync failed from {:?}: {}", source, e);
        }

        loop {
            std::thread::sleep(Duration::from_secs(2));
            let current = mtime(&source);
            if current != last {
                last = current;
                if let Err(e) = sync_blocklist_from(&source) {
                    log::warn!("App Group sync failed from {:?}: {}", source, e);
                }
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn resolve_group_dir() -> Option<PathBuf> {
    resolve_group_dir_via_ffi().or_else(resolve_group_dir_by_scan)
}

#[cfg(target_os = "macos")]
fn resolve_group_dir_via_ffi() -> Option<PathBuf> {
    let manager = NSFileManager::defaultManager();
    let group_id = NSString::from_str(APP_GROUP_ID);
    let url = manager.containerURLForSecurityApplicationGroupIdentifier(&group_id)?;
    let path = url.path()?;
    Some(PathBuf::from(path.to_string()))
}

#[cfg(target_os = "macos")]
fn resolve_group_dir_by_scan() -> Option<PathBuf> {
    let root = dirs::home_dir()?.join("Library").join("Group Containers");
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if name.ends_with(APP_GROUP_ID) {
            return Some(path);
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn atomic_write(target: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = target
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no parent"))?;
    fs::create_dir_all(parent)?;

    let tmp = parent.join(format!(
        ".{}.{}.tmp",
        target
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("app-group"),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::write(&tmp, bytes)?;
    if let Err(e) = fs::rename(&tmp, target) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn mtime(path: &Path) -> Option<SystemTime> {
    fs::metadata(path).and_then(|m| m.modified()).ok()
}
