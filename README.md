# 🚓 Prahari-Link: Hybrid Offline Emergency Relay & Command Center

> **Winner/Submission Project — Team "Special Bandits"**
> *An offline-first emergency communication bridge bridging remote communities in Nepal with law enforcement and search & rescue command centers.*

---

## 📖 Table of Contents
1. [Overview](#-overview)
2. [Key Features](#-key-features)
3. [System Architecture](#-system-architecture)
4. [Tech Stack](#-tech-stack)
5. [Directory Structure](#-directory-structure)
6. [Quick Start Guide](#-quick-start-guide)
    - [1. Backend Server Setup](#1-backend-server-setup)
    - [2. Vite Dashboard Setup](#2-vite-dashboard-setup)
    - [3. Mobile Application Setup](#3-mobile-application-setup)
    - [4. Firmware Flashing](#4-firmware-flashing)
7. [Telegram Integration Setup](#-telegram-integration-setup)
8. [Testing Workflow](#-testing-workflow)

---

## 🌟 Overview

In rural and mountainous regions of Nepal, cellular network coverage and internet access can be spotty or non-existent. When landslides, floods, or medical emergencies strike, citizens in offline zones are cut off from immediate aid.

**Prahari-Link** solves this by creating a **hybrid offline/online emergency bridge**:
* **Offline Loop**: A citizen triggers an SOS from their phone. The signal travels over **Classic Bluetooth** to an **ESP32 Village Relay (ESP-A)**. The relay hops the packet across miles using **ESP-NOW (sub-GHz radio simulation)** to a **Central Hub (ESP-B)**.
* **Online Loop**: The Central Hub connects via Serial to the police network backend. Simultaneously, nearby volunteers receive **BLE advertisements** directly on their phones, containing the incident type and coordinates.
* **Hybrid Fallback**: If internet/Wi-Fi is active on the citizen's device, the app initiates a redundant **Socket.IO socket connection** straight to the command center, ensuring delivery through whatever channel is available.

---

## ✨ Key Features

* **Redundant Transmission (BLE + Socket.IO)**: Citizens can report incidents offline (routed through ESP32 nodes) or online (pushed via web sockets).
* **Bilingual Support (EN/NE)**: Fully translated interfaces in English and Nepali (Noto Sans Devanagari) across the dashboard and mobile app.
* **Bility-based Volunteer Alerts**: Local volunteers receive instant alerts and vibration patterns on their phones if they are within BLE advertisement range (~50-100m) of an active relay.
* **🗺️ Turn-by-Turn GPS Navigation**: Responses include a "NAVIGATE TO INCIDENT" action button that opens Google Maps walking directions from the volunteer's current GPS location to the incident.
* **🚨 5-Minute Auto-Escalation & Telegram Alerts**: If a dispatched officer does not acknowledge/respond to an incident within 5 minutes, the backend automatically escalates the incident and forwards a rich text alert directly to a superior officer's **Telegram** account.
* **👮 On-Duty Beat Officer Management**: The dashboard allows real-time duty shifts tracking for local village modules.
* **📊 CSV Exports & Monthly Reports**: Operational logs can be exported directly from the control panel for audits and analytics.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Citizen Device (Phone 1)
        C_UI[Citizen SOS Screen] -->|Trigger Alert| C_Logic{Connection State}
    end

    subgraph Offline Relay
        C_Logic -->|Classic BT SPP| ESP_A[ESP-A Relay Node]
        ESP_A -->|ESP-NOW Radio| ESP_B[ESP-B Hub Node]
        ESP_A -->|BLE Advertisement| V_BLE[Phone 2 BLE Scan]
    end

    subgraph Hybrid Network
        C_Logic -->|Direct Socket.IO| Server[Node.js Backend]
        ESP_B -->|USB Serial| Server
    end

    subgraph Operator & Volunteer
        Server -->|Broadcast socket| V_Sock[Phone 2 Socket.io]
        Server -->|Socket.io| Dash[Vite Dashboard]
        
        V_BLE -->|decodeBase64| V_App[Volunteer App UI]
        V_Sock -->|Vibrate & Show Alert| V_App
        
        Dash -->|Acknowledge & Dispatch| Server
        V_App -->|Google Maps Deep Link| GMaps[Google Maps App]
    end
    
    style ESP_A fill:#f43f5e,stroke:#333,color:#fff
    style ESP_B fill:#f43f5e,stroke:#333,color:#fff
    style Server fill:#3b82f6,stroke:#333,color:#fff
    style Dash fill:#10b981,stroke:#333,color:#fff
    style V_App fill:#8b5cf6,stroke:#333,color:#fff
```

---

## 💻 Tech Stack

* **Backend**: Node.js, Express, Socket.IO, SQLite3 (`better-sqlite3`), SerialPort.
* **Control Center Dashboard**: React 18, Vite, React Leaflet (maps), TailwindCSS, Socket.IO Client.
* **Mobile Client**: React Native, Expo, BLE Plx (`react-native-ble-plx`), Bluetooth Serial Next (`react-native-bluetooth-serial-next`).
* **Firmware**: C++ (Arduino IDE/ESP-IDF), ESP-NOW, Classic Bluetooth Serial, BLE Advertising.

---

## 📁 Directory Structure

```text
├── backend/                       # Node.js backend server & SQLite DB
├── dashboard/                     # Vite + React dashboard UI
├── mobile_app/                    # React Native + Expo mobile application
├── firmware/
│   └── production/
│       ├── relay_esp_a/           # ESP32 firmware for Village Node (BT Classic + BLE)
│       └── hub_esp_b/             # ESP32 firmware for central hub (ESP-NOW + Serial)
└── README.md                      # This file
```

---

## 🚀 Quick Start Guide

### 1. Backend Server Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
   *The server runs on port `3001` and binds to `0.0.0.0` to listen on your local network.*

---

### 2. Vite Dashboard Setup
1. Navigate to the dashboard directory:
   ```bash
   cd dashboard
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev -- --host
   ```
   *Open [http://localhost:5173](http://localhost:5173) in your browser.*

---

### 3. Mobile Application Setup
1. Navigate to the mobile app directory:
   ```bash
   cd mobile_app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the backend URL in `App.js`:
   * Update the `BACKEND_URL` constant with your laptop's local IP address (e.g. `http://192.168.80.159:3001`).
4. Build the Android release APK:
   ```bash
   cd android
   ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs="-Xmx2048m"
   ```
5. Install on a connected device via ADB:
   ```bash
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```

---

### 4. Firmware Flashing
Using the Arduino IDE or PlatformIO, flash the ESP32 boards:
* **ESP-A (Relay Node)**: Flash `relay_esp_a.ino`. Ensure the partition scheme is set to `Huge App` to support both Classic Bluetooth and BLE libraries concurrently.
* **ESP-B (Hub Node)**: Flash `hub_esp_b.ino` and connect it via USB to the backend server.

---

## 📢 Telegram Integration Setup

When an incident is escalated (not acknowledged for 5 minutes), the backend will automatically forward a rich message to a Telegram chat.

1. **Create a Bot**: Message `@BotFather` on Telegram, send `/newbot`, and copy your **HTTP API Token**.
2. **Find Chat ID**: Add the bot to your group or message `@userinfobot` to get your personal User ID.
3. **Run Backend**: Pass the credentials as environment variables:
   ```bash
   TELEGRAM_BOT_TOKEN="your_bot_token" TELEGRAM_CHAT_ID="your_chat_id" npm start
   ```

---

## 🧪 Testing Workflow

1. Open the app on two devices:
   * **Device 1 (Citizen Mode)**: Connect to the ESP32 node via Classic Bluetooth (`Prahari-Link-V1`).
   * **Device 2 (Volunteer Mode)**: Turn on volunteer scanning.
2. Trigger an SOS on **Device 1**:
   * If online, it sends via Socket.IO immediately.
   * If offline, it writes over Bluetooth. The ESP32 receives the trigger and immediately broadcasts a BLE advertisement beacon.
3. **Device 2** detects the BLE beacon (using the custom base64 decoder helper), rings, and vibrates.
4. Click **"Navigate to Incident"** on **Device 2** to open Google Maps walking directions to the incident site!
