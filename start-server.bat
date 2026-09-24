@echo off
title EasyWebTab - Start Server (background)
cd /d %~dp0
setlocal EnableDelayedExpansion

set "PORT=16718"
set "ROOT=%CD%"
set "PIDFILE=%ROOT%\.server.pid"

echo ========================================
echo   EasyWebTab - Background Server
echo   Access: http://localhost:%PORT%
echo ========================================
echo.
echo Working directory: %ROOT%
echo.
echo 服务以独立进程后台运行（最小化窗口，可在任务栏点开看日志），
echo 关闭本窗口不会停止服务。停止服务请运行 stop-server.bat
echo.

:: ============================================================
:: [1/5] Locate Node.js
:: ============================================================
echo [1/5] Locating Node.js...
set "NODE_EXE="
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('where node') do (
        if not defined NODE_EXE set "NODE_EXE=%%i"
    )
)
if not defined NODE_EXE if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "E:\installSoftware\nodejs\node.exe" set "NODE_EXE=E:\installSoftware\nodejs\node.exe"

if defined NODE_EXE (
    for %%i in ("%NODE_EXE%") do set "NODE_DIR=%%~dpi"
)
if defined NODE_DIR set "PATH=%NODE_DIR%;%PATH%"

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo   Searched: PATH / WorkBuddy runtime / Program Files / E:\installSoftware\nodejs
    echo.
    pause
    exit /b 1
)
node --version

:: ============================================================
:: [2/5] Dependencies
:: ============================================================
echo.
echo [2/5] Checking dependencies...
if not exist "node_modules" (
    echo Installing...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
    echo Done
) else (
    echo Already installed
)

:: ============================================================
:: [3/5] Build - 必须校验 dist\index.html，产物残缺会导致服务一访问就崩
:: ============================================================
echo.
echo [3/5] Checking build...
if not exist "dist\index.html" (
    echo dist\index.html missing. Building...
    call npm run build
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Build failed - server will NOT be started.
        pause
        exit /b 1
    )
    if not exist "dist\index.html" (
        echo.
        echo [ERROR] Build finished but dist\index.html still missing - aborting.
        pause
        exit /b 1
    )
    echo Build done
) else (
    echo Already built - dist\index.html exists
)

:: ============================================================
:: [4/5] Port - 已在监听说明服务本来就跑着
:: ============================================================
echo.
echo [4/5] Checking port %PORT%...
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [INFO] Server is already running on port %PORT%. Opening browser...
    start "" http://localhost:%PORT%/
ping -n 7 127.0.0.1 >nul
    exit /b 0
)
echo Port %PORT% is free

:: ============================================================
:: [5/5] Launch detached - 用 start /min 起独立进程（纯 bat，无 PowerShell）
::   说明：本脚本刻意不使用 PowerShell 隐藏启动，避免被安全软件误判隔离
:: ============================================================
echo.
echo [5/5] Starting server in background...
if exist "%PIDFILE%" del "%PIDFILE%" >nul 2>&1

start "EasyWebTab Server" /min "%NODE_EXE%" scripts\serve-with-rewrites.cjs

:: 轮询端口，最多等 30 秒（端口 LISTENING 即视为启动成功）
echo Waiting for server (max 30s)...
set "UP=0"
for /l %%i in (1,1,30) do (
    if "!UP!"=="0" (
        netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
        if !errorlevel! equ 0 (
            set "UP=1"
        ) else (
            ping -n 2 127.0.0.1 >nul
        )
    )
)

if "!UP!"=="0" (
    echo.
    echo [ERROR] Server did not start within 30s.
    echo   Please check the minimized "EasyWebTab Server" window for errors.
    echo   Common causes: port occupied / build missing / Node version too low
    pause
    exit /b 1
)

set "SRV_PID=unknown"
if exist "%PIDFILE%" (
    set /p SRV_PID=<"%PIDFILE%"
)

echo.
echo ========================================
echo   [OK] Server is running
echo   URL:  http://localhost:%PORT%/
echo   PID:  !SRV_PID!
echo   Stop: stop-server.bat
echo ========================================
echo.
echo Opening browser...
start "" http://localhost:%PORT%/
ping -n 9 127.0.0.1 >nul
exit /b 0
