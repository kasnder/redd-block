use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<Androidblock<R>> {
  Ok(Androidblock(app.clone()))
}

/// Non-Android stub — the Accessibility-Service blocking engine only
/// exists on Android. Lets the crate compile standalone (CI, rust-analyzer);
/// the main app only depends on this plugin for the Android target.
pub struct Androidblock<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Androidblock<R> {
  fn unsupported_state() -> crate::Result<StateResponse> {
    Ok(StateResponse {
      state_json: "{\"error\":\"androidblock is only available on Android\"}".to_string(),
    })
  }

  pub fn get_state(&self) -> crate::Result<StateResponse> {
    Self::unsupported_state()
  }

  pub fn save_schedule(&self, _payload: SaveScheduleRequest) -> crate::Result<StateResponse> {
    Self::unsupported_state()
  }

  pub fn delete_schedule(&self, _payload: ScheduleIdRequest) -> crate::Result<StateResponse> {
    Self::unsupported_state()
  }

  pub fn toggle_schedule(&self, _payload: ScheduleIdRequest) -> crate::Result<StateResponse> {
    Self::unsupported_state()
  }

  pub fn get_installed_apps(&self) -> crate::Result<InstalledAppsResponse> {
    Ok(InstalledAppsResponse {
      apps_json: "[]".to_string(),
    })
  }

  fn unsupported() -> crate::Result<SuccessResponse> {
    Ok(SuccessResponse {
      success: false,
      error: Some("Only available on Android".to_string()),
    })
  }

  pub fn open_accessibility_settings(&self) -> crate::Result<SuccessResponse> {
    Self::unsupported()
  }

  pub fn open_notification_settings(&self) -> crate::Result<SuccessResponse> {
    Self::unsupported()
  }

  pub fn open_battery_settings(&self) -> crate::Result<SuccessResponse> {
    Self::unsupported()
  }
}
