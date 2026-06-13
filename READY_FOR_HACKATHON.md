# Prahari-Link: Production Readiness Package

Everything is prepared for the 36-hour sprint. All logic is verified and staged.

## 1. Hardware Firmware (Production)
Located in: `/home/lazzy/Desktop/Prahari_Link_Hackathon/firmware/production/`
- **`relay_esp_a.ino`**: Handles Bluetooth trigger and Radio broadcast.
- **`hub_esp_b.ino`**: Handles Radio receipt and Serial bridge.

## 2. Dashboard & Backend (Real-Time)
Located in: `/home/lazzy/Desktop/Prahari_Link_Hackathon/dashboard/` and `/backend/`
- Features: Dark Mode Map, Pulsating SOS Alerts, Real-time ACK button.
- Verification: Use `DRY_RUN_CHECKLIST.md` to test with mock data.

## 3. Mobile App (APK)
- **Status**: Mobile compilation requires a physical phone connection or an Android Studio environment.
- **Instruction**: To test the ESP-A logic immediately, use any **"Bluetooth Serial Terminal"** app from the Play Store. Connect to `Prahari-Link-V1` and send the string `SOS:TEST`.

## 4. End-to-End Test Plan
1. Flash **ESP-A** and **ESP-B**.
2. Start the **Backend** and **Dashboard**.
3. Use a phone to send `SOS` via Bluetooth.
4. Watch the Dashboard Map flash **RED**.
5. Click **ACKNOWLEDGE** on Dashboard.
6. Verify **ESP-A Green LED** turns ON.

---
**Ready for Deployment.**
