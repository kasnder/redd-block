use tauri::{command, AppHandle, Runtime};

use crate::models::*;
use crate::Result;
use crate::ScreentimeExt;

// --- Authorization ---

#[command]
pub(crate) async fn request_authorization<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AuthorizationResponse> {
    app.screentime().request_authorization()
}

#[command]
pub(crate) async fn check_authorization<R: Runtime>(
    app: AppHandle<R>,
) -> Result<AuthorizationResponse> {
    app.screentime().check_authorization()
}

// --- Website Blocking ---

#[command]
pub(crate) async fn block_websites<R: Runtime>(
    app: AppHandle<R>,
    domains: Vec<String>,
) -> Result<BlockWebsitesResponse> {
    app.screentime().block_websites(BlockWebsitesRequest { domains })
}

#[command]
pub(crate) async fn unblock_websites<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SuccessResponse> {
    app.screentime().unblock_websites()
}

// --- App Blocking ---

#[command]
pub(crate) async fn block_apps<R: Runtime>(
    app: AppHandle<R>,
    token_data: Vec<String>,
) -> Result<BlockAppsResponse> {
    app.screentime().block_apps(BlockAppsRequest { token_data })
}

#[command]
pub(crate) async fn unblock_apps<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SuccessResponse> {
    app.screentime().unblock_apps()
}

// --- Combined Block/Unblock ---

#[command]
pub(crate) async fn screentime_start_block<R: Runtime>(
    app: AppHandle<R>,
    domains: Vec<String>,
) -> Result<StartBlockResponse> {
    app.screentime().start_block(StartBlockRequest { domains })
}

#[command]
pub(crate) async fn screentime_clear_block<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SuccessResponse> {
    app.screentime().clear_block()
}

// --- Scheduling ---

#[command]
pub(crate) async fn schedule_block<R: Runtime>(
    app: AppHandle<R>,
    start_hour: u32,
    start_minute: u32,
    end_hour: u32,
    end_minute: u32,
    domains: Option<Vec<String>>,
    app_token_data: Option<Vec<String>>,
) -> Result<SuccessResponse> {
    app.screentime().schedule_block(ScheduleBlockRequest {
        start_hour,
        start_minute,
        end_hour,
        end_minute,
        domains,
        app_token_data,
    })
}

#[command]
pub(crate) async fn unschedule_block<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SuccessResponse> {
    app.screentime().unschedule_block()
}

// --- Activity Picker ---

#[command]
pub(crate) async fn show_activity_picker<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ActivityPickerResponse> {
    app.screentime().show_activity_picker()
}
