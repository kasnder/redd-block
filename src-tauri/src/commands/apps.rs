use tauri_plugin_dialog::DialogExt;

/// Open a file picker dialog to select one or more applications.
///
/// This is the only command exported from this module — the
/// previous get_running_apps + minimize_app helpers were dead code
/// (registered with Tauri but never invoked from the frontend) AND
/// they shelled out to osascript / PowerShell with arguments that
/// touched System Events on macOS and triggered the Automation TCC
/// permission dialog. Removing them lets the app start with one
/// fewer system-permission prompt at first launch. Real running-
/// process introspection lives in app_watcher (sysinfo-based) and
/// in the enforcer's quit_browser path.
#[tauri::command]
pub async fn open_app_picker(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    let default_path = std::path::Path::new("/Applications");

    #[cfg(target_os = "windows")]
    let default_path = std::path::Path::new("C:\\Program Files");

    #[cfg(target_os = "linux")]
    let default_path = std::path::Path::new("/usr/share/applications");

    let files = app.dialog()
        .file()
        .set_title("Select Applications to Block")
        .set_directory(default_path)
        .blocking_pick_files();

    match files {
        Some(file_paths) => {
            let mut app_names = Vec::new();
            for file_path in file_paths {
                if let Some(path) = file_path.into_path().ok() {
                    if let Some(name) = path.file_stem() {
                        app_names.push(name.to_string_lossy().to_string());
                    } else {
                        app_names.push(path.to_string_lossy().to_string());
                    }
                }
            }
            Ok(app_names)
        }
        None => Ok(Vec::new()),
    }
}
