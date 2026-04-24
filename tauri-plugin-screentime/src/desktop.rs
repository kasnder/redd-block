use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<Screentime<R>> {
  Ok(Screentime(app.clone()))
}

/// Desktop Screen Time backend.
///
/// On macOS 14+ this calls into `ScreentimePluginMacOS.swift` via the
/// `redd_screentime_*` C ABI. The Swift static library is built as
/// part of the plugin's Swift package and linked into the Tauri app.
///
/// On Windows / Linux the Screen Time API doesn't exist; every
/// method returns an `unsupported` response. The desktop Windows path
/// uses the browser-extension backend instead.
pub struct Screentime<R: Runtime>(AppHandle<R>);

#[cfg(target_os = "macos")]
mod ffi {
    use std::os::raw::{c_char, c_int};
    extern "C" {
        pub fn redd_screentime_request_authorization() -> c_int;
        pub fn redd_screentime_check_authorization() -> c_int;
        pub fn redd_screentime_block_websites(csv: *const c_char) -> c_int;
        pub fn redd_screentime_clear_websites() -> c_int;
        pub fn redd_screentime_set_schedules(json: *const c_char) -> c_int;
        pub fn redd_screentime_clear_schedules() -> c_int;
    }
}

#[cfg(target_os = "macos")]
fn auth_status_from_i32(v: i32) -> AuthorizationResponse {
    match v {
        1 => AuthorizationResponse {
            granted: true,
            status: "approved".into(),
            error: None,
        },
        0 => AuthorizationResponse {
            granted: false,
            status: "denied".into(),
            error: None,
        },
        2 => AuthorizationResponse {
            granted: false,
            status: "notDetermined".into(),
            error: None,
        },
        -1 => AuthorizationResponse {
            granted: false,
            status: "unsupported".into(),
            error: Some("macOS 14+ required".into()),
        },
        _ => AuthorizationResponse {
            granted: false,
            status: "error".into(),
            error: Some(format!("unknown authorization status: {v}")),
        },
    }
}

impl<R: Runtime> Screentime<R> {
    pub fn request_authorization(&self) -> crate::Result<AuthorizationResponse> {
        #[cfg(target_os = "macos")]
        {
            let v = unsafe { ffi::redd_screentime_request_authorization() };
            return Ok(auth_status_from_i32(v));
        }
        #[cfg(not(target_os = "macos"))]
        Ok(AuthorizationResponse {
            granted: false,
            status: "unsupported".into(),
            error: Some("Screen Time is only available on macOS 14+ and iOS".into()),
        })
    }

    pub fn check_authorization(&self) -> crate::Result<AuthorizationResponse> {
        #[cfg(target_os = "macos")]
        {
            let v = unsafe { ffi::redd_screentime_check_authorization() };
            return Ok(auth_status_from_i32(v));
        }
        #[cfg(not(target_os = "macos"))]
        Ok(AuthorizationResponse {
            granted: false,
            status: "unsupported".into(),
            error: Some("Screen Time is only available on macOS 14+ and iOS".into()),
        })
    }

    pub fn block_websites(
        &self,
        payload: BlockWebsitesRequest,
    ) -> crate::Result<BlockWebsitesResponse> {
        #[cfg(target_os = "macos")]
        {
            let csv = payload.domains.join("\n");
            let c = std::ffi::CString::new(csv)
                .map_err(|e| crate::Error::Other(e.to_string()))?;
            let n = unsafe { ffi::redd_screentime_block_websites(c.as_ptr()) };
            return Ok(BlockWebsitesResponse {
                success: n >= 0,
                blocked_count: n.max(0) as usize,
            });
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = payload;
            Ok(BlockWebsitesResponse { success: false, blocked_count: 0 })
        }
    }

    pub fn unblock_websites(&self) -> crate::Result<SuccessResponse> {
        #[cfg(target_os = "macos")]
        {
            let n = unsafe { ffi::redd_screentime_clear_websites() };
            return Ok(SuccessResponse {
                success: n >= 0,
                error: None,
            });
        }
        #[cfg(not(target_os = "macos"))]
        Ok(SuccessResponse { success: false, error: Some("Not supported on desktop".into()) })
    }

