#!/bin/bash

# Control Workbench - Unified Startup Script
# Starts the native Tauri desktop application for development.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect OS
OS_TYPE=$(uname)
if [[ "$OS_TYPE" == "MINGW"* ]] || [[ "$OS_TYPE" == "MSYS"* ]]; then
  IS_WINDOWS=true
else
  IS_WINDOWS=false
fi

# Print header
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Control Workbench - Unified Startup              ║"
echo "║                                                            ║"
echo "║  Native desktop · FeltDB · supervised agent runtimes       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Validate expected project structure
if [ ! -f "src-ui/package.json" ] || [ ! -f "src-tauri/Cargo.toml" ]; then
  echo -e "${RED}Error: Missing expected Control project files${NC}"
  echo "Expected: src-ui/package.json and src-tauri/Cargo.toml"
  exit 1
fi

# Function to cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}Control stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check environment
echo -e "${BLUE}[1/3]${NC} Checking environment..."

# Node.js version
NODE_VERSION=$(node -v)
echo "  ✓ Node.js: $NODE_VERSION"

echo "  ✓ npm: $(npm -v)"

# Install dependencies if needed
echo -e "\n${BLUE}[2/3]${NC} Checking dependencies..."

if [ ! -d "src-ui/node_modules" ]; then
  echo "  Installing src-ui dependencies..."
  (cd src-ui && npm ci)
fi

echo -e "  ${GREEN}✓ Dependencies ready${NC}"

# Start Tauri Application
echo -e "\n${BLUE}[3/3]${NC} Starting Tauri Application..."
echo -e "  ${GREEN}✓ UI opening in a moment...${NC}\n"

# Start dev mode
if [ "$IS_WINDOWS" = true ]; then
  echo -e "  ${YELLOW}ℹ Windows detected; use start.bat for best compatibility${NC}"
fi

if [ -f "package.json" ] && npm run 2>/dev/null | grep -q " tauri"; then
  npm run tauri dev
elif cargo tauri --help > /dev/null 2>&1; then
  (cd src-tauri && cargo tauri dev)
else
  echo -e "  ${RED}✗ Tauri CLI not available. Desktop mode cannot start.${NC}"
  echo -e "  ${YELLOW}  Install it with: cargo install tauri-cli${NC}"
  echo -e "  ${YELLOW}  Optional web fallback: CONTROL_WEB_FALLBACK=1 ./start.sh${NC}"
  if [ "${CONTROL_WEB_FALLBACK:-0}" = "1" ]; then
    echo -e "  ${YELLOW}ℹ Starting web fallback (no Tauri IPC)${NC}"
    (cd src-ui && npm run dev)
  else
    exit 1
  fi
fi

# Cleanup on exit
cleanup
