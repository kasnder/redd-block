!macro NSIS_HOOK_PREINSTALL
  ; Best-effort cleanup of a legacy direct-install app so the direct
  ; Fristed installer leaves only one desktop app installed. This is
  ; intentionally scoped to direct NSIS/MSI installs; MSIX does not run
  ; these hooks. We do NOT touch shared ProgramData storage here.
  ;
  ; Tauri's bundle already runs elevated for per-machine installs, so
  ; deleting the old app directory is safe to attempt here. For current-
  ; user installs we still try the standard local app roots.
  nsExec::ExecToLog 'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = ''SilentlyContinue''; $paths = @(); if ($env:ProgramFiles) { $paths += (Join-Path $env:ProgramFiles ''ReDD Block'') }; if ($env:ProgramW6432) { $paths += (Join-Path $env:ProgramW6432 ''ReDD Block'') }; if ($env:LOCALAPPDATA) { $paths += (Join-Path $env:LOCALAPPDATA ''Programs\ReDD Block'') }; foreach ($path in ($paths | Select-Object -Unique)) { if (-not (Test-Path -LiteralPath $path)) { continue }; Get-Process | Where-Object { $_.Path -and $_.Path -like ($path + ''\*'') } | Stop-Process -Force; Remove-Item -LiteralPath $path -Recurse -Force }"'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Always launch Fristed after install completes. The MUI finish
  ; page also has a "Run Fristed" checkbox (default checked); if
  ; the user leaves it checked we'd briefly run the app twice — the
  ; tauri-plugin-single-instance plugin (registered in lib.rs)
  ; collapses any second instance into a focus-the-existing-window
  ; call, so this is safe.
  ;
  ; Why always-launch: on a v1.x → 2.0 upgrade the migration
  ; onboarding (full-screen overlay) only fires when the app is
  ; running. Skipping the launch leaves the user staring at a
  ; finished installer with no visible result, while v1.x's daemon
  ; stays alive and unsupervised in the background.
  Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 1. Remove the watchdog Scheduled Task FIRST so it doesn't respawn
  ;    redd-block.exe between the kill below and the actual file
  ;    deletion that NSIS does after this hook returns. Idempotent —
  ;    schtasks /Delete /F is silent if the task isn't present.
  nsExec::ExecToLog 'schtasks /Delete /TN "Fristed Watchdog" /F'
  Pop $0
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
  ;    Without this, manifests under %LOCALAPPDATA%\Fristed\
  ;    native-host\ and HKCU\Software\<vendor>\<browser>\
  ;    NativeMessagingHosts\com.ulriklyngs.mindshield would be orphaned
  ;    after uninstall. The binary still exists at this point — NSIS
  ;    deletes it after the pre-uninstall hook returns. The --uninstall
  ;    branch in main.rs runs synchronously and exits; ExecWait blocks
  ;    until it does.
  ;
  ; Note: 2.0 dropped v1.x's "Keep Blocking after uninstall" feature
  ; entirely (no daemon = no enforcement after the binary is removed).
  ; The user's blocklists / settings in C:\ProgramData\Fristed\
  ; redd-block-data.json are intentionally preserved so a future
  ; reinstall picks them back up — only the daemon-state file (now
  ; absent) and the helper-state.json are scrubbed during migration.
  ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --uninstall'
!macroend
