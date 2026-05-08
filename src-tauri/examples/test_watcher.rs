// Standalone exerciser for the in-process app watcher.
// Run with: cargo run --example test_watcher -- Calculator
//
// Spawns the watcher and feeds it the names from argv. The watcher
// follows the desktop state machine: one graceful quit
// (`NSRunningApplication.terminate` / `taskkill` without `/F`), a short
// grace period (`QUIT_TO_WARNING_GRACE`), then (with a real `AppHandle`)
// an in-app warning countdown. This binary passes `None`, so warning
// events have no frontend listener — useful only for smoke-testing
// process-name matching and polite quit behaviour on your machine.
//
// To exercise the warning UI, run the full app with an app block.

fn main() {
    let names: Vec<String> = std::env::args().skip(1).collect();
    if names.is_empty() {
        eprintln!("usage: cargo run --example test_watcher -- AppName [AppName ...]");
        std::process::exit(2);
    }

    let h = redd_block_lib::app_watcher::start(None);
    h.set_apps(names);
    std::thread::sleep(std::time::Duration::from_secs(3));
    h.stop();
}
