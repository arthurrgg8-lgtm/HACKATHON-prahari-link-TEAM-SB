# Prahari-Link (प्रहरी-Link): Full Project Context & Technical Archive

## 1. Project Identity
- **Name:** Prahari-Link (Police Link)
- **Theme:** Nepal Police Hackathon 2026 - Public Safety & Emergency Systems.
- **Mission:** Bridging the "Connectivity Gap" in rural Nepal using zero-infrastructure IoT relays.

---

## 2. Problem & Research Context
- **Police-to-Citizen Ratio:** 1:393 (UN Standard is 1:220).
- **Core Challenge:** 48% increase in crime reports, high suicide/drug rates, and "dead zones" where cellular/4G data is unavailable.
- **Redundancy Audit:** Avoids duplicating existing cellular-dependent systems (100/102/104) by creating a private, resilient radio-based network.

---

## 3. Technical Architecture (The "Relay" Principle)
The system operates on a **Human-in-the-Loop** and **Zero-Infrastructure** model.

### A. System Architecture Flowchart (The "Mental Map")
```mermaid
[ CITIZEN / RESPONDER ]
       |
       | (1) Trigger SOS via
       |     React Native APK
       v
[ MOBILE SMARTPHONE ]
       |
       | (2) Bluetooth Serial (RFCOMM)
       |     Pair with "Prahari-Link-V1"
       v
[ ESP-A: VILLAGE RELAY ] <--- "The Double Agent"
       |
       | (3) ESP-NOW Radio (Layer 2)
       |     Zero-Infrastructure Link
       v
[ ESP-B: POLICE HUB ]    <--- "The Translation Hub"
       |
       | (4) Serial / USB Cable
       |     JSON Data Bridge at 115200 baud
       v
[ LAPTOP: NODE.JS SERVER ]
       |
       | (5) WebSockets (Socket.io)
       |     Real-Time Pulse
       v
[ REACT DASHBOARD ]      <--- "The Command Center"
       |
       | (6) Map Turns RED + Siren Sounds
       |     Officer clicks ACKNOWLEDGE
       v
[ CLOSED-LOOP FEEDBACK ]
       |
       | (7) ACK: Dashboard → WebSocket → Backend → USB → ESP-B → ESP-NOW → ESP-A
       | (8) ESP-A → Green LED ON + Bluetooth Serial → Phone shows "Help is coming!"
       v
[ VICTIM CONFIRMATION ]
```

### B. The Complete "Chain of Custody" (Forward Path)
1. **The Handshake (App → ESP-A):** Uses Bluetooth Serial (RFCOMM) to bridge the smartphone and the village node. The phone sends `SOS:lat,lon` via Bluetooth.
2. **The Relay (ESP-A → ESP-B):** Uses ESP-NOW (Layer 2 protocol) to broadcast structured C-struct packets (nodeID, type, lat, lon, status) to the Police Hub.
3. **The Translation (ESP-B → Backend):** ESP-B receives ESP-NOW packets, converts to JSON, and sends via USB Serial at 115200 baud to the host laptop.
4. **The Visualization (Backend → Dashboard):** Node.js reads the Serial port and emits `new_incident` WebSocket events to the React UI for real-time map updates, sirens, and alerts.

### C. The Closed-Loop Feedback (Reverse Path)
5. **Police Action:** Officer clicks "Acknowledge" on the React Dashboard for a specific nodeID.
6. **Signal Downstream:** Dashboard → WebSocket `acknowledge_incident` → Backend → Enriched serial command via USB Serial → ESP-B.
7. **Radio Relay:** ESP-B parses the enhanced `ACK:` command with pipe-delimited fields and sends a **92-byte struct** (nodeID, commander, personnel, vehicle, eta) via ESP-NOW back to ESP-A.
8. **Victim Confirmation:** ESP-A receives the dispatch struct, lights Green LED, **and sends `ACK:NODE_A|DSP Sharma|5|Mahindra Bolero|On the way` over Bluetooth Serial** to the phone. The APK shows a rich dispatch card overlay: 🚓 Commander, 👥 Personnel, 🚙 Vehicle, ⏱ ETA.
9. **BLE Volunteer Broadcast:** Simultaneously, ESP-A broadcasts a BLE advertisement containing compressed alert data (`P|A|LS|27.6945,83.4457`) for 60 seconds. Nearby phones running Prahari-Link in Volunteer mode detect the beacon and show an SOS notification with signal strength and incident details.

### D. "Double Logic" Roles (Internal Workings)
- **ESP-A (The Double Agent):**
    - *Logic 1 (Inbound):* Active Bluetooth Server (`Prahari-Link-V1`) listening for authenticated responder triggers (`SOS:lat,lon`).
    - *Logic 2 (Outbound):* Active ESP-NOW Sender that packages Bluetooth strings into structured C-structs for radio transmission.
    - *Logic 3 (Feedback):* Listens for ACK **dispatch structs** from ESP-B via ESP-NOW. On receipt: parses commander/personnel/vehicle/eta, turns Green LED HIGH **and** sends enriched `ACK:NODE_A|Commander|5|Vehicle|ETA` back to the phone via Bluetooth Serial.
    - *Logic 4 (BLE Volunteer Broadcast):* After triggering an SOS, broadcasts a BLE advertisement (`PRAHARI-ALERT` beacon) with compressed incident data (`nodeID, category, GPS`) for 60 seconds. Runs BLE simultaneously with Classic Bluetooth and ESP-NOW.
- **ESP-B (The Translation Hub):**
    - *Logic 1 (Inbound):* ESP-NOW Receiver listening for specific Node IDs from the field.
    - *Logic 2 (Outbound):* Serial Data Bridge converting binary radio packets into JSON strings for the Dashboard.
    - *Logic 3 (Reverse):* Reads enhanced `ACK:nodeID|commander|personnel|vehicle|eta` commands from USB Serial and sends a **92-byte dispatch struct** back to ESP-A via ESP-NOW (was 1-byte `ackVal`).

