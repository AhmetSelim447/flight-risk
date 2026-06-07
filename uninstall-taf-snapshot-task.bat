@echo off
setlocal

if "%TAF_TASK_NAME%"=="" set "TAF_TASK_NAME=FlightRiskTafSnapshot"

echo Removing scheduled task "%TAF_TASK_NAME%"...
schtasks /Delete /TN "%TAF_TASK_NAME%" /F
