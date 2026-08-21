@echo off
REM Control Workbench - Unified Startup Script for Windows
REM Starts all components for development: Tauri app, daemon, API server

setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║          Control Workbench - Unified Startup              ║
echo ║                                                            ║
echo ║  Starting all components:                                  ║
echo ║  • Tauri Application (Desktop UI)                          ║
echo ║  • Mission-Control Daemon (Agent Coordination)             ║
echo ║  • AI Targets (Claude, GPT-4, Ollama, Auto)                ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Check if running from project root
if not exist "package.json" (
  echo Error: Run this script from the Control project root
  exit /b 1
)

REM Check environment
echo [1/4] Checking environment...

REM Node.js version
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo   + Node.js: %NODE_VERSION%

REM pnpm availability
pnpm --version >nul 2>&1
if errorlevel 1 (
  echo   - pnpm not found
  echo   Install with: npm install -g pnpm
  exit /b 1
)
echo   + pnpm installed

REM AI API Keys check (optional but warn if missing)
if not defined ANTHROPIC_API_KEY (
  echo   ^ ANTHROPIC_API_KEY not set (Claude target will be unavailable)
) else (
  echo   + ANTHROPIC_API_KEY configured
)

if not defined OPENAI_API_KEY (
  echo   ^ OPENAI_API_KEY not set (GPT-4 target will be unavailable)
) else (
  echo   + OPENAI_API_KEY configured
)

echo   i Ollama: Will run locally (http://localhost:11434)

REM Install dependencies if needed
echo.
echo [2/4] Checking dependencies...
if not exist "node_modules" (
  echo   Installing root dependencies...
  call pnpm install
)

if not exist "mission-control\node_modules" (
  echo   Installing mission-control dependencies...
  cd mission-control
  call pnpm install
  cd ..
)

echo   + Dependencies ready

REM Start Mission-Control Daemon (background)
echo.
echo [3/4] Starting Mission-Control Daemon...
cd mission-control
start "" pnpm daemon:start
cd ..
timeout /t 2 /nobreak >nul

echo   + Daemon started

REM Start Tauri Application
echo.
echo [4/4] Starting Tauri Application...
echo   + UI opening in a moment...
echo.

timeout /t 1 /nobreak >nul

REM Start dev mode
call npm run tauri dev

REM Cleanup (stop daemon)
echo.
echo Shutting down services...
taskkill /F /IM node.exe 2>nul
