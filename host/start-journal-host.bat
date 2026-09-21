@echo off
rem Auto-start Journal host (127.0.0.1:8765) silently on login.
rem Skip if already running; hide console via wscript.
setlocal
set HOST_URL=http://127.0.0.1:8765/api/health
set HOST_DIR=E:\projects\journal\host
where curl >nul 2>&1
if %errorlevel%==0 (
  curl -s --max-time 1 "%HOST_URL%" >nul 2>&1
  if not errorlevel 1 exit /b 0
) else (
  netstat -ano | findstr /C:":8765 " | findstr /C:"LISTEN" >nul 2>&1
  if not errorlevel 1 exit /b 0
)
cd /d "%HOST_DIR%"
start "" /B wscript.exe "%HOST_DIR%\start-hidden.vbs"
endlocal
exit /b 0
