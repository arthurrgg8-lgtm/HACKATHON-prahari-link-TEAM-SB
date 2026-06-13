/* 
   Prahari-Link PRODUCTION: Village Relay (ESP-A)
   Logic: Bluetooth Input -> ESP-NOW Output -> LED Feedback
   v3: Enhanced ACK + BLE Volunteer Alert Broadcasting
*/

#include <esp_now.h>
#include <WiFi.h>
#include "BluetoothSerial.h"
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// --- CONFIGURATION ---
uint8_t hubAddress[] = {0x68, 0x09, 0x47, 0x48, 0x41, 0xC0}; // ESP-B MAC
#define LED_RED 2   // Built-in LED for SOS Status
#define LED_GREEN 4 // ACK Feedback LED
#define SOS_COOLDOWN_MS 1000 // 1-second debounce (app handles the 30-min lockout)
#define BATTERY_DRAIN_INTERVAL_MS 60000 // Drop 1% every minute (simulates real usage)
#define BATTERY_BOOST_ON_SOS 15 // Battery jumps up by ~15% on each SOS (simulates fresh battery)
#define BATTERY_SOLAR_CHARGE_MS 120000 // Solar recovers 1% every 2 minutes when active
#define BLE_ADVERT_DURATION_MS 60000 // Broadcast BLE alert for 60 seconds after SOS

BluetoothSerial SerialBT;

// Optimized struct: 182 bytes (under 250B ESP-NOW limit)
typedef struct struct_message {
    char nodeID[10];
    char type[10];
    char category[12];
    char citizenName[30];  // Reporter's full name
    char ai_detected[8];
    char note[100];
    float lat;
    float lon;
    uint8_t status;
    uint8_t battery_pct;
    uint8_t solar_ok;
    uint8_t ai_confidence;
} struct_message;

// ACK Dispatch struct — received from ESP-B when dashboard acknowledges
typedef struct struct_ack {
    char nodeID[10];
    char commander[30];
    uint8_t personnel;
    char vehicle[30];
    char eta[20];
    uint8_t hasDetails; // 0 = basic ack, 1 = full dispatch ack
} struct_ack;

struct_message myData;
esp_now_peer_info_t peerInfo;

unsigned long redLedOffTime = 0;
unsigned long lastSOSTime = 0;
unsigned long lastBatteryTick = 0;
unsigned long lastSolarTick = 0;
uint8_t simulatedBattery = 100; // Start at 100%
bool solarPanelActive = true;

// BLE Advertising
BLEAdvertising *pAdvertising = nullptr;
bool bleAdvertisingActive = false;
unsigned long bleAdvertStopTime = 0;

// Simulate battery drain — call this regularly from loop()
void updateBattery() {
    unsigned long now = millis();
    
    // Gradual drain: -1% every BATTERY_DRAIN_INTERVAL_MS
    if (now - lastBatteryTick >= BATTERY_DRAIN_INTERVAL_MS) {
        lastBatteryTick = now;
        if (simulatedBattery > 5) {
            simulatedBattery--; // Drain 1%
        }
    }
    
    // Solar recharge: +1% every BATTERY_SOLAR_CHARGE_MS when solar is active
    if (solarPanelActive && simulatedBattery < 100) {
        if (now - lastSolarTick >= BATTERY_SOLAR_CHARGE_MS) {
            lastSolarTick = now;
            simulatedBattery++; // Solar recovers 1%
            if (simulatedBattery > 100) simulatedBattery = 100;
        }
    }
    
    // Randomly toggle solar status (simulates weather/night)
    if (now % 300000 < 100) { // Every ~5 minutes, slight chance of toggle
        solarPanelActive = (now / 60000) % 3 != 0; // 2/3 chance active, 1/3 inactive
    }
}

// Get current battery percentage with simulated fluctuation
uint8_t getBatteryPct() {
    // Add slight jitter (±2%) for realistic feel
    int jitter = (millis() / 1000) % 5 - 2;
    int pct = (int)simulatedBattery + jitter;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return (uint8_t)pct;
}

