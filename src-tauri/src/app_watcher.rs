// In-process app watcher. Replaces the helper-daemon's privileged
// watcher — app blocking on desktop no longer needs elevation, so we
// run the watch-and-hide loop directly inside the Tauri backend.
//
// Behaviour carried over from helper-daemon/src/main.rs:
//   - macOS: subscribe to NSWorkspace launch/activate via a small
//     AppleScript process, match blocked app names, run
//     `System Events` visibility-hide. Requires Accessibility TCC
//     (user prompt on first use) but not root.
//   - Windows: install a WinEvent hook for EVENT_SYSTEM_FOREGROUND,
//     resolve the HWND to a process image name, and minimize
//     matching windows via ShowWindow(SW_MINIMIZE). No admin needed
//     for user-level processes.
//
// Safety net: `is_protected_app` prevents the watcher from ever
// hiding ReDD Block itself.

use std::collections::HashSet;
use std::sync::{Arc, Mutex, RwLock};

pub type BlockedApps = Arc<RwLock<HashSet<String>>>;

const PROTECTED: &[&str] = &[
    "ReDD Block", "redd-block", "ReddBlock",
    "System Events", "Finder", "loginwindow", "WindowServer",
    "explorer.exe", "dwm.exe", "winlogon.exe", "svchost.exe",
];

fn is_protected(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    PROTECTED.iter().any(|p| n == p.to_ascii_lowercase())
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_' || *c == '.')
        .collect()
}

/// Public handle returned from `start`. Use `set_apps` to update the
/// effective blocked set; drop-or-call-`stop` to tear down the watcher.
pub struct Handle {
    apps: BlockedApps,
    stop: Arc<Mutex<Option<StopSignal>>>,
}

#[cfg(target_os = "macos")]
type StopSignal = Arc<std::sync::atomic::AtomicBool>;
#[cfg(target_os = "windows")]
type StopSignal = u32; // thread id; PostThreadMessage(WM_QUIT)
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
type StopSignal = ();

impl Handle {
    pub fn set_apps(&self, names: Vec<String>) {
        if let Ok(mut w) = self.apps.write() {
            w.clear();
            for n in names {
                if is_protected(&n) {
                    continue;
                }
                w.insert(n.to_ascii_lowercase());
            }
        }
        // On next tick the watcher reads the set; also hide any
        // already-visible instances.
        hide_all(&self.apps);
    }

    pub fn stop(&self) {
        let mut slot = self.stop.lock().expect("stop lock");
        #[cfg(target_os = "macos")]
        if let Some(flag) = slot.take() {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        #[cfg(target_os = "windows")]
        if let Some(tid) = slot.take() {
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::{PostThreadMessageW, WM_QUIT};
                let _ = PostThreadMessageW(tid, WM_QUIT, Default::default(), Default::default());
            }
        }
        #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
        { let _ = slot; }
    }
}

/// Start the watcher. Idempotent — only one watcher runs per Handle.
pub fn start() -> Handle {
    let apps: BlockedApps = Arc::new(RwLock::new(HashSet::new()));
    let stop = Arc::new(Mutex::new(None));
    let stop_for_thread = stop.clone();
    let apps_for_thread = apps.clone();
    std::thread::spawn(move || run(apps_for_thread, stop_for_thread));
    Handle { apps, stop }
}

#[cfg(target_os = "macos")]
fn run(apps: BlockedApps, stop: Arc<Mutex<Option<StopSignal>>>) {
    use std::process::{Command, Stdio};
    use std::io::{BufRead, BufReader};

    let stop_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    {
        let mut slot = stop.lock().expect("stop slot");
        *slot = Some(stop_flag.clone());
    }

    // Drive the watcher with an AppleScript subscribed to workspace
    // launch/activate notifications. We read its stderr stream for
    // app-name lines and match against the blocked set.
    let script = r#"
use framework "Foundation"
use framework "AppKit"
use scripting additions
on run
    set nc to current application's NSWorkspace's sharedWorkspace's notificationCenter()
    nc's addObserverForName:"NSWorkspaceDidLaunchApplicationNotification" object:(missing value) queue:(missing value) usingBlock:(notifBlock)
    nc's addObserverForName:"NSWorkspaceDidActivateApplicationNotification" object:(missing value) queue:(missing value) usingBlock:(notifBlock)
    repeat
        delay 1
    end repeat
end run

on notifBlock(n)
    try
        set nInfo to n's userInfo()
        set appRunningApp to nInfo's objectForKey:"NSWorkspaceApplicationKey"
        if appRunningApp is not missing value then
            set appName to appRunningApp's localizedName() as text
            do shell script "echo " & quoted form of ("FOCUS:" & appName) & " 1>&2"
        end if
    end try
end notifBlock
"#;

    loop {
        if stop_flag.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        let mut child = match Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(script)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(_) => {
                std::thread::sleep(std::time::Duration::from_secs(2));
                continue;
            }
        };

        let stderr = child.stderr.take();
        if let Some(err) = stderr {
            let reader = BufReader::new(err);
            for line in reader.lines().map_while(Result::ok) {
                if stop_flag.load(std::sync::atomic::Ordering::SeqCst) {
                    let _ = child.kill();
                    return;
                }
                if let Some(name) = line.strip_prefix("FOCUS:") {
                    let name = name.trim();
                    let blocked = apps
                        .read()
                        .ok()
                        .map(|s| s.contains(&name.to_ascii_lowercase()))
                        .unwrap_or(false);
                    if blocked {
                        hide_one_mac(name);
                    }
                }
            }
        }
        let _ = child.wait();
    }
}

