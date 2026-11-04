@echo off
chcp 65001 >nul 2>&1
title MAN7 - Air-Gapped Splunk ^& RHEL Platform (Windows Built-In Zero-Install)
echo ==============================================================================
echo   MAN7 ^| Air-Gapped RHEL Hardening ^& Splunk Migration Platform
echo   Mode : 100%% Windows Built-In (.NET / PowerShell)
echo   Reqs : ZERO Install (No Admin, No npm, No Node.js, No Java Required)
echo ==============================================================================
echo.

cd /d "%~dp0"

if not exist "windows-portable\ui" mkdir "windows-portable\ui" >nul 2>&1
if exist "MAN7-Standalone.html" if not exist "windows-portable\ui\index.html" copy /y "MAN7-Standalone.html" "windows-portable\ui\index.html" >nul 2>&1
if exist "windows-portable\ui\index.html" if not exist "MAN7-Standalone.html" copy /y "windows-portable\ui\index.html" "MAN7-Standalone.html" >nul 2>&1

if exist "windows-portable\man7-windows-builtin.ps1" (
    echo [MAN7] Starting Built-In Windows Engine on http://127.0.0.1:3000 ...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-portable\man7-windows-builtin.ps1"
    if errorlevel 1 (
        echo [MAN7] Opening Pre-Built Standalone UI directly in browser...
        if exist "%~dp0MAN7-Standalone.html" (
            start "" "%~dp0MAN7-Standalone.html"
        ) else if exist "%~dp0windows-portable\ui\index.html" (
            start "" "%~dp0windows-portable\ui\index.html"
        ) else if exist "%~dp0index.html" (
            start "" "%~dp0index.html"
        )
    )
    goto :eof
)

if exist "%~dp0MAN7-Standalone.html" (
    echo [MAN7] Opening Pre-Built Standalone UI directly in browser...
    start "" "%~dp0MAN7-Standalone.html"
    goto :eof
)

if exist "%~dp0windows-portable\ui\index.html" (
    echo [MAN7] Opening Pre-Built Standalone UI directly in browser...
    start "" "%~dp0windows-portable\ui\index.html"
    goto :eof
)

echo [ERROR] Pre-built files not found.
pause
