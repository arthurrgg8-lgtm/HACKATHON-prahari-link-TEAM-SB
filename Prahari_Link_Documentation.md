# Project Prahari-Link (प्रहरी-Link)
**Theme:** Public Safety, Emergency & Support Systems (Nepal Police Hackathon 2026)

---

## 1. Executive Summary
**Prahari-Link** is a zero-infrastructure emergency relay system designed for the geographically challenging and low-connectivity regions of Nepal. By bridging modern smartphones with long-range IoT radio (LoRa), Prahari-Link ensures that a citizen can reach the Nepal Police even when cellular networks, Wi-Fi, and data services are completely unavailable.

## 2. The Problem Statement
- **Connectivity Gap:** Critical emergencies in rural Nepal often go unreported because of "dead zones" where 4G/GSM signals fail.
- **Resource Constraints:** With a 1:393 police-to-citizen ratio, authorities need instant, location-accurate data to prioritize dispatch.
- **Crisis Moment (Problem 01):** Marginalized communities lack a direct, reliable "crisis button" that doesn't require an expensive data plan.

## 3. The Proposed Solution
Prahari-Link creates an **Offline Safety Net** using a three-tier communication architecture:
1.  **Detection:** A "Verified Responsible Person" (e.g., Ward Member, Community Leader, or Teacher) triggers an SOS via a secured Mobile App (via Bluetooth). This "Human-in-the-Loop" model ensures that every alert is genuine and prevents system abuse. 
2.  **Relay:** A local "Prahari-Node" (ESP32) captures the signal and transmits it via **LoRa (Long Range Radio)**—simulated for demo via ESP-NOW—to the nearest Police Hub.
3.  **Response:** The Police Command Dashboard instantly visualizes the incident, sounds a physical alarm, and begins the triage process.

## 4. Technical Architecture (The Relay Loop)
### A. Tech Stack
- **Frontend:** React.js, Tailwind CSS, Leaflet.js (Mapping).
- **Backend:** Node.js, Express, SerialPort.js (Hardware-to-Web bridge).
- **Mobile:** React Native (Secured access for authorized personnel).
- **Firmware:** C++/Arduino (ESP-NOW Protocol, Bluetooth Serial).

### B. Hardware Components
- **Village Relay (Node A):** ESP32 (Bluetooth + Radio Relay).
- **Police Hub (Node B):** ESP32/ESP8266 (Radio Receiver + Serial Bridge).
- **Physical Feedback:** Active Buzzer & I2C LCD Display.

### C. Logic Flow
1.  **User Trigger:** App $\xrightarrow{Bluetooth}$ Node A.
2.  **Infrastructure-less Transmission:** Node A $\xrightarrow{Radio/ESP-NOW}$ Node B.
3. **Command Center Alert:** Node B $\xrightarrow{Serial/USB}$ Laptop Dashboard.
4. **Acknowledge:** Dashboard updates "Blue Pin" (Stationary) to "Pulsating Red" (Active Emergency).

> **Technical Note:** ESP-NOW is used in the prototype/demo phase to simulate low-power long-range mesh communication due to hardware constraints. The production architecture is designed for LoRa deployment.

## 5. Operational Impact for Nepal Police
- **Zero-Data Reporting:** Citizens can report crimes with $0$ balance and $0$ data.
- **Geospatial Triage:** Police see the exact "Node ID" and coordinates, eliminating confusion in remote wards.
- **Accountability:** The dashboard logs "Time to Acknowledge," providing the Nepal Police with data to optimize personnel distribution.

## 6. Scalability & Sustainability
In a full-scale deployment, these nodes would be powered by small solar panels and mounted on ward offices, schools, or health posts. A single "Police Hub" can listen to hundreds of "Village Relays" within a 15km radius, creating a mesh of safety across entire districts.

---
*Developed for the Nepal Police Hackathon - May 2026*
