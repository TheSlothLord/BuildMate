@echo off
setlocal
title DeckBuilder
set "DECKDIR=%~dp0"
set "M=#"
set "M=%M%LAUNCH"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-Content -Raw -LiteralPath '%~f0'; $m='%M%'; $i=$s.IndexOf($m); if($i -ge 0){ Invoke-Expression $s.Substring($i + $m.Length) }"
exit /b %errorlevel%

#LAUNCH
# ---------------------------------------------------------------------------
# DeckBuilder launcher (PowerShell section, run by the batch header above).
# Serves the built app locally and opens it in its own app window.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
$dir = $env:DECKDIR
if (-not $dir) { $dir = (Get-Location).Path }
Set-Location $dir

$port = 5180
$url  = "http://localhost:$port"

# Use the portable Node install if present, else whatever Node is on PATH.
$portable = Join-Path $env:LOCALAPPDATA 'node-portable\node-v22.11.0-win-x64'
if (Test-Path (Join-Path $portable 'node.exe')) { $env:Path = "$portable;$env:Path" }
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) {
  Write-Host 'Node.js was not found. Install Node 18+ from https://nodejs.org, then run DeckBuilder again.' -ForegroundColor Red
  Read-Host 'Press Enter to close'
  exit 1
}

# First run: install dependencies and build (one time).
if (-not (Test-Path (Join-Path $dir 'dist\index.html'))) {
  Write-Host 'First run: installing dependencies and building (one time)...' -ForegroundColor Cyan
  if (-not (Test-Path (Join-Path $dir 'node_modules'))) { & npm install --no-fund --no-audit }
  & npm run build
}

Write-Host 'Starting DeckBuilder...' -ForegroundColor Cyan
$vite   = Join-Path $dir 'node_modules\vite\bin\vite.js'
$server = Start-Process -FilePath $nodeExe `
  -ArgumentList @("`"$vite`"", 'preview', '--port', "$port", '--strictPort') `
  -WorkingDirectory $dir -PassThru -WindowStyle Hidden

# Wait (up to ~20s) for the server to respond.
$ready = $false
for ($i = 0; $i -lt 80; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 1).StatusCode -eq 200) { $ready = $true; break } } catch { }
  Start-Sleep -Milliseconds 250
}
if (-not $ready) { Write-Host 'Server did not start in time.' -ForegroundColor Red }

# Open in its own app window. A dedicated user-data-dir gives DeckBuilder its own
# browser process, so the window's lifetime is ours to track and clean up.
$prof  = Join-Path $env:LOCALAPPDATA 'DeckBuilderApp'
$bargs = "--app=$url --user-data-dir=`"$prof`" --window-size=1300,900 --no-first-run --no-default-browser-check"
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$browser = $null
if     ($edge)   { $browser = Start-Process $edge   $bargs -PassThru }
elseif ($chrome) { $browser = Start-Process $chrome $bargs -PassThru }
else             { Start-Process $url }  # no Chromium browser -> default browser tab

Write-Host "DeckBuilder is running at $url" -ForegroundColor Green
if ($browser) {
  Write-Host 'Close the DeckBuilder window to quit.' -ForegroundColor DarkGray
  Wait-Process -Id $browser.Id
} else {
  Read-Host 'Press Enter here to quit DeckBuilder'
}

# Shut the server down.
if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
