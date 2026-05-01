@echo off
echo ========================================
echo  Strength Agent - Development Launcher
echo ========================================

echo.
echo [1/2] Starting FastAPI backend on port 18720...
start "Strength-Backend" cmd /c "cd /d "%~dp0..\mvp\backend" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 18720 --reload"

echo [2/2] Starting Tauri desktop app...
cd /d "%~dp0"
call npm run tauri dev

echo.
echo Backend will be stopped when you close the desktop app.
pause
