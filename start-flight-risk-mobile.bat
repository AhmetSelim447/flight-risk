@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo Yerel IP adresi tespit ediliyor...
:: Filter out virtual adapters like WSL (vEthernet), VirtualBox, VMware, and loopbacks to find the real physical IP (e.g. Wi-Fi)
for /f "usebackq tokens=*" %%i in (`powershell -Command "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike '*vEthernet*' -and $_.InterfaceAlias -notlike '*Virtual*' -and $_.InterfaceAlias -notlike '*VMware*' } | Select-Object -First 1).IPAddress; if (-not $ip) { $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress }; if (-not $ip) { $ip = '127.0.0.1' }; $ip"`) do (
  set "LOCAL_IP=%%i"
)

if "%LOCAL_IP%"=="" (
  set "LOCAL_IP=127.0.0.1"
  echo UYARI: Yerel IP adresi bulunamadi, 127.0.0.1 kullaniliyor.
) else (
  echo Yerel IP Adresiniz: %LOCAL_IP%
)

echo.
echo Eski calisan arka plan servisleri (port 8000 ve 4000) temizleniyor...
call :kill_port 8000
call :kill_port 4000

echo.
echo Mobil uygulama icin .env.local dosyasi guncelleniyor...
echo EXPO_PUBLIC_API_URL=http://%LOCAL_IP%:4000> "apps\mobile\.env.local"
echo EXPO_PUBLIC_SUPABASE_URL=https://mklxfpgzvsrtpnctdohg.supabase.co>> "apps\mobile\.env.local"
echo EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rbHhmcGd6dnNydHBuY3Rkb2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTA0OTEsImV4cCI6MjA5Nzc4NjQ5MX0.LGP_YsJLEbWLa9g8_QkrxgBrXJevL_UHsl94PAIYcZ8>> "apps\mobile\.env.local"

call :load_env_file "%ROOT%apps\api\.env"
call :load_env_file "%ROOT%apps\api\.env.local"

set PORT=4000
if not defined MET_PROVIDER set MET_PROVIDER=auto
if not defined MET_PROVIDER_TIMEOUT_MS set MET_PROVIDER_TIMEOUT_MS=3500
if not defined NOTAM_PROVIDER set NOTAM_PROVIDER=simulated
set NOTAM_SYNTHETIC_MODE=hybrid
set NOTAM_SEED_BUCKET_HOURS=6
set AI_SERVICE_URL=http://127.0.0.1:8000
set AI_SERVICE_TIMEOUT_MS=2500
set RISK_MODEL_PATH=%ROOT%services\nlp\models\risk_model.json

echo.
echo Flight Risk Mobil Servisleri Baslatiliyor...
echo --------------------------------------------
echo API Servisi  : http://%LOCAL_IP%:4000
echo AI Servisi   : http://127.0.0.1:8000
echo Expo Sunucusu: apps/mobile dizininde baslatilacak.
echo --------------------------------------------
echo.

call :is_listening 8000
if errorlevel 1 (
  start "Flight Risk AI (NLP)" /D "%ROOT%" cmd /k python -m uvicorn main:app --app-dir services/nlp --host 127.0.0.1 --port 8000
) else (
  echo AI servisi zaten 8000 portunda calisiyor.
)
call :wait_listening 8000 30
if errorlevel 1 (
  echo AI servisi 30 saniye icinde hazir olmadi, devam ediliyor.
)

call :is_listening 4000
if errorlevel 1 (
  start "Flight Risk API Backend" /D "%ROOT%apps\api" cmd /k npm run dev
) else (
  echo API zaten 4000 portunda calisiyor.
)
call :wait_listening 4000 45
if errorlevel 1 (
  echo API 45 saniye icinde hazir olmadi.
)

echo.
echo Expo Dev Server baslatiliyor (cache temizlenerek)...
start "Flight Risk Expo Server" /D "%ROOT%apps\mobile" cmd /k npx expo start -c

echo.
echo Acilan pencereleri kapatmak servisleri durdurur.
echo Telefonunuzda veya emulatorde test etmek icin acilan Expo penceresindeki yonergeleri takip edin.
endlocal
exit /b

:load_env_file
if not exist "%~1" exit /b 0
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~1") do (
  if not "%%A"=="" set "%%A=%%B"
)
exit /b 0

:is_listening
:: Support both English (LISTENING) and Turkish (DİNLENİYOR) output
netstat -ano | findstr /R /C:":%~1 " | findstr /I /R "LISTENING DINLENIYOR DİNLENİYOR" >nul
exit /b %errorlevel%

:kill_port
:: Force-kills any process listening on the specified port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%~1 .*LISTENING" /C:":%~1 .*DİNLENİYOR"') do (
  echo Port %~1 uzerindeki PID %%a sonlandiriliyor...
  taskkill /F /PID %%a >nul 2>&1
)
exit /b 0

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
