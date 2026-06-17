use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(not(target_os = "android"))]
mod desktop;
#[cfg(target_os = "android")]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(not(target_os = "android"))]
use desktop::Androidblock;
#[cfg(target_os = "android")]
use mobile::Androidblock;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the Android blocking engine.
pub trait AndroidblockExt<R: Runtime> {
  fn androidblock(&self) -> &Androidblock<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AndroidblockExt<R> for T {
  fn androidblock(&self) -> &Androidblock<R> {
    self.state::<Androidblock<R>>().inner()
  }
}

/// Initializes the androidblock plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("androidblock")
    .invoke_handler(tauri::generate_handler![
      commands::get_state,
      commands::save_schedule,
      commands::delete_schedule,
      commands::toggle_schedule,
      commands::get_installed_apps,
      commands::open_accessibility_settings,
      commands::open_battery_settings,
    ])
    .setup(|app, api| {
      #[cfg(target_os = "android")]
      let androidblock = mobile::init(app, api)?;
      #[cfg(not(target_os = "android"))]
      let androidblock = desktop::init(app, api)?;
      app.manage(androidblock);
      Ok(())
    })
    .build()
}
