use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "ios"))]
use tauri::WebviewWindow;

/// App data structure - matches the Electron version exactly
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    pub blocklists: Vec<Blocklist>,
    pub active_blocks: Vec<ActiveBlock>,
    #[serde(default)]
    pub schedules: Vec<Schedule>,
    pub settings: Settings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub migration_version: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Blocklist {
    pub id: String,
    pub name: String,
    pub mode: String,
    #[serde(default)]
    pub websites: Vec<String>,
    #[serde(default)]
    pub apps: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emoji: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub override_difficulty: Option<OverrideDifficulty>,
    #[serde(default = "default_true")]
    pub show_item_details: bool,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverrideDifficulty {
    #[serde(rename = "type")]
    pub difficulty_type: String,
    #[serde(default)]
    pub count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_text: Option<String>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBlock {
    pub id: String,
    pub blocklist_id: String,
    pub start_time: u64,
    pub end_time: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_paused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pause_end_time: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_always_on: Option<bool>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    pub blocklist_id: String,
    pub segments: Vec<ScheduleSegment>,
    pub repeat_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repeat_date: Option<String>,
    #[serde(default)]
    pub created_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_paused: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pause_end_time: Option<u64>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSegment {
    pub start_hour: u32,
    pub start_minute: u32,
    pub end_hour: u32,
    pub end_minute: u32,
    pub days: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub onboarding_complete: bool,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            blocklists: Vec::new(),
            active_blocks: Vec::new(),
            schedules: Vec::new(),
            settings: Settings::default(),
            migration_version: None,
        }
    }
}

/// Get the shared, system-wide data file path.
///
/// On desktop (macOS/Windows), app data is stored in a shared location so that
/// all user accounts can see and edit the same blocks, schedules, and blocklists.
/// This mirrors the helper daemon's state storage which is already system-wide.
///
/// On iOS, the per-user app data dir is used (single-user device).
fn get_data_path(app: &AppHandle) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        let _ = app; // unused on macOS — path is fixed
        PathBuf::from("/var/lib/redd-block/redd-block-data.json")
    }
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        let program_data = std::env::var("PROGRAMDATA")
            .unwrap_or_else(|_| "C:\\ProgramData".to_string());
        PathBuf::from(program_data)
            .join("ReDD Block")
            .join("redd-block-data.json")
    }
    #[cfg(target_os = "ios")]
    {
        // iOS: single-user device, use standard per-app data dir
        let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
        app_data_dir.join("redd-block-data.json")
    }
    // Fallback for other targets (e.g. Linux)
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "ios")))]
    {
        let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
        app_data_dir.join("redd-block-data.json")
    }
}

/// Get the app version
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Check for data files from previous per-user locations (migration sources).
///
/// Returns the path to the most recently modified data file found in any of:
/// - Current per-user Tauri app data dir (the old default location)
/// - Legacy bundle identifier directories (com.redd.block, redd-block)
fn find_per_user_data(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // Current Tauri app data dir (the old per-user location before shared migration)
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        candidates.push(app_data_dir.join("redd-block-data.json"));
    }

    // Legacy bundle identifiers
    if let Some(app_support) = dirs::data_dir() {
        for id in &["com.redd.block", "redd-block"] {
            candidates.push(app_support.join(id).join("redd-block-data.json"));
        }
    }

    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    for path in candidates {
        if path.exists() {
            if let Ok(meta) = fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    if best.as_ref().map_or(true, |(_, t)| modified > *t) {
                        best = Some((path, modified));
                    }
                }
            }
        }
    }

    best.map(|(p, _)| p)
}

/// Set file permissions so all local users can read and write the data file.
#[cfg(not(target_os = "windows"))]
fn set_shared_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    // rw-rw-rw- (0o666) — all users can read and write
    let perms = std::fs::Permissions::from_mode(0o666);
    if let Err(e) = fs::set_permissions(path, perms) {
        log::warn!("Could not set shared permissions on {:?}: {}", path, e);
    }
}

#[cfg(target_os = "windows")]
fn set_shared_permissions(_path: &std::path::Path) {
    // On Windows, %PROGRAMDATA% is already accessible to all users by default.
    // No additional permission changes needed.
}

/// Ensure the shared data directory exists and has appropriate permissions.
fn ensure_shared_dir(path: &std::path::Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("Failed to create shared data directory {:?}: {}", parent, e)
        })?;
        // Ensure directory is accessible to all users
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;
            let dir_perms = std::fs::Permissions::from_mode(0o777);
            let _ = fs::set_permissions(parent, dir_perms);
        }
    }
    Ok(())
}

/// Load data from file
#[tauri::command]
pub fn load_data(app: AppHandle) -> Result<AppData, String> {
    let data_path = get_data_path(&app);

    // Ensure shared directory exists
    ensure_shared_dir(&data_path)?;

    if data_path.exists() {
        let content = fs::read_to_string(&data_path).map_err(|e| e.to_string())?;
        let data: AppData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(data)
    } else {
        // Migrate from per-user location or legacy paths
        if let Some(source_path) = find_per_user_data(&app) {
            log::info!("Migrating data from per-user path to shared location: {:?} -> {:?}",
                source_path, data_path);
            let content = fs::read_to_string(&source_path).map_err(|e| e.to_string())?;
            let data: AppData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            // Save to shared location so migration only happens once
            let migrated = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
            fs::write(&data_path, &migrated).map_err(|e| e.to_string())?;
            set_shared_permissions(&data_path);
            Ok(data)
        } else {
            Ok(AppData::default())
        }
    }
}

/// Save data to file
#[tauri::command]
pub fn save_data(app: AppHandle, data: AppData) -> Result<(), String> {
    let data_path = get_data_path(&app);

    // Ensure shared directory exists
    ensure_shared_dir(&data_path)?;

    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&data_path, &content).map_err(|e| e.to_string())?;
    set_shared_permissions(&data_path);
    Ok(())
}

/// Set window size (used after onboarding) - desktop only
#[tauri::command]
#[cfg(not(target_os = "ios"))]
pub fn set_window_size(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    use tauri::LogicalSize;
    window.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    Ok(())
}

/// Set window size - no-op on iOS (always fullscreen)
#[tauri::command]
#[cfg(target_os = "ios")]
pub fn set_window_size(_width: f64, _height: f64) -> Result<(), String> {
    Ok(())
}
