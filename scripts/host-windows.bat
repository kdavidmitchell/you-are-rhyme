@echo off
setlocal
cd /d "%~dp0\.."
echo =================================================================
echo   YOU ARE RHYME -- WINDOWS MULTIPLAYER HOST LAUNCHER
echo =================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0host-windows.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [Host] Host launcher terminated with code %ERRORLEVEL%.
    pause
)
