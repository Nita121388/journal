@echo off
rem Deploy the PROD host (8765 + E:\primary\data\journal + native host
rem "com.journal.host"). Must be run from the main branch (the script refuses
rem otherwise, because host/server.js DEFAULT_PORT would not be 8765).
rem
rem To only regenerate the manifest / shrink allowed_origins on the live
rem deployment (no source copy, no restart), run:
rem     deploy-prod-host.bat -ManifestOnly
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-host.ps1" ^
  -Variant prod ^
  -TargetDir "D:\Apps\ChromeExtensions\journal\host" ^
  -DataDir "E:\primary\data\journal" ^
  -Port 8765 ^
  -HostName "com.journal.host" ^
  -ExtensionIds "lpgikgjoebiolgkanfmaoffhbiphiali" %*
exit /b %errorlevel%
