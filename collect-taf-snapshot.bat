@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

if "%TAF_STATIONS%"=="" set "TAF_STATIONS=turkey"
if "%TAF_SNAPSHOT_OUT%"=="" set "TAF_SNAPSHOT_OUT=data/raw/live"

if not exist "data\logs" mkdir "data\logs"

>>"data\logs\taf-snapshot.log" echo [%date% %time%] collecting TAF snapshot stations=%TAF_STATIONS% out=%TAF_SNAPSHOT_OUT%
python tools\ml_pipeline.py collect-live --stations "%TAF_STATIONS%" --kinds taf --out "%TAF_SNAPSHOT_OUT%" >>"data\logs\taf-snapshot.log" 2>&1
set "CODE=%ERRORLEVEL%"
>>"data\logs\taf-snapshot.log" echo [%date% %time%] finished code=%CODE%

exit /b %CODE%
