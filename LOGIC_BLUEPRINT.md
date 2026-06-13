# Prahari-Link: The "SOS Relay" Logic Blueprint

## 1. Data Packet Schema (The Unified Language)
Both the radio (ESP-NOW) and the web bridge (Serial/JSON) will use this structure to ensure zero-loss data translation.

### A. Radio Packet (C-Struct)
```cpp
typedef struct struct_message {
    char nodeID[10];     // "VILLAGE_01"
    char reportType[10]; // "SOS", "FIRE", "RISK"
    double latitude;
    double longitude;
    int status;          // 0 = Active, 1 = Acknowledged
} struct_message;
```

### B. Serial/Web JSON
```json
{
  "nodeID": "VILLAGE_01",
  "type": "SOS",
  "coords": [27.6710, 85.3240],
  "timestamp": "2026-06-08T12:00:00Z",
  "status": "active"
}
```

---

## 2. Logic Flow: Component by Component

### Component A: ESP-A (The Village Relay)
1.  **Idle State:** Listen for Bluetooth Serial connections.
2.  **Trigger:** Receive string `SOS:27.671,85.324` from App.
3.  **Process:** Parse string into `struct_message`.
4.  **Transmit:** Broadcast via `esp_now_send` to ESP-B MAC.
5.  **Feedback:** Blink **Blue LED** during transmission. Wait for `ACK` packet.
6.  **Confirmation:** On `ACK` receipt, turn **Green LED ON** (Victim reassurance).

### Component B: ESP-B (The Police Hub)
1.  **Idle State:** `esp_now_register_recv_cb`.
2.  **Receive:** Capture `struct_message` from ESP-A.
3.  **Process:** Convert struct to JSON string.
4.  **Output:** `Serial.println(jsonString)` via USB.
5.  **Reverse Link:** Listen for Serial input `ACK:VILLAGE_01`.
6.  **Acknowledge:** Send small radio packet back to ESP-A.

### Component C: Node.js Backend (The Bridge)
1.  **Connect:** Open `/dev/ttyUSB1` (ESP-B) using `SerialPort`.
2.  **Stream:** On data receipt, parse JSON.
3.  **Emit:** `io.emit('new_incident', data)`.
4.  **Store:** Append to `db.json` for persistent logs.

### Component D: React Dashboard (The Interface)
1.  **Listen:** Socket.io event `new_incident`.
2.  **Action:** 
    - Push new coordinate to Leaflet map.
    - Change marker color to Red + Pulsating.
    - Play `siren.mp3`.
    - Show Desktop Notification.

---

## 3. Communication Test Strategy (The "Pre-Flight" Check)

### Step 1: Radio Ping-Pong (ESP-A <-> ESP-B)
- **Goal:** Verify ESP-NOW connectivity and MAC addresses.
- **Verification:** ESP-A sends "PING", ESP-B prints "RECEIVED" and sends "PONG".

### Step 2: Bluetooth Handshake (Phone -> ESP-A)
- **Goal:** Verify smartphone can send report data.
- **Verification:** Phone app connects to "Prahari-Link-Relay"; sends test string; ESP-A prints it to local Serial.

### Step 3: Serial Pipe (ESP-B -> Laptop)
- **Goal:** Verify Node.js can read hardware data.
- **Verification:** Manual JSON injection into ESP-B serial monitor appears on a dummy web page.
