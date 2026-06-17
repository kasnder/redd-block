use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::AndroidblockExt;
use crate::Result;

#[command]
pub(crate) async fn get_state<R: Runtime>(app: AppHandle<R>) -> Result<StateResponse> {
    app.androidblock().get_state()
}

#[command]
pub(crate) async fn save_schedule<R: Runtime>(
    app: AppHandle<R>,
    schedule_json: String,
) -> Result<StateResponse> {
    app.androidblock()
        .save_schedule(SaveScheduleRequest { schedule_json })
}

#[command]
pub(crate) async fn delete_schedule<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<StateResponse> {
    app.androidblock().delete_schedule(ScheduleIdRequest { id })
}

#[command]
pub(crate) async fn toggle_schedule<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> Result<StateResponse> {
    app.androidblock().toggle_schedule(ScheduleIdRequest { id })
}

#[command]
pub(crate) async fn get_installed_apps<R: Runtime>(
    app: AppHandle<R>,
) -> Result<InstalledAppsResponse> {
    app.androidblock().get_installed_apps()
}

#[command]
pub(crate) async fn open_accessibility_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SuccessResponse> {
    app.androidblock().open_accessibility_settings()
}

#[command]
pub(crate) async fn open_battery_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SuccessResponse> {
    app.androidblock().open_battery_settings()
}
