@echo off
title EasyWebTab - Stop Server
cd /d %~dp0
setlocal EnableDelayedExpansion

set "PORT=16718"
set "ROOT=%CD%"
set "PIDFILE=%ROOT%\.server.pid"

echo ========================================
echo   EasyWebTab - Stop Server
echo ========================================
echo.

set "KILLED=0"

:: 1) ������ start-server.bat ��¼�� PID
if exist "%PIDFILE%" (
    set /p SRV_PID=<"%PIDFILE%"
    if defined SRV_PID (
        echo Stopping PID from pidfile: !SRV_PID!
        taskkill /PID !SRV_PID! /F >nul 2>&1
        if !errorlevel! equ 0 set "KILLED=1"
    )
)

:: 2) ���ף����˿ڷ���ռ�ý��̣�IPv4 / IPv6 �������У�
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo Stopping PID on port %PORT%: %%p
    taskkill /PID %%p /F >nul 2>&1
    if !errorlevel! equ 0 set "KILLED=1"
)

:: 2b) Also stop WeChat MP proxy on port 16721 (launched by start-server.bat)
set "WECHAT_PORT=16721"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%WECHAT_PORT% " ^| findstr "LISTENING"') do (
    echo Stopping PID on port %WECHAT_PORT%: %%p
    taskkill /PID %%p /F >nul 2>&1
    if !errorlevel! equ 0 set "KILLED=1"
)

if exist "%PIDFILE%" del "%PIDFILE%" >nul 2>&1

if "!KILLED!"=="1" (
    echo.
    echo [OK] Server stopped.
) else (
    echo.
    echo [INFO] No running server found on port %PORT%.
)

echo.
ping -n 6 127.0.0.1 >nul
exit /b 0
