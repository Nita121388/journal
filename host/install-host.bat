@echo off
setlocal EnableExtensions

set "HOST_DIR=%~dp0"
if "%HOST_DIR:~-1%"=="\" set "HOST_DIR=%HOST_DIR:~0,-1%"

set "MANIFEST=%HOST_DIR%\com.journal.host.json"
set "LAUNCHER=%HOST_DIR%\journal-host-launcher.exe"
set "IDFILE=%HOST_DIR%\extension-ids.txt"

if not exist "%LAUNCHER%" (
  echo [journal] launcher not found: "%LAUNCHER%"
  exit /b 1
)

rem Resolve extension IDs: explicit arg (comma-separated) wins,
rem else read extension-ids.txt (one per line). All go into allowed_origins.
set "EXT_IDS_ARG=%~1"

powershell -NoProfile -Command ^
  "$idFile = '%IDFILE%';" ^
  "$arg = '%EXT_IDS_ARG%'.Trim();" ^
  "if ($arg -ne '') { $ids = $arg -split ',' }" ^
  "elseif (Test-Path -LiteralPath $idFile) { $ids = Get-Content -LiteralPath $idFile }" ^
  "else { $ids = @('YOUR_EXTENSION_ID') };" ^
  "$ids = @($ids | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' });" ^
  "if ($ids.Count -eq 0) { $ids = @('YOUR_EXTENSION_ID') };" ^
  "$path = '%LAUNCHER%'.Replace('\\','\\\\');" ^
  "$origins = $ids | ForEach-Object { 'chrome-extension://' + $_ + '/' };" ^
  "$json = @{name='com.journal.host'; description='Journal host launcher'; path=$path; type='stdio'; allowed_origins=@($origins)} | ConvertTo-Json;" ^
  "Set-Content -LiteralPath '%MANIFEST%' -Value $json -Encoding ascii;" ^
  "Write-Host '[journal] allowed origins:';" ^
  "$origins | ForEach-Object { Write-Host ('  ' + $_) }"

if errorlevel 1 (
  echo [journal] failed to write native host manifest
  exit /b 1
)

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.journal.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 goto :regfail

reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.journal.host" /ve /t REG_SZ /d "%MANIFEST%" /f >nul
if errorlevel 1 goto :regfail

echo [journal] native host registered.
exit /b 0

:regfail
echo [journal] registry write failed
exit /b 1
