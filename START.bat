@echo off
setlocal DisableDelayedExpansion
if not exist "%~dp0runtime\python.exe" (
    echo Extract the entire ZIP before running START.bat.
    pause
    exit /b 1
)
"%~dp0runtime\python.exe" -I -B "%~dp0start_server.py"
if errorlevel 1 pause