### E. The Full Closed-Loop State Machine
```
IDLE → SOS Received (Red LED flash 500ms) → ESP-NOW Send → Dashboard Alert
  → BLE Broadcast (60s) → Nearby volunteers notified via app
  → Officer ACK with Dispatch → ESP-B relays dispatch struct → ESP-A Receives
  → Green LED ON + Bluetooth "ACK:NODE_A|Commander|5|Vehicle|ETA" → Phone Alert
  → Phone shows dispatch details (who, how many, vehicle, ETA)
  → Back to IDLE — BLE broadcast expires after 60s
```

### F. Security Model & Reliability Logic
- **Verified Access:** The mobile app is restricted to "Verified Responsible Persons" (Ward Members/Teachers) to ensure alert integrity and prevent spam.
- **Production Vision:** Hardware uses **LoRa (Long Range Radio)** for 10-15km coverage. Demo uses **ESP-NOW** for P2P simulation.
- **OWASP Top 10 Hardening (Mission Achievement):**
    - **A03: Injection (Strict Input Validation):** Hardened the backend `validateIncident` logic with strict type checking (`typeof === 'string'`) to prevent length-bypass attacks via object/array payloads.
    - **A05: Security Misconfiguration (Hardened Headers):** Implemented security middleware providing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Strict-Transport-Security`.
    - **A05: Security Misconfiguration (Rate Limiting):** Added a lightweight, in-memory rate limiter to the `/api/trigger` endpoint (30 requests/min per IP) to prevent automated DoS during demonstrations.
    - **A07: Identification Failures (Timing-Safe Auth):** Upgraded all HTTP and WebSocket token validation to use `crypto.timingSafeEqual()`, protecting against timing-based side-channel attacks on `OPERATOR_TOKEN` and `INGEST_TOKEN`.
- **Reliability: 5-Minute Auto-Escalation:**
    - Implemented a server-side "Dead Man's Switch." If an incident is not acknowledged by a human operator within 300 seconds (5 minutes), the server automatically escalates the alert and sends a high-priority **Telegram notification** to superior officers.
    - Dashboard integrated with a live, real-time countdown timer for each active incident, providing visual cues for critical response windows.

---

## 4. Hardware Specification (Verified Kit)
- **ESP-A (Village Relay):** ESP32 [Port: `/dev/ttyUSB0` | MAC: `68:09:47:48:65:fc`]. Handles Bluetooth trigger + ESP-NOW broadcast + Bluetooth ACK feedback to phone.
- **ESP-B (Police Hub):** ESP32 [Port: `/dev/ttyUSB1` | MAC: `68:09:47:48:41:c0`]. Receives Radio packets + talks to Dashboard via Serial + relays ACK back to ESP-A.
- **Power:** Micro-USB cables connected to Laptop/Power Bank.
- **Input:** Smartphone (React Native App) → Bluetooth → ESP-A → ESP-NOW → ESP-B → USB → Laptop.
- **Current Connection:** ESP-B on `/dev/ttyUSB0` (flashed and ready). ESP-A disconnected from USB (runs on battery/power bank for field demo).

---

## 5. Software Stack (The "Brain")
- **Dashboard:** React + Vite 4.5, Tailwind CSS 3.3, Leaflet.js 1.9 (dark CartoDB tiles), Lucide React icons, Socket.io-client.
- **Backend:** Node.js, Express, `serialport` 10.5, `socket.io` 4.6, CORS enabled.
- **Firmware:** C++ (Arduino CLI / Arduino IDE) using `esp_now.h` and `BluetoothSerial.h` on ESP32.
- **Mobile App:** React Native 0.71 with Expo 48 (bare workflow). Libraries: `react-native-bluetooth-serial-next`, `react-native-ble-plx` (volunteer BLE scanning), `expo-location`, `react-native-vision-camera@3.9.2`, `@react-native-ml-kit/face-detection@2.0.1`, `react-native-worklets-core`.

---

## 6. Dashboard Features (Police Command Center)

### A. Live Map
- Dark-mode Leaflet map using CartoDB dark tiles.
- 4 static node markers (NODE_A through NODE_C + CMD_CTRL Police Command) with new GPS coordinates.
- **Blue marker (idleIcon):** Village module in standby — no active incident.
- **Red pulsing marker (sosIcon):** Active incident — alert received, waiting for acknowledgment.
- **Green marker (ackIcon):** Incident acknowledged by police.
- **Coverage overlay**: Color-coded 180m radius coverage circles per node (NODE_A🔴, NODE_B🔵, NODE_C🟢, CMD_CTRL🟣) with animated pulse
- **Communication mesh lines**: Dashed polylines between all nodes showing ESP-NOW radio links, animated flowing dots on active connections
- Auto-fits all village nodes on load via `MapBoundsFitter`.
- Map flies to latest incident location on new alert.
- Auto-resize observer for container size changes.

### B. Sidebar
- **Village Modules dropdown:** Collapsible list of all 4 node modules (NODE_A, NODE_B, NODE_C, CMD_CTRL) with real-time status (STANDBY / 🚨 ALERT ACTIVE), WiFi indicator, and GPS coordinates.
- **Active Incidents feed:** Scrolling list of incoming incidents with type badges (SOS/red, FIRE/orange, RISK/yellow, MISSING/yellow), timestamp, and ACKNOWLEDGE button.

### C. Alerts & Sirens
- **Persistent red alert banner** with glow shadow and bell animations — stays until all incidents acknowledged
- **Full-screen SOS alert overlay** — semi-transparent red overlay blinking at 0.5s intervals
- **Red animated border pulse** on entire dashboard container when SOS is active (0.8s pulse cycle)
- **Continuous woop-woop siren** via Web Audio API (sawtooth oscillator alternating 600Hz↔1200Hz every 250ms) — plays until all incidents acknowledged
- Instruction banner: "Acknowledge the incident to silence the alarm"
- Live status indicator: "LIVE" with green pulsing dot + "ESP-B" label.

### H. Node Health Monitoring
- Live heartbeat tracking for all 4 nodes (NODE_A, NODE_B, NODE_C, CMD_CTRL)
- Thresholds: 🟢 Online (<30s), 🟡 Warning (30-60s), 🔴 Offline (>60s)
- Each module card shows: health dot, status label with "Xs ago", battery bar, solar indicator
- Heartbeat data comes from mock injector (20s interval) and real incidents

### I. Alert Priority Queue
- Active incidents sorted by severity (CRITICAL → HIGH → MEDIUM), then earliest first
- Queue position badges on incident cards: 🔴 `#1 of 3`, 🟠 `#2 of 3`, 🟡 `#3+ of 3`
- Only shown when more than 1 active incident exists

