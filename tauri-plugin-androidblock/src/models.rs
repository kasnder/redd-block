use serde::{Deserialize, Serialize};

/// Schedules and active sessions are exchanged with the Kotlin side as
/// opaque JSON strings so the legacy redd-block-android data format
/// (SharedPreferences keys `routines` / `active_routine_sessions`)
/// stays the single source of truth — the frontend and the
/// Accessibility Service read the exact same shape.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmptyRequest {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateResponse {
  pub state_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveScheduleRequest {
  pub schedule_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleIdRequest {
  pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAppsResponse {
  pub apps_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SuccessResponse {
  pub success: bool,
  #[serde(default)]
  pub error: Option<String>,
}
