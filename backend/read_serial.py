import serial
import sys
import time

try:
    ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=1)
    print("Opened /dev/ttyUSB0 at 115200. Listening for raw data... Try triggering the SOS now.")
    while True:
        if ser.in_waiting > 0:
            data = ser.readline()
            print("RAW SERIAL:", data.decode('utf-8', errors='replace').strip())
        time.sleep(0.01)
except Exception as e:
    print("Serial Error:", e)
