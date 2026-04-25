// Standalone exerciser for the in-process app watcher.
// Run with: cargo run --example test_watcher -- Calculator
//
// Spawns the watcher and feeds it the names from argv. The watcher
// kills any matching processes immediately and on every poll tick.
// Useful for confirming a name matches before wiring it up via the
// Tauri command path.

fn main() {
    let names: Vec<String> = std::env::args().skip(1).collect();
    if names.is_empty() {
        eprintln!("usage: cargo run --example test_watcher -- AppName [AppName ...]");
        std::process::exit(2);
    }

    let h = redd_block_lib::app_watcher::start();
    h.set_apps(names);
    std::thread::sleep(std::time::Duration::from_secs(3));
    h.stop();
}
