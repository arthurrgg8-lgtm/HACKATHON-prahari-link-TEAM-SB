const { io } = require('socket.io-client');

const socket = io('http://localhost:3001');

const mockIncidents = [
  { nodeID: "NODE_A", type: "SOS", category: "LANDSLIDE", citizenName: "Ram Sharma", note: "Landslide blocking main road! 2 vehicles trapped.", ai_detected: "FACE", ai_confidence: 95, battery_pct: 87, solar_ok: 1, coords: [27.694532479739998, 83.4456506797053] },
  { nodeID: "NODE_B", type: "SOS", category: "FIRE", citizenName: "Sita Devi", note: "Forest fire spreading toward village.", ai_detected: "FACE", ai_confidence: 88, battery_pct: 72, solar_ok: 1, coords: [27.686999227671, 83.44392356378827] },
  { nodeID: "NODE_C", type: "RISK", category: "CRIME", citizenName: "Krishna Thapa", note: "Suspicious vehicle near water pump.", ai_detected: "FACE", ai_confidence: 72, battery_pct: 45, solar_ok: 0, coords: [27.687735583500398, 83.45997934509096] },
  { nodeID: "CMD_CTRL", type: "MISSING", category: "MISSING", citizenName: "Maya Rai", note: "Elderly woman lost since morning, wearing red sari.", ai_detected: "FACE", ai_confidence: 63, battery_pct: 91, solar_ok: 1, coords: [27.684676842143883, 83.46752748132091] },
];

console.log('--- Prahari-Link Demo: Mock Injector ---');
console.log('  Sending simulated incidents every 10 seconds');
console.log('  Incidents are tagged as "simulated" on the dashboard');
console.log('  To stop: kill this process or use Ctrl+C');

let i = 0;

const volunteerNames = [
  'Rajesh Gurung', 'Anita Thapa', 'Bishnu Rai', 'Sunita Sharma',
  'Krishna Limbu', 'Maya Tamang', 'Ram KC', 'Gita Baral',
  'Hari Acharya', 'Sita Poudel', 'Milan Shrestha', 'Laxmi Neupane'
];

// Send heartbeats every 15 seconds for all nodes
setInterval(() => {
  const incident = mockIncidents[i % mockIncidents.length];
  console.log(`Injecting Mock Signal: ${incident.nodeID}`);
  socket.emit('new_incident', {
    ...incident,
    source: 'simulated',
    status: 'active',
    timestamp: new Date().toISOString()
  });

  // ── Simulate phone BLE acknowledgment ──────────────────────────────
  // ~60% chance that a phone scanning BLE detects this broadcast
  if (Math.random() < 0.6) {
    const delay = 3000 + Math.floor(Math.random() * 7000); // 3-10s after incident
    setTimeout(() => {
      const volName = volunteerNames[Math.floor(Math.random() * volunteerNames.length)];
      const rssi = -45 - Math.floor(Math.random() * 35); // -45 to -80 dBm
      console.log(`Phone BLE ack: ${incident.nodeID} scanned by ${volName} (RSSI: ${rssi}dBm)`);
      socket.emit('phone_ble_ack', {
        nodeID: incident.nodeID,
        volunteerName: volName,
        rssi,
      });
    }, delay);
  }

  i++;
}, 10000);

// Periodic heartbeats for all nodes (every 20 seconds)
setInterval(() => {
  mockIncidents.forEach(inc => {
    socket.emit('new_incident', {
      nodeID: inc.nodeID,
      type: 'HEARTBEAT',
      battery_pct: inc.battery_pct,
      solar_ok: inc.solar_ok,
      lat: inc.coords[0],
      lon: inc.coords[1],
      timestamp: new Date().toISOString(),
    });
  });
  console.log(`Heartbeats sent for ${mockIncidents.length} nodes`);
}, 20000);

socket.on('acknowledge_incident', (nodeID) => {
  console.log(`RECEIVED ACK FROM DASHBOARD FOR: ${nodeID}`);
});
