$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Step($message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Cyan
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SynthNews local production-like test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not available in PATH."
  }

  if (-not (Get-Command caddy -ErrorAction SilentlyContinue)) {
    throw "Caddy is not available in PATH. Install Caddy first, then run this file again."
  }

  if (-not (Test-Path ".env.local")) {
    throw ".env.local is missing. Copy .env.local.example to .env.local and set ADMIN_TOKEN first."
  }

  Step "[1/5] Checking synthnews.local hosts entry..."
  npm run local:check-hosts
  if ($LASTEXITCODE -ne 0) {
    throw "Hosts check failed. Add this line as Administrator: 127.0.0.1 synthnews.local"
  }

  Step "[2/5] Starting local Postgres DB via Docker Compose..."
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose up -d db
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[WARN] Could not start Docker DB. If DB is already running elsewhere, you may ignore this." -ForegroundColor Yellow
    }
  } else {
    Write-Host "[WARN] Docker command not found. Skipping DB start; continuing in case DB is already running." -ForegroundColor Yellow
  }

  Step "[3/5] Building current client/server and copying client/dist to server/public..."
  npm run local:build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed."
  }

  Step "[4/5] Starting SynthNews app on http://127.0.0.1:3000 ..."
  Start-Process powershell.exe -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', "Set-Location '$root'; npm run local:start"
  ) -WindowStyle Normal

  Step "[5/5] Starting Caddy for https://synthnews.local ..."
  Start-Process powershell.exe -ArgumentList @(
    '-NoExit',
    '-ExecutionPolicy', 'Bypass',
    '-Command', "Set-Location '$root'; caddy run --config Caddyfile.local"
  ) -WindowStyle Normal

  Write-Host ""
  Write-Host "Waiting a few seconds for services to boot..." -ForegroundColor Gray
  Start-Sleep -Seconds 5

  Write-Host "Opening https://synthnews.local ..." -ForegroundColor Green
  Start-Process "https://synthnews.local"

  Write-Host ""
  Write-Host "Done. Keep the two opened PowerShell windows running while testing." -ForegroundColor Green
  Write-Host "Close 'local:start' and 'Caddy' PowerShell windows to stop local test." -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  Write-Host ""
  Read-Host "Press Enter to close this launcher window"
}
