mod data;

#[cfg(not(target_os = "ios"))]
pub mod app_blocking;
#[cfg(not(target_os = "ios"))]
mod apps;
#[cfg(not(target_os = "ios"))]
mod browser_ext;
#[cfg(not(target_os = "ios"))]
pub mod enforcement;
#[cfg(not(target_os = "ios"))]
mod helper_shim;
#[cfg(not(target_os = "ios"))]
pub mod migration;
#[cfg(not(target_os = "ios"))]
pub mod grace;
#[cfg(not(target_os = "ios"))]
pub mod enforcement_toggle;
#[cfg(not(target_os = "ios"))]
pub mod diagnostics;
#[cfg(not(target_os = "ios"))]
pub mod safari_bridge;
#[cfg(target_os = "macos")]
pub mod fda;
#[cfg(target_os = "macos")]
pub mod uninstall;
#[cfg(target_os = "macos")]
pub mod web_automation;

pub use data::*;

#[cfg(not(target_os = "ios"))]
pub use app_blocking::*;
#[cfg(not(target_os = "ios"))]
pub use apps::*;
#[cfg(not(target_os = "ios"))]
pub use browser_ext::*;
#[cfg(not(target_os = "ios"))]
pub use enforcement::*;
#[cfg(not(target_os = "ios"))]
pub use helper_shim::*;
#[cfg(not(target_os = "ios"))]
pub use migration::*;
#[cfg(not(target_os = "ios"))]
pub use grace::*;
#[cfg(not(target_os = "ios"))]
pub use enforcement_toggle::*;
#[cfg(not(target_os = "ios"))]
pub use diagnostics::*;
#[cfg(not(target_os = "ios"))]
pub use safari_bridge::*;
#[cfg(target_os = "macos")]
pub use fda::*;
#[cfg(target_os = "macos")]
pub use uninstall::*;
#[cfg(target_os = "macos")]
pub use web_automation::*;
