@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

call :load_env_file "%ROOT%apps\api\.env"
call :load_env_file "%ROOT%apps\api\.env.local"

set PORT=4000
if not defined MET_PROVIDER set MET_PROVIDER=auto
if not defined MET_PROVIDER_TIMEOUT_MS set MET_PROVIDER_TIMEOUT_MS=3500
if not defined NOTAM_PROVIDER set NOTAM_PROVIDER=simulated
rem Real NOTAM option:
rem set NOTAM_PROVIDER=laminar
rem set LAMINAR_USER_KEY=your_laminar_user_key_here
rem SkyLink RapidAPI option:
rem set NOTAM_PROVIDER=skylink
rem set SKYLINK_API_KEY=your_rapidapi_key_here
rem set SKYLINK_API_HOST=skylink-api.p.rapidapi.com
rem set SKYLINK_API_URL=https://skylink-api.p.rapidapi.com/notams
set NOTAM_SYNTHETIC_MODE=hybrid
set NOTAM_SEED_BUCKET_HOURS=6
set AI_SERVICE_URL=http://127.0.0.1:8000
set AI_SERVICE_TIMEOUT_MS=2500
set RISK_MODEL_PATH=%ROOT%services\nlp\models\risk_model.json

echo Flight Risk baslatiliyor...
echo.
echo API: http://127.0.0.1:4000
echo AI : http://127.0.0.1:8000
echo Web: http://127.0.0.1:5174
echo.

call :is_listening 8000
if errorlevel 1 (
  start "Flight Risk AI" /D "%ROOT%" cmd /k python -m uvicorn main:app --app-dir services/nlp --host 127.0.0.1 --port 8000
) else (
  echo AI servisi zaten 8000 portunda calisiyor.
)
call :wait_listening 8000 30
if errorlevel 1 (
  echo AI servisi 30 saniye icinde hazir olmadi, devam ediliyor.
)

call :is_listening 4000
if errorlevel 1 (
  start "Flight Risk API" /D "%ROOT%apps\api" cmd /k npm run dev
) else (
  echo API zaten 4000 portunda calisiyor.
)
call :wait_listening 4000 45
if errorlevel 1 (
  echo API 45 saniye icinde hazir olmadi; web proxy ilk isteklerde hata verebilir.
)

call :is_listening 5174
if errorlevel 1 (
  start "Flight Risk Web" /D "%ROOT%" cmd /k npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5174
) else (
  echo Web zaten 5174 portunda calisiyor.
)
timeout /t 3 /nobreak >nul

start "" "http://127.0.0.1:5174/"

echo Acilan pencereleri kapatmak servisleri durdurur.
endlocal
exit /b

:load_env_file
if not exist "%~1" exit /b 0
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~1") do (
  if not "%%A"=="" set "%%A=%%B"
)
exit /b 0

:is_listening
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
exit /b %errorlevel%

:wait_listening
set "WAIT_PORT=%~1"
set "WAIT_SECONDS=%~2"
set /a WAIT_COUNT=0
:wait_listening_loop
call :is_listening %WAIT_PORT%
if not errorlevel 1 exit /b 0
if %WAIT_COUNT% GEQ %WAIT_SECONDS% exit /b 1
timeout /t 1 /nobreak >nul
set /a WAIT_COUNT+=1
goto :wait_listening_loop
