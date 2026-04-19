# Start servers script
$backend = Start-Process -FilePath "npx" -ArgumentList "ts-node server/index.ts" -WorkingDirectory "C:\Users\KB\Documents\Open code\discipline-tracker-app" -PassThru -WindowStyle Minimized
$backendId = $backend.Id
Write-Host "Backend started with PID: $backendId"

Start-Sleep -Seconds 3

$frontend = Start-Process -FilePath "npm" -ArgumentList "run dev" -WorkingDirectory "C:\Users\KB\Documents\Open code\discipline-tracker-app\client" -PassThru -WindowStyle Minimized
$frontendId = $frontend.Id
Write-Host "Frontend started with PID: $frontendId"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Servers should be running now:"
Write-Host "  Backend: http://localhost:3001"
Write-Host "  Frontend: http://localhost:5173"
Write-Host ""
Write-Host "Press Enter to stop servers..."
Read-Host

Stop-Process -Id $backendId -Force -ErrorAction SilentlyContinue
Stop-Process -Id $frontendId -Force -ErrorAction SilentlyContinue
Write-Host "Servers stopped."