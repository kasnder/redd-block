@echo off
REM Debug: log environment to temp file
echo === SIGN DEBUG === > "%TEMP%\sign-debug.txt"
echo DOTNET_ROOT=%DOTNET_ROOT% >> "%TEMP%\sign-debug.txt"
echo AZURE_CLIENT_ID=%AZURE_CLIENT_ID% >> "%TEMP%\sign-debug.txt"
echo AZURE_TENANT_ID=%AZURE_TENANT_ID% >> "%TEMP%\sign-debug.txt"
echo AZURE_CLIENT_SECRET_LEN=check >> "%TEMP%\sign-debug.txt"
echo FILE=%1 >> "%TEMP%\sign-debug.txt"
echo CWD=%CD% >> "%TEMP%\sign-debug.txt"

REM Skip signing for local/unsigned builds when Azure creds are missing.
REM CI sets these three; absence means a developer build that should bundle unsigned.
if "%AZURE_CLIENT_ID%"=="" goto :skip
if "%AZURE_TENANT_ID%"=="" goto :skip
if "%AZURE_CLIENT_SECRET%"=="" goto :skip
goto :sign

:skip
echo SKIP=missing Azure signing env vars >> "%TEMP%\sign-debug.txt"
exit /b 0

:sign
REM Set DOTNET_ROOT for x64 .NET on ARM64 Windows
if exist "C:\Program Files\dotnet\x64" (
    set "DOTNET_ROOT=C:\Program Files\dotnet\x64"
)

echo DOTNET_ROOT_AFTER=%DOTNET_ROOT% >> "%TEMP%\sign-debug.txt"

trusted-signing-cli -e https://neu.codesigning.azure.net -a redd-block-signing -c redd-block-signing -d "ReDD Block" %1 >> "%TEMP%\sign-debug.txt" 2>&1
set EXITCODE=%errorlevel%
echo EXIT_CODE=%EXITCODE% >> "%TEMP%\sign-debug.txt"
exit /b %EXITCODE%