### J. FIR Reference Linkage
- Input field on dispatched/escalated incident cards for entering FIR number
- Submit button persists to SQLite and marks incident as `resolved`
- Resolved cards show green box with FIR number

### K. NDRRMA / Army Escalation
- Purple button on dispatched/escalated CRITICAL incidents (Landslide, Flood, Earthquake)
- Confirmation modal with incident summary and mandatory officer checkbox
- Generates CSV with 19 fields + downloads locally
- Opens Gmail compose with pre-filled recipients: `ndrrma@gmail.com, dte-dpr@nepalarmy.mil.np`
- Subject: `[PRARAHI-LINK] NDRRMA Escalation — NODE_A — LANDSLIDE`
- Body includes full incident summary with instruction to attach the downloaded CSV
- Once escalated, shows `✅ Escalated to NDRRMA` badge

### L. GPS Coordinates → Google Maps
- All GPS coordinate displays on the dashboard are clickable
- Clicking any 📍 coordinate opens Google Maps at that exact location
- 5 clickable locations: sidebar module cards, map popups (static + dynamic), bottom-left bar, NDRRMA modal
- Uses `window.open` with `https://www.google.com/maps?q=lat,lon`

### M. Training Mode Toggle
- Orange-bordered training mode with 4px border + inset shadow around the entire dashboard
- Toggle button in header: `🧪 Training Mode` with orange glow when active
- Server-side `trainingMode` state — toggled via `toggle_training_mode` socket event
- Incidents routed to separate `trainings` SQLite table (not live alerts table)
- 🧪 TRAINING badge on all incident cards when training mode is active
- Export training CSV + clear training data buttons visible in sidebar during training mode
- Optimistic toggle: UI updates immediately, server confirms via `training_mode_state` broadcast
- Clearing training data also removes training-tagged incidents from the dashboard UI

### N. Volunteer BLE Broadcast Badge
- All active incidents show a `📡 BLE Broadcast — Notifying nearby volunteers` badge with green color and pulse animation
- Indicates ESP-A is broadcasting a BLE advertisement beacon for nearby phones in Volunteer mode
- Badge disappears when incident is acknowledged (BLE broadcast stops after 60s)

### P. Community Volunteer Network Panel (Dashboard)
- Live sidebar panel between Beat Officer and Training panels showing simulated BLE volunteer alerts
- Activates automatically when a new incident arrives — generates 3-5 volunteers per incident
- 12-name pool: 'Rajesh Gurung', 'Anita Thapa', 'Bishnu Rai', 'Sunita Sharma', etc.
- Random distances (40-500m) to simulate nearby villagers
- **Auto-progressing statuses**: 🔔 Notified (0s) → 🚶 Responding (5s) → 📍 Arrived (15s)
- Color-coded status labels: yellow (notified), blue (responding), green (arrived)
- Per-incident arrival count badge: `3/5` shows how many volunteers have reached
- BLE broadcast coordinates indicator at bottom of each volunteer group
- Timer cleanup in all 3 paths: clearAll, all_incidents_cleared, unmount
- EN + ने translations for all labels and statuses
- Total notified count badge on panel header with pulse animation

### O. Enhanced Victim ACK with Dispatch Details
- When officer submits dispatch form, dispatch details (commander, personnel, vehicle, ETA) travel back through the full radio chain
- Backend embeds dispatch info in serial command: `ACK:NODE_A|DSP Sharma|5|Mahindra Bolero|On the way\n`
- ESP-B parses pipe-delimited format, sends 92-byte dispatch struct via ESP-NOW (replaced 1-byte `ackVal`)
- ESP-A reads struct, formats rich Bluetooth message, sends to phone
- Phone shows enhanced green overlay with 4-row dispatch card (🚓 Commander, 👥 Personnel, 🚙 Vehicle, ⏱ ETA)
- **Backward compatible**: basic ACK still works if no dispatch details are available

### F. Face Verification Badge
- Shows `🧐 Face 85%` badge on incident cards when face detection is enabled
- Shows `No Face Check` for legacy incidents without liveness
- Green badge for high confidence, yellow for low confidence

### G. Nepali Language Toggle
- Full bilingual UI toggle in the header
- Nepali translations for all labels, alerts, buttons
- Noto Sans Devanagari font for proper rendering
- All escalation timer, dispatch form, and face verification text translated

### Q. Floating Agency Dispatch Coordination Animation
- **Top-Right Map Overlay:** Displays agency dispatch status tracker box overlaying the map screen (`fixed top-16 right-4 z-[9999]`) rather than clogging the active incident cards.
- **Sequential Animation:** Auto-triggers on dispatch, showing a real-time cascading update chain: Hospital Services (🏥) -> Nepal Army Command (🪖) -> Armed Police Force - APF (🛡️) -> Local Volunteers Chain (🤝).
- **Auto-Dismissal:** Uses React state tracking and a `useEffect` timeout to automatically dismiss the coordination box exactly 8 seconds after dispatch.

### R. 2-Tiered Regional Alerting & Geofencing Orchestration
- **Dynamic 15km Geofence Area:** Centered dynamically on the coordinates of any active `CRITICAL` severity incident (Landslide, Flood, Earthquake) in the region.
- **Tier 1 (Wide-Area NTC SMS Broadcast):** Automatically triggers a simulated NTC SMS Cell Broadcast to all cellular devices inside the 15km warning radius, visualized on the Leaflet map as an animated, pulsating red warning wave.
- **Tier 2 (Strategic Command Escalation):** Automatically initializes the NDRRMA/Army Escalation console panel overlay, displaying geofence impact statistics and enabling immediate dispatch of emergency data packets and CSV reports to district commands.

### D. Cached Village Module Coordinates
| ID | Name | Latitude | Longitude |
|----|------|----------|-----------|
| NODE_A | Node A Village Relay | 27.694532479739998 | 83.4456506797053 |
| NODE_B | Node B Village Relay | 27.686999227671 | 83.44392356378827 |
| NODE_C | Node C Village Relay | 27.687735583500398 | 83.45997934509096 |
| CMD_CTRL | Police Command Control | 27.684676842143883 | 83.46752748132091 |