#[cfg(target_os = "macos")]
fn hide_one_mac(app_name: &str) {
    if is_protected(app_name) {
        return;
    }
    let safe = sanitize_name(app_name);
    if safe.is_empty() {
        return;
    }
    let script = format!(
        r#"tell application "System Events" to set visible of application process "{safe}" to false"#,
    );
    for _ in 0..3 {
        let ok = std::process::Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(&script)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if ok {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

#[cfg(target_os = "windows")]
fn run(apps: BlockedApps, stop: Arc<Mutex<Option<StopSignal>>>) {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent};
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, TranslateMessage, EVENT_SYSTEM_FOREGROUND, MSG,
        WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
    };

    // Snapshot the blocked-apps set into a thread-local via a leaked
    // Arc pointer passed to the WinEvent hook proc.
    static mut CURRENT: Option<BlockedApps> = None;
    unsafe {
        CURRENT = Some(apps.clone());
    }

    unsafe extern "system" fn hook_proc(
        _h: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
        _event: u32,
        hwnd: HWND,
        _idobj: i32,
        _idchild: i32,
        _tid: u32,
        _time: u32,
    ) {
        let apps = match &CURRENT {
            Some(a) => a,
            None => return,
        };
        let apps = match apps.read() {
            Ok(g) => g.clone(),
            Err(_) => return,
        };
        if apps.is_empty() {
            return;
        }
        if let Some(name) = process_name_for_hwnd(hwnd) {
            let lower = name.to_ascii_lowercase();
            let matched = apps.iter().any(|a| {
                a == &lower
                    || lower.strip_suffix(".exe").map(|s| s == a.as_str()).unwrap_or(false)
            });
            if matched && !is_protected(&name) {
                minimize_hwnd(hwnd);
            }
        }
    }

    unsafe {
        let hook = SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            Some(hook_proc),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );
        if hook.is_invalid() {
            return;
        }

        // Register our thread id so `stop()` can post WM_QUIT.
        let tid = windows::Win32::System::Threading::GetCurrentThreadId();
        {
            let mut slot = stop.lock().expect("stop slot");
            *slot = Some(tid);
        }

        // Standard message loop. GetMessageW returns 0 when WM_QUIT
        // is received.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        let _ = UnhookWinEvent(hook);
        CURRENT = None;
    }
}

#[cfg(target_os = "windows")]
fn process_name_for_hwnd(hwnd: windows::Win32::Foundation::HWND) -> Option<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::QueryFullProcessImageNameW;
    use windows::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId;
    unsafe {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 512];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            Default::default(),
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        if !ok {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        path.rsplit('\\').next().map(|s| s.to_string())
    }
}

#[cfg(target_os = "windows")]
fn minimize_hwnd(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_FORCEMINIMIZE};
    unsafe {
        let _ = ShowWindow(hwnd, SW_FORCEMINIMIZE);
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn run(_apps: BlockedApps, _stop: Arc<Mutex<Option<StopSignal>>>) {
    // Linux has no implementation; blocking apps would need either
    // X11 / Wayland specific hooks or a Screen Time equivalent.
}

/// Best-effort pass: iterate the currently-blocked set and hide any
/// running instance. Called after `set_apps` so newly-blocked apps
/// that are already running get hidden immediately rather than on
/// their next focus event.
fn hide_all(apps: &BlockedApps) {
    let names: Vec<String> = apps.read().map(|s| s.iter().cloned().collect()).unwrap_or_default();
    #[cfg(target_os = "macos")]
    for name in &names {
        hide_one_mac(name);
    }
    #[cfg(target_os = "windows")]
    {
        let _ = names;
        // The next foreground event will catch already-running apps.
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let _ = names;
    }
}
