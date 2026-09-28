@echo off
rem 开发版 host —— 固定 8766 端口 + 独立数据目录，绝不影响现役版本（8765）
setlocal
set "HOST_DIR=%~dp0"
if "%HOST_DIR:~-1%"=="\" set "HOST_DIR=%HOST_DIR:~0,-1%"

set JOURNAL_PORT=8766
set JOURNAL_DATA_DIR=%HOST_DIR%\data
set JOURNAL_PROJECT_DIR=%HOST_DIR%\..
cd /d "%HOST_DIR%"

echo [dev] host starting on 127.0.0.1:8766
echo [dev] data dir: %JOURNAL_DATA_DIR%
node server.js
endlocal
