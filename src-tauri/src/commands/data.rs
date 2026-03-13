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

/// Get the data file path
fn get_data_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
    app_data_dir.join("redd-block-data.json")
}

/// Get the app version
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Check for data files from previous app versions that used different bundle identifiers.
/// Returns the path to the most recently modified legacy data file, if any.
fn find_legacy_data() -> Option<PathBuf> {
    let app_support = dirs::data_dir()?; // ~/Library/Application Support on macOS
    let legacy_identifiers = ["com.redd.block", "redd-block"];
    
    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    
    for id in &legacy_identifiers {
        let path = app_support.join(id).join("redd-block-data.json");
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

/// Load data from file
#[tauri::command]
pub fn load_data(app: AppHandle) -> Result<AppData, String> {
    let data_path = get_data_path(&app);
    
    // Ensure parent directory exists
    if let Some(parent) = data_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    if data_path.exists() {
        let content = fs::read_to_string(&data_path).map_err(|e| e.to_string())?;
        let data: AppData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(data)
    } else {
        // Check for data from older app versions with different bundle identifiers
        if let Some(legacy_path) = find_legacy_data() {
            log::info!("Migrating data from legacy path: {:?}", legacy_path);
            let content = fs::read_to_string(&legacy_path).map_err(|e| e.to_string())?;
            let data: AppData = serde_json::from_str(&content).map_err(|e| e.to_string())?;
            // Save to current location so migration only happens once
            let migrated = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
            fs::write(&data_path, migrated).map_err(|e| e.to_string())?;
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
    
    // Ensure parent directory exists
    if let Some(parent) = data_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    let content = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(&data_path, content).map_err(|e| e.to_string())?;
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
