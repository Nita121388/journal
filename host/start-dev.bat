@echo off
rem 开发版 host —— 固定 8766 端口 + 独立数据目录，绝不影响现役版本（8765）
rem 已在运行时直接退出（不再抛 EADDRINUSE）。
setlocal
set "HOST_DIR=%~dp0"
if "%HOST_DIR:~-1%"=="\" set "HOST_DIR=%HOST_DIR:~0,-1%"

set JOURNAL_PORT=8766
set JOURNAL_DATA_DIR=E:\primary\data\journal-dev
set JOURNAL_PROJECT_DIR=%HOST_DIR%\..

rem 已经起来就静默退出（netstat 判断，避免 curl 缺失时的误判）
netstat -ano | findstr /C:":8766 " | findstr /C:"LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [dev] host already listening on 127.0.0.1:8766 - nothing to do
  endlocal
  exit /b 0
)

cd /d "%HOST_DIR%"

echo [dev] host starting on 127.0.0.1:8766
echo [dev] data dir: %JOURNAL_DATA_DIR%
node server.js
endlocal
