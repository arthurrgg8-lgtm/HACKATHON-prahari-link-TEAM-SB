#!/usr/bin/env bash
# ==============================================================================
# 🚓 Prahari-Link: Ultimate Demo Resilience Script (FIX-ALL)
# 
# Use this script if anything goes wrong. It handles:
# 1. Process cleanup
# 2. Database reset
# 3. Serial port permissions
# 4. Network IP auto-detection
# 5. Token verification
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

echo "------------------------------------------------"
echo "🔍 Phase 1: Cleaning Environment..."
echo "------------------------------------------------"
pkill -9 -f "node server.js" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
rm -f "$BACKEND_DIR/prahari_link.db"*
echo "✅ Processes killed and database wiped."

echo "------------------------------------------------"
echo "🔌 Phase 2: Hardware Check..."
echo "------------------------------------------------"
SERIAL_PORT="/dev/ttyUSB0"
if [ -e "$SERIAL_PORT" ]; then
    echo "✅ Found ESP32 Hub at $SERIAL_PORT"
    chmod 666 "$SERIAL_PORT" 2>/dev/null || true
    echo "✅ Permissions fixed for $SERIAL_PORT"
else
    echo "⚠️  WARNING: ESP32 Hub NOT detected at $SERIAL_PORT"
    echo "   Ensure the Hub is plugged in. Proceeding with software-only mode."
fi

echo "------------------------------------------------"
echo "🌐 Phase 3: Network Detection..."
echo "------------------------------------------------"
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "✅ Your Local IP is: $LOCAL_IP"
echo "   Dashboard: http://$LOCAL_IP:5173"
echo "   Backend:   http://$LOCAL_IP:3001"

echo "------------------------------------------------"
echo "🚀 Phase 4: Launching Fresh Services..."
echo "------------------------------------------------"

# Start Backend in background
cd "$BACKEND_DIR"
export OPERATOR_TOKEN="prahari-operator-demo-2026"
export INGEST_TOKEN="prahari-ingest-demo-2026"
node server.js > server_stdout.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"

# Start Dashboard in background
cd "$DASHBOARD_DIR"
export VITE_OPERATOR_TOKEN="prahari-operator-demo-2026"
# Use --host so it's accessible via IP
npx vite --host 0.0.0.0 --force > vite_stdout.log 2>&1 &
DASHBOARD_PID=$!
echo "✅ Dashboard started (PID: $DASHBOARD_PID)"

echo "------------------------------------------------"
echo "✨ SYSTEM IS READY FOR DEMO!"
echo "------------------------------------------------"
echo "Dashboard URL: http://$LOCAL_IP:5173"
echo "API Health:    http://$LOCAL_IP:3001/api/health"
echo ""
echo "Monitor logs with: tail -f backend/server_stdout.log"
echo "Press Ctrl+C to stop all services (Trap active)."

# Cleanup on exit
trap "kill $BACKEND_PID $DASHBOARD_PID 2>/dev/null; echo 'Services stopped.'; exit" INT TERM
wait