    pub fn block_apps(&self, _payload: BlockAppsRequest) -> crate::Result<BlockAppsResponse> {
        // App blocking on macOS desktop is handled in-process by the
        // main binary via NSWorkspace + AppleScript — it doesn't use
        // Screen Time shields (which would require the opaque app
        // token flow). Return unsupported so the frontend falls
        // through to the in-process path.
        Ok(BlockAppsResponse {
            success: false,
            blocked_count: 0,
            error: Some("macOS app blocking uses the in-process watcher".into()),
        })
    }

    pub fn unblock_apps(&self) -> crate::Result<SuccessResponse> {
        Ok(SuccessResponse {
            success: false,
            error: Some("macOS app blocking uses the in-process watcher".into()),
        })
    }

    pub fn start_block(&self, payload: StartBlockRequest) -> crate::Result<StartBlockResponse> {
        // start_block on desktop routes to block_websites; the
        // frontend separately drives the app watcher.
        let r = self.block_websites(BlockWebsitesRequest {
            domains: payload.domains.clone(),
        })?;
        Ok(StartBlockResponse {
            success: r.success,
            websites_blocked: r.blocked_count,
        })
    }

    pub fn clear_block(&self) -> crate::Result<SuccessResponse> {
        self.unblock_websites()
    }

    pub fn schedule_block(
        &self,
        _payload: ScheduleBlockRequest,
    ) -> crate::Result<SuccessResponse> {
        Ok(SuccessResponse {
            success: false,
            error: Some("use set_schedules on desktop".into()),
        })
    }

    pub fn set_schedules(&self, payload: SetSchedulesRequest) -> crate::Result<SuccessResponse> {
        #[cfg(target_os = "macos")]
        {
            let json = serde_json::to_string(&payload).map_err(|e| crate::Error::Other(e.to_string()))?;
            let c = std::ffi::CString::new(json).map_err(|e| crate::Error::Other(e.to_string()))?;
            let n = unsafe { ffi::redd_screentime_set_schedules(c.as_ptr()) };
            return Ok(SuccessResponse {
                success: n >= 0,
                error: None,
            });
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = payload;
            Ok(SuccessResponse { success: false, error: Some("Not supported on desktop".into()) })
        }
    }

    pub fn unschedule_block(
        &self,
        _payload: UnscheduleBlockRequest,
    ) -> crate::Result<SuccessResponse> {
        #[cfg(target_os = "macos")]
        {
            let n = unsafe { ffi::redd_screentime_clear_schedules() };
            return Ok(SuccessResponse {
                success: n >= 0,
                error: None,
            });
        }
        #[cfg(not(target_os = "macos"))]
        Ok(SuccessResponse { success: false, error: Some("Not supported on desktop".into()) })
    }

    pub fn register_one_off_activity(
        &self,
        _payload: RegisterOneOffActivityRequest,
    ) -> crate::Result<SuccessResponse> {
        Ok(SuccessResponse {
            success: false,
            error: Some("One-off DeviceActivity not yet implemented on desktop".into()),
        })
    }

    pub fn set_resume_payload(
        &self,
        _payload: SetResumePayloadRequest,
    ) -> crate::Result<SuccessResponse> {
        Ok(SuccessResponse {
            success: false,
            error: Some("Resume payload not yet implemented on desktop".into()),
        })
    }

    pub fn set_block_end_state(
        &self,
        _payload: SetBlockEndStateRequest,
    ) -> crate::Result<SuccessResponse> {
        Ok(SuccessResponse {
            success: false,
            error: Some("Block end state not yet implemented on desktop".into()),
        })
    }

    pub fn show_activity_picker(
        &self,
        _payload: ActivityPickerRequest,
    ) -> crate::Result<ActivityPickerResponse> {
        Ok(ActivityPickerResponse {
            cancelled: true,
            application_tokens: vec![],
            category_tokens: vec![],
            application_count: 0,
            category_count: 0,
            error: Some("Activity picker not yet implemented on desktop".into()),
        })
    }
}
