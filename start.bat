@echo off
cd /d C:\Users\KB\Documents\Open code\discipline-tracker-app
start /b npx ts-node server/index.ts > server.log 2>&1
cd /d C:\Users\KB\Documents\Open code\discipline-tracker-app\client
start /b npm run dev > client.log 2>&1
echo Servers starting...
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173