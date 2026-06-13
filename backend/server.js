const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { SerialPort } = require('serialport');
const cors = require('cors');
const DB = require('./database');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = 3001;
const SERIAL_PORT_PATH = '/dev/ttyUSB0'; // ESP-B (Police Hub) detected here

// ── In-Memory Recent Incidents Cache ─────────────────────────────────────────
// Stores the last 50 incidents so newly connecting dashboards get history
const MAX_CACHED_INCIDENTS = 50;
const recentIncidents = []; // [{ ...incident }] — newest first

// Populate cache from DB on startup so it survives server restarts
try {
  const dbAlerts = DB.getRecentIncidents(MAX_CACHED_INCIDENTS);
  recentIncidents.push(...dbAlerts);
  console.log(`Loaded ${dbAlerts.length} historical incidents from DB into cache.`);
} catch (err) {
  console.error('Failed to load historical incidents on startup:', err.message);
}

// Helper: update a cached incident in-place so refreshes see current state
function updateCachedIncident(nodeID, updates) {
  const idx = recentIncidents.findIndex(
    i => i.nodeID === nodeID && i.status !== 'resolved' && i.status !== 'archived'
  );
  if (idx !== -1) {
    recentIncidents[idx] = { ...recentIncidents[idx], ...updates };
  }
}

// ── Node Heartbeat Tracking ──────────────────────────────────────────────────
// Track last-seen timestamps and status for each village node
const NODE_HEARTBEAT_TIMEOUT_MS = 30000;  // 30s → marked as warning
const NODE_OFFLINE_TIMEOUT_MS = 60000;    // 60s → marked as offline
const HEARTBEAT_CLEANUP_INTERVAL_MS = 300000; // 5 min cleanup cycle

const nodeHeartbeats = new Map(); // nodeID → { lastSeen, battery_pct, solar_ok, lat, lon }

// Periodically prune stale heartbeat entries (>10 minutes old)
setInterval(() => {
  const cutoff = Date.now() - 600000; // 10 minutes
  for (const [nodeID, info] of nodeHeartbeats) {
    if (info.lastSeen < cutoff) {
      nodeHeartbeats.delete(nodeID);
    }
  }
}, HEARTBEAT_CLEANUP_INTERVAL_MS);

function updateNodeHeartbeat(nodeID, meta = {}) {
  if (!nodeID) return;
  const prev = nodeHeartbeats.get(nodeID) || {};
  nodeHeartbeats.set(nodeID, {
    lastSeen: Date.now(),
    battery_pct: meta.battery_pct ?? prev.battery_pct ?? 0,
    solar_ok: meta.solar_ok ?? prev.solar_ok ?? 0,
    lat: meta.lat ?? meta.coords?.[0] ?? prev.lat ?? 0,
    lon: meta.lon ?? meta.coords?.[1] ?? prev.lon ?? 0,
  });
}

function getNodeStatuses() {
  const now = Date.now();
  const statuses = {};
  for (const [nodeID, info] of nodeHeartbeats) {
    const elapsed = now - info.lastSeen;
    let status = 'online';
    if (elapsed >= NODE_OFFLINE_TIMEOUT_MS) {
      status = 'offline';
    } else if (elapsed >= NODE_HEARTBEAT_TIMEOUT_MS) {
      status = 'warning';
    }
    statuses[nodeID] = { ...info, status, elapsed };
  }
  return statuses;
}

// Broadcast node status to all dashboards every 10 seconds
setInterval(() => {
  const statuses = getNodeStatuses();
  if (Object.keys(statuses).length > 0) {
    io.emit('node_status', statuses);
  }
}, 10000);

// ── Training Mode State ────────────────────────────────────────────────────
let trainingMode = false;
let currentSessionID = null;

