const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'prahari_link.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Schema ────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT UNIQUE,
    node_id TEXT NOT NULL,
    alert_type TEXT DEFAULT '',
    alert_category TEXT DEFAULT '',
    alert_severity TEXT DEFAULT '',
    ai_detected TEXT DEFAULT '',
    ai_confidence INTEGER DEFAULT 0,
    citizen_name TEXT DEFAULT '',
    user_note TEXT DEFAULT '',
    latitude REAL DEFAULT 0,
    longitude REAL DEFAULT 0,
    triggered_at TEXT NOT NULL,
    acknowledged_at TEXT,
    response_time_secs INTEGER,
    escalation_status TEXT DEFAULT 'none',
    escalated_at TEXT,
    commander_name TEXT DEFAULT '',
    personnel_count INTEGER DEFAULT 0,
    equipment TEXT DEFAULT '',
    vehicle TEXT DEFAULT '',
    dispatch_notes TEXT DEFAULT '',
    officer_on_duty TEXT DEFAULT '',
    fir_number TEXT DEFAULT '',
    resolved_at TEXT,
    status TEXT DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS dispatches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT,
    node_id TEXT NOT NULL,
    commander_name TEXT NOT NULL,
    personnel_count INTEGER NOT NULL,
    equipment TEXT DEFAULT '',
    vehicle TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    dispatched_at TEXT NOT NULL,
    status TEXT DEFAULT 'dispatched',
    FOREIGN KEY (alert_id) REFERENCES alerts(alert_id)
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_node_id ON alerts(node_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_triggered_at ON alerts(triggered_at);
  CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);

  -- Training table — mirrors alerts schema for full drill simulation
  CREATE TABLE IF NOT EXISTS trainings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id TEXT UNIQUE,
    node_id TEXT NOT NULL,
    alert_type TEXT DEFAULT '',
    alert_category TEXT DEFAULT '',
    alert_severity TEXT DEFAULT '',
    ai_detected TEXT DEFAULT '',
    ai_confidence INTEGER DEFAULT 0,
    citizen_name TEXT DEFAULT '',
    user_note TEXT DEFAULT '',
    latitude REAL DEFAULT 0,
    longitude REAL DEFAULT 0,
    triggered_at TEXT NOT NULL,
    acknowledged_at TEXT,
    response_time_secs INTEGER,
    escalation_status TEXT DEFAULT 'none',
    escalated_at TEXT,
    commander_name TEXT DEFAULT '',
    personnel_count INTEGER DEFAULT 0,
    equipment TEXT DEFAULT '',
    vehicle TEXT DEFAULT '',
    dispatch_notes TEXT DEFAULT '',
    fir_number TEXT DEFAULT '',
    resolved_at TEXT,
    status TEXT DEFAULT 'active'
  );

  CREATE INDEX IF NOT EXISTS idx_trainings_node_id ON trainings(node_id);
  CREATE INDEX IF NOT EXISTS idx_trainings_triggered_at ON trainings(triggered_at);

  -- Training sessions for drill recording
  CREATE TABLE IF NOT EXISTS training_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    trainee_name TEXT DEFAULT '',
    scenario_id TEXT DEFAULT '',
    scenario_name TEXT DEFAULT '',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    drill_notes TEXT DEFAULT '',
    total_incidents INTEGER DEFAULT 0,
    acknowledged_count INTEGER DEFAULT 0,
    escalated_count INTEGER DEFAULT 0,
    resolved_count INTEGER DEFAULT 0,
    avg_response_time_secs INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
  );

  -- Beat officers for duty shift management
  CREATE TABLE IF NOT EXISTS beat_officers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    officer_id TEXT UNIQUE,
    name TEXT NOT NULL,
    contact TEXT DEFAULT '',
    assigned_village TEXT DEFAULT '',
    shift_start TEXT NOT NULL,
    shift_end TEXT,
    status TEXT DEFAULT 'on_duty'
  );

  CREATE INDEX IF NOT EXISTS idx_beat_officers_village ON beat_officers(assigned_village);
  CREATE INDEX IF NOT EXISTS idx_beat_officers_status ON beat_officers(status);
