# Prahari-Link: Full Stack UI Blueprint

## 1. Responder Mobile App (React Native)
**Goal:** A simplified, high-contrast interface for "Verified Responders" to trigger alerts in 1-click.

### A. Core Features
- **Bluetooth Scanner:** Auto-connect to `Prahari-Link-Relay`.
- **GPS Capture:** Automatically fetch coordinates on app launch.
- **Reporting Grid:**
  - **RED Button:** SOS / Immediate Danger.
  - **YELLOW Button:** Suspicious Activity / Risk.
  - **BLUE Button:** Missing Person / Information.
- **Offline Status:** Visual indicator if Bluetooth link is active.

### B. UI Layout (The "Panic Screen")
```text
[   Prahari-Link (Verified)   ]
-------------------------------
|  [ STATUS: CONNECTED ]      |
|  [ GPS: 27.67, 85.32 ]      |
-------------------------------
|                             |
|       (( [ SOS ] ))         | <-- Huge Red Pulsing Button
|      TAP TO SEND HELP       |
|                             |
-------------------------------
| [ Risk ]      | [ Missing ] |
-------------------------------
```

---

## 2. Police Command Dashboard (React + Leaflet)
**Goal:** Real-time situational awareness and rapid dispatch.

### A. Core Features
- **Live Map:** Dark-mode Leaflet map with custom icons for nodes.
- **Incident Feed:** A side-bar scrolling list of recent alerts.
- **Audio Siren:** Automated browser sound when `new_incident` is received.
- **Acknowledge Flow:** Button to send `ACK` back to the hardware.

### B. UI Layout (The "War Room")
```text
[ POLICE COMMAND CENTER ] [TIME: 12:00]
---------------------------------------
| MAP VIEW (80%)      | FEED (20%)     |
|                     |----------------|
| [ RED PIN ] <---SOS | SOS - WARD 5   |
| (Pulsating)         | 2 mins ago     |
|                     | [ ACKNOWLEDGE ]|
|                     |----------------|
| [ HUB NODE ]        | RISK - WARD 2  |
| (Static Blue)       | 10 mins ago    |
---------------------------------------
```

---

## 3. Implementation Strategy (36-Hour Sprint)

### Phase 1: The Mockup (Hour 0-2)
- Scaffold React Dashboard using `vite`.
- Scaffold React Native App using `expo`.

### Phase 2: The Data Pipe (Hour 2-10)
- Connect Mobile App to `react-native-bluetooth-serial-next`.
- Connect Dashboard to `socket.io-client`.

### Phase 3: The Full Loop (Hour 10-24)
- **Flow:** Phone -> ESP-A -> ESP-B -> Backend -> Web Dashboard.
- **Test:** Trigger SOS on phone, see map update in <2s.

### Phase 4: Polish & Performance (Hour 24-36)
- Add "Nepal Police" branding and logo.
- Implement "Time Since Alert" counters.
- Setup desktop notifications for the Dashboard.
