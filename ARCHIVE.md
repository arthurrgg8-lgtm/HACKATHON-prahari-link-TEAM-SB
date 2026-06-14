# Prahari-Link (प्रहरी-Link) — Complete Project Archive

**Date:** June 11, 2026  
**Event:** Nepal Police Hackathon 2026  
**Theme:** Public Safety, Emergency & Support Systems

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [File Checksums (Integrity)](#2-file-checksums)
3. [All Code Changes & Fixes](#3-all-code-changes--fixes)
4. [APK Build History](#4-apk-build-history)
5. [Firmware Flashing Log](#5-firmware-flashing-log)
6. [Android Build Environment](#6-android-build-environment)
7. [Running Services](#7-running-services)
8. [Data Flow](#8-data-flow)
9. [Known Issues & Notes](#9-known-issues--notes)

---

## 1. System Architecture

```
Phone App ──BT──> ESP-A (Village Relay) ──ESP-NOW──> ESP-B (Police Hub) ──USB──> Laptop Backend ──WebSocket──> Dashboard
       <──BT──                        <──ESP-NOW──                           <──USB──                           <──WebSocket──
```

### Component Summary

| Component | Tech | Role |
|-----------|------|------|
| **Mobile App** | React Native (Expo SDK 48) | 8-category SOS grid, face liveness, BLE volunteer scanning, BT to ESP-A |
| **ESP-A** | C++ (Arduino-ESP32) | Bluetooth server + ESP-NOW sender + BLE beacon broadcast |
| **ESP-B** | C++ (Arduino-ESP32) | ESP-NOW receiver → JSON via USB Serial |
| **Backend** | Node.js/Express/Socket.io | Serial bridge, SQLite DB, WebSocket events |
| **Dashboard** | React + Leaflet + Tailwind | Dark-mode map, real-time incidents, dispatch, training, volunteer panel |

### Directory Structure
```
Prahari_Link_Hackathon/
├── firmware/
│   ├── production/
│   │   ├── relay_esp_a/relay_esp_a.ino    ← ESP-A (Village Relay) v3
│   │   └── hub_esp_b/hub_esp_b.ino        ← ESP-B (Police Hub) v3
│   └── diagnostic_tests/                   ← PING/PONG + BT test sketches
├── backend/
│   ├── server.js                           ← Express + Socket.io server
│   ├── database.js                         ← SQLite schema + queries
│   ├── mock_injector.js                    ← Simulated incident injector
│   ├── prahari_link.db                     ← SQLite database
│   └── package.json
├── dashboard/
│   ├── src/App.jsx                         ← Main React dashboard
│   ├── src/index.css                       ← Tailwind styles
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── mobile_app/
│   ├── App.js                              ← React Native app
│   ├── LivenessCamera.js                   ← Face liveness component
│   ├── Prahari_Link_Demo_v4.apk            ← Latest built APK
│   ├── android/                            ← Android native project
│   ├── app.json                            ← Expo config
│   └── package.json
├── demo.sh                                 ← Quick start script
├── ARCHIVE.md                              ← This file
├── READY_FOR_HACKATHON.md
├── DRY_RUN_CHECKLIST.md
├── LOGIC_BLUEPRINT.md
└── Prahari_Link_Documentation.md
```

---

## 2. File Checksums (MD5)

Use these to verify file integrity after transfer:

```
50991b526b1eacb2b0afa26013154587  mobile_app/Prahari_Link_Demo_v4.apk
1b11637718fe92ef23c5f3cad19ec7b7  backend/server.js
8d69d48a8f22fb83e08b80a2e19d58cf  backend/database.js
0f7b457c2f6909a2cca14dcf541a6b87  dashboard/src/App.jsx
70f8eb7fe9181f8df7ed0ec7c7abdedc  mobile_app/App.js
bede706fb004cae9871d67c67fa6f491  firmware/production/relay_esp_a/relay_esp_a.ino
8119db73f92c0d20df543b93c8c38b0d  firmware/production/hub_esp_b/hub_esp_b.ino
```

---

## 3. All Code Changes & Fixes

### 3a. Backend Changes

#### `backend/mock_injector.js` — Source Tagging for Simulated Incidents
- **Added** `source: 'simulated'` to all mock incident payloads
- Allows dashboard to distinguish real vs test data
- Prevents false siren triggers for mock data

```javascript
// Before: no source field
socket.emit('new_incident', { ...incident, status: 'active', timestamp: ... });

// After: source field added
socket.emit('new_incident', { ...incident, source: 'simulated', status: 'active', timestamp: ... });
```

#### `backend/database.js` — CSV Export Integrity
- **Added** `fir_number`, `commander_name`, `personnel_count`, `equipment`, `vehicle`, and `dispatch_notes` columns to the CSV exporters (`exportCSV` and `exportTrainingCSV`) to ensure resolved incident details are properly preserved in report audits.

### 3b. Dashboard Changes

#### `dashboard/src/App.jsx` — Siren Suppression for Simulated Incidents
- **Wrapped** `setAlertActive(true)` and `startSiren()` in `if (data.source !== 'simulated')`
- Mock injector incidents no longer trigger the siren or red alert banner
- Real incidents (from ESP hardware) still trigger the alarm

#### `dashboard/src/App.jsx` — SIMULATED Badge
- **Added** `🧪 SIMULATED` badge for incidents where `inc.source === 'simulated'`
- **Added** `simulatedBadge` translation keys for both EN (`🧪 SIMULATED`) and NE (`🧪 अनुकरण`)

#### `dashboard/src/App.jsx` — GPS Coordinate Integrity (Kathmandu Support)
- **Removed** the Butwal offset override in `getMapCoords` so the map drops markers at the exact coordinates returned by the mobile phone's GPS (enabling live testing in Kathmandu/Lalitpur).

#### `dashboard/src/App.jsx` — Socket Sync on Reconnection
- **Updated** the `initial_incidents` handler to set `incidents` list to `[]` when the backlog is empty on reconnection (prevents stale mock incidents from staying on screen after a database purge or server restart).

#### `dashboard/src/App.jsx` — Static Node Status Visuals
- **Mapped** static nodes to `ackIcon` (non-blinking green marker) when their active incident is acknowledged/dispatched, instead of staying blue. Also updated the sidebar village cards to reflect the green/dispatched status state dynamically.

#### `dashboard/src/App.jsx` — Agency Dispatch Coordination Overlays & Animation
- **Created** `FloatingAgencyCoordination` component and positioned it in the top-right overlay (`fixed top-16 right-4 z-[9999]`) in front of the map screen.
- **Implemented** sequential agency dispatch notification animations: Hospital Services (🏥) -> Nepal Army Command (🪖) -> Armed Police Force (🛡️) -> Local Volunteers Chain (🤝) with corresponding status indicators.
- **Removed** the embedded coordination tracker from the active incident cards in the sidebar scrollbar.
- **Added** a React state hook and `useEffect` timer in the main `App` component to track dispatches in real time and automatically dismiss the floating overlay after 8 seconds.

#### `dashboard/src/App.jsx` — Coverage Legend Redesign
- **Redesigned** `MapLegend` with custom color coding and icon representations to properly display relays (Red/Blue/Green) and Command Control (CMD_CTRL in Purple).

#### `dashboard/src/App.jsx` — Map Labeling and Icon Customization
- **Fixed** duplicate node labeling in the Leaflet map rendering.
- **Customized** CMD_CTRL map marker icon styling and anchor offset.

#### `dashboard/src/App.jsx` — NDRRMA Google Gmail Redirection
- **Updated** the NDRRMA escalation trigger form to open Google Gmail directly in the browser with pre-composed incident summary email, bypassing local mail client conflicts (e.g. Thunderbird).

#### `dashboard/src/App.jsx` — Superior Officer Settings Update
- **Updated** the default superior settings contact to `DIGP BHUPENDRA BAHADUR KHATRI` (phone `98512345678`).

#### `dashboard/src/App.jsx` — Z-Index Modal Layout Corrections
- **Increased** modal z-index layer levels (`z-[9999]` and `z-[2000]`) to ensure the dispatch form, NDRRMA form, and training session modals render correctly above the Leaflet map panes.

#### `dashboard/src/App.jsx` — Siren and Drill Session Fixes
- **Resolved** buzzer auto-stop behavior on resolution and added proper `alert_id` propagation for drill incidents.

#### `dashboard/src/App.jsx` — 2-Tiered Regional Alerting & Geofencing Orchestration
- **Implemented** dynamic 15km geofence "Alert Wave" pulsing circles in Leaflet centered on the incoming coordinates of active CRITICAL incidents.
- **Created** a slide-out "Regional Alert Orchestration" panel overlay to display real-time NTC SMS Gateway API progress status (connecting → broadcasting → complete) and automated Strategic NDRRMA/Army Escalation options.

### 3c. Mobile App Changes

#### `mobile_app/App.js` — Bluetooth Connection Improvements

| Fix | Description |
|-----|-------------|
| `discoverUnpairedDevices()` fallback | If device not in bonded list, scan for unpaired devices |
| `name.trim()` | Handle invisible whitespace in device names |
| `findRelay()` helper | Exact match first, then case-insensitive `includes('prahari')` fallback |
| `btStatus` state tracking | `searching → scanning → connecting → connected → failed` |
| Retry button | "Scan for Node" button shown when connection fails |
| Auto-retry (3 attempts) | 3s delay between retries for transient failures |
| Retry timer cleanup | Proper cleanup in `useEffect` return |
| Initial status | Changed from `'initializing'` to `'searching'` for immediate feedback |

#### `mobile_app/App.js` — BLE Manufacturer Data Fix
- **Added** `atob()` base64 decoding before checking `mfgData.includes('P|')`
- `react-native-ble-plx` returns `manufacturerData` as Base64-encoded string
- Wrapped in try/catch for safe fallback

#### `mobile_app/App.js` — Missing Android Permissions
- **Added** `CAMERA` permission (required for face liveness detection)
- **Added** `POST_NOTIFICATIONS` permission for Android 13+ (API 33)
- Guarded with `Platform.Version >= 33` check

### 3d. Firmware

No firmware code changed — only re-flashed with existing code:
- **ESP-A** flashed with `relay_esp_a.ino` using `PartitionScheme=huge_app` (3MB app partition)
- **ESP-B** — no re-flash needed

---

## 4. APK Build History

| Version | File | Size | Built | Status |
|---------|------|------|-------|--------|
| v1 | `Prahari_Link_Demo_v1.apk` | 0 bytes | Jun 8 | ❌ Corrupted/deleted |
| v2 | `Prahari_Link_Demo_v2.apk` | 42.9 MB | Jun 11 12:29 | ❌ Deleted |
| v3 | `Prahari_Link_Demo_v3.apk` | 42.9 MB | Jun 11 12:47 | ❌ Deleted (no BT fixes) |
| **v4** | **`Prahari_Link_Demo_v4.apk`** | **43.6 MB** | **Jun 11 16:14** | **✅ Current — all fixes** |

### v4 APK Verification
- Contains unique string `"Prahari-Link-V1 not found"` (our custom error message) ✅
- Old v3 APK did NOT contain this string ✅
- Built from current `mobile_app/App.js` with all Bluetooth and permission fixes

### Build Environment
- **ESP32 Core:** v3.3.10
- **Java:** OpenJDK 17.0.18
- **Android SDK:** `/home/lazzy/Android/Sdk`
- **NDK:** 23.1.7779620
- **Gradle:** via `android/gradlew`

---

## 5. Firmware Flashing Log

### ESP-A (Village Relay) — Flashed Jun 11 16:10
```
Board: ESP32-D0WD-V3 (revision v3.1) at 240MHz
Partition: huge_app (3,145,728 bytes app space)
Sketch size: 1,651,367 bytes (52% used)
RAM: 62,096 bytes (18% used)
Flash: Success — verified and hard-reset via RTS
```

**Boot Verification:**
```
rst:0x1 (POWERON_RESET)
ESP-NOW Ready
Bluetooth Ready: Prahari-Link-V1
BLE Ready: PRAHARI-LINK-BLE
System initialized — BLE + Classic BT + ESP-NOW running
```

**Services on ESP-A:**
| Service | Name | Purpose |
|---------|------|---------|
| Classic Bluetooth | `Prahari-Link-V1` | Phone SOS send + ACK receive |
| BLE Advertising | `PRAHARI-LINK-BLE` | Volunteer alert beacon |
| ESP-NOW | N/A (MAC-addressed) | Radio to ESP-B |

### ESP-B (Police Hub) — Connected Jun 11 via USB
- **Port:** `/dev/ttyUSB0`
- **Firmware:** `hub_esp_b.ino` (no re-flash needed)
- **Backend:** Successfully opens serial port and reads JSON

---

## 6. Android Build Environment

### SDK Configuration
```
ANDROID_HOME=/home/lazzy/Android/Sdk
SDK components:
  - build-tools (latest)
  - platform-tools
  - platforms (API 33+)
  - cmdline-tools (latest)
  - ndk;23.1.7779620
```

### Tools Available
| Tool | Path | Version |
|------|------|---------|
| `arduino-cli` | `/home/lazzy/.local/bin/arduino-cli` | ESP32 core 3.3.10 |
| `adb` | `/usr/bin/adb` | Connected device: `10ADA60QJ9002ME` |
| `eas` | Installed globally | For cloud builds (needs Expo login) |
| `npx expo` | Available | v56.1.15 |

---

## 7. Running Services

| Service | Port | PID | Status |
|---------|------|-----|--------|
| **Backend** (node server.js) | 3001 | 95378 | ✅ Active — reading from ESP-B on /dev/ttyUSB0 |
| **Dashboard** (vite) | 5179 | Multiple | ✅ Active |
| **Mock Injector** | N/A | Not running | ❌ Stopped (to prevent false beeping) |

### How to Start/Stop
```bash
# Start everything
./demo.sh

# Or start individually:
cd backend && node server.js &
cd dashboard && npx vite --host &
cd backend && node mock_injector.js &

# Stop everything
kill $(pgrep -f 'node server.js') $(pgrep -f 'mock_injector') $(pgrep -f 'vite')
```

### URLs
- Dashboard: `http://localhost:5179`
- Backend health: `http://localhost:3001/api/health`
- CSV Export: `http://localhost:3001/api/alerts/export/csv`
- Monthly Report: `http://localhost:3001/api/reports/monthly?year=2026&month=6`

---

## 8. Data Flow

### Forward Path (SOS → Dashboard)
```
Mobile App                      ESP-A                     ESP-B                  Backend                Dashboard
    │                            │                         │                       │                       │
    ├─ BT connect ─────────────>│                         │                       │                       │
    │  (Prahari-Link-V1)         │                         │                       │                       │
    │                            │                         │                       │                       │
    ├─ BT write:                 │                         │                       │                       │
    │  SOS|lat|lon|cat|note|     │                         │                       │                       │
    │  FACE|conf|name|bat\\n   ──>│                         │                       │                       │
    │                            ├─ ESP-NOW send ────────>│                       │                       │
    │                            │  (struct_message)       ├─ Serial JSON ────────>│                       │
    │                            │                         │    {"coords":[...]}    ├─ WebSocket emit ──────>│
    │                            │                         │                       │   new_incident         ├─ Map marker
    │                            │                         │                       │                         ├─ Siren (if real)
    │                            │                         │                       │                         ├─ Badges
    │                            │                         │                       │                         └─ Panels
    │                            ├─ BLE broadcast ────────>│                       │                       │
    │                            │  (volunteer alerts)     │                       │                       │
```

### Return Path (ACK → Phone)
```
Dashboard                     Backend                   ESP-B                    ESP-A                 Mobile App
    │                            │                        │                        │                      │
    ├─ Acknowledge ────────────>│                        │                        │                      │
    │  (dispatch form)          ├─ Serial write:         │                        │                      │
    │                           │  ACK:NODE_A|...|ETA   ─>│                        │                      │
    │                           │                        ├─ ESP-NOW send ────────>│                      │
    │                           │                        │  (struct_ack)          ├─ BT write:          ─>│
    │                           │                        │                        │  ACK:NODE_A|...|ETA   ├─ ACK overlay
    │                           │                        │                        │                      │  (green screen)
    │                           │                        │                        │                      └─ Alert
```

---

## 9. Known Issues & Notes

### Resolved Issues
- ✅ Dashboard siren no longer fires for mock/simulated incidents
- ✅ APK now requests CAMERA and POST_NOTIFICATIONS permissions
- ✅ BLE volunteer scanning now decodes base64 manufacturerData
- ✅ Mobile BT has `discoverUnpairedDevices()` + partial name matching + auto-retry
- ✅ ESP-A flashed with correct partition scheme (huge_app)
- ✅ Old APK archives cleaned (only v4 remains)
- ✅ **Port conflict auto-recovery** — Backend now auto-kills stale processes holding port 3001 on EADDRINUSE via `fuser -k`, with 2s retry delay. Prevents "port already in use" errors when restarting after a crash.
- ✅ **Node blinking removed** — Sidebar node card status dot and all node map markers are now fully static (no `animate-ping`). Nodes only use heartbeat-based static `getNodeIcon()`, never `sosIcon`/`escalatedIcon`/`ackIcon`.
- ✅ **SOS label on GPS pins** — Incident location pins now display visible "SOS" text with pulsing ring animation, making phone-triggered GPS coordinates instantly identifiable on the map.
- ✅ **Backend crash fixed** — Fixed undefined `suffix` variable in `logStartup()` that caused server to crash on restart.
- ✅ **Cache clear refinement** — Database wipe + backend restart now properly clears both DB and in-memory cache (`recentIncidents`).

### Non-Issues (Intentional Design)
- `nodeID` hardcoded as `"NODE_A"` in ESP-A firmware — per-design for prototype hardware
- `incident_updated` matches by `nodeID` only — fine for demo (1 incident/node at a time)
- `clearAllIncidents` doesn't clear DB — preserves data for CSV/reports
- SMS modal shown for simulated incidents — has `smsSimulated` badge, operator knows
- Training drill incidents trigger siren — intentional for realistic drills

### For Future Consideration
- `react-native-ble-plx` — manufacturer data handling may vary by platform version
- ESP-A uses `PartitionScheme=huge_app` — only matters for re-flashing
- Dashboard's `activeNodeIDs` includes escalated incidents in mesh lines — cosmetic

---

## 10. Git Restore Point — `working-clean-hackathon`

**Created:** June 14, 2026  
**Commit:** `88a638a` (on main branch)  
**Purpose:** Known-good working state that can be restored if anything breaks during future development.

### What's Tagged

| Component | Details |
|-----------|---------|
| **Backend** | Express + Socket.IO server on port 3001, SQLite DB, Telegram notifications, 5-min auto-escalation, training drills, CSV export, serial bridge to ESP-B |
| **Dashboard** | React 18 + Vite + Leaflet map, real-time incident queue, dispatch form, escalation timers, NDRRMA escalation, SMS alerts, Volunteer Network panel, BLE tracking, training sessions, Beat Officer shifts, bilingual (EN/ने) |
| **Mobile App** | React Native with 8-category SOS grid, face liveness (MLKit), BLE scanning, Bluetooth serial to ESP-A, foreground service |
| **Firmware** | ESP-A relay (BLE + Classic BT + ESP-NOW), ESP-B hub (Serial + ESP-NOW), diagnostic sketches |
| **Gitignore** | `screenshot*.png` and `window_dump*.xml` excluded |

### How to Restore
```bash
git checkout working-clean-hackathon

# Start backend (port 3001):
cd backend && node server.js &

# Start dashboard (port 5173):
cd dashboard && npx vite --host 0.0.0.0 &

# (Optional) Start mock injector for testing without hardware:
cd backend && node mock_injector.js &
```

### Tag Details (view full message)
```bash
git tag -l 'working-clean-hackathon' -n100
```

### Pre-Restore Checklist
- [ ] Verify no unsaved changes: `git status`
- [ ] Confirm port 3001 is free: `fuser 3001/tcp`
- [ ] Confirm port 5173 is free: `fuser 5173/tcp`
