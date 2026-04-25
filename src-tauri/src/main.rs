// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Debug builds load `.env` from the workspace root so dev-only
    // settings (REDD_DEV_EXT_ID, etc.) are picked up by `npm run dev`,
    // direct `cargo run`, and the browser-spawned native-host process
    // alike. Production builds skip this entirely — release users
    // should never have a `.env` adjacent to the bundle anyway.
    #[cfg(debug_assertions)]
    {
        let _ = dotenvy::from_filename("../.env");
        let _ = dotenvy::dotenv();
    }

    // When invoked by a browser as a native-messaging host, branch
    // into the stdio loop before Tauri tries to start a UI. The flag
    // is passed to the binary by the browser when it spawns us via the
    // native-messaging manifest.
    #[cfg(not(target_os = "ios"))]
    if redd_block_lib::native_host::is_native_host_invocation() {
        redd_block_lib::native_host::run();
    }

    // `--uninstall` tears down per-browser native-messaging manifests
    // and any leftover legacy-helper artefacts, then exits. Useful for
    // an `Uninstall.app` shim or a manual `redd-block --uninstall`.
    #[cfg(not(target_os = "ios"))]
    if std::env::args().skip(1).any(|a| a == "--uninstall") {
        let _ = redd_block_lib::native_host_install::uninstall();
        let _ = redd_block_lib::commands::migration::strip_hosts_markers_sync();
        let _ = redd_block_lib::commands::migration::uninstall_legacy_helper_sync();
        std::process::exit(0);
    }

    redd_block_lib::run();
}
