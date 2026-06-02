@echo off
REM Tauri signCommand entry point. %~dp0 is always src-tauri\ regardless of process CWD.
call "%~dp0windows\sign-bundle.cmd" %~1
exit /b %ERRORLEVEL%
