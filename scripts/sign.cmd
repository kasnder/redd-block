@echo off
REM Manual signing from repo scripts/ (Tauri uses src-tauri\sign.cmd).
call "%~dp0..\src-tauri\sign.cmd" "%~1"
exit /b %ERRORLEVEL%
