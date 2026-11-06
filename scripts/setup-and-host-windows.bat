@echo off
setlocal
cd /d "%~dp0\.."
echo =================================================================
echo   YOU ARE RHYME -- TURNKEY WINDOWS SETUP & MULTIPLAYER HOST
echo =================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-and-host-windows.ps1"
if %ERRORLEVEL% neq 0 (
    echo.
    echo [Setup] Setup script terminated with code %ERRORLEVEL%.
    pause
)
