@echo off
rem Deploy the DEV host (8766 + E:\primary\data\journal-dev + native host
rem "com.journal.host.dev"). Run from the dev/local branch.
rem Extra args are forwarded, e.g.:  deploy-dev-host.bat -NoRegister
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-host.ps1" ^
  -Variant dev ^
  -TargetDir "D:\Apps\ChromeExtensions\journal-dev\host" ^
  -DataDir "E:\primary\data\journal-dev" ^
  -Port 8766 ^
  -HostName "com.journal.host.dev" ^
  -ExtensionIds "plfeioojhaglgflfdhphdhlnkmohoaig" %*
exit /b %errorlevel%
