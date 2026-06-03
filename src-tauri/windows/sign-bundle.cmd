@echo off
REM Tauri signCommand entry point. Delegates to scripts/sign.ps1, which loads
REM .env itself — same as the pre-Store build path (run-tauri env alone is
REM not always inherited by the bundler's signing subprocess on Windows).
setlocal EnableExtensions
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\..\scripts\sign.ps1" "%~1"
exit /b %ERRORLEVEL%
