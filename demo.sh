#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

cleanup() {
  echo ""
  echo "Shutting down Prahari-Link..."
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
  [ -n "$DASHBOARD_PID" ] && kill "$DASHBOARD_PID" 2>/dev/null
  wait "$MOCK_PID" "$BACKEND_PID" "$DASHBOARD_PID" 2>/dev/null
  echo "All services stopped."
}
trap cleanup EXIT INT TERM

echo "==================================="
echo "   Prahari-Link — Demo Mode"
echo "==================================="
echo ""

# ── Start Backend (port 3001) ──
cd "$BACKEND_DIR"
echo "[1/3] Starting backend on http://localhost:3001 ..."
node server.js &
BACKEND_PID=$!
sleep 1

# ── Start Mock Injector (pre-loaded demo incidents) ──
cd "$BACKEND_DIR"
echo "[2/3] Starting mock injector (demo incidents every 10s)..."
node mock_injector.js &
MOCK_PID=$!
sleep 1

# ── Start Dashboard (port 5173) ──
cd "$DASHBOARD_DIR"
echo "[3/3] Starting dashboard on http://localhost:5173 ..."
npx vite --force &
DASHBOARD_PID=$!
sleep 2

echo ""
echo "==================================="
echo "   ✅ Prahari-Link is running!"
echo "   Dashboard:  http://localhost:5173"
echo "   Backend:    http://localhost:3001"
echo "   Mock Injector: incident every 10s + heartbeat every 20s"
echo "   Press Ctrl+C to stop all services"
echo "==================================="

# Wait for either process to exit
wait -n "$MOCK_PID" "$BACKEND_PID" "$DASHBOARD_PID" 2>/dev/null || true
