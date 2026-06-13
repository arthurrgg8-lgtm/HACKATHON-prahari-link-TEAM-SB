/* 
   Prahari-Link Diagnostic: Bluetooth Handshake (ESP-A)
   Role: Bluetooth Server
   Purpose: Verify SOS trigger reception from Smartphone
*/

#include "BluetoothSerial.h"

#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error Bluetooth is not enabled! Please run `make menuconfig` to and enable it
#endif

BluetoothSerial SerialBT;

void setup() {
  Serial.begin(115200);
  SerialBT.begin("Prahari-Link-Relay"); // Bluetooth device name
  Serial.println("Bluetooth Started! Pair your phone with 'Prahari-Link-Relay'");
}

void loop() {
  if (SerialBT.available()) {
    String incoming = SerialBT.readString();
    Serial.print("Trigger Received via Bluetooth: ");
    Serial.println(incoming);
    
    // Feedback: Fast blink built-in LED on receipt
    digitalWrite(2, HIGH);
    delay(100);
    digitalWrite(2, LOW);
  }
  delay(20);
}