---

## 7. Firmware Specifications

### A. ESP-A (relay_esp_a.ino) — Current Production State
- **Bluetooth:** Server mode, device name `Prahari-Link-V1`.
- **BLE Advertising:** Runs BLE simultaneously with Classic BT. Broadcasts `PRAHARI-ALERT` beacon with compressed payload (`P|A|LS|27.6945,83.4457`) for 60s after each SOS trigger. Manufacturer data only (fits 31-byte BLE advert limit). Uses `BLEDevice.h`.
- **ESP-NOW:** Sends structured packets to ESP-B MAC `68:09:47:48:41:C0`. Receives 92-byte ACK dispatch structs.
- **OnDataRecv (ACK Handler):** v3 — reads `struct_ack` (nodeID[10], commander[30], personnel, vehicle[30], eta[20], hasDetails). Formats rich BT message: `ACK:NODE_A|DSP Sharma|5|Mahindra Bolero|On the way`. Falls back to legacy `ACK:HELP_ON_THE_WAY` for single-byte ACKs.
- **loop():**
  - Reads Bluetooth data from phone.
  - **Pipe format parsing** (supports 8-pipe, 7-pipe, 6-pipe, and 5-pipe):
    - New 8-pipe: `TYPE|lat|lon|cat|note|FACE|conf|citizenName|battery_pct`
    - 7-pipe: `TYPE|lat|lon|cat|note|FACE|conf|citizenName` (no battery, backward compatible)
    - 6-pipe: `TYPE|lat|lon|cat|note|FACE|conf` (no name)
    - Old 5-pipe: `TYPE|lat|lon|note|FACE|conf` (backward compatible)
    - Basic format: `TYPE:lat,lon` (legacy)
  - 30-second rate limiting via `millis()` cooldown.
  - Sets `nodeID = "NODE_A"`, parses type, category, note, ai_detected, ai_confidence, and citizenName from pipe fields.
  - Sends ESP-NOW packet with full struct (182 bytes, under 250B ESP-NOW limit).
  - Non-blocking LED timer keeps LED_RED (pin 2) on for 500ms using `millis()`.
  - Auto-stops BLE advertising after 60s timeout.
- **Struct fields:** `nodeID`, `type`, `category`, `citizenName[30]`, `ai_detected`, `note`, `lat`, `lon`, `status`, `battery_pct`, `solar_ok`, `ai_confidence`
- **ACK Struct fields:** `nodeID[10]`, `commander[30]`, `personnel`, `vehicle[30]`, `eta[20]`, `hasDetails` (92 bytes total)
- **Known Issue:** Requires `PartitionScheme=huge_app` when compiling due to Bluetooth + ESP-NOW + BLE libraries exceeding 1.3MB. Standard ESP32 partition only has 1,310,720 bytes; sketch uses ~1.9MB now with BLE.
- **Compilation:** `arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app`

### B. ESP-B (hub_esp_b.ino) — Current Production State
- **ESP-NOW:** Listens for packets; converts C-struct to JSON and prints via Serial. JSON output includes `citizenName` field.
- **Serial:** 115200 baud. Reads incoming `ACK:nodeID|commander|personnel|vehicle|eta` commands from laptop. Parses pipe-delimited fields via `parseAndSendACK()`.
- **ACK Dispatch Struct:** New `struct_ack` (nodeID[10], commander[30], personnel uint8_t, vehicle[30], eta[20], hasDetails uint8_t = 92 bytes). Sends full struct via ESP-NOW back to ESP-A MAC `68:09:47:48:65:FC`.
- **Struct:** Matches ESP-A exactly — `citizenName[30]` replaces the old `responderID[8]` field.
- **Backward compatible:** Basic `ACK:NODE_A` (no pipes) still works — sends struct with `hasDetails = 0`.

---

## 8. Backend (server.js) — Current State
- **Port:** 3001
- **Serial:** Opens `/dev/ttyUSB0` at 115200 baud with `ReadlineParser` (`\r\n` delimiter).
- **Forward:** Parses incoming JSON from ESP-B and emits `new_incident` via Socket.io with timestamp.
- **Reverse ACK:** Listens for `acknowledge_incident` from dashboard. When dispatch info (commander, personnel, etc.) is present, embeds it in serial command: `ACK:NODE_A|Commander|5|Vehicle|On the way\n`. Falls back to basic `ACK:nodeID\n` for simple acknowledgements.
- **CORS:** Wildcard enabled (`origin: "*"`).
- **Node Heartbeat Tracking:** `nodeHeartbeats` Map tracks last-seen per node. `updateNodeHeartbeat()` and `getNodeStatuses()` functions. `/api/nodes/status` endpoint returns statuses. 10s broadcast of `node_status` to all dashboards. 30s → warning, 60s → offline.
- **FIR Reference:** `update_fir` socket handler validates and persists FIR numbers to SQLite. Broadcasts `incident_updated` with status `resolved`.
- **Mock Injector:** `mock_injector.js` cycles through 4 mock incidents (NODE_A/B/C + CMD_CTRL) every 10s. Also sends HEARTBEAT packets for all 4 nodes every 20s to keep nodes showing as online in the dashboard.
- **Training Mode:** `trainingMode` boolean state. `toggle_training_mode` toggles state and broadcasts to all dashboards. `training_mode_state` event sent on connect. Incidents route to `trainings` table when training mode is active. `clear_training_data` socket handler clears training DB. `/api/training/export/csv` endpoint.

---

## 9. Recent Dev Session Changes (June 11, 2026)

### Session Summary — Citizen Name + Database/Battery/APK v4

Completed SQLite database with CSV export, battery simulation with health bar display, and the **Citizen Name** feature — the citizen types their name before sending SOS, and it travels through the full radio chain to appear on the dashboard as `👤 Reported by: Ram Sharma`.

