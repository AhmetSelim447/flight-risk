@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

if "%TAF_INTERVAL_MINUTES%"=="" set "TAF_INTERVAL_MINUTES=30"

echo Flight Risk TAF snapshot loop started.
echo Interval: %TAF_INTERVAL_MINUTES% minutes
echo Close this window to stop the loop.
echo.

:loop
call "%ROOT%collect-taf-snapshot.bat"
echo Waiting %TAF_INTERVAL_MINUTES% minutes...
set /a TAF_INTERVAL_SECONDS=%TAF_INTERVAL_MINUTES%*60
timeout /t %TAF_INTERVAL_SECONDS% /nobreak >nul
goto loop
