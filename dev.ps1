# Sobe o Worker (API + site já compilado) em http://localhost:8787 e o Vite (com recarga automática) em http://localhost:5173.
$root = $PSScriptRoot
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\worker'; npm run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\frontend'; npm run dev"
Write-Host 'Desenvolvimento: http://localhost:5173 (o Vite encaminha /api para o Worker na porta 8787)'
