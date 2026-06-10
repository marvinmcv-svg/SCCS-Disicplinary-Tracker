@echo off
cd /d "%~dp0"

echo Starting backend server...
start "SCCS Backend" cmd /k "set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sccs_discipline && npm run server"

timeout /t 3 /nobreak >nul

echo Starting frontend server...
start "SCCS Frontend" cmd /k "cd client && npm run dev"

echo.
echo Servers starting. This window will close.
timeout /t 2 /nobreak >nul