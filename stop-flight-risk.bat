@echo off
setlocal

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

echo Flight Risk servisleri durduruluyor...
echo Root: %ROOT%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Resolve-Path '%ROOT%').Path; " ^
  "$patterns = @('src/index.ts','nodemon','uvicorn main:app','vite --port','vite.js'); " ^
  "$procs = Get-CimInstance Win32_Process | Where-Object { " ^
  "  $cmd = [string]$_.CommandLine; " ^
  "  $cmd -and $cmd.Contains($root) -and ($patterns | Where-Object { $cmd.Contains($_) }) " ^
  "}; " ^
  "if (-not $procs) { Write-Host 'Durdurulacak Flight Risk process bulunamadi.'; exit 0 }; " ^
  "$procs | Sort-Object ProcessId | ForEach-Object { Write-Host ('PID {0} {1} :: {2}' -f $_.ProcessId, $_.Name, $_.CommandLine) }; " ^
  "$procs | Sort-Object ProcessId -Descending | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; " ^
  "Write-Host 'Tamamlandi.'"

echo.
echo Port kontrolu:
netstat -ano | findstr /R /C:":4000 .*LISTENING" /C:":5174 .*LISTENING" /C:":8000 .*LISTENING"

endlocal
