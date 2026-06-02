@echo off
REM Wrapper so manual invocations still work; Tauri uses sign.ps1 via tauri.windows.conf.json.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sign.ps1" "%~1"
exit /b %ERRORLEVEL%
