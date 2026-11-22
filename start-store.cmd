@echo off
rem Starts the API (port 3001) and the website (port 3000) in two windows,
rem then opens the store in your browser. Close the two windows to stop.
cd /d "%~dp0"
start "API - Carte PSN Abidjan" cmd /k corepack pnpm --filter @repo/api dev
start "Site - Carte PSN Abidjan" cmd /k corepack pnpm --filter @repo/web dev
timeout /t 20 /nobreak >nul
start "" http://localhost:3000
