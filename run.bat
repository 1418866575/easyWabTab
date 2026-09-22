@echo off
title EasyWebTab Local Server
cd /d %~dp0
setlocal EnableDelayedExpansion

set "PORT=16718"
set "ROOT=%CD%"

echo ========================================
echo   EasyWebTab Local Server
echo   Access: http://localhost:%PORT%
echo ========================================
echo.
echo Working directory: %ROOT%
echo.

:: ============================================================
:: [0/4] Locate Node.js
::   PATH 优先，其次依次回退到常见安装位置（含 WorkBuddy 托管运行时）
:: ============================================================
echo [0/4] Locating Node.js...
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
    echo   Please install Node.js 22+ or fix the path in this script.
    echo.
    pause
    exit /b 1
)
node --version
echo   Path: %NODE_EXE%

:: ============================================================
:: [1/4] Dependencies
:: ============================================================
echo.
echo [1/4] Checking dependencies...
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
:: [2/4] Build - 校验 dist\index.html（而不是只看 dist 目录在不在）
::   目录存在但产物残缺会导致服务一访问就崩，这里必须强制重新构建
:: ============================================================
echo.
echo [2/4] Checking build...
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
:: [3/4] Port availability
:: ============================================================
echo.
echo [3/4] Checking port %PORT%...
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [ERROR] Port %PORT% is already in use:
    netstat -ano | findstr ":%PORT% " | findstr "LISTENING"
    echo.
    echo   Stop it first:  stop-server.bat
    echo   Or switch port: set PORT=16719 ^&^& npm run serve
    echo.
    pause
    exit /b 1
)
echo Port %PORT% is free

:: ============================================================
:: [4/4] Start server (foreground - closing this window stops it)
::   想要后台常驻（关掉窗口也继续跑），请用 start-server.bat
:: ============================================================
echo.
echo [4/4] Starting server...
echo ========================================
echo   Server running!
echo   Open: http://localhost:%PORT%
echo   Press Ctrl+C to stop
echo ========================================
echo.

npm run serve

echo.
echo Server stopped.
pause