`);

// ─── Helper: Generate unique alert ID ──────────────────────────────────────
function generateAlertID(nodeID) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '').slice(0, 15);
  return `${nodeID}_${ts}`;
}

// ─── Severity mapping ──────────────────────────────────────────────────────
const SEVERITY_MAP = {
  LANDSLIDE: 'CRITICAL',
  FLOOD: 'CRITICAL',
  EARTHQUAKE: 'CRITICAL',
  CRIME: 'HIGH',
  MEDICAL: 'HIGH',
  FIRE: 'HIGH',
  MISSING: 'MEDIUM',
  DISTURBANCE: 'MEDIUM',
};

function getSeverity(category) {
  return SEVERITY_MAP[category] || 'MEDIUM';
}

// ─── Public API ────────────────────────────────────────────────────────────
const DB = {
  /** Log a new incident from hardware or mock injector */
  logIncident(data) {
    const alertID = data.alert_id || generateAlertID(data.nodeID || 'UNKNOWN');
    const now = new Date().toISOString();
    const severity = getSeverity(data.category);

    // Extract coordinates from coords array, lat/lon object, or fallback to 0
    let lat = 0, lon = 0;
    if (data.coords && Array.isArray(data.coords) && data.coords.length >= 2) {
      lat = data.coords[0];
      lon = data.coords[1];
    } else if (data.latitude !== undefined && data.longitude !== undefined) {
      lat = data.latitude;
      lon = data.longitude;
    } else if (data.lat !== undefined && data.lon !== undefined) {
      lat = data.lat;
      lon = data.lon;
    }

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO alerts (
        alert_id, node_id, alert_type, alert_category, alert_severity,
        ai_detected, ai_confidence, citizen_name, user_note, latitude, longitude, triggered_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    stmt.run(
      alertID,
      data.nodeID || 'UNKNOWN',
      data.type || '',
      data.category || '',
      severity,
      data.ai_detected || '',
      data.ai_confidence || 0,
      data.citizenName || '',
      data.user_note || data.note || '',
      lat,
      lon,
      data.timestamp || now
    );

    return alertID;
  },

  /** Mark an incident as acknowledged and log dispatch info */
  acknowledgeIncident(nodeID, dispatchData = {}) {
    const now = new Date().toISOString();

    // Find the most recent active alert for this node
    const alert = db.prepare(`
      SELECT alert_id, triggered_at FROM alerts
      WHERE node_id = ? AND status = 'active'
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    const responseTime = Math.round(
      (new Date(now).getTime() - new Date(alert.triggered_at).getTime()) / 1000
    );

    // Update the alert record
    db.prepare(`
      UPDATE alerts SET
        acknowledged_at = ?,
        response_time_secs = ?,
        commander_name = ?,
        personnel_count = ?,
        equipment = ?,
        vehicle = ?,
        dispatch_notes = ?,
        status = 'dispatched'
      WHERE alert_id = ?
    `).run(
      now,
      responseTime,
      dispatchData.commander || '',
      parseInt(dispatchData.personnel) || 0,
      Array.isArray(dispatchData.equipment) ? dispatchData.equipment.join('; ') : (dispatchData.equipment || ''),
      dispatchData.vehicle || '',
      dispatchData.notes || '',
      alert.alert_id
    );

    // Log the dispatch record
    db.prepare(`
      INSERT INTO dispatches (
        alert_id, node_id, commander_name, personnel_count,
        equipment, vehicle, notes, dispatched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      alert.alert_id,
      nodeID,
      dispatchData.commander || '',
      parseInt(dispatchData.personnel) || 0,
      Array.isArray(dispatchData.equipment) ? dispatchData.equipment.join('; ') : (dispatchData.equipment || ''),
      dispatchData.vehicle || '',
      dispatchData.notes || '',
      now
    );

    return { alertID: alert.alert_id, responseTime };
  },

  /** Resolve an incident directly without FIR */
  resolveIncident(nodeID) {
    const now = new Date().toISOString();
    const alert = db.prepare(`
      SELECT alert_id FROM alerts
      WHERE node_id = ? AND (status = 'dispatched' OR status = 'escalated')
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    db.prepare(`
      UPDATE alerts SET
        resolved_at = ?,
        status = 'resolved'
      WHERE alert_id = ?
    `).run(now, alert.alert_id);

    return { alertID: alert.alert_id, resolvedAt: now };
  },

  /** Update an incident with FIR number and resolve it */
  updateIncidentFIR(nodeID, firNumber) {
    const now = new Date().toISOString();
    const alert = db.prepare(`
      SELECT alert_id FROM alerts
      WHERE node_id = ? AND (status = 'dispatched' OR status = 'escalated')
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    db.prepare(`
      UPDATE alerts SET
        resolved_at = ?,
        status = 'resolved',
        fir_number = ?
      WHERE alert_id = ?
    `).run(now, firNumber, alert.alert_id);

    return { alertID: alert.alert_id, resolvedAt: now };
  },

  /** Escalate an incident */
  escalateIncident(nodeID) {
    const now = new Date().toISOString();
    const alert = db.prepare(`
      SELECT alert_id FROM alerts
      WHERE node_id = ? AND status = 'active'
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    db.prepare(`
      UPDATE alerts SET
        escalation_status = 'escalated',
        escalated_at = ?,
        status = 'escalated'
      WHERE alert_id = ?
    `).run(now, alert.alert_id);

    return { alertID: alert.alert_id };
  },

  /** Export all alerts as CSV */
  exportCSV() {
    const alerts = db.prepare(`
      SELECT * FROM alerts ORDER BY triggered_at DESC
    `).all();

    const headers = [
      'alert_id', 'node_id', 'alert_type', 'alert_category',
      'alert_severity', 'ai_detected', 'ai_confidence', 'citizen_name', 'user_note',
      'latitude', 'longitude',
      'triggered_at', 'acknowledged_at', 'response_time_secs',
      'escalation_status', 'escalated_at',
      'commander_name', 'personnel_count', 'equipment', 'vehicle',
      'dispatch_notes', 'fir_number', 'resolved_at', 'status',
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = alerts.map(a =>
      headers.map(h => escapeCSV(a[h])).join(',')
    );

    return headers.join(',') + '\n' + rows.join('\n');
  },

  /** Generate monthly report CSV */
  monthlyReport(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`;

    const alerts = db.prepare(`
      SELECT * FROM alerts
      WHERE triggered_at >= ? AND triggered_at <= ?
      ORDER BY triggered_at
    `).all(startDate, endDate);

    // Summary stats
    const totalAlerts = alerts.length;
    const byCategory = {};
    const bySeverity = {};
    let ackedCount = 0;
    let totalResponseTime = 0;

    alerts.forEach(a => {
      byCategory[a.alert_category] = (byCategory[a.alert_category] || 0) + 1;
      bySeverity[a.alert_severity] = (bySeverity[a.alert_severity] || 0) + 1;
      if (a.response_time_secs) {
        ackedCount++;
        totalResponseTime += a.response_time_secs;
      }
    });

    const avgResponseMin = ackedCount > 0
      ? Math.round(totalResponseTime / ackedCount / 60)
      : 0;

    const lines = [];
    lines.push(`Prahari-Link Monthly Report — ${month}/${year}`);
    lines.push('');
    lines.push(`Total Alerts: ${totalAlerts}`);
    lines.push(`Acknowledged: ${ackedCount}`);
    lines.push(`Average Response Time: ${avgResponseMin} minutes`);
    lines.push('');

    lines.push('Category Breakdown:');
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        lines.push(`  ${cat}: ${count}`);
      });
    lines.push('');

    lines.push('Severity Breakdown:');
    Object.entries(bySeverity)
      .sort((a, b) => b[1] - a[1])
      .forEach(([sev, count]) => {
        lines.push(`  ${sev}: ${count}`);
      });
    lines.push('');

    if (alerts.length > 0) {
      lines.push('All Incidents:');
      const csvHeaders = 'alert_id,node_id,category,severity,ai_conf,triggered_at,response_time_mins,commander,status';
      lines.push(csvHeaders);
      alerts.forEach(a => {
        const responseMin = a.response_time_secs
          ? Math.round(a.response_time_secs / 60)
          : '';
        lines.push([
          a.alert_id, a.node_id, a.alert_category, a.alert_severity,
          a.ai_confidence, a.triggered_at, responseMin,
          a.commander_name, a.status
        ].join(','));
      });
    }

    return lines.join('\n');
  },

  /** Get raw alert count (for health check) */
  getAlertCount() {
    return db.prepare('SELECT COUNT(*) as count FROM alerts').get().count;
  },

  /** Log an incident to the training table (separate from live alerts) */
  logTrainingIncident(data) {
    const alertID = data.alert_id || generateAlertID(data.nodeID || 'TRAINING');
    const now = new Date().toISOString();
    const severity = getSeverity(data.category);

    let lat = 0, lon = 0;
    if (data.coords && Array.isArray(data.coords) && data.coords.length >= 2) {
      lat = data.coords[0];
      lon = data.coords[1];
    } else if (data.latitude !== undefined && data.longitude !== undefined) {
      lat = data.latitude;
      lon = data.longitude;
    } else if (data.lat !== undefined && data.lon !== undefined) {
      lat = data.lat;
      lon = data.lon;
    }

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO trainings (
        alert_id, node_id, alert_type, alert_category, alert_severity,
        ai_detected, ai_confidence, citizen_name, user_note,
        latitude, longitude, triggered_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    stmt.run(
      alertID,
      data.nodeID || 'TRAINING',
      data.type || '',
      data.category || '',
      severity,
      data.ai_detected || '',
      data.ai_confidence || 0,
      data.citizenName || '',
      data.user_note || data.note || '',
      lat,
      lon,
      data.timestamp || now
    );

    return alertID;
  },

  /** Mark a training incident as acknowledged and log dispatch info */
  acknowledgeTrainingIncident(nodeID, dispatchData = {}) {
    const now = new Date().toISOString();

    const alert = db.prepare(`
      SELECT alert_id, triggered_at FROM trainings
      WHERE node_id = ? AND status = 'active'
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    const responseTime = Math.round(
      (new Date(now).getTime() - new Date(alert.triggered_at).getTime()) / 1000
    );

    db.prepare(`
      UPDATE trainings SET
        acknowledged_at = ?,
        response_time_secs = ?,
        commander_name = ?,
        personnel_count = ?,
        equipment = ?,
        vehicle = ?,
        dispatch_notes = ?,
        status = 'dispatched'
      WHERE alert_id = ?
    `).run(
      now,
      responseTime,
      dispatchData.commander || '',
      parseInt(dispatchData.personnel) || 0,
      Array.isArray(dispatchData.equipment) ? dispatchData.equipment.join('; ') : (dispatchData.equipment || ''),
      dispatchData.vehicle || '',
      dispatchData.notes || '',
      alert.alert_id
    );

    return { alertID: alert.alert_id, responseTime };
  },

  /** Resolve a training incident directly */
  resolveTrainingIncident(nodeID) {
    const now = new Date().toISOString();
    const alert = db.prepare(`
      SELECT alert_id FROM trainings
      WHERE node_id = ? AND (status = 'dispatched' OR status = 'escalated')
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    db.prepare(`
      UPDATE trainings SET
        resolved_at = ?,
        status = 'resolved'
      WHERE alert_id = ?
    `).run(now, alert.alert_id);

    return { alertID: alert.alert_id, resolvedAt: now };
  },

  /** Update a training incident with FIR number and resolve it */
  updateTrainingIncidentFIR(nodeID, firNumber) {
    const now = new Date().toISOString();
    const alert = db.prepare(`
      SELECT alert_id FROM trainings
      WHERE node_id = ? AND (status = 'dispatched' OR status = 'escalated')
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    db.prepare(`
      UPDATE trainings SET
        resolved_at = ?,
        status = 'resolved',
        fir_number = ?
      WHERE alert_id = ?
    `).run(now, firNumber, alert.alert_id);

    return { alertID: alert.alert_id, resolvedAt: now };
  },

  /** Escalate a training incident */
  escalateTrainingIncident(nodeID) {
    const now = new Date().toISOString();
    const alert = db.prepare(`
      SELECT alert_id FROM trainings
      WHERE node_id = ? AND status = 'active'
      ORDER BY triggered_at DESC LIMIT 1
    `).get(nodeID);

    if (!alert) return null;

    db.prepare(`
      UPDATE trainings SET
        escalation_status = 'escalated',
        escalated_at = ?,
        status = 'escalated'
      WHERE alert_id = ?
    `).run(now, alert.alert_id);

    return { alertID: alert.alert_id };
  },

  /** Clear all training data */
  clearTrainingData() {
    const c1 = db.prepare('DELETE FROM training_sessions').run().changes;
    const c2 = db.prepare('DELETE FROM trainings').run().changes;
    return c1 + c2;
  },

  /** Export training incidents as CSV */
  exportTrainingCSV() {
    const alerts = db.prepare(`
      SELECT * FROM trainings ORDER BY triggered_at DESC
    `).all();

    const headers = [
      'alert_id', 'node_id', 'alert_type', 'alert_category',
      'alert_severity', 'ai_detected', 'ai_confidence', 'citizen_name', 'user_note',
      'latitude', 'longitude',
      'triggered_at', 'acknowledged_at', 'response_time_secs',
      'escalation_status', 'escalated_at',
      'commander_name', 'personnel_count', 'equipment', 'vehicle',
      'dispatch_notes', 'fir_number', 'resolved_at', 'status',
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = alerts.map(a =>
      headers.map(h => escapeCSV(a[h])).join(',')
    );

    return headers.join(',') + '\n' + rows.join('\n');
  },

  /** Get training alert count */
  getTrainingAlertCount() {
    return db.prepare('SELECT COUNT(*) as count FROM trainings').get().count;
  },

  // ── Training Session Management ──────────────────────────────────────────

  /** Create a new training session */
  startTrainingSession(traineeName, scenarioID, scenarioName) {
    const sessionID = `SESSION_${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO training_sessions (
        session_id, trainee_name, scenario_id, scenario_name,
        started_at, status
      ) VALUES (?, ?, ?, ?, ?, 'active')
    `).run(sessionID, traineeName || 'Unknown', scenarioID || '', scenarioName || '', now);
    return sessionID;
  },

  /** End a training session and calculate stats */
  endTrainingSession(sessionID) {
    const now = new Date().toISOString();
    const session = db.prepare(`SELECT * FROM training_sessions WHERE session_id = ?`).get(sessionID);
    if (!session) return null;

    // Get stats from the trainings table during this session
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'dispatched' OR status = 'resolved' THEN 1 ELSE 0 END) as acked,
        SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) as escalated,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        AVG(CASE WHEN response_time_secs > 0 THEN response_time_secs ELSE NULL END) as avgResponse
      FROM trainings
      WHERE triggered_at >= ?
    `).get(session.started_at);

    db.prepare(`
      UPDATE training_sessions SET
        ended_at = ?,
        status = 'completed',
        total_incidents = ?,
        acknowledged_count = ?,
        escalated_count = ?,
        resolved_count = ?,
        avg_response_time_secs = ?
      WHERE session_id = ?
    `).run(
      now,
      stats.total || 0,
      stats.acked || 0,
      stats.escalated || 0,
      stats.resolved || 0,
      Math.round(stats.avgResponse || 0),
      sessionID
    );

    return {
      sessionID,
      totalIncidents: stats.total || 0,
      acknowledgedCount: stats.acked || 0,
      escalatedCount: stats.escalated || 0,
      resolvedCount: stats.resolved || 0,
      avgResponseTime: Math.round(stats.avgResponse || 0),
      startedAt: session.started_at,
      endedAt: now,
      scenarioName: session.scenario_name,
      traineeName: session.trainee_name,
    };
  },

  /** Get active session info */
  getActiveSession() {
    return db.prepare(`SELECT * FROM training_sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1`).get();
  },

  // ── Beat Officer Shift Management ────────────────────────────────────────

  /** Start a beat officer's duty shift */
  startOfficerShift(name, contact, assignedVillage) {
    const officerID = `OFFICER_${Date.now()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO beat_officers (
        officer_id, name, contact, assigned_village, shift_start, status
      ) VALUES (?, ?, ?, ?, ?, 'on_duty')
    `).run(officerID, name, contact || '', assignedVillage || '', now);
    return { officerID, name, contact, assignedVillage, shiftStart: now };
  },

  /** End an officer's duty shift */
  endOfficerShift(officerID) {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE beat_officers SET
        shift_end = ?,
        status = 'off_duty'
      WHERE officer_id = ? AND status = 'on_duty'
    `).run(now, officerID);
    return result.changes > 0;
  },

  /** Get all currently on-duty officers */
  getActiveOfficers() {
    return db.prepare(`
      SELECT * FROM beat_officers
      WHERE status = 'on_duty'
      ORDER BY shift_start DESC
    `).all();
  },

  /** Get officer on duty for a specific village */
  getOfficerForVillage(villageID) {
    return db.prepare(`
      SELECT * FROM beat_officers
      WHERE assigned_village = ? AND status = 'on_duty'
      ORDER BY shift_start DESC LIMIT 1
    `).get(villageID);
  },

  /** Get officer by ID */
  getOfficerByID(officerID) {
    return db.prepare(`
      SELECT * FROM beat_officers WHERE officer_id = ?
    `).get(officerID);
  },

  /** Get recent officer shifts (history) */
  getOfficerHistory(limit = 20) {
    return db.prepare(`
      SELECT * FROM beat_officers
      ORDER BY shift_start DESC LIMIT ?
    `).all(limit);
  },

  /** Get recent alerts from DB and format for the in-memory cache */
  getRecentIncidents(limit = 50) {
    const alerts = db.prepare(`
      SELECT * FROM alerts
      ORDER BY triggered_at DESC LIMIT ?
    `).all(limit);
    
    return alerts.map(a => ({
      alert_id: a.alert_id,
      nodeID: a.node_id,
      type: a.alert_type,
      category: a.alert_category,
      severity: a.alert_severity,
      ai_detected: a.ai_detected,
      ai_confidence: a.ai_confidence,
      citizenName: a.citizen_name,
      note: a.user_note,
      coords: [a.latitude, a.longitude],
      timestamp: a.triggered_at,
      status: a.status,
      dispatchInfo: a.status === 'dispatched' || a.status === 'resolved' ? {
        commander: a.commander_name,
        personnel: a.personnel_count,
        equipment: a.equipment ? a.equipment.split('; ') : [],
        vehicle: a.vehicle,
        notes: a.dispatch_notes,
      } : null,
      fir_number: a.fir_number,
      resolvedAt: a.resolved_at,
    }));
  },

  /** Close the database connection */
  close() {
    db.close();
  },
};

module.exports = DB;
