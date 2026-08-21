#!/bin/bash

# Control Workbench - Unified Startup Script
# Starts all components for development: Tauri app, daemon, API server

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
echo "║  Starting all components:                                  ║"
echo "║  • Tauri Application (Desktop UI)                          ║"
echo "║  • Mission-Control Daemon (Agent Coordination)             ║"
echo "║  • AI Targets (Claude, GPT-4, Ollama, Auto)                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Validate expected project structure
if [ ! -f "mission-control/package.json" ] || [ ! -f "src-ui/package.json" ] || [ ! -f "src-tauri/Cargo.toml" ]; then
  echo -e "${RED}Error: Missing expected Control project files${NC}"
  echo "Expected: mission-control/package.json, src-ui/package.json, src-tauri/Cargo.toml"
  exit 1
fi

# Function to cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}Shutting down services...${NC}"
  # Daemon is managed by mission-control daemon scripts.
  # We do not force-stop it here to avoid killing unrelated processes.
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check environment
echo -e "${BLUE}[1/4]${NC} Checking environment..."

# Node.js version
NODE_VERSION=$(node -v)
echo "  ✓ Node.js: $NODE_VERSION"

# pnpm availability
if ! command -v pnpm &> /dev/null; then
  echo -e "  ${RED}✗ pnpm not found${NC}"
  echo "  Install with: npm install -g pnpm"
  exit 1
fi
echo "  ✓ pnpm installed"

# AI API Keys check (optional but warn if missing)
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo -e "  ${YELLOW}⚠ ANTHROPIC_API_KEY not set (Claude target will be unavailable)${NC}"
else
  echo -e "  ${GREEN}✓ ANTHROPIC_API_KEY configured${NC}"
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo -e "  ${YELLOW}⚠ OPENAI_API_KEY not set (GPT-4 target will be unavailable)${NC}"
else
  echo -e "  ${GREEN}✓ OPENAI_API_KEY configured${NC}"
fi

echo -e "  ${YELLOW}ℹ Ollama: Will run locally (http://localhost:11434)${NC}"

# Install dependencies if needed
echo -e "\n${BLUE}[2/4]${NC} Checking dependencies..."
if [ ! -d "mission-control/node_modules" ]; then
  echo "  Installing mission-control dependencies..."
  (cd mission-control && pnpm install)
fi

if [ ! -d "src-ui/node_modules" ]; then
  echo "  Installing src-ui dependencies..."
  (cd src-ui && pnpm install)
fi

echo -e "  ${GREEN}✓ Dependencies ready${NC}"

# Start Mission-Control Daemon (background)
echo -e "\n${BLUE}[3/4]${NC} Starting Mission-Control Daemon..."
# Start in background so unified startup can continue.
(cd mission-control && pnpm daemon:start > /tmp/control-daemon-start.log 2>&1) &
DAEMON_START_PID=$!
sleep 2

if (cd mission-control && pnpm daemon:status > /tmp/control-daemon-status.log 2>&1); then
  echo -e "  ${GREEN}✓ Daemon started${NC}"
else
  echo -e "  ${YELLOW}⚠ Daemon status check failed (startup may still be in progress)${NC}"
  echo -e "  ${YELLOW}  See /tmp/control-daemon-start.log and /tmp/control-daemon-status.log${NC}"
fi

# Start Tauri Application
echo -e "\n${BLUE}[4/4]${NC} Starting Tauri Application..."
echo -e "  ${GREEN}✓ UI opening in a moment...${NC}\n"

# Wait a bit for daemon to fully initialize
sleep 1

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
    (cd src-ui && pnpm dev)
  else
    exit 1
  fi
fi

# Cleanup on exit
cleanup
