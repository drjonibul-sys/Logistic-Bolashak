@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 server.py
) else (
  python server.py
)
if errorlevel 1 (
  echo.
  echo Programma ne zapustilas. Proverte, chto ustanovlen Python 3.9 ili novee: https://www.python.org/downloads/
)
pause