// ── BLE Volunteer Alert Broadcasting ────────────────────────────────────────
void startBLEAlertBroadcast(const char* nodeID, const char* category, float lat, float lon) {
    if (pAdvertising == nullptr) return;
    
    // Stop any existing advertising first
    pAdvertising->stop();
    
    // Build compressed advertising data
    // Format: "P|NA|LS|27.6945,83.4457" — short enough for BLE advert (~29 bytes)
    char advPayload[32];
    // Use compressed nodeID (last char) and category (2-letter code)
    size_t nodeLen = strlen(nodeID);
    const char* shortNode = (nodeLen > 0) ? (nodeID + nodeLen - 1) : "U"; // Last char: A, B, C, or L (CMD_CTRL)
    const char* shortCat = category;
    // Map categories to 2-letter codes
    if (strcmp(category, "LANDSLIDE") == 0) shortCat = "LS";
    else if (strcmp(category, "FLOOD") == 0) shortCat = "FL";
    else if (strcmp(category, "EARTHQUAKE") == 0) shortCat = "EQ";
    else if (strcmp(category, "CRIME") == 0) shortCat = "CR";
    else if (strcmp(category, "MEDICAL") == 0) shortCat = "MD";
    else if (strcmp(category, "FIRE") == 0) shortCat = "FI";
    else if (strcmp(category, "MISSING") == 0) shortCat = "MS";
    else if (strcmp(category, "DISTURBANCE") == 0) shortCat = "DI";
    
    snprintf(advPayload, sizeof(advPayload), "P|%s|%s|%.4f,%.4f", shortNode, shortCat, lat, lon);
    
    // Set BLE advertising data
    BLEAdvertisementData advertisementData;
    // Manufacturer data only (fits within 31-byte BLE advert limit)
    // Phone app scans for "P|" prefix in manufacturer data
    advertisementData.setManufacturerData(advPayload);
    pAdvertising->setAdvertisementData(advertisementData);
    
    // Start advertising
    pAdvertising->start();
    bleAdvertisingActive = true;
    bleAdvertStopTime = millis() + BLE_ADVERT_DURATION_MS;
    
    Serial.print("BLE Alert Broadcast: ");
    Serial.println(advPayload);
}

void stopBLEAlertBroadcast() {
    if (pAdvertising && bleAdvertisingActive) {
        pAdvertising->stop();
        bleAdvertisingActive = false;
        Serial.println("BLE Alert Broadcast stopped");
    }
}

void OnDataSent(const wifi_tx_info_t *info, esp_now_send_status_t status) {
    Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Radio: Sent OK" : "Radio: Sent FAIL");
}

void OnDataRecv(const esp_now_recv_info *recv_info, const uint8_t *incomingData, int len) {
    // Check if this is a full ACK/RESOLVE dispatch struct or legacy single-byte
    if (len >= sizeof(struct_ack)) {
        struct_ack ackMsg;
        memcpy(&ackMsg, incomingData, sizeof(ackMsg));
        
        if (ackMsg.hasDetails == 2) {
            digitalWrite(LED_GREEN, LOW); // Turn off ACK LED
            Serial.println("POLICE RESOLVED/CLEARED the incident.");
            // Send RESOLVED to phone via Bluetooth
            char resBuffer[40];
            snprintf(resBuffer, sizeof(resBuffer), "RESOLVED:%s", ackMsg.nodeID);
            SerialBT.println(resBuffer);
            Serial.print("Sent to phone: ");
            Serial.println(resBuffer);
            return;
        }
        
        digitalWrite(LED_GREEN, HIGH);
        Serial.println("POLICE ACKNOWLEDGED! Dispatch details received.");
        Serial.printf("  Node: %s, Commander: %s, Personnel: %d, Vehicle: %s, ETA: %s\n",
            ackMsg.nodeID, ackMsg.commander, ackMsg.personnel, ackMsg.vehicle, ackMsg.eta);
        
        if (ackMsg.hasDetails == 1 && strlen(ackMsg.commander) > 0) {
            // Rich ACK with dispatch details — send to phone via Bluetooth
            char ackBuffer[220];
            snprintf(ackBuffer, sizeof(ackBuffer),
                "ACK:%s|%s|%d|%s|%s",
                ackMsg.nodeID,
                ackMsg.commander,
                ackMsg.personnel,
                ackMsg.vehicle,
                ackMsg.eta
            );
            SerialBT.println(ackBuffer);
            Serial.print("Sent to phone: ");
            Serial.println(ackBuffer);
        } else {
            // Basic ACK — no dispatch details
            SerialBT.println("ACK:HELP_ON_THE_WAY");
            Serial.println("Sent to phone: ACK:HELP_ON_THE_WAY");
        }
    } else {
        digitalWrite(LED_GREEN, HIGH);
        // Legacy single-byte ACK (backward compatible)
        SerialBT.println("ACK:HELP_ON_THE_WAY");
        Serial.println("POLICE ACKNOWLEDGED! Green LED ON.");
    }
}

