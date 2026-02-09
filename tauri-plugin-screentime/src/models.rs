use serde::{Deserialize, Serialize};

// --- Authorization ---

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthorizationRequest {}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizationResponse {
    pub granted: bool,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// --- Website Blocking ---

#[derive(Debug, Serialize, Deserialize)]
pub struct BlockWebsitesRequest {
    pub domains: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockWebsitesResponse {
    pub success: bool,
    #[serde(default)]
    pub blocked_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnblockRequest {}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub struct SuccessResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// --- App Blocking ---

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockAppsRequest {
    pub token_data: Vec<String>,  // Base64-encoded ApplicationToken data
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockAppsResponse {
    pub success: bool,
    #[serde(default)]
    pub blocked_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// --- Combined Block (matches existing frontend API) ---

#[derive(Debug, Serialize, Deserialize)]
pub struct StartBlockRequest {
    pub domains: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBlockResponse {
    pub success: bool,
    #[serde(default)]
    pub websites_blocked: usize,
}

// --- Scheduling ---

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleBlockRequest {
    pub start_hour: u32,
    pub start_minute: u32,
    pub end_hour: u32,
    pub end_minute: u32,
    pub domains: Option<Vec<String>>,
    pub app_token_data: Option<Vec<String>>,
}

// --- Activity Picker ---

#[derive(Debug, Serialize, Deserialize)]
pub struct ActivityPickerRequest {}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPickerResponse {
    pub cancelled: bool,
    #[serde(default)]
    pub application_tokens: Vec<String>,
    #[serde(default)]
    pub category_tokens: Vec<String>,
    #[serde(default)]
    pub application_count: usize,
    #[serde(default)]
    pub category_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

