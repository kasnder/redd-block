# tauri-plugin-androidblock

Android blocking engine for ReDD Block, ported from
[redd-block-android](https://github.com/kasnder/redd-block-android).

All enforcement lives in Kotlin (`android/`): an Accessibility Service
detects blocked apps (redirects to home screen) and blocked websites in
browser URL bars (redirects to reddfocus.org). Schedules persist in
device-protected SharedPreferences and are driven by WorkManager, so
blocking keeps working when the webview/app process is dead and across
reboots (BootReceiver).

The webview UI only does CRUD on schedules through this plugin's
commands; it is never needed for enforcement.
