@echo off
REM Manual signing wrapper (Tauri uses src-tauri\windows\sign-bundle.cmd).
call "%~dp0..\src-tauri\windows\sign-bundle.cmd" "%~1"
exit /b %ERRORLEVEL%
