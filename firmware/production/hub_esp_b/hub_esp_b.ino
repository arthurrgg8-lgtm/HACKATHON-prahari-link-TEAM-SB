/* 
   Prahari-Link PRODUCTION: Police Hub (ESP-B)
   Logic: Radio Input -> Serial Output -> Serial Input -> Radio Output
   v3: Enhanced ACK with dispatch details + BLE relay
*/

#include <esp_now.h>
#include <WiFi.h>

// Optimized struct: 182 bytes — MUST match ESP-A exactly
typedef struct struct_message {
    char nodeID[10];
    char type[10];
    char category[12];
    char citizenName[30];  // Reporter's full name (was responderID[8])
    char ai_detected[8];
    char note[100];
    float lat;
    float lon;
    uint8_t status;
    uint8_t battery_pct;
    uint8_t solar_ok;
    uint8_t ai_confidence;
} struct_message;

// ACK Dispatch struct — sent back to ESP-A when dashboard acknowledges
typedef struct struct_ack {
    char nodeID[10];
    char commander[30];
    uint8_t personnel;
    char vehicle[30];
    char eta[20];
    uint8_t hasDetails; // 0 = basic ack, 1 = full dispatch ack
} struct_ack;

struct_message incomingData;
uint8_t relayAddress[] = {0x68, 0x09, 0x47, 0x48, 0x65, 0xFC}; // ESP-A MAC

void OnDataRecv(const esp_now_recv_info *recv_info, const uint8_t *data, int len) {
    memcpy(&incomingData, data, sizeof(incomingData));
    
    // Output JSON for the Dashboard
    Serial.print("{\"nodeID\":\""); Serial.print(incomingData.nodeID);
    Serial.print("\",\"type\":\""); Serial.print(incomingData.type);
    Serial.print("\",\"category\":\""); Serial.print(incomingData.category);
    Serial.print("\",\"citizenName\":\""); Serial.print(incomingData.citizenName);
    Serial.print("\",\"note\":\""); Serial.print(incomingData.note);
    Serial.print("\",\"ai_detected\":\""); Serial.print(incomingData.ai_detected);
    Serial.print("\",\"battery_pct\":"); Serial.print(incomingData.battery_pct);
    Serial.print(",\"solar_ok\":"); Serial.print(incomingData.solar_ok);
    Serial.print(",\"ai_confidence\":"); Serial.print(incomingData.ai_confidence);
    Serial.print(",\"coords\":["); Serial.print(incomingData.lat, 6);
    Serial.print(","); Serial.print(incomingData.lon, 6);
    Serial.println("]}");
}

void setup() {
    Serial.begin(115200);
    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK) return;
    esp_now_register_recv_cb(OnDataRecv);

    // Register Relay as Peer for ACK sending
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, relayAddress, 6);
    peerInfo.channel = 1;  
    peerInfo.encrypt = false;
    esp_now_add_peer(&peerInfo);
    
    Serial.println("ESP-NOW Hub Ready");
}

void parseAndSendACK(String cmd) {
    struct_ack ackMsg;
    memset(&ackMsg, 0, sizeof(ackMsg));
    
    // Format: "ACK:nodeID|commander|personnel|vehicle|eta"
    String rest = cmd.substring(4); // Remove "ACK:"
    int firstPipe = rest.indexOf('|');
    
    if (firstPipe > 0) {
        // Enhanced format with dispatch details
        String nodeID = rest.substring(0, firstPipe);
        nodeID.toCharArray(ackMsg.nodeID, 10);
        
        int secondPipe = rest.indexOf('|', firstPipe + 1);
        int thirdPipe = rest.indexOf('|', secondPipe + 1);
        int fourthPipe = rest.indexOf('|', thirdPipe + 1);
        
        if (secondPipe > 0) {
            String commander = rest.substring(firstPipe + 1, secondPipe);
            commander.toCharArray(ackMsg.commander, 30);
            
            if (thirdPipe > 0) {
                String personnelStr = rest.substring(secondPipe + 1, thirdPipe);
                ackMsg.personnel = (uint8_t)personnelStr.toInt();
                
                if (fourthPipe > 0) {
                    String vehicle = rest.substring(thirdPipe + 1, fourthPipe);
                    vehicle.toCharArray(ackMsg.vehicle, 30);
                    String eta = rest.substring(fourthPipe + 1);
                    eta.toCharArray(ackMsg.eta, 20);
                }
            }
            ackMsg.hasDetails = 1;
        } else {
            nodeID.toCharArray(ackMsg.nodeID, 10);
            ackMsg.hasDetails = 0;
        }
    } else {
        // Simple format: "ACK:NODE_A"
        rest.toCharArray(ackMsg.nodeID, 10);
        ackMsg.hasDetails = 0;
    }
    
    esp_now_send(relayAddress, (uint8_t *)&ackMsg, sizeof(ackMsg));
    
    Serial.print("ACK relayed to ESP-A: ");
    if (ackMsg.hasDetails) {
        Serial.printf("%s | %s | %d | %s | %s\n", 
            ackMsg.nodeID, ackMsg.commander, ackMsg.personnel, ackMsg.vehicle, ackMsg.eta);
    } else {
        Serial.println(ackMsg.nodeID);
    }
}

void parseAndSendResolve(String cmd) {
    struct_ack ackMsg;
    memset(&ackMsg, 0, sizeof(ackMsg));
    
    // Format: "RESOLVED:NODE_A"
    String rest = cmd.substring(9); // Remove "RESOLVED:"
    rest.trim();
    rest.toCharArray(ackMsg.nodeID, 10);
    ackMsg.hasDetails = 2; // Magic value 2 indicating RESOLVED
    
    esp_now_send(relayAddress, (uint8_t *)&ackMsg, sizeof(ackMsg));
    Serial.print("RESOLVED command relayed to ESP-A: ");
    Serial.println(ackMsg.nodeID);
}

void loop() {
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        cmd.trim();
        if (cmd.startsWith("ACK:")) {
            parseAndSendACK(cmd);
        } else if (cmd.startsWith("RESOLVED:")) {
            parseAndSendResolve(cmd);
        }
    }
}