### Phase 1.1 — 8-Category Grid (Mobile App)
| Change | Details |
|--------|---------|
| **LANDSLIDE** 🔴 | CRITICAL severity, red badge |
| **FLOOD** 🔴 | CRITICAL severity, blue badge |
| **EARTHQUAKE** 🔴 | CRITICAL severity, red badge |
| **CRIME** 🟠 | HIGH severity, orange badge |
| **MEDICAL** 🟠 | HIGH severity, red badge |
| **FIRE** 🟠 | HIGH severity, orange badge |
| **MISSING** 🟡 | MEDIUM severity, yellow badge |
| **DISTURBANCE** 🟡 | MEDIUM severity, yellow badge |

### Phase 1.2 — 3-Second Countdown + Cancel
After face verification → 3-second countdown appears with cancel button → prevents accidental triggers before SOS fires.

### Phase 1.4 — Dispatch Form + 5-Minute Escalation Timer
- ACK opens a mandatory dispatch modal (commander name, personnel count, equipment checklist, vehicle, notes)
- **5-minute countdown timer** in the modal with progress bar
- Timer colors: blue (>2min) → yellow (<2min) → **red pulsing** (<1min — "TIME CRITICAL")
- On timeout → incident marked as `ESCALATED` with orange warning banner
- Re-dispatch button available on escalated incidents

### Face Liveness Detection (Anti-Spam Layer 1)
The old `FAKE|0` placeholder in the pipe format is now replaced with real MLKit face detection:

| Component | Change |
|-----------|--------|
| `mobile_app/LivenessCamera.js` | **NEW** — Front camera screen with MLKit face detection + blink scoring |
| `mobile_app/App.js` | Integrated liveness gate: category → face check → countdown → SOS |
| `mobile_app/package.json` | Added `react-native-vision-camera@3.9.2`, `@react-native-ml-kit/face-detection`, `react-native-worklets-core` |
| `dashboard/src/App.jsx` | Added face verification badge (`🧐 Face 85%`) on incident cards |

**Flow:** Select category → Front camera opens → MLKit detects face + blink → 3 attempts → On success: **3s countdown** → SOS fires with `FACE|confidence` → On failure: "Access Denied — Real person required"

**Blink Liveness Score Formula:**
```
score = (avgEyeOpen * 0.6) + (faceSizeRatio * 0.4)
avgEyeOpen = (leftEyeOpenProbability + rightEyeOpenProbability) / 2
confidence = clamp(score, 40, 99)
```

### Pipe Format Evolution
```
v1 (old):  SOS|27.71|85.32|help|FAKE|0
v2 (cat):  SOS|27.71|85.32|FIRE|help|FACE|85
v3 (name): SOS|27.71|85.32|FIRE|help|FACE|85|Ram Sharma
```

### Complete File Changes Since June 8

| File | Change |
|------|--------|
| `mobile_app/App.js` | **REWRITTEN** — 8-category grid, 5-second countdown, Nepali/English toggle, user note, pipe format with category, face liveness integration, citizen name input |
| `mobile_app/LivenessCamera.js` | **CREATED** — Front camera + MLKit face detection + blink scoring + 3-attempt retry |
| `dashboard/src/App.jsx` | **REWRITTEN** — CATEGORY_CONFIG with colors/emoji/severity, ACK dispatch form modal, dispatch info display, 5-min escalation timer with progress bar, Nepali/English translations, face verification badge, Devanagari font, battery health bar, citizen name display, CSV export button |
| `dashboard/index.html` | **UPDATED** — Added Noto Sans Devanagari Google Font import |
| `backend/server.js` | **UPDATED** — ACK handler accepts both string and object format, DB logging for incidents/ACKs/escalations, CSV/report endpoints, mock injector socket handler |
| `backend/database.js` | **CREATED** — SQLite schema (alerts + dispatches tables), CRUD ops (logIncident, acknowledgeIncident, escalateIncident, exportCSV, monthlyReport), `citizen_name` column |
| `backend/mock_injector.js` | **UPDATED** — Mock incidents include `citizenName`, `battery_pct`, `solar_ok` fields with realistic data |
| `firmware/production/relay_esp_a/relay_esp_a.ino` | **UPDATED** — 7-pipe format parsing with backward compat (v3: `TYPE|lat|lon|cat|note|FACE|conf|name`, v2: 6-pipe, v1: 5-pipe). `responderID` renamed to `citizenName[30]`. Battery simulation (drain, solar recharge, SOS boost). |
| `firmware/production/hub_esp_b/hub_esp_b.ino` | **UPDATED** — Struct field renamed to `citizenName`, JSON key updated |
| `backend/package.json` | **UPDATED** — Added `better-sqlite3`, `socket.io-client` |
| `mobile_app/package.json` | **UPDATED** — Added vision-camera, MLKit face detection, worklets-core |

### APK Build History
| Build | Version | Changes | Status |
|-------|---------|---------|--------|
| 1 | Initial debug | ACK listener, Bluetooth, GPS | ✅ Installed |
| 2 | Categories + Nepali | 8-category grid, countdown, Nepali toggle, hex color fix | ✅ Installed |
| 3 | Face Liveness | MLKit face detection, camera, blink scoring | ✅ Installed |
| 4 | Citizen Name | Name input, 7-pipe format with citizen name, battery bars, CSV export | ✅ Installed |
| 5 | Training Mode + Battery APK | Training mode toggle with separate DB table. APK v2 with `expo-battery`, 8-pipe format, battery header display. | ✅ Built v2 |
| 6 | APK v3 Clean Rebuild | Full APK rebuild (41MB). No mobile code changes — training mode is backend/dashboard only. | ✅ Built v3 |

---

## 10. Presentation & Pitch Strategy
- **The "Killer Feature":** The system works with **$0 balance, $0 data, and $0 cellular network**.
- **The Demo Flow:**
    1. Turn off phone internet.
    2. Press SOS on App.
    3. Dashboard 10 meters away flashes **RED**, animated border pulses, full-screen overlay blinks, and continuous woop-woop siren sounds until acknowledged.
    4. Node marker turns from Blue (Static) to Pulsating Red. Coverage circles and communication lines animate to show active mesh. **BLE beacon broadcast** — nearby phones with the Prahari-Link Volunteer app detect the alert.
    5. Officer clicks **ACKNOWLEDGE**, fills dispatch form (commander, personnel, vehicle).
    6. ESP-A Green LED turns ON + Phone app shows **rich dispatch card**: 🚓 Commander Name, 👥 5 Personnel, 🚙 Mahindra Bolero, ⏱ ETA.
