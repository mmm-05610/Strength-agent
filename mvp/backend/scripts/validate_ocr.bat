@echo off
setlocal
chcp 65001 >nul

REM Run from mvp/backend/scripts -> switch to mvp/backend
cd /d "%~dp0.."

if not exist ".venv\Scripts\python.exe" (
  echo ERROR: venv not found: .venv\Scripts\python.exe
  echo Please create venv and install deps in mvp\backend first.
  echo.
  echo   py -3.12 -m venv .venv
  echo   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
  exit /b 2
)

.\.venv\Scripts\python.exe scripts\validate_ocr.py %*
