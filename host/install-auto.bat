@echo off
rem install-auto.bat — 注册 Windows 计划任务：每天 22:00 自动运行 auto-summary.mjs
rem 用法：install-auto.bat  （可加参数：-day HH:MM 修改时间，默认 22:00）
setlocal EnableExtensions

set "TASKNAME=JournalAutoSummary"
set "HOST_DIR=%~dp0"
if "%HOST_DIR:~-1%"=="\" set "HOST_DIR=%HOST_DIR:~0,-1%"
set "NODE_EXE=%~1"
if "%NODE_EXE%"=="" set "NODE_EXE=D:\SoftWare\NodeJS\node.exe"
set "SCRIPT=%HOST_DIR%\auto-summary.mjs"
set "TIME=22:00"

if "%~2"=="-day" if "%~3" neq "" set "TIME=%~3"

if not exist "%NODE_EXE%" (
  echo [journal] node 未找到: "%NODE_EXE%"
  echo [journal] 用法: install-auto.bat [node路径] [-day HH:MM]
  exit /b 1
)
if not exist "%SCRIPT%" (
  echo [journal] 脚本未找到: "%SCRIPT%"
  exit /b 1
)

schtasks /Create /TN "%TASKNAME%" /TR "\"%NODE_EXE%\" \"%SCRIPT%\"" /SC DAILY /ST "%TIME%" /F
if errorlevel 1 (
  echo [journal] 计划任务创建失败
  exit /b 1
)

echo [journal] 计划任务已注册：%TASKNAME% 每天 %TIME% 运行
echo [journal]   node: %NODE_EXE%
echo [journal]   script: %SCRIPT%
schtasks /Query /TN "%TASKNAME%" /FO LIST | findstr /C:"TaskName" /C:"Next Run" /C:"Schedule"
exit /b 0