- **Scalability:** Explain that these nodes are low-power, solar-ready, and mesh-capable for district-wide coverage.
- **Volunteer Network Pitch:** "Every phone with the app becomes a first responder. No internet, no cellular — BLE beacon reaches ~50m. The victim gets instant confirmation with dispatch details, neighbors get alerted within seconds."

---

## 11. The "Prahari-Link" 7-Phase Build Roadmap
*Architecture Principle: Incremental verification and modular scalability.*

### Phase 1: The "Nerve Center" (Backend & Map) ✅
- **Goal:** Create a centralized incident management hub.
- **Steps:** Initialize Node.js/Express server; set up Socket.io; scaffold React app with Leaflet.js.
- **Verification:** Manually inject an incident; verify map updates in <1s.

### Phase 2: The "Police Hub" Bridge (ESP-B to Laptop) ✅
- **Goal:** Bridge physical radio signals to the digital dashboard via USB.
- **Steps:** Flash ESP-B to print Serial; write Node.js script using `SerialPort.js` to emit socket events.
- **Verification:** Type a JSON SOS into Serial Monitor; verify map and siren trigger.

### Phase 3: The "Invisible Link" (ESP-A to ESP-B) ✅
- **Goal:** Establish zero-infrastructure radio communication.
- **Steps:** Discover ESP-B MAC Address; implement ESP-NOW P2P logic on both boards.
- **Verification:** Press button on ESP-A; verify ESP-B receives packet and Dashboard updates.

### Phase 4: The "Handshake" (Mobile App to ESP-A) ✅
- **Goal:** Connect the "Verified Responder" to the village node.
- **Steps:** Implement `BluetoothSerial` on ESP-A; build one-button SOS React Native app.
- **Verification:** Press SOS on phone; verify ESP-A receives the string and prints to Serial.

### Phase 5: The "Full Loop" Integration ✅
- **Goal:** Verify the end-to-end "Zero-Infrastructure" chain.
- **Steps:** Clean up GPS coordinate passing from App → ESP-A → ESP-B → Dashboard.
- **Verification:** Trigger SOS from data-disabled phone; verify coordinates appear on Dashboard map.

### Phase 6: The "Closed Loop" (Feedback) ✅
- **Goal:** Provide visual + Bluetooth confirmation to the victim's phone.
- **Steps:** Add "Acknowledge" button on Dashboard; implement reverse signal Dashboard → ESP-B → ESP-A → Bluetooth → Phone.
- **Verification:** Click "Acknowledge" on laptop; verify ESP-A Green LED turns ON **AND** phone app shows "Help is coming ASAP!"

### Phase 7: The "Police-Ready" Polish ✅
- **Goal:** Finalize branding and hardware presentation.
- **Steps:** Apply Nepal Police branding/logos; set Map to Dark Mode; house ESPs in labeled enclosures; rebuild APK with Bluetooth ACK listener.
- **Verification:** Perform a full "Field Demo" across the room to ensure stability and "The Pitch" flow.
- **Status:** APK built and installed, all firmware flashed, servers running. Ready for field demo.

---

## 12. DevOps & Build Notes

### Arduino CLI (for flashing ESP32)
```bash
# Compile with huge_app partition (required for Bluetooth + ESP-NOW)
arduino-cli compile --fqbn esp32:esp32:esp32:PartitionScheme=huge_app firmware/production/relay_esp_a/relay_esp_a.ino

# Upload
arduino-cli upload --fqbn esp32:esp32:esp32:PartitionScheme=huge_app --port /dev/ttyUSB0 firmware/production/relay_esp_a/relay_esp_a.ino

# ESP-B (no special partition needed)
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/production/hub_esp_b/hub_esp_b.ino
arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/ttyUSB0 firmware/production/hub_esp_b/hub_esp_b.ino
```

### Dashboard
```bash
cd dashboard
npm run dev    # Vite dev server on port 5173
npm run build  # Production build to dist/
```

### Backend
```bash
cd backend
npm start      # Node.js server on port 3001
node mock_injector.js  # Simulates incidents for testing (no hardware needed)
```

### Mobile APK Build & Install
```bash
cd mobile_app
npx react-native bundle --platform android --dev false --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res
cd android && ./gradlew assembleDebug --no-daemon
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## 13. Hackathon Day Demo Checklist

### Hardware Checklist
- [ ] **ESP-A** — Power on (battery/power bank). Bluetooth name: `Prahari-Link-V1`
- [ ] **ESP-B** — Connect to laptop via USB. Shows as `/dev/ttyUSB0`
- [ ] **Phone** — APK installed. Open app → connects to `Prahari-Link-V1` via Bluetooth

### Software Startup (on laptop)
```bash
# One-command launcher (starts backend + mock injector + dashboard)
cd ~/Desktop/Prahari_Link_Hackathon && ./demo.sh

# Or manually in separate terminals:
# Terminal 1: Backend
cd ~/Desktop/Prahari_Link_Hackathon/backend && npm start

# Terminal 2: Mock Injector (demo incidents every 10s)
cd ~/Desktop/Prahari_Link_Hackathon/backend && node mock_injector.js