void setup() {
    Serial.begin(115200);
    pinMode(LED_RED, OUTPUT);
    pinMode(LED_GREEN, OUTPUT);

    // Initialize Classic Bluetooth for phone connection
    SerialBT.begin("Prahari-Link-V1");
    Serial.println("Bluetooth Ready: Prahari-Link-V1");

    // Initialize BLE for volunteer alert broadcasting
    BLEDevice::init("PRAHARI-LINK-BLE");
    BLEServer *pServer = BLEDevice::createServer();
    pAdvertising = BLEDevice::getAdvertising();
    Serial.println("BLE Ready: PRAHARI-LINK-BLE");
    
    // Initialize WiFi + ESP-NOW
    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) return;
    esp_now_register_send_cb(OnDataSent);
    esp_now_register_recv_cb(OnDataRecv);

    memcpy(peerInfo.peer_addr, hubAddress, 6);
    peerInfo.channel = 1;
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);
    
    Serial.print("ESP-A MAC Address: ");
    Serial.println(WiFi.macAddress());
    Serial.println("ESP-NOW Ready");
    Serial.println("System initialized — BLE + Classic BT + ESP-NOW running");
}

void parseAndSendAlert(String data) {
    data.trim();
    if (data.length() < 3) return;

    // Minimal debounce to prevent serial buffer overflow only
    if (millis() - lastSOSTime < SOS_COOLDOWN_MS) {
        Serial.println("Debounce - ignoring");
        return;
    }

    // Defaults
    strcpy(myData.nodeID, "NODE_A");
    strcpy(myData.category, "");
    strcpy(myData.citizenName, "");
    strcpy(myData.note, "");
    strcpy(myData.ai_detected, "");
    myData.status = 0;
    
    // Simulate battery boost on SOS (like a fresh battery was inserted)
    if (simulatedBattery < 50) {
        simulatedBattery += BATTERY_BOOST_ON_SOS;
        if (simulatedBattery > 100) simulatedBattery = 100;
    }
    myData.battery_pct = getBatteryPct();
    myData.solar_ok = solarPanelActive ? 1 : 0;
    myData.ai_confidence = 0;

    float lat = 0, lon = 0;

    int firstPipe = data.indexOf('|');
    int firstColon = data.indexOf(':');

    if (firstPipe > 0) {
        // Pipe format options:
        String type = data.substring(0, firstPipe);
        int secondPipe = data.indexOf('|', firstPipe + 1);
        int thirdPipe = data.indexOf('|', secondPipe + 1);
        if (secondPipe < 0 || thirdPipe < 0) return;

        int fourthPipe = data.indexOf('|', thirdPipe + 1);
        int fifthPipe = data.indexOf('|', fourthPipe + 1);
        int sixthPipe = data.indexOf('|', fifthPipe + 1);

        lat = data.substring(firstPipe + 1, secondPipe).toFloat();
        lon = data.substring(secondPipe + 1, thirdPipe).toFloat();

        int seventhPipe = data.indexOf('|', sixthPipe + 1);
        int eighthPipe = data.indexOf('|', seventhPipe + 1);

        if (sixthPipe > 0 && seventhPipe > 0 && eighthPipe > 0) {
            // New 8-pipe format with citizen name + battery: TYPE|lat|lon|cat|note|FACE|conf|name|battery_pct
            String cat = data.substring(thirdPipe + 1, fourthPipe);
            cat.toCharArray(myData.category, 12);
            String note = data.substring(fourthPipe + 1, fifthPipe);
            note.toCharArray(myData.note, 100);
            String aiLabel = data.substring(fifthPipe + 1, sixthPipe);
            aiLabel.toCharArray(myData.ai_detected, 8);
            myData.ai_confidence = (uint8_t)data.substring(sixthPipe + 1, seventhPipe).toInt();
            String name = data.substring(seventhPipe + 1, eighthPipe);
            name.toCharArray(myData.citizenName, 30);
            uint8_t phoneBattery = (uint8_t)data.substring(eighthPipe + 1).toInt();
            if (phoneBattery > 0 && phoneBattery <= 100) {
                simulatedBattery = phoneBattery;
            }
        } else if (sixthPipe > 0 && seventhPipe > 0) {
            // 7-pipe format without battery
            String cat = data.substring(thirdPipe + 1, fourthPipe);
            cat.toCharArray(myData.category, 12);
            String note = data.substring(fourthPipe + 1, fifthPipe);
            note.toCharArray(myData.note, 100);
            String aiLabel = data.substring(fifthPipe + 1, sixthPipe);
            aiLabel.toCharArray(myData.ai_detected, 8);
            myData.ai_confidence = (uint8_t)data.substring(sixthPipe + 1, seventhPipe).toInt();
            String name = data.substring(seventhPipe + 1);
            name.toCharArray(myData.citizenName, 30);
        } else if (sixthPipe > 0) {
            // 6-pipe format without name
            String cat = data.substring(thirdPipe + 1, fourthPipe);
            cat.toCharArray(myData.category, 12);
            String note = data.substring(fourthPipe + 1, fifthPipe);
            note.toCharArray(myData.note, 100);
            String aiLabel = data.substring(fifthPipe + 1, sixthPipe);
            aiLabel.toCharArray(myData.ai_detected, 8);
            myData.ai_confidence = (uint8_t)data.substring(sixthPipe + 1).toInt();
        } else if (fifthPipe > 0) {
            // Old format without category
            String note = data.substring(thirdPipe + 1, fourthPipe);
            note.toCharArray(myData.note, 100);
            String aiLabel = data.substring(fourthPipe + 1, fifthPipe);
            aiLabel.toCharArray(myData.ai_detected, 8);
            myData.ai_confidence = (uint8_t)data.substring(fifthPipe + 1).toInt();
        }

        type.toCharArray(myData.type, 10);
    } else if (firstColon > 0) {
        // Basic format: "TYPE:lat,lon" - backward compatible
        String type = data.substring(0, firstColon);
        String coords = data.substring(firstColon + 1);
        int comma = coords.indexOf(',');
        if (comma > 0) {
            lat = coords.substring(0, comma).toFloat();
            lon = coords.substring(comma + 1).toFloat();
        }
        type.toCharArray(myData.type, 10);
    }

    if (lat == 0 && lon == 0) return;

    lastSOSTime = millis();
    myData.lat = lat;
    myData.lon = lon;

    digitalWrite(LED_RED, HIGH);
    esp_now_send(hubAddress, (uint8_t *)&myData, sizeof(myData));
    Serial.print("Sent via ESP-NOW: ");
    Serial.println(myData.type);
    redLedOffTime = millis() + 500;
    
    // Broadcast BLE alert for nearby volunteers
    startBLEAlertBroadcast(myData.nodeID, myData.category, myData.lat, myData.lon);
}

void loop() {
    if (redLedOffTime > 0 && millis() >= redLedOffTime) {
        digitalWrite(LED_RED, LOW);
        redLedOffTime = 0;
    }

    // Update simulated battery every cycle
    updateBattery();

    // Stop BLE advertising after timeout
    if (bleAdvertisingActive && millis() >= bleAdvertStopTime) {
        stopBLEAlertBroadcast();
    }

    if (SerialBT.available()) {
        String data = SerialBT.readString();
        Serial.print("App Trigger: ");
        Serial.println(data);
        parseAndSendAlert(data);
    }
    
    // Log battery status every 30 seconds for debugging
    static unsigned long lastBatteryLog = 0;
    if (millis() - lastBatteryLog >= 30000) {
        lastBatteryLog = millis();
        Serial.print("Battery: ");
        Serial.print(getBatteryPct());
        Serial.print("%, Solar: ");
        Serial.print(solarPanelActive ? "ON" : "OFF");
        Serial.print(", BLE: ");
        Serial.println(bleAdvertisingActive ? "Broadcasting" : "Idle");
    }
}
