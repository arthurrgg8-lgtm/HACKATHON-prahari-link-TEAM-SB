# Prahari-Link Project Mandates

This file contains foundational mandates for the Prahari-Link project, ensuring a zero-error state for the Nepal Police Hackathon demonstration.

## 🛠️ Zero-Error Launch Protocol
- **Restart Strategy:** Always use `./fix_demo.sh` to restart the system. This script handles process cleanup, database reset, serial port permissions, and network auto-detection.
- **Hardware First:** If hardware issues are reported, prioritize checking the `/dev/ttyUSB0` serial link.
- **Port Permissions:** Ensure `chmod 666 /dev/ttyUSB0` is executed (handled by `fix_demo.sh`).

## 🚓 Demo Tokens
- **Operator Token:** `prahari-operator-demo-2026`
- **Ingest Token:** `prahari-ingest-demo-2026`

## 🌐 Network Configuration
- The system auto-detects the local IP.
- Backend runs on port `3001`.
- Dashboard runs on port `5173`.

## ⚠️ Known Fixes
- **Map Resize:** If the Leaflet map doesn't display correctly, the `MapResizer` component should handle it via `ResizeObserver`. If it fails, a simple window resize or map click is the manual fallback.
- **Siren Suppression:** Sending `ACK:{nodeID}` or `RESOLVED:{nodeID}` via serial suppresses the physical siren on the ESP32.

## 🧪 Simulation
- Use `node backend/mock_injector.js` to simulate incidents if hardware (ESP32) is not available or radio signals are weak in the demo area.