// ── Drill Scenarios ─────────────────────────────────────────────────────────
const DRILL_SCENARIOS = [
  {
    id: 'FLOOD_DRILL', name: 'Flood Mass Evacuation Drill',
    desc: 'Simulates a flood emergency requiring evacuation across multiple villages',
    incidents: [
      { delayMs: 0, nodeID: 'NODE_A', category: 'FLOOD', citizenName: 'Ram Sharma', note: 'Water level rising rapidly in lower areas!', ai_detected: 'FACE', ai_confidence: 95 },
      { delayMs: 30000, nodeID: 'NODE_B', category: 'MEDICAL', citizenName: 'Sita Devi', note: 'Pregnant woman in labor, need ambulance to higher ground', ai_detected: 'FACE', ai_confidence: 88 },
      { delayMs: 60000, nodeID: 'NODE_C', category: 'MISSING', citizenName: 'Krishna Thapa', note: 'Child swept away by current, last seen near bridge', ai_detected: 'FACE', ai_confidence: 72 },
    ],
  },
  {
    id: 'LANDSLIDE_DRILL', name: 'Landslide Mass Casualty Drill',
    desc: 'Simulates a landslide disaster burying a village road with trapped vehicles',
    incidents: [
      { delayMs: 0, nodeID: 'NODE_A', category: 'LANDSLIDE', citizenName: 'Bishnu Gurung', note: 'Massive landslide blocking highway! Multiple vehicles trapped.', ai_detected: 'FACE', ai_confidence: 91 },
      { delayMs: 15000, nodeID: 'NODE_B', category: 'MEDICAL', citizenName: 'Maya Rai', note: '5 injured persons need evacuation from roadside', ai_detected: 'FACE', ai_confidence: 63 },
      { delayMs: 45000, nodeID: 'NODE_A', category: 'FIRE', citizenName: 'Ram Sharma', note: 'Gas leak reported near landslide zone, evacuate immediately', ai_detected: 'FACE', ai_confidence: 95 },
    ],
  },
  {
    id: 'EARTHQUAKE_DRILL', name: 'Earthquake Response Drill',
    desc: 'Simulates a major earthquake with multiple collapsed structures',
    incidents: [
      { delayMs: 0, nodeID: 'NODE_C', category: 'EARTHQUAKE', citizenName: 'Krishna Thapa', note: 'School building collapsed! Students trapped inside.', ai_detected: 'FACE', ai_confidence: 72 },
      { delayMs: 20000, nodeID: 'NODE_B', category: 'FIRE', citizenName: 'Sita Devi', note: 'Fire spreading from damaged gas lines in market area', ai_detected: 'FACE', ai_confidence: 88 },
      { delayMs: 40000, nodeID: 'NODE_A', category: 'MEDICAL', citizenName: 'Ram Sharma', note: 'Mass casualty triage needed at village center', ai_detected: 'FACE', ai_confidence: 95 },
      { delayMs: 60000, nodeID: 'NODE_B', category: 'MISSING', citizenName: 'Maya Rai', note: 'Elderly woman trapped under rubble, last seen at home', ai_detected: 'FACE', ai_confidence: 63 },
    ],
  },
];

// Track active drill timers
let drillTimers = [];

// ── Health endpoint ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    alerts: DB.getAlertCount(),
    uptime: process.uptime(),
  });
});

// ── Direct trigger endpoint (for testing without ESP hardware) ─────────────
app.post('/api/trigger', (req, res) => {
  const data = req.body;
  if (!data || !data.nodeID) return res.status(400).json({ error: 'nodeID required' });
  data.type = data.type || 'SOS';
  data.timestamp = new Date().toISOString();

  if (!data.coords && data.lat !== undefined && data.lon !== undefined) data.coords = [data.lat, data.lon];

  updateNodeHeartbeat(data.nodeID, data);
  const alertID = DB.logIncident(data);
  const incident = { ...data, alert_id: alertID };
  recentIncidents.unshift(incident);
  if (recentIncidents.length > MAX_CACHED_INCIDENTS) recentIncidents.pop();
  io.emit('new_incident', incident);
  console.log(`[HTTP TRIGGER] ${alertID} → ${data.nodeID} @ ${JSON.stringify(data.coords)}`);
  res.json({ success: true, alert_id: alertID, incident });
});

// ── Node Status Endpoint ─────────────────────────────────────────────────────
app.get('/api/nodes/status', (req, res) => {
  res.json(getNodeStatuses());
});

// ── Drill Scenarios Endpoint ────────────────────────────────────────────────
app.get('/api/training/scenarios', (req, res) => {
  res.json(DRILL_SCENARIOS);
});

// ── Active Session Endpoint ──────────────────────────────────────────────────
app.get('/api/training/session', (req, res) => {
  const session = DB.getActiveSession();
  res.json(session || { active: false });
});

// ── Beat Officer API ──────────────────────────────────────────────────────────
app.get('/api/officers/active', (req, res) => {
  try {
    const officers = DB.getActiveOfficers();
    res.json(officers);
  } catch (err) {
    console.error('Active officers fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch active officers' });
  }
});

