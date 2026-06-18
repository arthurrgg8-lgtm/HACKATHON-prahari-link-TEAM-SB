# 🚀 Prahari-Link: Seamless Demo & Launch Guide

This guide ensures that the **Prahari-Link** ecosystem (Backend, Dashboard, and Hardware) works perfectly during the Nepal Police Hackathon demo. Follow these steps for a 100% success rate.

---

## 🛠️ Phase 1: The "Fresh Start" Protocol
**Always run this 5 minutes before the demo to clear stale data.**

1. **Stop all active processes:**
   ```bash
   pkill -9 -f "node server.js"
   pkill -9 -f "vite"
   ```

2. **Clear Database & Logs:**
   *(Ensures the map starts empty without old test markers)*
   ```bash
   rm -f backend/prahari_link.db*
   ```

3. **Clear Frontend Cache:**
   *(Prevents UI glitches from old builds)*
   ```bash
   rm -rf dashboard/node_modules/.vite
   ```

---

## 🚀 Phase 2: Launching the Ecosystem

### The "One-Click Fix" (Recommended)
If you want to ensure permissions, network IPs, and tokens are all handled automatically, run:
```bash
./fix_demo.sh
```

### The Standard Script
Alternatively, run the standard demo script:
```bash
./demo.sh
```

---

## 🌐 Phase 4: Network & Portability (Future-Proofing)
If you move the demo to a different machine or router:

1. **IP Detection:** The `fix_demo.sh` script automatically detects your new local IP and binds the dashboard to it. This allows judges to view the dashboard on their own tablets/phones if they are on the same Wi-Fi.
2. **Hardcoded Overrides:** The system avoids hardcoded `localhost` references. It uses `window.location.hostname` as a fallback, ensuring the dashboard can always find the backend even if the IP changes dynamically.
3. **Hardware Port:** If the ESP32 Hub is moved to a different port (e.g., `/dev/ttyUSB1`), update the `SERIAL_PORT_PATH` in `backend/server.js`.

---

## ✅ Phase 3: The "Green Light" Checklist
Before the judges arrive, verify these 3 things:

1. **Serial Link:** Check the terminal output for:
   `Serial port /dev/ttyUSB0 opened`
   *If you see "Permission Denied", run: `sudo chmod 666 /dev/ttyUSB0`*

2. **Dashboard Sync:** Open `http://localhost:5173`. Look at the terminal for:
   `Client connected: ... (operator)`
   *If the dashboard doesn't connect, refresh the page.*

3. **Token Match:** Ensure the tokens match in both environments.
   - **Backend:** `OPERATOR_TOKEN=prahari-operator-demo-2026`
   - **Dashboard:** `.env` or `App.jsx` should use the same token.

---

## ⚠️ Common Demo Killers (Troubleshooting)

### 1. "Dashboard shows no markers after a trigger"
- **Cause:** Token mismatch or CORS block.
- **Fix:** Check if the browser console (F12) shows `401 Unauthorized`. Ensure you are using `prahari-operator-demo-2026` in the Dashboard's socket config.

### 2. "Serial Port Not Available"
- **Cause:** Another app (like Arduino Serial Monitor or another Node instance) is holding the port.
- **Fix:** Close all Arduino IDE windows and run `pkill -9 -f node`.

### 3. "Emergency Alert sounds but Map doesn't zoom"
- **Cause:** Leaflet map container didn't resize correctly.
- **Fix:** Simply click the map once or resize the browser window slightly.

### 4. "Mobile App won't connect to ESP-A"
- **Cause:** ESP32 is still paired with a previous phone.
- **Fix:** Press the **EN/RESET** button on the ESP32 (Relay Node) and toggle Bluetooth on the phone.

---

## 🧪 Demo Test Script (To verify logic)

To simulate a hardware trigger without the ESP32 (if radio fails):
```bash
curl -X POST -H "Content-Type: application/json" \
     -H "x-prahari-token: prahari-ingest-demo-2026" \
     -d '{"nodeID":"VILLAGE_01","category":"MEDICAL","coords":[27.7,85.3],"citizenName":"Demo Test"}' \
     http://localhost:3001/api/trigger
```

**Expected Result:**
1. Dashboard sounds a **Siren**.
2. A **Red Pulsating Marker** appears near Kathmandu.
3. The **"Regional Alert Orchestration"** panel slides out.

---
*Developed for Team Special Bandits - Nepal Police Hackathon 2026*
