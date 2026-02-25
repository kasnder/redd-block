!macro NSIS_HOOK_PREUNINSTALL
  ; Best-effort pre-kill of main app process so the built-in
  ; running-app check usually doesn't need to show a second popup.
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

  MessageBox MB_OK|MB_ICONINFORMATION "If $\"Keep Blocking after uninstall$\" is enabled:$\n$\nTo override blocks, reinstall ReDD Block and use $\"Override all$\" in Settings.$\n$\nUrgent help: contact team@reddfocus.org or create an issue at github.com/ulyngs/redd-block/issues"
!macroend
