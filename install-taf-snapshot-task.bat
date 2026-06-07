@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

if "%TAF_INTERVAL_MINUTES%"=="" set "TAF_INTERVAL_MINUTES=30"
if "%TAF_TASK_NAME%"=="" set "TAF_TASK_NAME=FlightRiskTafSnapshot"

set "TASK_CMD=%ROOT%collect-taf-snapshot.bat"

echo Installing scheduled task "%TAF_TASK_NAME%" every %TAF_INTERVAL_MINUTES% minutes...
schtasks /Create /SC MINUTE /MO %TAF_INTERVAL_MINUTES% /TN "%TAF_TASK_NAME%" /TR "\"%TASK_CMD%\"" /F

if errorlevel 1 (
  echo Failed to install scheduled task.
  exit /b 1
)

echo Scheduled task installed.
echo It runs even when the app is not open, as long as Windows Task Scheduler can run tasks for this user.
echo To remove it, run uninstall-taf-snapshot-task.bat
