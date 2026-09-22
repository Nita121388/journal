@echo off
setlocal EnableExtensions

set "HOST_DIR=%~dp0"
if "%HOST_DIR:~-1%"=="\" set "HOST_DIR=%HOST_DIR:~0,-1%"

set "EXT_ID=%~1"
if "%EXT_ID%"=="" set "EXT_ID=YOUR_EXTENSION_ID"

set "MANIFEST=%HOST_DIR%\com.journal.host.json"
set "LAUNCHER=%HOST_DIR%\journal-host-launcher.exe"

if not exist "%LAUNCHER%" (
  echo [journal] launcher not found: "%LAUNCHER%"
  exit /b 1
)

powershell -NoProfile -Command ^
  "$path = '%LAUNCHER%'.Replace('\\','\\\\');" ^
  "$origin = 'chrome-extension://%EXT_ID%/';" ^
  "$json = @{name='com.journal.host'; description='Journal host launcher'; path=$path; type='stdio'; allowed_origins=@($origin)} | ConvertTo-Json;" ^
  "Set-Content -LiteralPath '%MANIFEST%' -Value $json -Encoding ascii"

if errorlevel 1 (
  echo [journal] failed to write native host manifest
  exit /b 1
)

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.journal.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 goto :regfail

reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.journal.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 goto :regfail

echo [journal] native host registered.
echo [journal] allowed origin: chrome-extension://%EXT_ID%/
echo [journal] If this is YOUR_EXTENSION_ID, rerun: install-host.bat ^<extension-id^>
exit /b 0

:regfail
echo [journal] registry write failed
exit /b 1
