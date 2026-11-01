@echo off
setlocal
cd /d "%~dp0"
title Supabase backup

set "PGDUMP=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
if not exist "%PGDUMP%" (
  echo [error] pg_dump.exe was not found at:
  echo         %PGDUMP%
  echo         Edit the PGDUMP line at the top of this file to match your PostgreSQL version.
  goto end
)

echo.
echo Paste your Supabase SESSION POOLER connection string with your password already in it.
echo It must look like: postgresql://postgres.xxxx:PASSWORD@aws-0-xx.pooler.supabase.com:5432/postgres
echo.
set "CONN="
set /p "CONN=Connection string: "
if not defined CONN goto end
set "CONN=%CONN:"=%"

for /f %%i in ('powershell -nologo -command "Get-Date -Format yyyy-MM-dd_HHmm"') do set "TS=%%i"
if not exist "sql" mkdir "sql"
set "OUT=sql\ACADaelash_bsckup_%TS%.sql"

echo.
echo Backing up, please wait...
"%PGDUMP%" "%CONN%" --schema=public --column-inserts --no-owner --no-privileges -f "%OUT%"
if errorlevel 1 (
  echo.
  echo [error] The backup failed. Read the message above.
  if exist "%OUT%" del "%OUT%"
  goto end
)

echo.
echo Done. Saved as: %CD%\%OUT%

:end
echo.
pause
endlocal