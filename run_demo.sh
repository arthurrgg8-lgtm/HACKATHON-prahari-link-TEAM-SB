#!/usr/bin/env bash
# ==============================================================================
# 🚓 Prahari-Link: Unified Demo & Launch Script
# 
# This script handles:
# 1. Cleaning up active processes (Node, Vite)
# 2. Resetting Vite cache & cleaning DB for a fresh start
# 3. Configures local IP address auto-detection
# 4. Sets port permissions for /dev/ttyUSB0
# 5. Boots Backend + Dashboard and streams backend logs in real-time
# 6. Cleans up all background processes on Ctrl+C (SIGINT/SIGTERM)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

echo "------------------------------------------------"
echo "🔍 Phase 1: Wiping Cache & Fresh Reset..."
echo "------------------------------------------------"
pkill -9 -f "node server.js" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
pkill -9 -f "node mock_injector.js" 2>/dev/null || true

# Free ports explicitly to avoid EADDRINUSE errors
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true

# Reset database & logs
rm -f "$BACKEND_DIR/prahari_link.db"*
rm -f "$BACKEND_DIR/server_stdout.log"
rm -f "$DASHBOARD_DIR/vite_stdout.log"

# Wipe Vite development cache
rm -rf "$DASHBOARD_DIR/node_modules/.vite"
echo "✅ Old processes killed, ports freed, DB wiped, and Vite cache cleaned."

echo "------------------------------------------------"
echo "🔌 Phase 2: Serial Hub Check..."
echo "------------------------------------------------"
SERIAL_PORT="/dev/ttyUSB0"
if [ -e "$SERIAL_PORT" ]; then
    echo "✅ Found CP2102 Serial Hub at $SERIAL_PORT"
    # Try setting permissions. If not permitted, alert user but proceed 
    # since they are likely already in the 'dialout' group.
    chmod 666 "$SERIAL_PORT" 2>/dev/null || echo "ℹ️  Using existing dialout group permissions for $SERIAL_PORT"
else
    echo "⚠️  WARNING: Serial Hub not found at $SERIAL_PORT"
    echo "   Ensure the Police Hub ESP-B is connected."
fi

echo "------------------------------------------------"
echo "🌐 Phase 3: Auto-Detecting Network IP..."
echo "------------------------------------------------"
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="localhost"
fi
echo "✅ Active IP: $LOCAL_IP"

echo "------------------------------------------------"
echo "🚀 Phase 4: Launching Services..."
echo "------------------------------------------------"

# Set tokens & VITE backend configurations
export OPERATOR_TOKEN="prahari-operator-demo-2026"
export INGEST_TOKEN="prahari-ingest-demo-2026"
export VITE_OPERATOR_TOKEN="prahari-operator-demo-2026"
export VITE_BACKEND_URL="http://$LOCAL_IP:3001"
export TELEGRAM_BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
# Leave TELEGRAM_CHAT_ID empty to auto-detect the user's chat ID (just send a /start message to the bot first), or fill your custom chat ID here.
export TELEGRAM_CHAT_ID=""

# TELEGRAM BLOCKED WORKAROUND (e.g. on Venue Wi-Fi):
# If api.telegram.org is blocked, you can:
# 1. Switch your laptop Wi-Fi to your mobile data hotspot (e.g. Ncell/NTC) which does NOT block Telegram.
# 2. Or, set up a custom Cloudflare Worker proxy and export the URL here (e.g. "https://my-proxy.workers.dev"):
export TELEGRAM_API_BASE_URL="https://plink.anuditkhatri2011.workers.dev"

# Load local .env overrides from backend/.env if present (ignored by Git)
if [ -f "$BACKEND_DIR/.env" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ ! "$line" =~ ^# ]] && [[ ! -z "$line" ]]; then
            key=$(echo "$line" | cut -d '=' -f 1)
            val=$(echo "$line" | cut -d '=' -f 2-)
            # Strip surrounding double or single quotes
            val="${val%\"}"
            val="${val#\"}"
            val="${val%\'}"
            val="${val#\'}"
            export "$key=$val"
        fi
    done < "$BACKEND_DIR/.env"
fi

# Start Backend in background
cd "$BACKEND_DIR"
node server.js > "$BACKEND_DIR/server_stdout.log" 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID) -> http://$LOCAL_IP:3001"

# Start Dashboard in background
cd "$DASHBOARD_DIR"
npx vite --host 0.0.0.0 --force > "$DASHBOARD_DIR/vite_stdout.log" 2>&1 &
DASHBOARD_PID=$!
echo "✅ Dashboard started (PID: $DASHBOARD_PID) -> http://$LOCAL_IP:5173"

# Setup trap to terminate child processes when stopping the script
cleanup() {
    # Reset trap to prevent infinite recursion
    trap - INT TERM EXIT
    echo ""
    echo "------------------------------------------------"
    echo "🛑 Shutting down Prahari-Link services..."
    echo "------------------------------------------------"
    kill "$BACKEND_PID" "$DASHBOARD_PID" "$TAIL_PID" 2>/dev/null || true
    kill 0 2>/dev/null || true
    echo "✅ Stopped Node.js, Vite, and tail processes."
    exit 0
}
trap cleanup INT TERM EXIT

echo ""
echo "================================================="
echo "   🎉 PRAHARI-LINK SYSTEM READY FOR DEMO!"
echo "================================================="
echo "   Dashboard: http://$LOCAL_IP:5173"
echo "   Backend:   http://$LOCAL_IP:3001"
echo "================================================="
echo "Streaming backend logs below (Press Ctrl+C to exit):"
echo ""

# Tail the backend log to print active alerts and heartbeats
sleep 1.5
tail -f "$BACKEND_DIR/server_stdout.log" &
TAIL_PID=$!

wait
