#[cfg(not(target_os = "ios"))]
use tauri::Manager;

#[cfg(feature = "desktop")]
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

#[cfg(target_os = "macos")]
use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "ios")]
use tauri::{WebviewUrl, WebviewWindowBuilder};

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_screentime::init())
        .setup(|app| {
            // Set up logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Create main window with transparent titlebar on macOS
            #[cfg(target_os = "macos")]
            {
                let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                    .title("")
                    .inner_size(1000.0, 900.0)
                    .min_inner_size(600.0, 500.0)
                    .resizable(true)
                    .center()
                    .title_bar_style(TitleBarStyle::Overlay);

                let window = win_builder.build()?;

                // Set background color to match app (white)
                use cocoa::appkit::{NSColor, NSWindow};
                use cocoa::base::{id, nil};

                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    // Pure white background
                    let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                        nil,
                        1.0,  // R
                        1.0,  // G
                        1.0,  // B
                        1.0,  // A
                    );
                    ns_window.setBackgroundColor_(bg_color);
                }
            }

            // Create main window on Windows
            #[cfg(target_os = "windows")]
            {
                let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                    .title("ReDD Block")
                    .inner_size(840.0, 750.0)
                    .min_inner_size(600.0, 500.0)
                    .resizable(true)
                    .decorations(false) // Hide native title bar, use custom controls
                    .center();

                win_builder.build()?;
            }

            // Create main window on iOS — full screen webview
            #[cfg(target_os = "ios")]
            {
                let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                    .build()?;
            }

            // Create system tray menu (desktop only)
            #[cfg(feature = "desktop")]
            {
                let open_item = MenuItem::with_id(app, "open", "Open ReDD Block", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                // Build tray icon
                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .tooltip("ReDD Block")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .invoke_handler(all_commands())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// All commands for desktop platforms (includes helper, apps, watcher)
#[cfg(not(target_os = "ios"))]
fn all_commands() -> impl Fn(tauri::ipc::Invoke) -> bool {
    tauri::generate_handler![
        // Data commands (all platforms)
        commands::get_app_version,
        commands::load_data,
        commands::save_data,
        commands::set_window_size,
        // App commands (desktop only)
        commands::open_app_picker,
        commands::get_running_apps,
        commands::minimize_app,
        // Helper commands (desktop only)
        commands::check_helper_status,
        commands::install_helper,
        commands::uninstall_helper,
        commands::start_block_via_helper,
        commands::clear_block_via_helper,
        commands::set_blocked_apps_via_helper,
        commands::set_schedules_via_helper,
        commands::block_websites,
        // Process watcher commands (desktop only)
        commands::start_process_watcher,
        commands::stop_process_watcher,
        commands::set_blocked_apps,
        commands::has_blocked_apps,
        commands::hide_all_blocked_apps,
    ]
}

/// Commands for iOS (only shared commands for now; Screen Time plugin will add more)
#[cfg(target_os = "ios")]
fn all_commands() -> impl Fn(tauri::ipc::Invoke) -> bool {
    tauri::generate_handler![
        // Data commands (all platforms)
        commands::get_app_version,
        commands::load_data,
        commands::save_data,
        commands::set_window_size,
    ]
}
