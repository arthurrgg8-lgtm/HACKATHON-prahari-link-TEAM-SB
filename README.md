# 🚓 Prahari-Link

An offline-first emergency communication bridge linking remote communities in Nepal with law enforcement and search & rescue command centers.

## 🚀 Quick Start

Start all services (Express backend, Vite dashboard, and simulated mocks) automatically:

```bash
./fix_demo.sh
```

* **Dashboard URL:** `http://localhost:5173`
* **Backend URL:** `http://localhost:3001`

## 📁 Directory Structure

* **`backend/`** - Node.js server, WebSocket coordinator, and SQLite database.
* **`dashboard/`** - Vite + React map and operator control center.
* **`mobile_app/`** - React Native / Expo application for emergency dispatchers and volunteers.
* **`firmware/`** - C++ Arduino firmware for ESP32 Relay Node (ESP-A) and Hub Node (ESP-B).

## 🛠️ Core Stack

* **Web/API:** Node.js, Express, Socket.IO, Leaflet.js, React, Tailwind CSS.
* **Database:** SQLite (`better-sqlite3`).
* **Hardware Protocols:** ESP-NOW (Radio), Classic Bluetooth Serial, BLE (Bluetooth Low Energy) Advertising.
