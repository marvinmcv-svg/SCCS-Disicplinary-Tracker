@echo off
echo ========================================
echo SCCS Discipline Tracker - Quick Start
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] Starting PostgreSQL Docker...
docker start sccs-pg 2>nul
if errorlevel 1 (
    echo    Docker container not found - ensure Docker is running
)

echo [2/3] Starting Backend Server...
start "SCCS Backend" cmd /k "cd %~dp0 && set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sccs_discipline && npm run server"

timeout /t 5 /nobreak >nul

echo [3/3] Starting Frontend...
start "SCCS Frontend" cmd /k "cd %~dp0\client && npm run dev"

echo.
echo ========================================
echo ✅ All servers starting!
echo.
echo Access the app at: http://localhost:5173
echo.
echo Login: marvin / Password123!
echo ========================================
echo.
pause