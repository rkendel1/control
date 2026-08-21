@echo off
setlocal

echo Control Workbench - Native desktop, FeltDB, supervised agent runtimes

if not exist "src-ui\package.json" (
  echo Error: Run this script from the Control repository root.
  exit /b 1
)
if not exist "src-tauri\Cargo.toml" (
  echo Error: src-tauri\Cargo.toml is missing.
  exit /b 1
)

if not exist "src-ui\node_modules" (
  pushd src-ui
  call npm ci
  popd
  if errorlevel 1 exit /b 1
)

cargo tauri --help >nul 2>&1
if errorlevel 1 (
  echo Error: Tauri CLI is required. Install it with: cargo install tauri-cli
  exit /b 1
)

cd src-tauri
cargo tauri dev
exit /b %errorlevel%