app.get('/api/officers/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = DB.getOfficerHistory(limit);
    res.json(history);
  } catch (err) {
    console.error('Officer history fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch officer history' });
  }
});

// ── Training Mode Export ─────────────────────────────────────────────────────
app.get('/api/training/export/csv', (req, res) => {
  try {
    const csv = DB.exportTrainingCSV();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=prahari_link_training_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('Training CSV export error:', err);
    res.status(500).json({ error: 'Training export failed' });
  }
});

// ── CSV Export — All Incidents ──────────────────────────────────────────────
app.get('/api/alerts/export/csv', (req, res) => {
  try {
    const csv = DB.exportCSV();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=prahari_link_alerts_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── Monthly Report ─────────────────────────────────────────────────────────
app.get('/api/reports/monthly', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
  try {
    const report = DB.monthlyReport(year, month);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=prahari_link_report_${year}_${String(month).padStart(2, '0')}.txt`);
    res.send(report);
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// ── Get incidents as JSON (for dashboard load) ─────────────────────────────
app.get('/api/alerts', (req, res) => {
  // Return recent alerts from the in-memory cache for dashboard initial load
  // This catches any incidents the WebSocket might have missed
  res.json({ incidents: recentIncidents, message: 'Live feed via WebSocket' });
});

// ── Initialize Serial Port ─────────────────────────────────────────────────
const port = new SerialPort({ path: SERIAL_PORT_PATH, baudRate: 115200 }, (err) => {
  if (err) return console.log('Serial port unavailable:', err.message);
  console.log(`Serial port ${SERIAL_PORT_PATH} opened`);
});

const { Transform } = require('stream');

const parser = port.pipe(new Transform({
  readableObjectMode: true,
  transform(chunk, encoding, callback) {
    this.buffer = (this.buffer || '') + chunk.toString();
    // Try to find and emit complete JSON objects
    while (this.buffer.length > 0) {
      const start = this.buffer.indexOf('{');
      if (start === -1) { this.buffer = ''; break; }
      // Find matching closing brace
      let depth = 0, end = -1;
      for (let i = start; i < this.buffer.length; i++) {
        if (this.buffer[i] === '{') depth++;
        if (this.buffer[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) break; // incomplete — wait for more data
      const json = this.buffer.substring(start, end + 1);
      this.buffer = this.buffer.substring(end + 1);
      try {
        JSON.parse(json); // validate
        this.push(json);
      } catch (e) {
        // skip invalid JSON fragments
      }
    }
    callback();
  }
}));

// Safe serial write — no crash if port is missing
function safeSerialWrite(data) {
  if (port && port.isOpen) {
    console.log(`[SERIAL WRITE] Sending to Hub: ${data.trim()}`);
    port.write(data, (err) => {
      if (err) console.log('Serial write error:', err.message);
    });
  } else {
    console.log('Serial port not available, skipping write:', (data || '').trim());
  }
}

// ── Handle Data from Hardware ──────────────────────────────────────────────
parser.on('data', (data) => {
  console.log('--- Hardware Signal Received ---');
  console.log('Raw:', data.substring(0, 200));

  try {
    const jsonData = JSON.parse(data);

    // Ensure coordinates are in the format the dashboard expects ([lat, lon])
    if (!jsonData.coords) {
      if (jsonData.lat !== undefined && jsonData.lon !== undefined) {
        jsonData.coords = [jsonData.lat, jsonData.lon];
      } else if (jsonData.latitude !== undefined && jsonData.longitude !== undefined) {
        jsonData.coords = [jsonData.latitude, jsonData.longitude];
      }
    }

    // Heartbeat packets just update the node's last-seen timestamp, no incident
    if (jsonData.type === 'HEARTBEAT' && jsonData.nodeID) {
      updateNodeHeartbeat(jsonData.nodeID, jsonData);
      io.emit('node_heartbeat', { nodeID: jsonData.nodeID, ...jsonData });
      return;
    }

    const incident = {
      ...jsonData,
      timestamp: new Date().toISOString(),
    };

    console.log(`[GPS DEBUG] Hardware Node: ${jsonData.nodeID}, Coords: ${JSON.stringify(jsonData.coords)}`);

    // Any incident from a node also counts as a heartbeat
    updateNodeHeartbeat(jsonData.nodeID, jsonData);

    // Route to training or live table based on mode
    if (trainingMode) {
      const alertID = DB.logTrainingIncident(incident);
      console.log(`Logged TRAINING alert from hardware: ${alertID}`);
      const evt = { ...incident, alert_id: alertID, training: true };
      recentIncidents.unshift(evt);
      if (recentIncidents.length > MAX_CACHED_INCIDENTS) recentIncidents.pop();
      io.emit('new_incident', evt);
    } else {
      const alertID = DB.logIncident(incident);
      console.log(`Logged alert: ${alertID}`);
      const evt = { ...incident, alert_id: alertID };
      recentIncidents.unshift(evt);
      if (recentIncidents.length > MAX_CACHED_INCIDENTS) recentIncidents.pop();
      io.emit('new_incident', evt);
    }
  } catch (e) {
    console.log('Not a JSON packet, broadcasting as raw string.');
    io.emit('raw_log', data);
  }
});

// ── Handle Commands from Dashboard ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Dashboard connected: ${socket.id}`);

  // Debug: Log all incoming events
  socket.onAny((eventName, ...args) => {
    console.log(`[SOCKET EVENT] ${eventName}:`, JSON.stringify(args));
  });

  // Send current training mode state on connect
  socket.emit('training_mode_state', { enabled: trainingMode });

  // Client requests initial incidents explicitly after it's ready to receive them
  socket.on('request_initial_incidents', () => {
    if (recentIncidents.length > 0) {
      console.log('Sending initial incidents:', recentIncidents.length);
      socket.emit('initial_incidents', recentIncidents.slice());
    }
  });

  // Handle mock/simulated incidents from mock_injector or test scripts
  socket.on('new_incident', (data) => {
    // Ensure coordinates are in the format the dashboard expects ([lat, lon])
    if (!data.coords) {
      if (data.lat !== undefined && data.lon !== undefined) {
        data.coords = [data.lat, data.lon];
      } else if (data.latitude !== undefined && data.longitude !== undefined) {
        data.coords = [data.latitude, data.longitude];
      }
    }

    // Heartbeat from mock injector — just update last-seen, no DB logging
    if (data.type === 'HEARTBEAT') {
      updateNodeHeartbeat(data.nodeID, data);
      return;
    }

    const incident = {
      ...data,
      timestamp: new Date().toISOString(),
    };

    console.log(`[GPS DEBUG] Socket Node: ${data.nodeID}, Coords: ${JSON.stringify(data.coords)}`);

    // Any incident also acts as a heartbeat
    updateNodeHeartbeat(data.nodeID, data);

    // Route to training or live table based on mode
    if (trainingMode) {
      const alertID = DB.logTrainingIncident(incident);
      console.log(`Logged TRAINING alert from socket: ${alertID} (${incident.nodeID})`);
      // Tag as training so dashboard can style it differently
      const evt = { ...incident, alert_id: alertID, training: true };
      recentIncidents.unshift(evt);
      if (recentIncidents.length > MAX_CACHED_INCIDENTS) recentIncidents.pop();
      io.emit('new_incident', evt);
    } else {
      const alertID = DB.logIncident(incident);
      console.log(`Logged alert from socket: ${alertID} (${incident.nodeID})`);
      const evt = { ...incident, alert_id: alertID };
      recentIncidents.unshift(evt);
      if (recentIncidents.length > MAX_CACHED_INCIDENTS) recentIncidents.pop();
      io.emit('new_incident', evt);
    }
  });

  // Toggle training mode
  socket.on('toggle_training_mode', () => {
    trainingMode = !trainingMode;
    // Clear drill timers when exiting training mode
    if (!trainingMode) {
      drillTimers.forEach(t => clearTimeout(t));
      drillTimers = [];
    }
    console.log(`Training mode ${trainingMode ? 'ENABLED' : 'DISABLED'}`);
    io.emit('training_mode_state', { enabled: trainingMode });
  });

  // When an incident is acknowledged with dispatch data
  socket.on('acknowledge_incident', (data) => {
    const nodeID = typeof data === 'string' ? data : data.nodeID;
    console.log(`ACK for ${nodeID}`);

    if (typeof data === 'object' && data.commander) {
      console.log(`Dispatch: Commander=${data.commander}, Personnel=${data.personnel}`);

      if (trainingMode) {
        const result = DB.acknowledgeTrainingIncident(nodeID, data);
        if (result) {
          console.log(`Training dispatched alert ${result.alertID}, response time: ${result.responseTime}s`);
          const updatePayload = {
            alert_id: result.alertID,
            nodeID, status: 'dispatched', dispatchInfo: data,
            responseTime: result.responseTime, training: true,
          };
          updateCachedIncident(nodeID, updatePayload);
          io.emit('incident_updated', updatePayload);
        }
      } else {
        const result = DB.acknowledgeIncident(nodeID, data);
        if (result) {
          console.log(`Dispatched alert ${result.alertID}, response time: ${result.responseTime}s`);
          const updatePayload = {
            alert_id: result.alertID,
            nodeID, status: 'dispatched', dispatchInfo: data,
            responseTime: result.responseTime,
          };
          updateCachedIncident(nodeID, updatePayload);
          io.emit('incident_updated', updatePayload);
        }
      }
    } else {
      if (trainingMode) {
        DB.acknowledgeTrainingIncident(nodeID);
      } else {
        DB.acknowledgeIncident(nodeID);
      }
    }

    // Enhanced ACK: include dispatch details for victim's phone
    if (typeof data === 'object' && data.commander) {
      safeSerialWrite(`ACK:${data.nodeID}|${data.commander}|${data.personnel || 'N/A'}|${data.vehicle || 'N/A'}|On the way\n`);
    } else {
      safeSerialWrite(`ACK:${nodeID}\n`);
    }
  });

  // When an incident is resolved
  socket.on('resolve_incident', (nodeID) => {
    if (!nodeID) {
      console.log('Invalid resolve: missing nodeID');
      return;
    }
    console.log(`Resolving: ${nodeID}`);

    const result = trainingMode
      ? DB.resolveTrainingIncident(nodeID)
      : DB.resolveIncident(nodeID);

    if (result) {
      const updatePayload = {
        alert_id: result.alertID,
        nodeID, status: 'resolved',
        resolvedAt: new Date().toISOString(),
        ...(trainingMode ? { training: true } : {}),
      };
      updateCachedIncident(nodeID, updatePayload);
      io.emit('incident_updated', updatePayload);
    }
  });

  // When an incident is escalated
  socket.on('escalate_incident', (nodeID) => {
    console.log(`Escalating ${nodeID}`);

    const result = trainingMode
      ? DB.escalateTrainingIncident(nodeID)
      : DB.escalateIncident(nodeID);

    if (result) {
      const updatePayload = { 
        alert_id: result.alertID,
        nodeID, status: 'escalated',
        ...(trainingMode ? { training: true } : {}),
      };
      updateCachedIncident(nodeID, updatePayload);
      io.emit('incident_updated', updatePayload);
    }
  });

  // When an incident has an FIR filed
  socket.on('update_fir', (data) => {
    if (!data || !data.nodeID || !data.firNumber) {
      console.log('Invalid update_fir payload');
      return;
    }
    const { nodeID, firNumber } = data;
    console.log(`Updating FIR for ${nodeID}: ${firNumber}`);

    const result = trainingMode
      ? DB.updateTrainingIncidentFIR(nodeID, firNumber)
      : DB.updateIncidentFIR(nodeID, firNumber);

    if (result) {
      const updatePayload = {
        alert_id: result.alertID,
        nodeID,
        status: 'resolved',
        fir_number: firNumber,
        resolvedAt: result.resolvedAt,
        ...(trainingMode ? { training: true } : {})
      };
      updateCachedIncident(nodeID, updatePayload);
      io.emit('incident_updated', updatePayload);
    }
  });

  // Clear training data
  // Clear all incidents (from dashboard Clear All button)
  socket.on('clear_all_incidents', () => {
    console.log('All incidents cleared by dashboard operator');
    // Flush any drill timers too
    drillTimers.forEach(t => clearTimeout(t));
    drillTimers = [];
    // Clear the in-memory incident cache so fresh dashboards don't reload stale incidents
    recentIncidents.length = 0;
    // Broadcast to all connected dashboards so they clear too
    io.emit('all_incidents_cleared');
  });

  socket.on('clear_training_data', () => {
    // Also clear any active drill timers
    drillTimers.forEach(t => clearTimeout(t));
    drillTimers = [];
    const count = DB.clearTrainingData();
    console.log(`Cleared ${count} training records`);
    socket.emit('training_data_cleared', { count });
  });

  // ── Training Session Management ─────────────────────────────────────────

  socket.on('start_training_session', ({ traineeName, scenarioID }) => {
    const scenario = DRILL_SCENARIOS.find(s => s.id === scenarioID);
    const sName = scenario ? scenario.name : 'Free Drill (No Scenario)';
    currentSessionID = DB.startTrainingSession(traineeName, scenarioID, sName);
    console.log(`Training session started: ${currentSessionID} — ${sName} — ${traineeName}`);
    io.emit('training_session_started', { sessionID: currentSessionID, traineeName, scenarioName: sName });

    // If a scenario is selected, schedule its incidents
    if (scenario && scenario.incidents) {
      // Clear any previous drill timers
      drillTimers.forEach(t => clearTimeout(t));
      drillTimers = [];

      scenario.incidents.forEach((inc, idx) => {
        const timer = setTimeout(() => {
          const incident = {
            nodeID: inc.nodeID, type: 'SOS', category: inc.category,
            citizenName: inc.citizenName, note: inc.note,
            ai_detected: inc.ai_detected, ai_confidence: inc.ai_confidence,
            coords: inc.nodeID === 'NODE_A' ? [27.694532479739998, 83.4456506797053] :
                    inc.nodeID === 'NODE_B' ? [27.686999227671, 83.44392356378827] :
                    inc.nodeID === 'NODE_C' ? [27.687735583500398, 83.45997934509096] :
                    [27.684676842143883, 83.46752748132091],
            battery_pct: 85 - (idx * 10), solar_ok: 1,
            timestamp: new Date().toISOString(),
          };
          const alertID = DB.logTrainingIncident(incident);
          console.log(`Drill incident ${idx + 1}/${scenario.incidents.length}: ${alertID}`);
          io.emit('new_incident', { ...incident, training: true });
          io.emit('drill_progress', { current: idx + 1, total: scenario.incidents.length });
        }, inc.delayMs);
        drillTimers.push(timer);
      });
    }
  });

  socket.on('end_training_session', () => {
    if (!currentSessionID) {
      socket.emit('training_session_ended', { error: 'No active session' });
      return;
    }
    // Clear any pending drill timers
    drillTimers.forEach(t => clearTimeout(t));
    drillTimers = [];

    const summary = DB.endTrainingSession(currentSessionID);
    console.log(`Training session ended: ${currentSessionID}`, summary);
    io.emit('training_session_ended', { sessionID: currentSessionID, summary });
    currentSessionID = null;
  });

  // ── Phone BLE Acknowledgment ───────────────────────────────────────────
  // When a mobile phone detects an ESP-A BLE broadcast and confirms the incident
  socket.on('phone_ble_ack', (data) => {
    const nodeID = data.nodeID || data;
    console.log(`Phone BLE acknowledgment for incident at ${nodeID}`);
    io.emit('incident_ble_confirmed', {
      nodeID,
      volunteerName: data.volunteerName || 'Phone-Scanned',
      rssi: data.rssi || -60,
      confirmedAt: new Date().toISOString(),
    });
  });

  // ── Beat Officer Shift Management ──────────────────────────────────────

  socket.on('start_officer_shift', (data) => {
    const { name, contact, assignedVillage } = data;
    if (!name || !name.trim()) {
      socket.emit('officer_shift_error', { error: 'Officer name is required' });
      return;
    }
    const officer = DB.startOfficerShift(name.trim(), contact || '', assignedVillage || '');
    console.log(`Officer shift started: ${officer.name} (${officer.officerID}) on ${officer.assignedVillage || 'No village'}`);
    // Broadcast to all dashboards
    const activeOfficers = DB.getActiveOfficers();
    io.emit('officers_updated', activeOfficers);
    // Also send a per-village update
    if (officer.assignedVillage) {
      io.emit('officer_assigned', { village: officer.assignedVillage, officer });
    }
  });

  socket.on('end_officer_shift', (officerID) => {
    if (!officerID) return;
    const ended = DB.endOfficerShift(officerID);
    if (ended) {
      console.log(`Officer shift ended: ${officerID}`);
      const activeOfficers = DB.getActiveOfficers();
      io.emit('officers_updated', activeOfficers);
    }
  });

  socket.on('get_active_officers', () => {
    const officers = DB.getActiveOfficers();
    socket.emit('officers_updated', officers);
  });
});

server.listen(PORT, () => {
  console.log(`Prahari-Link Backend running on http://localhost:${PORT}`);
  console.log(`  Alerts DB: ${DB.getAlertCount()} records`);
  console.log(`  CSV Export: http://localhost:${PORT}/api/alerts/export/csv`);
  console.log(`  Monthly Report: http://localhost:${PORT}/api/reports/monthly?year=2026&month=6`);
});
