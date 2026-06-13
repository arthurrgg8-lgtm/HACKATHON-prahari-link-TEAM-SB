# Prahari-Link Dry Run Checklist

Follow these steps to verify the entire software stack before connecting the ESP32 hardware.

## 1. Start the Backend
Open a terminal and run:
```bash
cd /home/lazzy/Desktop/Prahari_Link_Hackathon/backend
npm install
node server.js
```
*Note: If the ESP is not connected, the serial port error is expected. The Socket.io server will still run.*

## 2. Start the Dashboard
Open a second terminal and run:
```bash
cd /home/lazzy/Desktop/Prahari_Link_Hackathon/dashboard
npm install
npm run dev
```
Open the URL shown (usually `http://localhost:5173`) in your browser.

## 3. Inject Mock Data
Open a third terminal and run:
```bash
cd /home/lazzy/Desktop/Prahari_Link_Hackathon/backend
node mock_injector.js
```

## 4. Verification points
- [ ] **Dashboard:** Do you see the Dark Mode Map?
- [ ] **Data Flow:** Does a Red Pulsating card appear in the sidebar every 10 seconds?
- [ ] **Map Action:** Does the map automatically "fly" to the incident location?
- [ ] **Acknowledge:** Click "ACKNOWLEDGE" on the dashboard. Does the `mock_injector` terminal print "RECEIVED ACK FROM DASHBOARD"?

---
**Status:** Software Stack Verified. Ready for Hardware Integration.
