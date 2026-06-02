@echo off
setlocal EnableExtensions

echo === SIGN DEBUG (sign-bundle.cmd) === > "%TEMP%\sign-debug.txt"
echo CWD=%CD%>> "%TEMP%\sign-debug.txt"
echo FILE=%~1>> "%TEMP%\sign-debug.txt"
echo AZURE_CLIENT_ID=%AZURE_CLIENT_ID%>> "%TEMP%\sign-debug.txt"
echo AZURE_TENANT_ID=%AZURE_TENANT_ID%>> "%TEMP%\sign-debug.txt"

if "%REDD_SKIP_CODE_SIGN%"=="1" (
    echo SKIP=REDD_SKIP_CODE_SIGN=1>> "%TEMP%\sign-debug.txt"
    exit /b 0
)

if "%AZURE_CLIENT_ID%"=="" goto :skip
if "%AZURE_TENANT_ID%"=="" goto :skip
if "%AZURE_CLIENT_SECRET%"=="" goto :skip
goto :sign

:skip
echo SKIP=missing Azure signing env vars>> "%TEMP%\sign-debug.txt"
exit /b 0

:sign
if exist "C:\Program Files\dotnet\x64" (
    set "DOTNET_ROOT=C:\Program Files\dotnet\x64"
)
echo DOTNET_ROOT=%DOTNET_ROOT%>> "%TEMP%\sign-debug.txt"

set "TSCLI=%USERPROFILE%\.cargo\bin\trusted-signing-cli.exe"
if exist "%TSCLI%" goto :run
where trusted-signing-cli.exe >nul 2>&1
if errorlevel 1 goto :no_cli
set "TSCLI=trusted-signing-cli.exe"
goto :run

:no_cli
echo ERROR=trusted-signing-cli not found>> "%TEMP%\sign-debug.txt"
echo ERROR: trusted-signing-cli not found. Install: cargo install trusted-signing-cli --locked>&2
echo Or remove AZURE_* from .env / set REDD_SKIP_CODE_SIGN=1>&2
exit /b 1

:run
echo TSCLI=%TSCLI%>> "%TEMP%\sign-debug.txt"
"%TSCLI%" -e https://neu.codesigning.azure.net -a redd-block-signing -c redd-block-signing -d "ReDD Block" "%~1" >> "%TEMP%\sign-debug.txt" 2>&1
set EXITCODE=%errorlevel%
echo EXIT_CODE=%EXITCODE%>> "%TEMP%\sign-debug.txt"
if %EXITCODE% NEQ 0 (
    echo Azure signing failed. See %TEMP%\sign-debug.txt>&2
)
exit /b %EXITCODE%
