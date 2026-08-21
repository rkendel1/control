#!/bin/bash

# Control Workbench - Unified Startup Script
# Starts all components for development: Tauri app, daemon, API server

set -e

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

# Check if running from project root
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Run this script from the Control project root${NC}"
  exit 1
fi

# Function to cleanup on exit
cleanup() {
  echo -e "\n${YELLOW}Shutting down services...${NC}"
  # Kill daemon if started by us
  if [ ! -z "$DAEMON_PID" ]; then
    kill $DAEMON_PID 2>/dev/null || true
  fi
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
if [ ! -d "node_modules" ]; then
  echo "  Installing root dependencies..."
  pnpm install
fi

if [ ! -d "mission-control/node_modules" ]; then
  echo "  Installing mission-control dependencies..."
  cd mission-control
  pnpm install
  cd ..
fi

echo -e "  ${GREEN}✓ Dependencies ready${NC}"

# Start Mission-Control Daemon (background)
echo -e "\n${BLUE}[3/4]${NC} Starting Mission-Control Daemon..."
cd mission-control
pnpm daemon:start > /dev/null 2>&1 &
DAEMON_PID=$!
sleep 2

if ps -p $DAEMON_PID > /dev/null; then
  echo -e "  ${GREEN}✓ Daemon started (PID: $DAEMON_PID)${NC}"
else
  echo -e "  ${RED}✗ Failed to start daemon${NC}"
  exit 1
fi
cd ..

# Start Tauri Application
echo -e "\n${BLUE}[4/4]${NC} Starting Tauri Application..."
echo -e "  ${GREEN}✓ UI opening in a moment...${NC}\n"

# Wait a bit for daemon to fully initialize
sleep 1

# Start dev mode
if [ "$IS_WINDOWS" = true ]; then
  npm run tauri dev
else
  npm run tauri dev
fi

# Cleanup on exit
cleanup
