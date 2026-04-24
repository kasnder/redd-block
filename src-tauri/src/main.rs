// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // When invoked by a browser as a native-messaging host, branch
    // into the stdio loop before Tauri tries to start a UI. The flag
    // is passed to the binary by the browser when it spawns us via the
    // native-messaging manifest.
    #[cfg(not(target_os = "ios"))]
    if redd_block_lib::native_host::is_native_host_invocation() {
        redd_block_lib::native_host::run();
    }

    redd_block_lib::run();
}
