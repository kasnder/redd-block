use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

// initializes the Kotlin plugin class
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<Androidblock<R>> {
  let handle = api.register_android_plugin("com.reddblock.androidblock", "AndroidBlockPlugin")?;
  Ok(Androidblock(handle))
}

/// Access to the Android blocking engine via the native Kotlin plugin.
pub struct Androidblock<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Androidblock<R> {
  /// Full UI state: schedules, active session ids, permission status.
  pub fn get_state(&self) -> crate::Result<StateResponse> {
    self.0
      .run_mobile_plugin("getState", EmptyRequest {})
      .map_err(Into::into)
  }

  pub fn save_schedule(&self, payload: SaveScheduleRequest) -> crate::Result<StateResponse> {
    self.0
      .run_mobile_plugin("saveSchedule", payload)
      .map_err(Into::into)
  }

  pub fn delete_schedule(&self, payload: ScheduleIdRequest) -> crate::Result<StateResponse> {
    self.0
      .run_mobile_plugin("deleteSchedule", payload)
      .map_err(Into::into)
  }

  pub fn toggle_schedule(&self, payload: ScheduleIdRequest) -> crate::Result<StateResponse> {
    self.0
      .run_mobile_plugin("toggleSchedule", payload)
      .map_err(Into::into)
  }

  pub fn get_installed_apps(&self) -> crate::Result<InstalledAppsResponse> {
    self.0
      .run_mobile_plugin("getInstalledApps", EmptyRequest {})
      .map_err(Into::into)
  }

  pub fn open_accessibility_settings(&self) -> crate::Result<SuccessResponse> {
    self.0
      .run_mobile_plugin("openAccessibilitySettings", EmptyRequest {})
      .map_err(Into::into)
  }

  pub fn open_battery_settings(&self) -> crate::Result<SuccessResponse> {
    self.0
      .run_mobile_plugin("openBatterySettings", EmptyRequest {})
      .map_err(Into::into)
  }
}
