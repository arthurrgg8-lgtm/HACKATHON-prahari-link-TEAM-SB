#!/usr/bin/env bash
# ==============================================================================
# 🚓 Prahari-Link: Detached Launch Script for AI Agent
# ==============================================================================
set -e

SCRIPT_DIR="/home/lazzy/Desktop/Prahari_Link_Hackathon"
BACKEND_DIR="$SCRIPT_DIR/backend"
DASHBOARD_DIR="$SCRIPT_DIR/dashboard"

echo "🧹 Cleaning up old processes and database..."
pkill -9 -f "node server.js" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
rm -f "$BACKEND_DIR/prahari_link.db"*

echo "🔌 Configuring serial port..."
SERIAL_PORT="/dev/ttyUSB0"
if [ -e "$SERIAL_PORT" ]; then
    chmod 666 "$SERIAL_PORT" 2>/dev/null || true
fi

echo "🌐 Detecting local IP..."
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo "Detected IP: $LOCAL_IP"

echo "🚀 Starting Backend (Port 3001)..."
cd "$BACKEND_DIR"
export OPERATOR_TOKEN="prahari-operator-demo-2026"
export INGEST_TOKEN="prahari-ingest-demo-2026"
nohup node server.js > server_stdout.log 2>&1 &

echo "🚀 Starting Dashboard (Port 5173)..."
cd "$DASHBOARD_DIR"
export VITE_BACKEND_URL="http://$LOCAL_IP:3001"
export VITE_OPERATOR_TOKEN="prahari-operator-demo-2026"
nohup npx vite --host 0.0.0.0 --force > vite_stdout.log 2>&1 &

echo "🎉 Services successfully launched in the background!"
echo "Dashboard: http://$LOCAL_IP:5173"
echo "Backend:   http://$LOCAL_IP:3001"
