@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo Rising Chemicals sayti mahalliy serverda ishga tushirilmoqda...
echo Brauzer avtomatik ochiladi. Yopish uchun bu oynani yoping.
echo.
start "" http://localhost:8000
python -m http.server 8000
if errorlevel 1 (
  echo.
  echo Python topilmadi. python.org saytidan Python o'rnatib, qayta urinib ko'ring.
  pause
)