# Terminal 3: Dashboard
cd ~/Desktop/Prahari_Link_Hackathon/dashboard && npm run dev
```

### Demo Flow
1. Open **http://localhost:5173** in browser
2. Phone connects → header shows 🟢 LIVE
3. Tap **SOS** on phone → Dashboard shows 🔴 alert + siren
4. Click **ACKNOWLEDGE** on dashboard → Phone shows 🚔 "HELP IS COMING!"

---

*End of Archive - June 8, 2026 — READY FOR HACKATHON DAY*

## Final System Status ✅

| Component | Status | Details |
|-----------|--------|--------|
| ESP-A Firmware | ⚠️ Needs reflash v3 | v3 firmware with BLE advertising (`BLEDevice.h`) + ACK dispatch struct receiving + 60s BLE broadcast timeout. Requires `huge_app` partition (now ~1.9MB with BLE). Must reflash after removing Serial noise. |
| ESP-B Firmware | ⚠️ Needs reflash v3 | v3 firmware with `struct_ack` dispatch struct, `parseAndSendACK()` pipe-parsing, enhanced ACK relay via ESP-NOW (92-byte struct instead of 1-byte `ackVal`). |
| Backend | ✅ Ready v4 | Port 3001, Socket.io, SQLite DB, CSV export, monthly reports, node heartbeat tracking, FIR handler, mock injector with heartbeats, **enhanced ACK serial format** with dispatch details when available. |
| Backend | ✅ Ready v5 | v4 + `phone_ble_ack` socket handler broadcasts `incident_ble_confirmed` to all dashboards |
| Dashboard | ✅ Built v9 | v8 + Floating Agency Dispatch Coordination overlay animation box (`fixed top-16 right-4 z-[9999]` with 8-second auto-dismiss timer), redesigned MapLegend, duplicate node labels resolution, z-index overlays fix, and pre-composed Google Gmail browser redirection. |
| Mobile APK | ✅ Installed v4 | 8 categories, 3s countdown, Nepali toggle, MLKit face liveness, citizen name input, 7-pipe format. **v5 pending** — enhanced ACK parsing + volunteer BLE scanning + `react-native-ble-plx` |
| ACK Chain | ✅ Verified | Dashboard → Backend → ESP-B → ESP-A → Phone (all 5 steps) |
| Face Liveness | ✅ Live | MLKit blink detection → sends `FACE|confidence` instead of `FAKE|0` |
| Escalation Timer + SMS Alert | ✅ Live | 5-min per-incident timer from trigger (not form-open). Configurable superior contact (DSP Anudit Khatri / 9851291019). Animated SMS modal with phone UI — typing dots → "Sending..." → ✅ "DELIVERED". Unique timer keys. Timer cleanup on training clear + unmount. |
| Nepali UI | ✅ Live | Full bilingual toggle (EN/ने) on mobile + dashboard with Devanagari font |
| SQLite Database | ✅ Live | All alerts/dispatches logged. CSV export + monthly report endpoints |
| Battery + Solar | ✅ Live | Simulated drain/recharge. Health bars on dashboard node modules + incident cards |
| Citizen Name | ✅ Live | Name input on mobile app. 7-pipe format. `👤 Reported by: [name]` on dashboard cards. Stored in DB + CSV |
| Node Health Ping | ✅ Live | Heartbeat tracking (30s/60s thresholds). Online/warning/offline indicators on all module cards |
| Alert Priority Queue | ✅ Live | Severity-sorted active incidents. Queue position badges (🔴 #1 of 3, 🟠 #2, 🟡 #3+) |
| FIR Reference | ✅ Live | FIR input on dispatched cards. Submit → persist to DB → resolved status with green box |
| NDRRMA Escalation | ✅ Live | Purple button on CRITICAL incidents. Confirmation modal with checkbox. CSV download + Gmail compose to ndrrma@gmail.com, dte-dpr@nepalarmy.mil.np |
| GPS → Google Maps | ✅ Live | All coordinate displays clickable → opens Google Maps at that location. 📍 icon on all 5 display locations |
| Training Mode Toggle | ✅ Live | Orange-bordered training mode toggle. Separate `trainings` DB table. 🧪 TRAINING badge on cards. Export/clear training data. |
| APK v2 — Battery Rebuild | ✅ Built v2 | `Prahari_Link_Demo_v2.apk` (42.9MB). Device battery reading via `expo-battery`. Battery displayed in header with color-coded %. 8-pipe format with `battery_pct`. |
| APK v3 — Clean Rebuild | ✅ Built v3 | `Prahari_Link_Demo_v3.apk` (41MB). Clean rebuild of v2 codebase. Training mode is backend/dashboard only. |
| APK v4 — Final Polish | ✅ Installed | Built and ADB-installed June 11. Category grid polish (shadow, elevation, larger padding, 32px emoji, 14px bold labels). 8-pipe format with `battery_pct` from `expo-battery`. |
| Training Mode — Full Simulation | ✅ Live | Orange-bordered training with separate `trainings` DB. Hardware serial, ACK, dispatch, escalation, FIR all route through training DB. 3 drill scenarios with timed injection. Session recording with performance stats. |
| Dashboard Polish (v5) | ✅ Built | Coverage Map Legend, NodeLabels on map, animated radio wave empty state, fixed useEffect dependency bug (`[playSiren]`→`[startSiren]`), z-index fixes. Dead code removal (`ackTimerRef`). Unique timer keys (`nodeID__timestamp`). |
| Mobile APK Polish (v4) | ✅ Installed via ADB | Category grid shadow/elevation, larger touch targets, 32px emoji, 14px bold labels with letter spacing. Rebuilt and ADB-installed June 11. |
| Enhanced Victim ACK | ✅ Live | Dispatch details (commander, personnel, vehicle, ETA) travel through full radio chain → phone shows rich 4-row card in green overlay. Backend, ESP-B, ESP-A, and mobile app updated. Basic ACK backward compatible. |
| Volunteer BLE Notification | ✅ Live (firmware + dashboard + APK) | ESP-A broadcasts BLE beacon (`P|A|LS|27.6945,83.4457`) for 60s post-SOS. Mobile app has volunteer registration + BLE scanning + incident feed UI via `react-native-ble-plx`. Dashboard shows BLE broadcast badge + Volunteer Notification Panel with phone-confirmed badges. |
| Dashboard Volunteer Panel | ✅ Built v7 | Live sidebar panel showing simulated 3-5 BLE volunteers per incident with auto-progressing statuses (🔔 Notified → 🚶 Responding → 📍 Arrived), color-coded labels, arrival count badges, BLE broadcast coordinates. Timer cleanup in all 3 paths. EN + ने translations. |
| Phone BLE Acknowledgment | ✅ Live | Backend `phone_ble_ack` socket handler. Dashboard `bleConfirmedNodes` tracking. **📱 Phone Confirmed** vs **🔄 Simulated** badges on volunteer panel + incident cards. Scanner name + RSSI display. Auto-simulation fallback. Mock injector ~60% BLE ack simulation. |
| Dashboard Incident Card Badges | ✅ Built | Active incident cards show **two badges**: 📡 BLE Broadcast (green pulsing) + 📱 Phone Confirmed (emerald static) when phone has detected the broadcast. |
| APK v5 — Enhanced ACK + Volunteer BLE | ✅ Built v2 | Enhanced ACK dispatch parsing, volunteer registration screen, BLE scanning with `react-native-ble-plx`, volunteer mode with incident feed. `react-native-ble-plx` installed. |
| Dashboard (v9) | ✅ Built | Move Agency Dispatch Coordination Tracker to Floating Map Overlay (`fixed top-16 right-4 z-[9999]`), sequential 4-agency status tracking animation with 8-second auto-dismiss, 2-tiered regional alerting (15km animated Leaflet wave + NTC SMS broadcast animation + automated Strategic command escalation panel), custom `MapLegend` relay and command control design, fixed duplicate node labels, and increased modal z-index levels. |

---

## Git Restore Point — `working-clean-hackathon`

**Created:** June 14, 2026  
**Commit:** `88a638a` (main branch)  
**Tag Type:** Annotated (contains full architecture breakdown in tag message)  
**Purpose:** Known-good working state — restore if anything breaks during future development.

### How to Restore
```bash
git checkout working-clean-hackathon

