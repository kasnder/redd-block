!macro NSIS_HOOK_PREUNINSTALL
  ; 1. Remove the watchdog Scheduled Task FIRST so it doesn't respawn
  ;    redd-block.exe between the kill below and the actual file
  ;    deletion that NSIS does after this hook returns. Idempotent —
  ;    schtasks /Delete /F is silent if the task isn't present.
  nsExec::ExecToLog 'schtasks /Delete /TN "ReDD Block Watchdog" /F'
  Pop $0

  ; 2. Best-effort pre-kill of the main app process so the built-in
  ;    running-app check usually doesn't need to show a second popup.
  !if "${INSTALLMODE}" == "currentUser"
    nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
  !else
    nsis_tauri_utils::FindProcess "${MAINBINARYNAME}.exe"
  !endif
  Pop $R0
  ${If} $R0 = 0
    !if "${INSTALLMODE}" == "currentUser"
      nsis_tauri_utils::KillProcessCurrentUser "${MAINBINARYNAME}.exe"
    !else
      nsis_tauri_utils::KillProcess "${MAINBINARYNAME}.exe"
    !endif
    Pop $R0
    Sleep 500
  ${EndIf}

  ; 3. Run the app's `--uninstall` mode to remove per-browser
  ;    native-messaging manifests and the matching HKCU registry keys.
  ;    Without this, manifests under %LOCALAPPDATA%\ReDD Block\
  ;    native-host\ and HKCU\Software\<vendor>\<browser>\
  ;    NativeMessagingHosts\com.ulriklyngs.mindshield would be orphaned
  ;    after uninstall. The binary still exists at this point — NSIS
  ;    deletes it after the pre-uninstall hook returns. The --uninstall
  ;    branch in main.rs runs synchronously and exits; ExecWait blocks
  ;    until it does.
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall'

  MessageBox MB_OK|MB_ICONINFORMATION "If $\"Keep Blocking after uninstall$\" is enabled:$\n$\nTo override blocks, reinstall ReDD Block and use $\"Override all$\" in Settings.$\n$\nUrgent help: contact team@reddfocus.org or create an issue at github.com/ulyngs/redd-block/issues"
!macroend
