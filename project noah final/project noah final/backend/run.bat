@echo off
setlocal
cd /d "%~dp0"
title LMS local server

rem Layout: univlms\ (index.html, style.css, logos) and univlms\backend\ (this file, server.js, .env, scripts)
set "HOST=127.0.0.1"
set "PORT=5500"

rem Find the settings file. The normal name is .env, but .env.txt and _env are accepted too.
set "ENVFILE="
if exist ".env" set "ENVFILE=.env"
if not defined ENVFILE if exist ".env.txt" set "ENVFILE=.env.txt"
if not defined ENVFILE if exist "_env" set "ENVFILE=_env"
if not defined ENVFILE goto checknode

for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENVFILE%") do (
  if /i "%%A"=="CENTRAL_HOST" set "HOST=%%B"
  if /i "%%A"=="CENTRAL_PORT" set "PORT=%%B"
)
goto checknode

:checknode
where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist "scripts\generate-config.js" goto serve
if not defined ENVFILE goto serve
node --env-file=%ENVFILE% scripts\generate-config.js
if errorlevel 1 echo [warning] config.js was not regenerated, so the existing config.js is used.

:serve
echo.
echo Serving the website at http://%HOST%:%PORT%
echo Press Ctrl+C to stop the server.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://%HOST%:%PORT%"
set "FRONTEND_DIR=.."
node server.js
goto end

:nonode
echo [error] Node.js was not found.
echo         Install Node.js LTS from https://nodejs.org then run this file again.

:end
pause
endlocal