# Start backend:
cd backend && node server.js &

# Start dashboard:
cd dashboard && npx vite --host 0.0.0.0 &

# (Optional) Mock injector:
cd backend && node mock_injector.js &
```

### What's Preserved at This State

| Area | Key Features |
|------|-------------|
| **Backend** (`:3001`) | Express + Socket.IO, SQLite, Telegram bot, serial bridge to ESP-B, 5-min auto-escalation, 3 drill scenarios, Beat Officer shifts, CSV/report exports, node heartbeat tracking (30s/60s thresholds) |
| **Dashboard** (`:5173`) | React 18 + Leaflet map (4 nodes), real-time incident queue (CRITICAL→HIGH→MEDIUM), dispatch form, escalation countdown, NDRRMA escalation, SMS alert modal, Volunteer Network panel, BLE confirmation tracking, training session mgmt, bilingual (EN/ने), siren alerts, Agency Dispatch Coordination overlay, 15km geofence alerting |
| **Mobile App** | 8-category SOS grid, MLKit face liveness detection, BLE volunteer scanning (react-native-ble-plx), Classic BT serial to ESP-A, Android foreground service |
| **Firmware** | ESP-A (relay_esp_a.ino) — Classic BT + BLE beacon + ESP-NOW, ESP-B (hub_esp_b.ino) — Serial JSON + ESP-NOW relay |
| **Config** | Dev tokens (`prahari-operator-demo-2026`, `prahari-ingest-demo-2026`), screenshots/window_dumps in .gitignore |

### View Full Tag Message
```bash
git tag -l 'working-clean-hackathon' -n100
```

---

*End of Archive — June 14, 2026 — All 30 features + Git restore point `working-clean-hackathon` saved*

## 11. Prahari-Link Mobile APK Upgrade Plan (June 13, 2026)

This phase-by-phase implementation plan outlines the upgrades for the Prahari-Link mobile app to align with the official Nepal Police branding, improve background stability, restrict SOS triggers, implement a waiting lobby, and handle incident resolution.

### Phase-by-Phase Plan

#### Phase 1: Nepal Police Brand Theme & UI Skinning
- **Primary Color:** Astronaut Blue (`#004163`) for headers, card backgrounds, and core accents.
- **Accent Color:** Cardinal Red (`#cb2027`) for emergency/warning elements.
- **Secondary Color:** Half Baked Sky Blue (`#8abcd7`) for borders, input focus, and labels.
- **Background:** Polish Slate/Dark Navy gradient (from `#011f30` to `#091118`).
- **Header:** Include a stylized "NEPAL POLICE / नेपाल प्रहरी" banner.

#### Phase 2: Minimalist Face Liveness UI
- **Camera Screen:** Keep full camera capture and face detection logic intact.
- **Visuals:** Remove emojis (`😊`, `✅`, `❌`) from the face guide. Keep it simple and clean. The face guide oval border will change colors (White for scanning, Green for verified, Red for failed).

#### Phase 3: Dual-Mode Landing Page & Back Options
- **Landing Page:** The first view will present two rectangular buttons: "Volunteer Mode" (green) and "Responder Mode" (red).
- **Navigation:** Implement a back option (header arrow or button) on subsequent pages (Volunteer Feed, Responder SOS Form) to allow return to the main landing page.

#### Phase 4: Compulsory SOS Form Fields
- **Validation:** Enforce that Name (`citizenName`) and Description (`userNote`) are mandatory.
- **UI:** Show warning indicators if empty. Disable category items or show alerts if users attempt to trigger SOS with empty fields.

#### Phase 5: Android Foreground Service for Stable Background Connection
- **Native Implementation:** Create a custom Java Android Foreground Service (`PrahariLinkService`) and Native Module bridge (`PrahariLinkModule`, `PrahariLinkPackage`).
- **Features:** Persistent sticky notification, CPU WakeLock, foreground service types: `connectedDevice` and `location`.
- **Integration:** Start service when entering Responder or Volunteer modes; stop when exiting. Register in `AndroidManifest.xml` and `MainApplication.java`.

#### Phase 6: SOS Waiting Lobby & Closed-Loop Acknowledgment
- **Lobby View:** Once SOS is triggered, move directly to a Waiting Lobby. Display a pulsing status in English and Nepali: "Waiting for acknowledgement... / प्रहरी स्वीकृतिको प्रतीक्षामा...".
- **Dispatch Overlay:** When `ACK:NODE_ID|...` is received over Bluetooth, transition to the "Help is Coming" screen with dispatch details. Keep this screen persistent until manually dismissed.

#### Phase 7: Persistent Lockout & Dashboard Resolution Handler
- **Local Persistence:** Save the active incident state in `AsyncStorage`.
- **Lockout:** Prevent triggering a new alert while an alert is active, unacknowledged, or resolved/removed.
- **Resolution Communication:** Update backend (`server.js`) to emit `RESOLVED:NODE_ID\n` over serial, and relay via ESP-B and ESP-A to the phone. The phone resets/locks accordingly.

