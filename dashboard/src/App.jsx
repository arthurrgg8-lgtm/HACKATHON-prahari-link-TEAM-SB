import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import { io } from 'socket.io-client';
import { Shield, Bell, CheckCircle, Radio, ChevronDown, ChevronRight, MapPin, Wifi, WifiOff, X, AlertTriangle } from 'lucide-react';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ESCALATION_TIMEOUT = 300; // 5 minutes in seconds

const NODE_COLORS = {
  NODE_A: '#ef4444',
  NODE_B: '#3b82f6',
  NODE_C: '#22c55e',
  CMD_CTRL: '#a855f7',
};

const COVERAGE_RADIUS = 850; // Increased for slight overlap between adjacent nodes

const sosIcon = new L.DivIcon({
  className: 'custom-sos-icon',
  html: '<div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px"><div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.25);animation:sos-ring-pulse 1.5s ease-out infinite"></div><div style="width:36px;height:36px;background:#ef4444;border-radius:50%;border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 20px rgba(239,68,68,0.6),0 0 40px rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:white;letter-spacing:1px;z-index:2">SOS</div></div>',
  iconSize: [48, 48], iconAnchor: [24, 24],
});

const ackIcon = new L.DivIcon({
  className: 'custom-ack-icon',
  html: '<div style="width:20px;height:20px;background:#22c55e;border-radius:50%;border:2px solid white"></div>',
  iconSize: [20, 20], iconAnchor: [10, 10],
});

const idleIcon = new L.DivIcon({
  className: 'custom-idle-icon',
  html: '<div class="node-green-pulse"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9],
});

// Heartbeat-aware icons — all same base size (18px like idleIcon) to prevent visual jumping
const onlineIcon = new L.DivIcon({
  className: 'custom-online-icon',
  html: '<div style="width:18px;height:18px;background:#22c55e;border-radius:50%;border:3px solid rgba(34,197,94,0.5);box-shadow:0 0 10px rgba(34,197,94,0.5)"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9],
});

const warningIcon = new L.DivIcon({
  className: 'custom-warning-icon',
  html: '<div style="width:18px;height:18px;background:#f59e0b;border-radius:50%;border:3px solid rgba(245,158,11,0.5);box-shadow:0 0 10px rgba(245,158,11,0.4)"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9],
});

const offlineIcon = new L.DivIcon({
  className: 'custom-offline-icon',
  html: '<div class="node-green-pulse"></div>',
  iconSize: [18, 18], iconAnchor: [9, 9],
});

const cmdCtrlIcon = new L.DivIcon({
  className: 'custom-cmd-ctrl-icon',
  html: '<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#0f172a;border:2.5px solid #a855f7;border-radius:50%;box-shadow:0 0 15px rgba(168,85,247,0.7);font-size:16px;line-height:1">🚨</div>',
  iconSize: [32, 32], iconAnchor: [16, 16],
});

// Helper to pick the right node icon based on heartbeat status
function getNodeIcon(nodeId, nodeStatuses) {
  if (nodeId === 'CMD_CTRL') return cmdCtrlIcon;
  const hb = nodeStatuses[nodeId];
  if (!hb || hb.elapsed === undefined) return idleIcon;
  if (hb.status === 'online' && hb.elapsed < 30000) return onlineIcon;
  if (hb.status === 'warning' || (hb.elapsed >= 30000 && hb.elapsed < 60000)) return warningIcon;
  return offlineIcon;
}

const escalatedIcon = new L.DivIcon({
  className: 'custom-escalated-icon',
  html: '<div style="width:24px;height:24px;background:#f97316;border-radius:50%;border:3px solid white;box-shadow:0 0 20px #f97316,0 0 40px #f97316"></div>',
  iconSize: [24, 24], iconAnchor: [12, 12],
});
const STATIC_NODES = [
  { id: 'NODE_A', name: 'Node A Village Relay', coords: [27.694532, 83.445651] },
  { id: 'NODE_B', name: 'Node B Village Relay', coords: [27.686999, 83.443924] },
  { id: 'NODE_C', name: 'Node C Village Relay', coords: [27.687736, 83.459979] },
  { id: 'CMD_CTRL', name: 'Police Command Control', coords: [27.684677, 83.467527] },
];
const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

const CATEGORY_CONFIG = {
  LANDSLIDE: { color: 'bg-red-600/20 text-red-400', label: '\u{1F3D4}\uFE0F Landslide', severity: 'CRITICAL', sevColor: 'bg-red-600/30 text-red-300' },
  FLOOD: { color: 'bg-blue-600/20 text-blue-400', label: '\u{1F30A} Flood', severity: 'CRITICAL', sevColor: 'bg-red-600/30 text-red-300' },
  EARTHQUAKE: { color: 'bg-red-600/20 text-red-400', label: '\u{1F3DA}\uFE0F Earthquake', severity: 'CRITICAL', sevColor: 'bg-red-600/30 text-red-300' },
  CRIME: { color: 'bg-orange-600/20 text-orange-400', label: '\u{1F52B} Crime', severity: 'HIGH', sevColor: 'bg-orange-600/30 text-orange-300' },
  MEDICAL: { color: 'bg-red-600/20 text-red-400', label: '\u{1F691} Medical', severity: 'HIGH', sevColor: 'bg-orange-600/30 text-orange-300' },
  FIRE: { color: 'bg-orange-600/20 text-orange-400', label: '\u{1F525} Fire', severity: 'HIGH', sevColor: 'bg-orange-600/30 text-orange-300' },
  MISSING: { color: 'bg-yellow-600/20 text-yellow-400', label: '\u{1F50D} Missing', severity: 'MEDIUM', sevColor: 'bg-yellow-600/30 text-yellow-300' },
  DISTURBANCE: { color: 'bg-yellow-600/20 text-yellow-400', label: '\u{1F4E2} Disturbance', severity: 'MEDIUM', sevColor: 'bg-yellow-600/30 text-yellow-300' },
};

const TRANSLATIONS = {
  en: {
    title: 'Prahari-Link', subtitle: 'Police Command Center',
    villageModules: 'Village Modules', activeIncidents: 'Active Incidents',
    standby: 'STANDBY', alertActive: 'ALERT ACTIVE', acknowledge: 'ACKNOWLEDGE',
    dispatchTitle: '\u{1F694} Dispatch Confirmation', commander: 'Commander Name *',
    personnel: 'Personnel Count *', equipment: 'Equipment', vehicle: 'Vehicle/Mode',
    notes: 'Notes', confirm: 'CONFIRM DISPATCH', cancel: 'Cancel',
    waiting: 'Waiting for signals...', online: 'System online \u2014 ESP-B connected',
    newIncident: '\u{1F6A8} NEW INCIDENT DETECTED \u2014 CHECK MAP \u{1F6A8}',
    citizenNote: 'Citizen note', reportedBy: 'Reported by', exportCSV: '\u{1F4CA} Export CSV', live: 'LIVE',
    escalated: '\u26A0\uFE0F ESCALATED \u2014 Dispatch timeout expired',
    dispatchNow: '\u{1F6A8} Dispatch Now (Overdue)',
    timeRemaining: 'Time remaining to dispatch',
    timeCritical: '\u26A0\uFE0F TIME CRITICAL \u2014 Immediate action required!',
    resolved: 'Resolved',
    resolve: 'RESOLVE INCIDENT',
    firLabel: 'FIR Reference',
    firPlaceholder: 'e.g. FIR-2083-001',
    submitFIR: 'SAVE FIR',
    ndrrmA: '\u{1F6A8} Escalate to NDRRMA/Army', ndrrmATitle: 'NDRRMA / Army Escalation',
    ndrrmADesc: 'This will generate a CSV with all incident data for NDRRMA or Army coordination. Only available for CRITICAL incidents (Landslide, Flood, Earthquake).',
    ndrrmAConfirm: 'I confirm this incident has been reported to my commanding officer',
    ndrrmAGenerate: 'GENERATE CSV & ESCALATE',    ndrrmADone: '\u2705 Escalated to NDRRMA',
    trainingToggle: '\u{1F9EA} Training Mode',
    trainingOn: '\u{1F9EA} TRAINING MODE',
    trainingOff: '\u{1F6A8} Exit Training',
    trainingLabel: 'TRAINING',
    trainingExport: 'Export Training CSV',
    trainingClear: 'Clear Training Data',
    startSession: '\u{1F3AF} Start Drill Session',
    endSession: '\u{1F6A8} End Session',
    sessionActive: '\u{1F9EA} Session Active',
    sessionInactive: 'No active session',
    traineeNameLabel: 'Trainee Name',
    scenarioLabel: 'Drill Scenario',
    freeDrill: 'Free Drill (No Scenario)',
    drillProgress: 'Drill Progress',
    sessionSummary: 'Session Summary',
    totalIncidentsLabel: 'Total Incidents',
    ackedLabel: 'Acknowledged',
    resolvedLabel: 'Resolved',
    escalatedLabel: 'Escalated',
    avgResponseLabel: 'Avg Response Time',
    secondsLabel: 's',
    incidentsLabel: 'incidents',
    ok: 'OK \u2705',
    beatOfficer: '\u{1F694} POLICE BIT',
    officerDuty: 'COMMANDER',
    officerName: 'Office Name *',
    officerContact: 'Contact Number',
    officerVillage: 'Assigned Village',
    startShift: '\u25B6 START DUTY SHIFT',
    endShift: '\u{1F534} END SHIFT',
    activeOfficers: 'On-Duty Officers',
    officerSince: 'On duty since',
    officerOnDuty: '\u{1F694} Officer on duty',
    endShiftConfirm: 'End this duty shift?',
    villageSelect: 'Select village...',
    smsAlertTitle: '📱 SMS Alert — Dispatch Escalated',
    smsAlertDesc: 'Dispatch timeout expired. An SMS alert has been sent to the superior officer.',
    smsTo: 'To',
    smsFrom: 'From',
    smsMessage: 'Message',
    smsDelivered: '✅ SMS DELIVERED',
    smsSending: 'Sending',
    smsDismiss: 'DISMISS',
    smsSimulated: '📡 Demo mode — SMS alert simulated (real SMS integration in production)',
    smsSuperiorName: 'DIGP BHUPENDRA BAHADUR KHATRI',
    smsSuperiorPhone: '98512345678',
    smsSentTo: 'SMS Alert Sent to Superior',
    smsIncidentDetails: 'INCIDENT DETAILS',
    smsNode: 'Node',
    smsCategory: 'Category',
    smsCitizen: 'Citizen',
    smsNote: 'Note',
    smsAction: 'Reply with dispatch plan immediately.',
    superiorContact: 'Superior Contact',
    superiorNameLabel: 'Superior Name',
    superiorPhoneLabel: 'Superior Phone',
    save: 'SAVE',
    currentSuperior: 'Current Superior',
    notConfigured: 'Not configured',
    clearAll: '🗑️ Clear All',
    clearAllConfirm: 'Clear all incidents from dashboard? This cannot be undone.',
    volunteerBroadcast: '📡 BLE Broadcast — Notifying nearby volunteers',
    volunteerAlert: 'Volunteer Alert',
    nearbyVolunteers: 'Nearby Volunteers',
    volunteersNotified: 'Volunteers Notified',
    volunteerBeacon: 'Volunteer alert beacon active',
    volunteerPanel: 'Community Volunteer Network',
    volunteerTotal: 'Total Alerted',
    volunteerStatusNotified: '🔔 Notified',
    volunteerStatusResponding: '🚶 Responding',
    volunteerStatusArrived: '📍 Arrived',
    volunteerDistance: 'away',
    volunteerNoData: 'No active volunteer alerts',
    phoneConfirmed: '📱 Phone Confirmed',
    phoneSimulated: '🔄 Simulated',
    phoneScannedBy: 'Scanned by',
    phoneRSSI: 'RSSI',
    simulatedBadge: '🧪 SIMULATED',
  },
  ne: {
    title: '\u092A\u094D\u0930\u0939\u0930\u0940-\u0932\u093F\u0902\u0915', subtitle: '\u092A\u094D\u0930\u0939\u0930\u0940 \u0915\u092E\u093E\u0923\u094D\u0921 \u0938\u0947\u0928\u094D\u091F\u0930',
    villageModules: '\u0917\u093E\u0909\u0901 \u092E\u094B\u0921\u094D\u092F\u0941\u0932\u0939\u0930\u0942', activeIncidents: '\u0938\u0915\u094D\u0930\u093F\u092F \u0918\u091F\u0928\u093E\u0939\u0930\u0942',
    standby: '\u0938\u094D\u091F\u094D\u092F\u093E\u0928\u094D\u0921\u092C\u093E\u0907', alertActive: '\u0938\u0915\u094D\u0930\u093F\u092F \u0905\u0932\u0930\u094D\u091F', acknowledge: '\u0938\u094D\u0935\u0940\u0915\u093E\u0930 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    dispatchTitle: '\u{1F694} \u092A\u0920\u093E\u0909\u0928\u0947 \u092A\u0941\u0937\u094D\u091F\u093F', commander: '\u0915\u092E\u093E\u0923\u094D\u0921\u0930\u0915\u094B \u0928\u093E\u092E *',
    personnel: '\u0915\u0930\u094D\u092E\u091A\u093E\u0930\u0940 \u0938\u0902\u0916\u094D\u092F\u093E *', equipment: '\u0909\u092A\u0915\u0930\u0923',
    vehicle: '\u0938\u0935\u093E\u0930\u0940 \u0938\u093E\u0927\u0928', notes: '\u0928\u094B\u091F\u0939\u0930\u0942',
    confirm: '\u092A\u0941\u0937\u094D\u091F\u093F \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D', cancel: '\u0930\u0926\u094D\u0926 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    waiting: '\u0938\u0902\u0915\u0947\u0924\u0915\u094B \u092A\u094D\u0930\u0924\u093F\u0915\u094D\u0937\u093E\u092E\u093E...', online: '\u092A\u094D\u0930\u0923\u093E\u0932\u0940 \u0905\u0928\u0932\u093E\u0907\u0928 \u2014 ESP-B \u091C\u094B\u0921\u093F\u092F\u094B',
    newIncident: '\u{1F6A8} \u0928\u092F\u093E\u0901 \u0918\u091F\u0928\u093E \u092A\u0924\u094D\u0924\u093E \u0932\u093E\u0917\u094D\u092F\u094B \u2014 \u0928\u0915\u094D\u0938\u093E \u091C\u093E\u0901\u091A \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D \u{1F6A8}',
    citizenNote: '\u0928\u093E\u0917\u0930\u093F\u0915\u0915\u094B \u0928\u094B\u091F', reportedBy: '\u0930\u093F\u092A\u094B\u0930\u094D\u091F \u0917\u0930\u094D\u0928\u0947',
    exportCSV: '\u{1F4CA} CSV', live: '\u0938\u0915\u094D\u0930\u093F\u092F',
    escalated: '\u26A0\uFE0F \u0909\u091A\u094D\u091A \u0938\u094D\u0924\u0930 \u2014 \u092A\u0920\u093E\u0909\u0928\u0947 \u0938\u092E\u092F \u0938\u092E\u093E\u092A\u094D\u0924',
    dispatchNow: '\u{1F6A8} \u0905\u0939\u093F\u0932\u0947 \u092A\u0920\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D (\u0922\u093F\u0932\u0947\u0915\u094B)',
    timeRemaining: '\u092A\u0920\u093E\u0909\u0928\u0947 \u092C\u093E\u0915\u0940 \u0938\u092E\u092F',
    timeCritical: '\u26A0\uFE0F \u0938\u092E\u092F \u091C\u094B\u0916\u093F\u092E\u092E\u093E \u2014 \u0924\u0924\u094D\u0915\u093E\u0932 \u0915\u093E\u0930\u094D\u092C\u093E\u0939\u0940 \u0906\u0935\u0936\u094D\u092F\u0915!',
    resolved: '\u0938\u092E\u093E\u0927\u093E\u0928',
    resolve: '\u0918\u091F\u0928\u093E \u0938\u092E\u093E\u0927\u093E\u0928 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    ndrrmA: '\u{1F6A8} NDRRMA/\u0938\u0947\u0928\u093E\u0932\u093E\u0908 \u092A\u0920\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D', ndrrmATitle: 'NDRRMA / \u0938\u0947\u0928\u093E \u0909\u091A\u094D\u091A \u0938\u094D\u0924\u0930',
    ndrrmADesc: '\u0915\u0943\u0924\u093F\u0915 \u0918\u091F\u0928\u093E\u0939\u0930\u0942\u0915\u093E \u0932\u093E\u0917\u093F NDRRMA \u0935\u093E \u0938\u0947\u0928\u093E\u0938\u0902\u0917 \u0938\u092E\u0928\u094D\u0935\u092F\u0915\u094B \u0932\u093E\u0917\u093F CSV \u092B\u093E\u0907\u0932 \u0924\u092F\u093E\u0930 \u0917\u0930\u094D\u0928\u0947\u091B\u0964 \u0915\u0947\u0935\u0932 CRITICAL \u0918\u091F\u0928\u093E\u0939\u0930\u0942 (\u092A\u0939\u093F\u0930\u094B, \u092C\u093E\u0921\u093C\u0940, \u092D\u0942\u0915\u092E\u094D\u092A) \u0915\u094B \u0932\u093E\u0917\u093F \u092E\u093E\u0924\u094D\u0930\u0964',
    ndrrmAConfirm: '\u092E\u0948\u0902\u0932\u0947 \u092F\u094B \u0918\u091F\u0928\u093E \u092E\u0947\u0930\u094B \u0915\u092E\u093E\u0923\u094D\u0921\u093F\u0902\u0917 \u0905\u0927\u093F\u0915\u093E\u0930\u0940\u0932\u093E\u0908 \u0930\u093F\u092A\u094B\u0930\u094D\u091F \u0917\u0930\u093F\u0938\u0915\u0947\u091B\u0941 \u092D\u0928\u0947 \u092A\u0941\u0937\u094D\u091F\u093F \u0917\u0930\u094D\u0928\u0941\u0939\u0941\u0928\u094D\u091B\u0941',
    ndrrmAGenerate: 'CSV \u092C\u0928\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D \u0930 \u092A\u0920\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D',    ndrrmADone: '\u2705 NDRRMA\u092E\u093E \u092A\u0920\u093E\u0907\u092F\u094B',
    trainingToggle: '\u{1F9EA} \u0924\u093E\u0932\u093F\u092E \u092E\u094B\u0921',
    trainingOn: '\u{1F9EA} \u0924\u093E\u0932\u093F\u092E \u092E\u094B\u0921',
    trainingOff: '\u{1F6A8} \u0924\u093E\u0932\u093F\u092E \u092C\u0928\u094D\u0926 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    trainingLabel: '\u0924\u093E\u0932\u093F\u092E',
    trainingExport: 'Training CSV',
    trainingClear: 'Training \u0921\u093E\u091F\u093E \u092E\u0947\u091F\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D',
    startSession: '\u{1F3AF} \u0921\u094D\u0930\u093F\u0932 \u0938\u0930\u0941\u0935\u093E\u0924 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    endSession: '\u{1F6A8} \u0938\u0930\u0941\u0935\u093E\u0924 \u0905\u0928\u094D\u0924\u094D\u092F \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    sessionActive: '\u{1F9EA} \u0938\u0930\u0941\u0935\u093E\u0924 \u0938\u0915\u094D\u0930\u093F\u092F',
    sessionInactive: '\u0915\u0941\u0928\u0948 \u0938\u0930\u0941\u0935\u093E\u0924 \u091B\u0948\u0928',
    traineeNameLabel: '\u0924\u093E\u0932\u093F\u092E\u093E\u0930\u094D\u0925\u0940\u0915\u094B \u0928\u093E\u092E',
    scenarioLabel: '\u0921\u094D\u0930\u093F\u0932 \u092A\u0930\u093F\u0926\u0943\u0936\u094D\u092F',
    freeDrill: '\u0928\u093F\u0936\u0941\u0932\u094D\u0915 \u0921\u094D\u0930\u093F\u0932',
    drillProgress: '\u0921\u094D\u0930\u093F\u0932 \u092A\u094D\u0930\u0917\u0924\u093F',
    sessionSummary: '\u0938\u0930\u0941\u0935\u093E\u0924 \u0938\u093E\u0930\u093E\u0902\u0936',
    totalIncidentsLabel: '\u0915\u0941\u0932 \u0918\u091F\u0928\u093E',
    ackedLabel: '\u0938\u094D\u0935\u0940\u0915\u093E\u0930',
    resolvedLabel: '\u0938\u092E\u093E\u0927\u093E\u0928',
    escalatedLabel: '\u0909\u091A\u094D\u091A \u0938\u094D\u0924\u0930',
    avgResponseLabel: '\u0914\u0938\u0924 \u092A\u094D\u0930\u0924\u093F\u0915\u094D\u0930\u093F\u092F\u093E \u0938\u092E\u092F',
    secondsLabel: '\u0938\u0947',
    incidentsLabel: '\u0918\u091F\u0928\u093E',
    ok: '\u0939\u0941\u0928\u094D\u091B \u2705',
    beatOfficer: '\u{1F694} \u092C\u093F\u091F \u0905\u092B\u093F\u0938\u0930',
    officerDuty: '\u0921\u094D\u092F\u0941\u091F\u0940 \u0938\u093F\u092B\u094D\u091F',
    officerName: '\u0905\u092B\u093F\u0938\u0930\u0915\u094B \u0928\u093E\u092E *',
    officerContact: '\u0938\u092E\u094D\u092A\u0930\u094D\u0915 \u0928\u092E\u094D\u092C\u0930',
    officerVillage: '\u0924\u094B\u0915\u093F\u090F\u0915\u094B \u0917\u093E\u0909\u0901',
    startShift: '\u25B6 \u0921\u094D\u092F\u0941\u091F\u0940 \u0938\u0941\u0930\u0941 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D',
    endShift: '\u{1F534} \u0921\u094D\u092F\u0941\u091F\u0940 \u0905\u0928\u094D\u0924\u094D\u092F',
    activeOfficers: '\u0921\u094D\u092F\u0941\u091F\u0940\u092E\u093E \u0930\u0939\u0947\u0915\u093E \u0905\u092B\u093F\u0938\u0930\u0939\u0930\u0942',
    officerSince: '\u092F\u0938\u0930\u093F \u0921\u094D\u092F\u0941\u091F\u0940 \u0938\u0941\u0930\u0941',
    officerOnDuty: '\u{1F694} \u0921\u094D\u092F\u0941\u091F\u0940\u092E\u093E \u0905\u092B\u093F\u0938\u0930',
    endShiftConfirm: '\u092F\u094B \u0921\u094D\u092F\u0941\u091F\u0940 \u0938\u093F\u092B\u094D\u091F \u0905\u0928\u094D\u0924\u094D\u092F \u0917\u0930\u094D\u0928\u0947?',
    villageSelect: '\u0917\u093E\u0909\u0901 \u091A\u092F\u0928 \u0917\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D...',
    smsAlertTitle: '📱 SMS सूचना — पठाउने समय समाप्त',
    smsAlertDesc: 'पठाउने समय समाप्त भयो। वरिष्ठ अधिकारीलाई SMS सूचना पठाइयो।',
    smsTo: 'प्राप्तकर्ता',
    smsFrom: 'पठाउने',
    smsMessage: 'सन्देश',
    smsDelivered: '✅ SMS पठाइयो',
    smsSending: 'पठाउँदै',
    smsDismiss: 'बन्द गर्नुहोस्',
    smsSimulated: '📡 डेमो मोड — SMS सूचना अनुकरण (वास्तविक SMS उत्पादनमा)',
    smsSuperiorName: 'डीआईजीपी भुपेन्द्र बहादुर खत्री',
    smsSuperiorPhone: '98512345678',
    smsSentTo: 'वरिष्ठ अधिकारीलाई SMS पठाइयो',
    smsIncidentDetails: 'घटना विवरण',
    smsNode: 'नोड',
    smsCategory: 'श्रेणी',
    smsCitizen: 'नागरिक',
    smsNote: 'नोट',
    smsAction: 'पठाउने योजना तुरुन्त पठाउनुहोस्।',
    superiorContact: 'वरिष्ठ सम्पर्क',
    superiorNameLabel: 'वरिष्ठको नाम',
    superiorPhoneLabel: 'वरिष्ठको फोन',
    save: 'सुरक्षित गर्नुहोस्',
    currentSuperior: 'हालको वरिष्ठ',
    notConfigured: 'कन्फिगर गरिएको छैन',
    clearAll: '🗑️ सबै मेटाउनुहोस्',
    clearAllConfirm: 'ड्यासबोर्डबाट सबै घटनाहरू मेटाउने? यो पूर्ववत गर्न सकिँदैन।',
    volunteerBroadcast: '📡 BLE प्रसारण — नजिकका स्वयंसेवकहरूलाई सूचना',
    volunteerAlert: 'स्वयंसेवक सूचना',
    nearbyVolunteers: 'नजिकका स्वयंसेवकहरू',
    volunteersNotified: 'स्वयंसेवकहरूलाई सूचना',
    volunteerBeacon: 'स्वयंसेवक अलर्ट बिकन सक्रिय',
    volunteerPanel: 'सामुदायिक स्वयंसेवक सञ्जाल',
    volunteerTotal: 'जम्मा सूचित',
    volunteerStatusNotified: '🔔 सूचित',
    volunteerStatusResponding: '🚶 प्रतिक्रिया दिँदै',
    volunteerStatusArrived: '📍 आइपुगे',
    volunteerDistance: 'टाढा',
    volunteerNoData: 'कुनै सक्रिय स्वयंसेवक सूचना छैन',
    phoneConfirmed: '📱 फोन पुष्टि',
    phoneSimulated: '🔄 अनुकरण',
    phoneScannedBy: 'स्क्यान गर्यो',
    phoneRSSI: 'RSSI',
    simulatedBadge: '🧪 अनुकरण',
  },
};

const socket = io(`http://${window.location.hostname}:3001`, { reconnection: true, reconnectionDelay: 500 });

function MapFlyTo({ center }) {
  const map = useMap();
  const lastCenterRef = useRef(null);
  useEffect(() => { 
    if (!center) return;
    if (lastCenterRef.current?.[0] === center[0] && lastCenterRef.current?.[1] === center[1]) return;
    map.flyTo(center, 14, { duration: 1 }); 
    lastCenterRef.current = center;
  }, [center, map]);
  return null;
}
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}
function MapBoundsFitter({ nodes }) {
  const map = useMap();
  useEffect(() => {
    if (nodes && nodes.length > 0) {
      const bounds = L.latLngBounds(nodes.map(n => n.coords));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [map, nodes]);
  return null;
}

function useSirenSound() {
  const audioCtxRef = useRef(null);
  const oscRef = useRef(null);
  const gainRef = useRef(null);
  const playingRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      try { oscRef.current?.stop(); } catch(e) {}
      if (audioCtxRef.current?.state !== 'closed') {
        audioCtxRef.current?.close().catch(() => {});
      }
    };
  }, []);

  const startSiren = useCallback(async () => {
    if (playingRef.current) return;

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.start();

      oscRef.current = osc;
      gainRef.current = gain;
      playingRef.current = true;

      // Woop-woop siren: alternate 600Hz ↔ 1200Hz every 250ms
      let high = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        if (!playingRef.current || !oscRef.current) return;
        high = !high;
        try { 
          oscRef.current.frequency.setValueAtTime(high ? 1200 : 600, ctx.currentTime); 
        } catch(e) {
          clearInterval(intervalRef.current);
        }
      }, 250);
    } catch (err) {
      console.error('Failed to start siren:', err);
    }
  }, []);

  const stopSiren = useCallback(() => {
    playingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    try {
      if (gainRef.current && audioCtxRef.current) {
        gainRef.current.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05);
      }
      const currentOsc = oscRef.current;
      setTimeout(() => { 
        try { currentOsc?.stop(); } catch(e) {} 
      }, 100);
    } catch(e) {}
    oscRef.current = null;
  }, []);

  return { startSiren, stopSiren };
}


function CoverageOverlay({ nodes, activeNodeIDs }) {
  return (
    <>
      {/* Coverage circles for each node */}
      {nodes.map(node => (
        <Circle
          key={`coverage-${node.id}`}
          center={node.coords}
          radius={COVERAGE_RADIUS}
          pathOptions={{
            color: NODE_COLORS[node.id] || '#6b7280',
            fillColor: NODE_COLORS[node.id] || '#6b7280',
            fillOpacity: 0.2,
            weight: 2,
            opacity: 0.6,
          }}
        >
          <Popup>
            <div className="text-gray-900 text-[11px]">
              <div className="font-bold text-sm" style={{color: NODE_COLORS[node.id]}}>{node.id}</div>
              <div className="text-gray-600 mt-1">{node.name}</div>
              <div className="text-gray-500 mt-1">Coverage radius: {(COVERAGE_RADIUS/1000).toFixed(1)}km</div>
              <div className="text-gray-500">Covers surrounding village area</div>
            </div>
          </Popup>
        </Circle>
      ))}
    </>
  );
}


function MapLegend() {
  return (
    <div className="absolute bottom-4 right-4 z-[10000] bg-gray-900/85 backdrop-blur-sm px-3 py-2.5 rounded-xl border border-gray-700/50 text-[10px] shadow-lg pointer-events-auto min-w-[140px]">
      <div className="font-bold text-gray-300 mb-2 text-[9px] uppercase tracking-wider border-b border-gray-800 pb-1">Map Legend</div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-gray-400 font-semibold">Node A</span>
          </div>
          <span className="text-[8px] text-gray-600 font-mono">850m Relay</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-gray-400 font-semibold">Node B</span>
          </div>
          <span className="text-[8px] text-gray-600 font-mono">850m Relay</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-400 font-semibold">Node C</span>
          </div>
          <span className="text-[8px] text-gray-600 font-mono">850m Relay</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-800/60 pt-1.5 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs">🚨</span>
            <span className="text-gray-400 font-semibold">HQ Command</span>
          </div>
          <span className="text-[8px] text-purple-400 font-mono">Control</span>
        </div>
      </div>
    </div>
  );
}

function NodeLabels({ nodes }) {
  const map = useMap();
  useEffect(() => {
    const labels = nodes.map(node => {
      const displayName = node.id === 'CMD_CTRL' ? 'COMMAND CENTER' : node.id.replace('_', ' ');
      const el = L.divIcon({
        className: 'node-label',
        html: `<div style="color:${NODE_COLORS[node.id] || '#6b7280'};font-size:9px;font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.8),0 0 6px rgba(0,0,0,0.6);letter-spacing:0.5px;background:rgba(3,7,18,0.6);padding:1px 5px;border-radius:4px;backdrop-filter:blur(2px);border:1px solid ${NODE_COLORS[node.id] || '#6b7280'}40">${displayName}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, node.id === 'CMD_CTRL' ? -22 : -16],
      });
      return L.marker(node.coords, { icon: el, interactive: false, zIndexOffset: 1000 }).addTo(map);
    });
    return () => labels.forEach(l => map.removeLayer(l));
  }, [map, nodes]);
  return null;
}

function AgencyCoordinationTracker({ dispatchedAt }) {
  const startTs = dispatchedAt || (Date.now() - 10000);
  const [elapsed, setElapsed] = React.useState(Date.now() - startTs);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTs);
    }, 100);
    return () => clearInterval(interval);
  }, [startTs]);

  const agencies = [
    { name: 'Hospital Services', icon: '🏥', delay: 1200 },
    { name: 'Nepal Army Command', icon: '🪖', delay: 2700 },
    { name: 'Armed Police Force (APF)', icon: '🛡️', delay: 4200 },
    { name: 'Local Volunteers Chain', icon: '🤝', delay: 5700 },
  ];

  return (
    <div className="mt-2.5 p-2.5 bg-purple-950/20 border border-purple-900/30 rounded-xl">
      <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
        <span>📡 Agency Dispatch Coordination</span>
        {elapsed < 6500 ? (
          <span className="text-[8px] text-purple-300 animate-pulse font-mono">Syncing...</span>
        ) : (
          <span className="text-[8px] text-green-400 font-mono">Completed</span>
        )}
      </div>
      <div className="space-y-1.5">
        {agencies.map((agency, idx) => {
          const isDone = elapsed >= agency.delay;
          const isCurrent = elapsed >= (agency.delay - 600) && elapsed < agency.delay;
          return (
            <div
              key={idx}
              className={`flex items-center justify-between text-[10px] transition-all duration-500 px-2 py-1 rounded-lg ${
                isDone ? 'text-gray-300 bg-gray-800/20 border border-gray-700/10' : isCurrent ? 'text-purple-300 bg-purple-900/20 border border-purple-800/20 animate-pulse' : 'text-gray-600 opacity-20'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs">{agency.icon}</span>
                <span className={isDone ? 'font-medium' : ''}>{agency.name}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[8.5px]">
                {isDone ? (
                  <span className="text-green-400 font-bold">✓ INFORMED</span>
                ) : isCurrent ? (
                  <span className="text-purple-400 font-semibold animate-pulse">NOTIFYING...</span>
                ) : (
                  <span className="text-gray-700">PENDING</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SMSAlertModal({ data, onDismiss, getCategoryInfo, openInGMaps, t, superiorName, superiorPhone }) {
  const [smsPhase, setSmsPhase] = React.useState('sending');
  const [dots, setDots] = React.useState('');

  React.useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);
    const deliveredTimer = setTimeout(() => {
      clearInterval(dotInterval);
      setSmsPhase('delivered');
    }, 2500);
    const autoDismiss = setTimeout(() => {
      onDismiss();
    }, 6000);
    return () => {
      clearInterval(dotInterval);
      clearTimeout(deliveredTimer);
      clearTimeout(autoDismiss);
    };
  }, [onDismiss]);

  const cat = getCategoryInfo(data);
  const now = new Date().toLocaleTimeString();

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={onDismiss}>
      <div className="sms-phone-frame bg-gray-900 border border-purple-700/50 rounded-2xl p-5 w-full max-w-sm mx-4 shadow-[0_0_60px_rgba(168,85,247,0.15)]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{'\u{1F4F1}'}</span>
            <h2 className="text-base font-bold text-purple-300">{t.smsAlertTitle}</h2>
          </div>
          <button onClick={onDismiss} className="text-gray-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        <div className="text-[10px] text-gray-400 mb-4 leading-relaxed bg-purple-950/20 border border-purple-800/30 rounded-xl px-3 py-2">
          {t.smsAlertDesc}
        </div>

        {/* 📱 Phone Mockup — SMS Conversation */}
        <div className="bg-gray-950 rounded-xl border border-gray-700/50 overflow-hidden mb-3">
          {/* Phone top bar */}
          <div className="bg-gray-900 px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[9px] font-bold text-white">SK</div>
              <div>
                <div className="text-[10px] font-bold text-gray-200">{superiorName}</div>
                <div className="text-[7px] text-gray-500">{superiorPhone}</div>
              </div>
            </div>
            <div className="text-[8px] text-gray-600 font-mono">{now}</div>
          </div>

          {/* SMS conversation thread */}
          <div className="p-3 space-y-2.5 min-h-[140px]">
            {/* SMS from system */}
            <div className="flex justify-start">
              <div className="bg-purple-900/40 border border-purple-800/30 rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
                <div className="text-[9px] text-purple-300 font-bold mb-0.5">Prahari-Link Alert</div>
                <div className="text-[10px] text-gray-200 leading-relaxed">
                  {'\u26A0\uFE0F'} URGENT: Dispatch timeout for incident at <strong>{data.nodeID}</strong>.
                </div>
                <div className="text-[9px] text-gray-400 mt-1">
                  Category: {cat.label} | Severity: {cat.severity}
                </div>
                {data.citizenName && (
                  <div className="text-[9px] text-gray-400 mt-0.5">
                    Reported by: {data.citizenName}
                  </div>
                )}
                {data.note && (
                  <div className="text-[9px] text-gray-500 italic mt-0.5">"{data.note.slice(0, 60)}{data.note.length > 60 ? '...' : ''}"</div>
                )}
                <div className="text-[9px] text-gray-500 mt-1">{t.smsAction}</div>
              </div>
            </div>

            {/* Sending indicator */}
            <div className="flex justify-start">
              <div className={`rounded-2xl px-3 py-2 text-[9px] transition-all duration-500 ${smsPhase === 'delivered' ? 'bg-green-900/20 border border-green-800/30' : 'bg-gray-800/60 border border-gray-700/30'}`}>
                {smsPhase === 'sending' ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-purple-400 animate-pulse">{t.smsSending}{dots}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-xs">{'\u2705'}</span>
                    <span className="text-green-400 font-bold">{t.smsDelivered}</span>
                    <span className="text-green-600/60 text-[7px]">{now}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Incident summary */}
        <div className="p-2.5 bg-gray-800/40 border border-gray-700/30 rounded-xl mb-3">
          <div className="text-[8px] text-gray-500 font-bold uppercase tracking-wider mb-1">{t.smsIncidentDetails}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
            <span className="text-gray-500">{t.smsNode}:</span>
            <span className="text-gray-200 font-mono text-right">{data.nodeID}</span>
            <span className="text-gray-500">{t.smsCategory}:</span>
            <span className={`text-right ${cat.color}`}>{cat.label}</span>
            {data.citizenName && (
              <>
                <span className="text-gray-500">{t.smsCitizen}:</span>
                <span className="text-gray-200 text-right">{data.citizenName}</span>
              </>
            )}
            <span className="text-gray-500">GPS:</span>
            <span className="text-gray-200 font-mono text-right cursor-pointer hover:text-blue-400" onClick={() => openInGMaps(data.coords?.[0], data.coords?.[1])}>
              {data.coords?.[0]?.toFixed(4)}, {data.coords?.[1]?.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Simulated badge */}
        <div className="text-[8px] text-purple-400/60 text-center mb-3">
          {t.smsSimulated}
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="w-full py-2.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold rounded-xl transition-colors"
        >
          {t.smsDismiss}
        </button>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Helper to calculate distance between phone GPS and node
const getDistance = (inc, nodes) => {
  if (!inc || !inc.coords || !inc.coords[0] || !inc.coords[1]) return null;
  const nodesList = nodes || [];
  const node = nodesList.find(n => n.id === inc.nodeID);
  if (!node || !node.coords) return null;
  const latDiff = (inc.coords[0] - node.coords[0]) * 111320;
  const lonDiff = (inc.coords[1] - node.coords[1]) * 111320 * Math.cos(inc.coords[0] * Math.PI / 180);
  return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
};

// Helper to get coordinates for map display
const getMapCoords = (inc) => {
  if (!inc || !inc.coords || !inc.coords[0] || !inc.coords[1]) return null;
  return inc.coords;
};

export default function App() {
  const [incidents, setIncidents] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({});

  // Dynamically derive nodes from heartbeats/statuses
  const dynamicNodes = React.useMemo(() => {
    return Object.entries(nodeStatuses).map(([id, s]) => ({
      id,
      name: `Active Node: ${id}`,
      coords: [s.lat, s.lon]
    }));
  }, [nodeStatuses]);

  const [lastIncident, setLastIncident] = useState(null);
  const [alertActive, setAlertActive] = useState(false);
  const [modulesExpanded, setModulesExpanded] = useState(true);
  const [locationsExpanded, setLocationsExpanded] = useState(true);
  const [language, setLanguage] = useState('en');
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [pendingNodeID, setPendingNodeID] = useState(null);
  const [dispatchInfo, setDispatchInfo] = useState({ equipment: [] });
  const [escalationTimeLeft, setEscalationTimeLeft] = useState(ESCALATION_TIMEOUT);
  const [showNDRRMAForm, setShowNDRRMAForm] = useState(false);
  const [pendingNDRRMANodeID, setPendingNDRRMANodeID] = useState(null);
  const [ndrrmAConfirmed, setNdrrmAConfirmed] = useState(false);
  const { startSiren, stopSiren } = useSirenSound();
  const t = TRANSLATIONS[language];

  const [trainingMode, setTrainingMode] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [traineeName, setTraineeName] = useState('');
  const [selectedScenario, setSelectedScenario] = useState('');
  const [drillProgress, setDrillProgress] = useState(null);
  const [officers, setOfficers] = useState([]);
  const [showOfficerForm, setShowOfficerForm] = useState(false);
  const [officerName, setOfficerName] = useState('');
  const [officerContact, setOfficerContact] = useState('');
  const [selectedOfficerVillage, setSelectedOfficerVillage] = useState('');
  const [showSMSAlert, setShowSMSAlert] = useState(false);
  const [smsAlertData, setSmsAlertData] = useState(null);
  const [superiorName, setSuperiorName] = useState('DSP Anudit Khatri');
  const [superiorPhone, setSuperiorPhone] = useState('9851291019');
  const [showSuperiorSettings, setShowSuperiorSettings] = useState(false);
  const [pendingTimerKey, setPendingTimerKey] = useState(null);
  const [firInputs, setFirInputs] = useState({});
  const [volunteerData, setVolunteerData] = useState({}); // { nodeID: { incident, volunteers: [{name, dist, status}] } }
  const [bleConfirmedNodes, setBleConfirmedNodes] = useState({}); // { nodeID: { volunteerName, rssi, confirmedAt } }
  const volunteerTimersRef = useRef({});
  const incidentsRef = useRef(incidents);
  const escalationTimersRef = useRef({});
  useEffect(() => { incidentsRef.current = incidents; }, [incidents]);

  const getCategoryInfo = (inc) => {
    if (inc.category && CATEGORY_CONFIG[inc.category]) return CATEGORY_CONFIG[inc.category];
    if (inc.type === 'SOS') return { color: 'bg-red-600/20 text-red-400', label: '\u{1F198} SOS', severity: 'HIGH', sevColor: 'bg-orange-600/30 text-orange-300' };
    if (inc.type === 'FIRE') return { color: 'bg-orange-600/20 text-orange-400', label: '\u{1F525} FIRE', severity: 'HIGH', sevColor: 'bg-orange-600/30 text-orange-300' };
    if (inc.type === 'RISK') return { color: 'bg-yellow-600/20 text-yellow-400', label: '\u26A0\uFE0F RISK', severity: 'MEDIUM', sevColor: 'bg-yellow-600/30 text-yellow-300' };
    if (inc.type === 'INFO') return { color: 'bg-blue-600/20 text-blue-400', label: '\u2139\uFE0F INFO', severity: 'MEDIUM', sevColor: 'bg-yellow-600/30 text-yellow-300' };
    if (inc.type === 'MISSING') return { color: 'bg-yellow-600/20 text-yellow-400', label: '\u{1F50D} MISSING', severity: 'MEDIUM', sevColor: 'bg-yellow-600/30 text-yellow-300' };
    return { color: 'bg-gray-600/20 text-gray-400', label: inc.type, severity: '', sevColor: '' };
  };

  const processedIncidents = React.useMemo(() => {
    const active = incidents.filter(
      inc => inc.status !== 'acknowledged' && inc.status !== 'dispatched' && inc.status !== 'escalated' && inc.status !== 'resolved' && !inc.fir_number
    );
    const sortedActive = [...active].sort((a, b) => {
      const aSev = SEVERITY_ORDER[getCategoryInfo(a).severity] ?? 3;
      const bSev = SEVERITY_ORDER[getCategoryInfo(b).severity] ?? 3;
      if (aSev !== bSev) return aSev - bSev;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });
    
    const archived = incidents.filter(inc => inc.status === 'resolved' || inc.fir_number);
    
    return { sortedActive, archived };
  }, [incidents]);

  const activeNodeIDs = React.useMemo(() => new Set(
    processedIncidents.sortedActive.map(inc => inc.nodeID)
  ), [processedIncidents.sortedActive]);

  useEffect(() => {
    // Request initial incidents immediately
    socket.emit('request_initial_incidents');

    socket.on('new_incident', (data) => {
      setIncidents(prev => {
        // Prevent duplicates
        if (prev.some(inc => (inc.alert_id && inc.alert_id === data.alert_id) || (inc.nodeID === data.nodeID && inc.timestamp === data.timestamp))) {
          return prev;
        }
        
        console.log('INCIDENT:', data);
        const newIncidents = [data, ...prev];
        setLastIncident(data);
        
        // Trigger siren/alert for both real and simulated incidents (demo-friendly)
        setAlertActive(true);
        startSiren().catch(() => {});
        return newIncidents;
      });

      // ── Simulate volunteer BLE notifications ──────────────────────────
      const volunteerNames = [
        'Rajesh Gurung', 'Anita Thapa', 'Bishnu Rai', 'Sunita Sharma',
        'Krishna Limbu', 'Maya Tamang', 'Ram KC', 'Gita Baral',
        'Hari Acharya', 'Sita Poudel', 'Milan Shrestha', 'Laxmi Neupane'
      ];
      const volCount = 3 + Math.floor(Math.random() * 3); // 3-5 volunteers
      const volunteers = [];
      for (let v = 0; v < volCount; v++) {
        const name = volunteerNames[Math.floor(Math.random() * volunteerNames.length)];
        const dist = Math.round(40 + Math.random() * 460); // 40-500m
        volunteers.push({ name, dist, status: 'notified', id: `${data.nodeID}_vol_${v}_${Date.now()}` });
      }
      setVolunteerData(prev => ({
        ...prev,
        [data.nodeID]: { incident: data, volunteers, notifiedAt: Date.now() }
      }));

      // Progress volunteer statuses: notified → responding after 5s → arrived after 15s
      const respTimer = setTimeout(() => {
        setVolunteerData(prev => {
          if (!prev[data.nodeID]) return prev;
          return {
            ...prev,
            [data.nodeID]: {
              ...prev[data.nodeID],
              volunteers: prev[data.nodeID].volunteers.map(v => ({
                ...v, status: v.status === 'notified' ? 'responding' : v.status
              }))
            }
          };
        });
      }, 5000);
      const arriveTimer = setTimeout(() => {
        setVolunteerData(prev => {
          if (!prev[data.nodeID]) return prev;
          return {
            ...prev,
            [data.nodeID]: {
              ...prev[data.nodeID],
              volunteers: prev[data.nodeID].volunteers.map(v => ({
                ...v, status: v.status === 'responding' ? 'arrived' : v.status
              }))
            }
          };
        });
      }, 15000);
      volunteerTimersRef.current[`resp_${data.nodeID}`] = respTimer;
      volunteerTimersRef.current[`arr_${data.nodeID}`] = arriveTimer;

      // ── Auto-simulate phone BLE acknowledgment (fallback) ───────────
      // Randomly mark ~50% of incidents as phone-BLE-confirmed after 8-18s
      if (Math.random() < 0.5) {
        const bleSimDelay = 8000 + Math.floor(Math.random() * 10000);
        const bleSimTimer = setTimeout(() => {
          const volNames = [
            'Rajesh Gurung', 'Anita Thapa', 'Bishnu Rai', 'Sunita Sharma',
            'Krishna Limbu', 'Maya Tamang', 'Ram KC', 'Gita Baral',
            'Hari Acharya', 'Sita Poudel', 'Milan Shrestha', 'Laxmi Neupane'
          ];
          const scannerName = volNames[Math.floor(Math.random() * volNames.length)];
          const rssi = -45 - Math.floor(Math.random() * 35);
          setBleConfirmedNodes(prev => ({
            ...prev,
            [data.nodeID]: { volunteerName: scannerName, rssi, confirmedAt: Date.now() }
          }));
          console.log(`📱 Auto-sim: Phone BLE confirmed ${data.nodeID} (${scannerName}, ${rssi}dBm)`);
        }, bleSimDelay);
        volunteerTimersRef.current[`ble_sim_${data.nodeID}`] = bleSimTimer;
      }

      // Start 5-min escalation timer from the moment the incident arrives
      // If officer doesn't acknowledge+dispatch within 5 min → auto SMS to superior
      const timerKey = `${data.nodeID}__${Date.parse(data.timestamp)}`;
      const timerId = setTimeout(() => {
        const currentInc = incidentsRef.current.find(
          inc => inc.nodeID === data.nodeID && inc.status !== 'acknowledged' && inc.status !== 'dispatched'
        );
        if (currentInc) {
          setSmsAlertData(currentInc);
          setShowSMSAlert(true);
          setIncidents(prev => prev.map(inc =>
            inc.nodeID === data.nodeID ? { ...inc, status: 'escalated' } : inc
          ));
          socket.emit('escalate_incident', data.nodeID);
        }
        delete escalationTimersRef.current[timerKey];
      }, ESCALATION_TIMEOUT * 1000);
      escalationTimersRef.current[timerKey] = timerId;
    });
    socket.on('connect', () => {
      console.log('Socket connected');
      // Explicitly request initial incidents — the listener is DEFINITELY registered now
      socket.emit('request_initial_incidents');
      socket.emit('get_active_officers');
    });
    socket.on('disconnect', () => console.log('Socket disconnected'));

    // Receive backlog of recent incidents after explicit request (race condition prevention)
    socket.on('initial_incidents', (initial) => {
      console.log('Initial incidents received:', initial ? initial.length : 0);
      if (!initial || initial.length === 0) {
        setIncidents([]);
        setLastIncident(null);
        return;
      }
      setIncidents(prev => {
        const existingIDs = new Set(prev.map(i => `${i.nodeID}__${i.timestamp}`));
        const fresh = initial.filter(i => !existingIDs.has(`${i.nodeID}__${i.timestamp}`));
        return [...fresh, ...prev];
      });
      setLastIncident(initial[0]);
    });

    // Also fetch initial incidents from REST API as a robust fallback
    const abortCtrl = new AbortController();
    fetch('http://localhost:3001/api/alerts', { signal: abortCtrl.signal })
      .then(r => r.json())
      .then(data => {
        if (data.incidents && data.incidents.length > 0) {
          console.log('REST API initial incidents:', data.incidents.length);
          setIncidents(prev => {
            const existingIDs = new Set(prev.map(i => `${i.nodeID}__${i.timestamp}`));
            const fresh = data.incidents.filter(i => !existingIDs.has(`${i.nodeID}__${i.timestamp}`));
            if (fresh.length === 0) return prev;
            return [...fresh, ...prev];
          });
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.log('REST API fetch failed:', err.message);
        }
      });

    // Listen for DB-backed updates from server (dispatch confirmations, etc.)
    socket.on('incident_updated', (data) => {
      console.log('Incident updated:', data);
      setIncidents(prev => {
        let updated = false;
        return prev.map(inc => {
          const matchByAlertId = data.alert_id && inc.alert_id === data.alert_id;
          const matchByNodeId = !data.alert_id && inc.nodeID === data.nodeID && inc.status !== 'resolved';
          if (!updated && (matchByAlertId || matchByNodeId)) {
            updated = true;
            return { ...inc, ...data, dispatchedAt: inc.dispatchedAt || Date.now() };
          }
          return inc;
        });
      });
    });

    // Listen for node heartbeat/status updates
    socket.on('node_status', (statuses) => {
      setNodeStatuses(statuses);
    });

    socket.on('training_mode_state', (data) => {
      setTrainingMode(data.enabled);
    });

    socket.on('training_data_cleared', () => {
      // Remove training-tagged incidents from the dashboard
      // Also clear their escalation timers using unique timer keys
      incidentsRef.current.forEach(inc => {
        if (inc.training) {
          const key = `${inc.nodeID}__${Date.parse(inc.timestamp)}`;
          if (escalationTimersRef.current[key]) {
            clearTimeout(escalationTimersRef.current[key]);
            delete escalationTimersRef.current[key];
          }
        }
      });
      setIncidents(prev => prev.filter(inc => !inc.training));
    });

    socket.on('training_session_started', (data) => {
      setActiveSession(data);
    });

    socket.on('training_session_ended', (data) => {
      setActiveSession(null);
      setDrillProgress(null);
      if (data.summary) setSessionSummary(data.summary);
    });

    socket.on('drill_progress', (data) => {
      setDrillProgress(data);
    });

    socket.on('node_heartbeat', (data) => {
      setNodeStatuses(prev => ({
        ...prev,
        [data.nodeID]: {
          lastSeen: Date.now(),
          battery_pct: data.battery_pct ?? prev[data.nodeID]?.battery_pct ?? 0,
          solar_ok: data.solar_ok ?? prev[data.nodeID]?.solar_ok ?? 0,
          lat: data.lat ?? prev[data.nodeID]?.lat ?? 0,
          lon: data.lon ?? prev[data.nodeID]?.lon ?? 0,
          status: 'online',
          elapsed: 0,
        },
      }));
    });

    socket.on('officers_updated', (officerList) => {
      setOfficers(officerList);
    });

    socket.on('officer_assigned', (data) => {
      if (data.officer) {
        setOfficers(prev => {
          const filtered = prev.filter(o => o.officer_id !== data.officer.officer_id);
          return [data.officer, ...filtered];
        });
      }
    });

    // When another dashboard client clears all incidents
    socket.on('all_incidents_cleared', () => {
      Object.values(escalationTimersRef.current).forEach(clearTimeout);
      escalationTimersRef.current = {};
      setVolunteerData({});
      Object.values(volunteerTimersRef.current).forEach(clearTimeout);
      volunteerTimersRef.current = {};
      setIncidents([]);
      setLastIncident(null);
      setAlertActive(false);
      stopSiren();
      setShowDispatchForm(false);
      setPendingNodeID(null);
      setPendingTimerKey(null);
      setShowSMSAlert(false);
      setSmsAlertData(null);
      setShowNDRRMAForm(false);
      setPendingNDRRMANodeID(null);
      setBleConfirmedNodes({});
      setNdrrmAConfirmed(false);
    });

    // Phone BLE acknowledgment from real phone or mock injector
    socket.on('incident_ble_confirmed', (data) => {
      console.log('📱 Phone BLE confirmed:', data);
      setBleConfirmedNodes(prev => ({
        ...prev,
        [data.nodeID]: { volunteerName: data.volunteerName || 'Phone', rssi: data.rssi || -60, confirmedAt: Date.parse(data.confirmedAt) || Date.now() }
      }));
    });

    return () => {
      // Flush all pending escalation timers on unmount
      Object.values(escalationTimersRef.current).forEach(clearTimeout);
      escalationTimersRef.current = {};
      // Flush all volunteer simulation timers on unmount
      Object.values(volunteerTimersRef.current).forEach(clearTimeout);
      volunteerTimersRef.current = {};

      // Abort the REST API fetch if component unmounts (StrictMode safety)
      abortCtrl.abort();

      socket.off('new_incident');
      socket.off('incident_updated');
      socket.off('node_status');
      socket.off('training_mode_state');
      socket.off('training_data_cleared');
      socket.off('training_session_started');
      socket.off('training_session_ended');
      socket.off('drill_progress');
      socket.off('node_heartbeat');
      socket.off('officers_updated');
      socket.off('officer_assigned');
      socket.off('all_incidents_cleared');
      socket.off('incident_ble_confirmed');
      socket.off('initial_incidents');
      socket.off('request_initial_incidents');
    };
  }, [startSiren]);

  // Reset session form when training mode is toggled
  useEffect(() => {
    if (!trainingMode) {
      setShowSessionForm(false);
      setTraineeName('');
      setSelectedScenario('');
      setActiveSession(null);
      setDrillProgress(null);
      setSessionSummary(null);
    }
  }, [trainingMode]);

  // Per-incident escalation timer: starts from incident trigger, not from form open
  const clearEscalationTimer = useCallback((timerKey) => {
    if (timerKey && escalationTimersRef.current[timerKey]) {
      clearTimeout(escalationTimersRef.current[timerKey]);
      delete escalationTimersRef.current[timerKey];
    }
  }, []);

  // Dispatch form countdown: shows time remaining since incident trigger
  useEffect(() => {
    if (!showDispatchForm || !pendingNodeID) return;
    const interval = setInterval(() => {
      const inc = incidentsRef.current.find(i => i.nodeID === pendingNodeID);
      if (inc) {
        const elapsed = Math.floor((Date.now() - new Date(inc.timestamp).getTime()) / 1000);
        setEscalationTimeLeft(Math.max(0, ESCALATION_TIMEOUT - elapsed));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [showDispatchForm, pendingNodeID]);  // Stop siren + clear alert when all incidents are resolved
  useEffect(() => {
    const hasActive = incidents.some(inc => 
      inc.status !== 'acknowledged' && 
      inc.status !== 'dispatched' && 
      inc.status !== 'escalated' && 
      inc.status !== 'resolved'
    );
    if (!hasActive && alertActive) {
      setAlertActive(false);
      stopSiren();
    }
  }, [incidents, alertActive, stopSiren]);
  const openDispatchForm = (nodeID) => {
    setPendingNodeID(nodeID);
    const inc = incidentsRef.current.find(i => i.nodeID === nodeID);
    // Store unique timer key so we clear the right timer (not a training vs real collision)
    setPendingTimerKey(inc ? `${nodeID}__${Date.parse(inc.timestamp)}` : null);
    setDispatchInfo({ commander: '', personnel: '', equipment: [], vehicle: '', notes: '' });
    // Compute remaining time from incident trigger timestamp
    const elapsed = inc ? Math.floor((Date.now() - new Date(inc.timestamp).getTime()) / 1000) : 0;
    setEscalationTimeLeft(Math.max(0, ESCALATION_TIMEOUT - elapsed));
    setShowDispatchForm(true);
  };

  const submitDispatch = () => {
    clearEscalationTimer(pendingTimerKey);
    const data = { nodeID: pendingNodeID, ...dispatchInfo };
    socket.emit('acknowledge_incident', data);
    // Optimistic update so UI immediately reflects dispatched status
    setIncidents(prev => {
      let updated = false;
      return prev.map(inc => {
        if (!updated && inc.nodeID === pendingNodeID &&
            inc.status !== 'resolved' && inc.status !== 'dispatched') {
          updated = true;
          return { ...inc, status: 'dispatched', dispatchInfo: dispatchInfo, dispatchedAt: Date.now() };
        }
        return inc;
      });
    });
    setShowDispatchForm(false);
    setPendingNodeID(null);
    setPendingTimerKey(null);
  };

  const clearAllIncidents = useCallback(() => {
    if (!window.confirm(t.clearAllConfirm)) return;
    // Flush all escalation timers so stale callbacks don't fire
    Object.values(escalationTimersRef.current).forEach(clearTimeout);
    escalationTimersRef.current = {};
    // Notify the backend to clear its state too
    socket.emit('clear_all_incidents');
    // Clear all incidents, close modals, stop siren
    setIncidents([]);
    setLastIncident(null);
    setAlertActive(false);
    stopSiren();
    setVolunteerData({});
    setBleConfirmedNodes({});
    Object.values(volunteerTimersRef.current).forEach(clearTimeout);
    volunteerTimersRef.current = {};
    setShowDispatchForm(false);
    setPendingNodeID(null);
    setPendingTimerKey(null);
    setShowSMSAlert(false);
    setSmsAlertData(null);
    setShowNDRRMAForm(false);
    setPendingNDRRMANodeID(null);
    setNdrrmAConfirmed(false);
  }, [t, stopSiren]);

  const toggleEquipment = (item) => {
    setDispatchInfo(prev => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter(e => e !== item)
        : [...prev.equipment, item]
    }));
  };

  // Open GPS coordinates in Google Maps
  const openInGMaps = (lat, lon) => {
    if (lat === undefined || lon === undefined) return;
    window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
  };


  return (
    <div className={`flex h-screen w-screen bg-gray-950 text-white font-sans overflow-hidden ${
      trainingMode ? 'border-4 border-orange-500/60 shadow-[inset_0_0_60px_rgba(251,146,60,0.08)]' : ''
    } ${alertActive ? 'sos-border-flash border-4 border-red-500/60' : ''}`} style={{ fontFamily: language === 'ne' ? "'Noto Sans Devanagari', sans-serif" : '' }}>
      {alertActive && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600/95 backdrop-blur text-white text-center py-4 shadow-[0_0_40px_rgba(239,68,68,0.5)]">
          <div className="flex items-center justify-center gap-4">
            <Bell className="animate-bounce" size={22} />
            <span className="font-bold text-xl tracking-wide">{t.newIncident}</span>
            <Bell className="animate-bounce" size={22} />
          </div>
          <div className="text-[10px] text-red-200 mt-1 opacity-80">Acknowledge the incident to silence the alarm</div>
        </div>
      )}

      {alertActive && <div className="sos-alert-overlay fixed inset-0" />}

      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg"><Shield className="text-white" size={20} /></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{t.title}</h1>
              <p className="text-[10px] text-gray-500">{t.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                // Optimistic update — toggle immediately, server will confirm
                setTrainingMode(prev => !prev);
                socket.emit('toggle_training_mode');
              }}
              className={`px-2 py-1 text-[9px] font-bold rounded-lg transition-all ${
                trainingMode
                  ? 'bg-orange-600 text-white border border-orange-500/50 shadow-[0_0_8px_rgba(251,146,60,0.4)]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title={trainingMode ? t.trainingOff : t.trainingToggle}
            >
              {trainingMode ? t.trainingOn : t.trainingToggle}
            </button>
            <button onClick={() => setLanguage(prev => prev === 'en' ? 'ne' : 'en')} className="px-2 py-1 text-[10px] bg-gray-800 rounded-lg hover:bg-gray-700">{language === 'en' ? '\u0928\u0947' : 'EN'}</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="bg-gray-800/40 rounded-xl border border-gray-700/50 overflow-hidden">
            <button onClick={() => setModulesExpanded(!modulesExpanded)} className="w-full flex items-center justify-between p-3 hover:bg-gray-700/30 transition-colors">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-blue-400" />
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{t.villageModules}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">{dynamicNodes.length}</span>
                {modulesExpanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
              </div>
            </button>
            {modulesExpanded && (
              <div className="px-3 pb-3 space-y-2">
                {[...STATIC_NODES, ...dynamicNodes.filter(dn => !STATIC_NODES.some(sn => sn.id === dn.id))].map(node => {
                  const isActive = activeNodeIDs.has(node.id);
                  const inc = incidents.find(i => i.nodeID === node.id && i.status !== 'resolved');
                  const isEscalated = inc?.status === 'escalated';
                  const isDispatched = inc?.status === 'acknowledged' || inc?.status === 'dispatched';
                  const hb = nodeStatuses[node.id];
                  const hbStatus = hb?.status || 'offline';
                  const lastSeenSecs = hb ? Math.round((Date.now() - hb.lastSeen) / 1000) : null;
                  
                  let cardClass = 'border-blue-800/30 bg-blue-950/10';
                  if (isEscalated) cardClass = 'border-orange-800/60 bg-orange-950/30';
                  else if (isActive) cardClass = 'border-red-800/60 bg-red-950/30';
                  else if (isDispatched) cardClass = 'border-green-800/60 bg-green-950/30';

                  return (
                    <div key={node.id} className={`p-3 rounded-lg border transition-all duration-300 ${cardClass}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${isEscalated ? 'bg-orange-500' : isActive ? 'bg-red-500' : isDispatched ? 'bg-green-500' : 'bg-blue-400'}`} />
                          <span className="font-bold text-sm">{node.id}</span>
                          <div className={`w-1.5 h-1.5 rounded-full ${hbStatus === 'online' ? 'bg-green-500' : 'bg-green-500 animate-pulse'}`} />
                        </div>
                        <div className="text-[10px] text-gray-500">{node.name}</div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 font-mono">
                          'Node Heartbeat'
                        </span>
                        {(inc?.battery_pct !== undefined || hb?.battery_pct !== undefined) && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500" style={{ width: `${inc?.battery_pct ?? hb?.battery_pct}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-gray-400">{(inc?.battery_pct ?? hb?.battery_pct)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t.activeIncidents}</h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => window.open('http://localhost:3001/api/alerts/export/csv', '_blank')}
                className="text-[9px] bg-gray-800 hover:bg-gray-700 text-gray-400 px-1.5 py-1 rounded-full transition-colors"
                title="Export all alerts as CSV"
              >
                {t.exportCSV}
              </button>
              <button
                onClick={clearAllIncidents}
                className="text-[9px] bg-red-900/40 hover:bg-red-800/50 text-red-400 px-1.5 py-1 rounded-full transition-colors"
                title={t.clearAll}
              >
                {t.clearAll}
              </button>
                  {trainingMode && (
                <>
                  <button
                    onClick={() => window.open('http://localhost:3001/api/training/export/csv', '_blank')}
                    className="text-[9px] bg-orange-900/40 hover:bg-orange-800/50 text-orange-400 px-1.5 py-1 rounded-full transition-colors"
                    title={t.trainingExport}
                  >
                    {'\u{1F9EA}'} CSV
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all training data?')) {
                        socket.emit('clear_training_data');
                        setActiveSession(null);
                        setDrillProgress(null);
                      }
                    }}
                    className="text-[9px] bg-red-900/30 hover:bg-red-800/50 text-red-400 px-1.5 py-1 rounded-full transition-colors"
                    title={t.trainingClear}
                  >
                    {'\u{1F5D1}\uFE0F'}
                  </button>
                </>
              )}
              <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{incidents.length}</span>
            </div>
          </div>

          {/* Beat Officer Duty Shift Panel */}
          <div className="bg-blue-950/20 border border-blue-800/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Shield size={12} className="text-blue-400" />
                <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">{t.beatOfficer}</span>
              </div>
              {officers.length > 0 && (
                <span className="text-[8px] text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded-full">{officers.length} {t.activeOfficers}</span>
              )}
            </div>

            {/* Active officers list */}
            {officers.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {officers.map(officer => {
                  const shiftDuration = Math.floor((Date.now() - new Date(officer.shift_start).getTime()) / 60000);
                  return (
                    <div key={officer.officer_id} className="flex items-center justify-between p-2 bg-blue-900/20 border border-blue-800/20 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          <span className="text-[10px] font-semibold text-blue-200 truncate">{officer.name}</span>
                        </div>
                        <div className="text-[8px] text-blue-400/70 mt-0.5">
                          {officer.contact && <span>{officer.contact} · </span>}
                          {officer.assigned_village ? <span>{officer.assigned_village} · </span> : null}
                          <span>{t.officerSince} {shiftDuration}m</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(t.endShiftConfirm)) {
                            socket.emit('end_officer_shift', officer.officer_id);
                          }
                        }}
                        className="px-1.5 py-1 bg-red-900/40 hover:bg-red-800/50 text-red-400 text-[7px] font-bold rounded-lg transition-colors ml-2"
                        title={t.endShift}
                      >
                        {t.endShift}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {showOfficerForm ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">{t.officerDuty}</span>
                  <button onClick={() => setShowOfficerForm(false)} className="text-gray-500 hover:text-white text-[10px]">\u2715</button>
                </div>
                <div className="space-y-2">
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-white"
                    placeholder={t.officerName}
                    value={officerName}
                    onChange={e => setOfficerName(e.target.value)}
                    maxLength={30}
                  />
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-white"
                    placeholder={t.officerContact}
                    value={officerContact}
                    onChange={e => setOfficerContact(e.target.value)}
                    maxLength={15}
                  />
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-white"
                    value={selectedOfficerVillage}
                    onChange={e => setSelectedOfficerVillage(e.target.value)}
                  >
                    <option value="">{t.villageSelect}</option>
                    {STATIC_NODES.map(n => (
                      <option key={n.id} value={n.id}>{n.id} - {n.name}</option>
                    ))}
                  </select>
                  <button
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                    disabled={!officerName.trim()}
                    onClick={() => {
                      socket.emit('start_officer_shift', {
                        name: officerName.trim(),
                        contact: officerContact.trim(),
                        assignedVillage: selectedOfficerVillage,
                      });
                      setShowOfficerForm(false);
                      setOfficerName('');
                      setOfficerContact('');
                      setSelectedOfficerVillage('');
                    }}
                  >
                    {t.startShift}
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setShowOfficerForm(true)}
                className="w-full py-2 bg-blue-700/50 hover:bg-blue-700 border border-blue-600/30 text-blue-300 text-[10px] font-bold rounded-lg transition-colors"
              >
                {t.startShift}
              </button>
            )}
          </div>

          {/* ── Community Volunteer Notification Panel ───────────────── */}
          {Object.keys(volunteerData).length > 0 && (
            <div className="bg-green-950/20 border border-green-800/30 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">{'\u{1F4E1}'}</span>
                  <span className="text-[10px] font-bold text-green-300 uppercase tracking-wider">{t.volunteerPanel}</span>
                </div>
                <span className="text-[8px] text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full animate-pulse">
                  {Object.values(volunteerData).reduce((sum, v) => sum + v.volunteers.length, 0)} {t.volunteerTotal}
                </span>
              </div>

              <div className="space-y-2">
                {Object.entries(volunteerData).map(([nodeID, vd]) => {
                  const isPhoneConfirmed = bleConfirmedNodes[nodeID] !== undefined;
                  const bleInfo = bleConfirmedNodes[nodeID];
                  return (
                  <div key={nodeID} className={`rounded-lg p-2 transition-all duration-500 ${
                    isPhoneConfirmed
                      ? 'bg-emerald-950/30 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
                      : 'bg-green-950/20 border border-green-800/20'
                  }`}>
                    {/* Incident header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${isPhoneConfirmed ? 'bg-emerald-400' : 'bg-green-500'} animate-pulse`} />
                        <span className={`text-[9px] font-bold ${isPhoneConfirmed ? 'text-emerald-300' : 'text-green-300'}`}>{nodeID}</span>
                        <span className="text-[8px] text-gray-500">{vd.incident.category || vd.incident.type}</span>
                        {/* Phone confirmed vs simulated badge */}
                        <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold ${
                          isPhoneConfirmed
                            ? 'bg-emerald-600/30 text-emerald-300'
                            : 'bg-blue-600/20 text-blue-300'
                        }`}>
                          {isPhoneConfirmed ? t.phoneConfirmed : t.phoneSimulated}
                        </span>
                      </div>
                      <span className="text-[8px] text-green-500 bg-green-900/30 px-1 rounded-full">
                        {vd.volunteers.filter(v => v.status === 'arrived').length}/{vd.volunteers.length}
                      </span>
                    </div>

                    {/* Phone-scanned volunteer info */}
                    {isPhoneConfirmed && bleInfo && (
                      <div className="flex items-center gap-1.5 mb-1.5 px-1 py-1 bg-emerald-950/40 border border-emerald-800/30 rounded-md">
                        <span className="text-[9px]">{'\u{1F4F1}'}</span>
                        <span className="text-[8px] text-emerald-300 font-semibold">{bleInfo.volunteerName}</span>
                        <span className="text-[7px] text-emerald-600">{t.phoneScannedBy}</span>
                        <span className="text-[7px] text-emerald-500 font-mono">{t.phoneRSSI}: {bleInfo.rssi}dBm</span>
                      </div>
                    )}

                    {/* Volunteer list */}
                    <div className="space-y-1">
                      {vd.volunteers.map(vol => {
                        const statusLabel = vol.status === 'notified' ? t.volunteerStatusNotified :
                          vol.status === 'responding' ? t.volunteerStatusResponding :
                          t.volunteerStatusArrived;
                        const statusColor = vol.status === 'notified' ? 'text-yellow-400' :
                          vol.status === 'responding' ? 'text-blue-400' : 'text-green-400';
                        return (
                          <div key={vol.id} className="flex items-center justify-between py-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className={`w-1 h-1 rounded-full ${statusColor}`} />
                              <span className="text-[9px] text-gray-200 truncate max-w-[80px]">{vol.name}</span>
                              <span className="text-[7px] text-gray-500">{vol.dist}m {t.volunteerDistance}</span>
                            </div>
                            <span className={`text-[8px] font-medium ${statusColor} transition-all duration-500`}>
                              {statusLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* BLE broadcast indicator */}
                    <div className="mt-1.5 flex items-center gap-1 text-[7px] text-green-600/70">
                      <span className="w-1 h-1 rounded-full bg-green-500 animate-ping" />
                      <span>{'\u{1F4E1}'} BLE {t.volunteerBeacon} — {vd.incident.coords ? `${vd.incident.coords[0].toFixed(4)}, ${vd.incident.coords[1].toFixed(4)}` : ''}</span>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {/* Training Session Management Panel */}
          {trainingMode && (
            <div className="bg-orange-950/20 border border-orange-800/30 rounded-xl p-3">
              {activeSession ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-orange-300 uppercase tracking-wider">{t.sessionActive}</span>
                    </div>
                    <button
                      onClick={() => socket.emit('end_training_session')}
                      className="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-[8px] font-bold rounded-lg"
                    >
                      {t.endSession}
                    </button>
                  </div>
                  <div className="space-y-1 text-[10px] text-gray-400">
                    <div><span className="text-gray-500">{t.traineeNameLabel}:</span> <span className="text-gray-200 font-semibold">{activeSession.traineeName}</span></div>
                    <div><span className="text-gray-500">{t.scenarioLabel}:</span> <span className="text-gray-200">{activeSession.scenarioName}</span></div>
                  </div>
                  {/* Drill progress bar */}
                  {drillProgress && (
                    <div className="mt-2">
                      <div className="flex justify-between text-[8px] text-gray-500 mb-1">
                        <span>{t.drillProgress}</span>
                        <span>{drillProgress.current}/{drillProgress.total} {t.incidentsLabel}</span>
                      </div>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full transition-all duration-500"
                          style={{ width: `${(drillProgress.current / drillProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : showSessionForm ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-orange-300 uppercase tracking-wider">{t.startSession}</span>
                    <button onClick={() => setShowSessionForm(false)} className="text-gray-500 hover:text-white text-[10px]">✕</button>
                  </div>
                  <div className="space-y-2">
                    <input
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-white"
                      placeholder={t.traineeNameLabel}
                      value={traineeName}
                      onChange={e => setTraineeName(e.target.value)}
                      maxLength={30}
                    />
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-white"
                      value={selectedScenario}
                      onChange={e => setSelectedScenario(e.target.value)}
                    >
                      <option value="">{t.freeDrill}</option>
                      <option value="FLOOD_DRILL">🏔️ Flood Mass Evacuation Drill</option>
                      <option value="LANDSLIDE_DRILL">🌊 Landslide Mass Casualty Drill</option>
                      <option value="EARTHQUAKE_DRILL">🏚️ Earthquake Response Drill</option>
                    </select>
                    <button
                      className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50"
                      disabled={!traineeName.trim()}
                      onClick={() => {
                        socket.emit('start_training_session', {
                          traineeName: traineeName.trim(),
                          scenarioID: selectedScenario,
                        });
                        setShowSessionForm(false);
                      }}
                    >
                      {'\u{25B6}'} {t.startSession}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowSessionForm(true);
                    setTraineeName('');
                    setSelectedScenario('');
                  }}
                  className="w-full py-2 bg-orange-700/50 hover:bg-orange-700 border border-orange-600/30 text-orange-300 text-[10px] font-bold rounded-lg transition-colors"
                >
                  {t.startSession}
                </button>
              )}
            </div>
          )}

          {incidents.length === 0 && (
            <div className="text-center py-8">
              <div className="relative mx-auto mb-4 w-16 h-16 flex items-center justify-center">
                <Radio className="text-gray-700 absolute" size={28} />
                <div className="absolute inset-0 border-2 border-gray-700/30 rounded-full animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-2 border-2 border-gray-700/20 rounded-full animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.3s' }} />
                <div className="absolute inset-4 border-2 border-gray-700/10 rounded-full animate-ping" style={{ animationDuration: '3s', animationDelay: '0.6s' }} />
              </div>
              <p className="text-gray-500 text-sm font-semibold">{t.waiting}</p>
              <p className="text-gray-700 text-[10px] mt-1">{t.online}</p>
              <div className="mt-3 flex justify-center gap-1.5">
                {STATIC_NODES.map(n => (
                  <div key={n.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: NODE_COLORS[n.id], opacity: 0.3 }} />
                ))}
              </div>
            </div>
          )}

          {/* Priority queue: active incidents sorted by severity then timestamp */}
          {incidents.filter(inc => inc.status !== 'resolved' && !inc.fir_number).map((inc, i) => {
            const cat = getCategoryInfo(inc);
            const isEscalated = inc.status === 'escalated';
            const isActive = inc.status !== 'acknowledged' && inc.status !== 'dispatched' && inc.status !== 'escalated';
            const queuePos = isActive && processedIncidents.sortedActive.length > 0 ? processedIncidents.sortedActive.findIndex(s => (s.alert_id && s.alert_id === inc.alert_id) || (s.nodeID === inc.nodeID && s.timestamp === inc.timestamp)) + 1 : 0;
            const queueTotal = processedIncidents.sortedActive.length;
            return (
              <div key={inc.alert_id || `${inc.nodeID}-${inc.timestamp}`} className={`p-3 rounded-xl border transition-all duration-300 ${isEscalated ? 'border-orange-900/50 bg-orange-950/20' : inc.status === 'acknowledged' || inc.status === 'dispatched' ? 'border-green-900/50 bg-green-950/20' : 'border-red-900/50 bg-red-950/20 animate-pulse'}`}>

                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isEscalated ? 'bg-orange-500 animate-pulse' : inc.status === 'acknowledged' || inc.status === 'dispatched' ? 'bg-green-500' : 'bg-red-500 animate-ping'}`} />
                    <span className="font-bold text-sm">{inc.nodeID}</span>
                    {isActive && queuePos > 0 && queueTotal > 1 && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                        queuePos === 1 ? 'bg-red-600/30 text-red-300' :
                        queuePos === 2 ? 'bg-orange-600/30 text-orange-300' :
                        'bg-yellow-600/30 text-yellow-300'
                      }`}>
                        #{queuePos} of {queueTotal}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cat.color}`}>{cat.label}</span>
                  {cat.severity && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cat.sevColor}`}>{cat.severity}</span>}
                  {inc.category && CATEGORY_CONFIG[inc.category] && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">{inc.category}</span>
                  )}
                  {inc.ai_detected === 'FACE' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-600/30 text-emerald-300">{'\u{1F9D0}'} Face {inc.ai_confidence || 0}%</span>
                  )}
                  {inc.ai_detected === 'FAKE' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-600/30 text-yellow-300">No Face Check</span>
                  )}
                  {(inc.training || trainingMode) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-600/30 text-orange-300 font-bold border border-orange-500/30">
                      {'\u{1F9EA}'} {t.trainingLabel}
                    </span>
                  )}
                  {inc.source === 'simulated' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-600/30 text-gray-400 font-bold">
                      {'🧪'} {t.simulatedBadge}
                    </span>
                  )}
                  {isEscalated && (
                    <>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-600/30 text-orange-300 font-bold animate-pulse">{'\u26A0\uFE0F'} ESCALATED</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-600/30 text-purple-300 font-bold">{'\u{1F4F1}'} {t.smsSentTo}</span>
                    </>
                  )}
                  {/* BLE Volunteer Broadcast + Phone Confirmed badges on active incidents */}
                  {isActive && (
                    <>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-600/20 text-green-400 font-bold animate-pulse" title={t.volunteerBeacon}>
                        {'\u{1F4E1}'} {t.volunteerBroadcast}
                      </span>
                      {bleConfirmedNodes[inc.nodeID] && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-600/30 text-emerald-300 font-bold" title={t.phoneScannedBy}>
                          {'\u{1F4F1}'} {t.phoneConfirmed}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {inc.citizenName && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                    <span>{'\u{1F464}'}</span>
                    <span className="text-gray-500">{t.reportedBy}:</span>
                    <span className="font-semibold text-gray-300">{inc.citizenName}</span>
                  </div>
                )}

                {/* Beat officer for this village */}
                {(() => {
                  const officer = officers.find(o => o.assigned_village === inc.nodeID);
                  if (!officer) return null;
                  const shiftMins = Math.floor((Date.now() - new Date(officer.shift_start).getTime()) / 60000);
                  return (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-blue-400/80 bg-blue-950/20 border border-blue-800/20 rounded-lg px-2 py-1">
                      <Shield size={10} />
                      <span className="text-gray-500">{t.officerOnDuty}:</span>
                      <span className="font-semibold text-blue-300">{officer.name}</span>
                      {officer.contact && <span className="text-gray-500">| {officer.contact}</span>}
                      <span className="text-gray-600">| {shiftMins}m</span>
                    </div>
                  );
                })()}

                {inc.note && (
                  <div className="mt-2 p-2 bg-gray-800/50 border border-gray-700/30 rounded-lg">
                    <div className="text-[10px] text-gray-500 mb-0.5">{'\u{1F4DD}'} {t.citizenNote}</div>
                    <div className="text-xs text-gray-200 italic leading-relaxed">\u201C{inc.note}\u201D</div>
                  </div>
                )}

                {/* Battery health bar */}
                {inc.battery_pct !== undefined && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          inc.battery_pct > 60 ? 'bg-green-500' :
                          inc.battery_pct > 20 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${inc.battery_pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono ${
                      inc.battery_pct > 60 ? 'text-green-400' :
                      inc.battery_pct > 20 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {inc.battery_pct}%
                    </span>
                    {inc.solar_ok === 1 && (
                      <span className="text-[10px] text-yellow-400" title="Solar charging active">\u2600\uFE0F</span>
                    )}
                    {inc.solar_ok === 0 && (
                      <span className="text-[10px] text-gray-600" title="Solar inactive">\u2601\uFE0F</span>
                    )}
                  </div>
                )}

                {(inc.status === 'dispatched' || inc.status === 'resolved') && inc.dispatchInfo && (
                  <>
                    <div className="mt-2 p-2 bg-blue-950/30 border border-blue-800/40 rounded-lg">
                      <div className="text-[10px] text-blue-400 font-semibold mb-1">{'\u{1F694}'} Dispatched</div>
                      <div className="text-xs text-gray-300"><span className="text-gray-500">Commander:</span> {inc.dispatchInfo.commander}</div>
                      <div className="text-xs text-gray-300"><span className="text-gray-500">Personnel:</span> {inc.dispatchInfo.personnel}</div>
                      {inc.dispatchInfo.equipment && (
                        <div className="text-xs text-gray-300 mt-0.5">
                          <span className="text-gray-500">Equipment:</span>{' '}
                          {Array.isArray(inc.dispatchInfo.equipment)
                            ? inc.dispatchInfo.equipment.join(', ')
                            : typeof inc.dispatchInfo.equipment === 'string'
                            ? inc.dispatchInfo.equipment.split('; ').join(', ')
                            : ''}
                        </div>
                      )}
                    </div>
                    <AgencyCoordinationTracker dispatchedAt={inc.dispatchedAt} />
                  </>
                )}

                {/* FIR reference section */}
                {inc.fir_number && inc.status === 'resolved' ? (
                  <div className="mt-2 p-2 bg-emerald-950/30 border border-emerald-800/40 rounded-lg">
                    <div className="text-[10px] text-emerald-400 font-semibold mb-1">{t.firLabel}</div>
                    <div className="text-xs text-gray-200 font-mono">{inc.fir_number}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{'\u2705'} {t.resolved}</div>
                  </div>
                ) : (inc.status === 'dispatched' || inc.status === 'escalated') && !inc.fir_number && (
                  <div className="mt-2">
                    <label className="text-[9px] text-gray-500 mb-1 block">{t.firLabel}</label>
                    <div className="flex gap-1.5">
                      <input
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono"
                        placeholder={t.firPlaceholder}
                        value={firInputs[inc.alert_id || inc.nodeID] || ''}
                        onChange={(e) => setFirInputs(prev => ({ ...prev, [inc.alert_id || inc.nodeID]: e.target.value }))}
                        maxLength={30}
                      />
                      <button
                        onClick={() => {
                          const val = (firInputs[inc.alert_id || inc.nodeID] || '').trim();
                          if (!val) return;
                          socket.emit('update_fir', { alertID: inc.alert_id, nodeID: inc.nodeID, firNumber: val });
                          // Optimistic update
                          setIncidents(prev => prev.map(x => {
                            const matchByAlertId = inc.alert_id && x.alert_id === inc.alert_id;
                            const matchByNodeId = !inc.alert_id && x.nodeID === inc.nodeID && x.status !== 'resolved';
                            return (matchByAlertId || matchByNodeId) ? { ...x, fir_number: val, status: 'resolved' } : x;
                          }));
                          setFirInputs(prev => ({ ...prev, [inc.alert_id || inc.nodeID]: '' }));
                        }}
                        className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[9px] font-bold rounded-lg transition-colors disabled:opacity-40"
                        disabled={!firInputs[inc.alert_id || inc.nodeID]?.trim()}
                      >
                        {t.submitFIR}
                      </button>
                    </div>
                  </div>
                )}

                {/* NDRRMA escalation — CRITICAL severity only */}
                {cat.severity === 'CRITICAL' && (inc.status === 'dispatched' || inc.status === 'escalated') && !inc.ndrrmA_escalated && (
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        setPendingNDRRMANodeID(inc.nodeID);
                        setNdrrmAConfirmed(false);
                        setShowNDRRMAForm(true);
                      }}
                      className="w-full py-2 bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white text-[10px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-purple-500/30"
                    >
                      {'\u{1F6A8}'} {t.ndrrmA}
                    </button>
                  </div>
                )}
                {inc.ndrrmA_escalated && (
                  <div className="mt-2 p-1.5 bg-purple-950/30 border border-purple-800/40 rounded-lg">
                    <div className="flex items-center gap-1.5 text-[10px] text-purple-400">
                      <span>{'\u2705'}</span>
                      <span>{t.ndrrmADone}</span>
                    </div>
                  </div>
                )}

                {isEscalated && (
                  <div className="mt-2 p-2 bg-orange-950/50 border border-orange-800/60 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-orange-400" />
                      <span className="text-xs text-orange-400 font-bold">{t.escalated}</span>
                    </div>
                    <button onClick={() => openDispatchForm(inc.nodeID)} className="mt-2 w-full py-2 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                      <AlertTriangle size={14} /> {t.dispatchNow}
                    </button>
                  </div>
                )}

                {(inc.status !== 'acknowledged' && inc.status !== 'dispatched' && !isEscalated) && (
                  <button onClick={() => openDispatchForm(inc.nodeID)} className="mt-3 w-full py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2">
                    <CheckCircle size={14} /> {t.acknowledge}
                  </button>
                )}
              </div>
            );
          })}
          {/* ┬¿─ Archives — Resolved Incidents ┬¿─ */}
          {processedIncidents.archived.length > 0 && (
            <div className="bg-gray-800/30 border border-gray-700/40 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-800/50 border-b border-gray-700/30 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">{'\u{1F4C1}'}</span>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Archives</span>
                </div>
                <span className="text-[9px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">
                  {processedIncidents.archived.length}
                </span>
              </div>
              <div className="px-3 py-2 space-y-1.5 max-h-[300px] overflow-y-auto">
                {processedIncidents.archived.slice(0, 50).map((inc) => {
                  const cat = getCategoryInfo(inc);
                  return (
                    <div key={inc.alert_id || `arch-${inc.nodeID}-${inc.timestamp}`} className="p-2 rounded-lg border border-gray-700/30 bg-gray-800/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span className="text-[10px] font-bold text-gray-300">{inc.nodeID}</span>
                          <span className={`text-[8px] px-1 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                        </div>
                        <span className="text-[8px] text-gray-600 font-mono">{new Date(inc.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[8px] text-gray-500 flex-wrap">
                        {inc.citizenName && <span>{'\u{1F464}'} {inc.citizenName}</span>}
                        {inc.fir_number && <span className="text-emerald-500">FIR: {inc.fir_number}</span>}
                        {inc.coords && inc.coords[0] && (
                          <span className="cursor-pointer hover:text-blue-400 font-mono" onClick={() => openInGMaps(inc.coords[0], inc.coords[1])}>
                            {'\u{1F4CD}'} {inc.coords[0].toFixed(4)}, {inc.coords[1].toFixed(4)}
                          </span>
                        )}
                        {(() => {
                          const dist = getDistance(inc, [...STATIC_NODES, ...dynamicNodes]);
                          return dist !== null && dist > 1500 ? (
                            <span className="text-yellow-500 font-semibold text-[8px]">
                              (⚠️ Remote: {Math.round(dist/1000)}km)
                            </span>
                          ) : null;
                        })()}
                      </div>
                      {inc.dispatchInfo?.commander && (
                        <div className="mt-1 text-[8px] text-gray-600">
                          {'\u{1F694}'} Dispatched by: {inc.dispatchInfo.commander}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 relative">
        {showDispatchForm && (
          <div className="absolute inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-red-500" />
                  <h2 className="text-lg font-bold tracking-tight">{t.dispatchTitle}</h2>
                </div>
                <button onClick={() => { setShowDispatchForm(false); setPendingTimerKey(null); }} className="p-1 hover:bg-gray-800 rounded-lg transition-colors">
                  <X size={18} className="text-gray-500 hover:text-white" />
                </button>
              </div>

              {/* Escalation Timer */}
              <div className={`text-center mb-5 p-3 rounded-xl border ${escalationTimeLeft < 60 ? 'border-red-800/60 bg-red-950/30' : 'border-gray-700 bg-gray-800/30'}`}>
                <div className={`text-3xl font-mono font-bold tracking-wider ${escalationTimeLeft < 60 ? 'text-red-400 animate-pulse' : escalationTimeLeft < 120 ? 'text-yellow-400' : 'text-blue-400'}`}>
                  {formatTime(escalationTimeLeft)}
                </div>
                <div className={`text-[10px] mt-1 ${escalationTimeLeft < 60 ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                  {escalationTimeLeft < 60 ? t.timeCritical : t.timeRemaining}
                </div>
                {/* Visual progress bar */}
                <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${escalationTimeLeft < 60 ? 'bg-red-500' : escalationTimeLeft < 120 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                    style={{ width: `${(escalationTimeLeft / ESCALATION_TIMEOUT) * 100}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">{t.commander}</label>
                  <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value={dispatchInfo.commander || ''} onChange={e => setDispatchInfo({ ...dispatchInfo, commander: e.target.value })} placeholder="e.g. DSP Sharma" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">{t.personnel}</label>
                    <input type="number" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" value={dispatchInfo.personnel || ''} onChange={e => setDispatchInfo({ ...dispatchInfo, personnel: e.target.value })} placeholder="e.g. 5" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">{t.vehicle}</label>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" value={dispatchInfo.vehicle || ''} onChange={e => setDispatchInfo({ ...dispatchInfo, vehicle: e.target.value })} placeholder="e.g. Bolero" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">{t.equipment}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Weapon', 'Medical Kit', 'Rope', 'Vehicle'].map(eq => (
                      <button key={eq} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${(dispatchInfo.equipment || []).includes(eq) ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`} onClick={() => toggleEquipment(eq)}>
                        {eq}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block tracking-wider">{t.notes}</label>
                  <textarea className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white resize-none h-16 outline-none focus:border-blue-500" value={dispatchInfo.notes || ''} onChange={e => setDispatchInfo({ ...dispatchInfo, notes: e.target.value })} placeholder="Additional instructions..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-bold rounded-xl border border-gray-700 transition-colors" onClick={() => { setShowDispatchForm(false); setPendingTimerKey(null); }}>{t.cancel}</button>
                <button className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-900/20 transition-all active:scale-[0.98] disabled:opacity-50" onClick={submitDispatch} disabled={!dispatchInfo.commander || !dispatchInfo.personnel}>
                  {t.confirm}
                </button>
              </div>
            </div>
          </div>
        )}

        <MapContainer center={STATIC_NODES[0].coords} zoom={14} className="h-full w-full" zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          {STATIC_NODES.map(node => {
            const isActive = activeNodeIDs.has(node.id);
            const activeIncident = incidents.find(inc => inc.nodeID === node.id && inc.status !== 'resolved');
            const isEscalated = activeIncident?.status === 'escalated';
            const isDispatched = activeIncident?.status === 'acknowledged' || activeIncident?.status === 'dispatched';
            
            let icon = getNodeIcon(node.id, nodeStatuses);
            
            return (
              <Marker key={node.id} position={node.coords} icon={icon}>
                <Popup>
                  <div className="text-gray-900 min-w-[180px]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${isEscalated ? 'bg-orange-500' : isActive ? 'bg-red-500' : isDispatched ? 'bg-green-500' : 'bg-blue-500'}`} />
                      <span className="font-bold text-sm">{node.id}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">{node.name}</div>
                    <div className="text-xs">Status: <span className={isEscalated ? 'text-orange-600 font-bold' : isActive ? 'text-red-600 font-bold' : isDispatched ? 'text-green-600 font-bold' : 'text-blue-600'}>{isEscalated ? `\u26A0\uFE0F ESCALATED - ${activeIncident?.type}` : isActive ? `\u{1F6A8} ALERT - ${activeIncident?.type}` : isDispatched ? `\u2705 DISPATCHED - ${activeIncident?.type}` : '\u2705 STANDBY'}</span></div>
                    <div className="text-[10px] text-gray-500 mt-1 font-mono cursor-pointer hover:text-blue-600" onClick={() => openInGMaps(node.coords[0], node.coords[1])} title="Open in Google Maps">
                      {'\u{1F4CD}'} {node.coords[0].toFixed(6)}, {node.coords[1].toFixed(6)}
                    </div>
                    {(isActive || isDispatched || isEscalated) && activeIncident && <div className="text-[10px] text-gray-500 mt-1">Triggered: {new Date(activeIncident.timestamp).toLocaleString()}</div>}
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {/* Show dynamic nodes (real hardware) alongside static ones */}
          {dynamicNodes.filter(dn => !STATIC_NODES.some(sn => sn.id === dn.id)).map(node => {
            const isActive = activeNodeIDs.has(node.id);
            const activeIncident = incidents.find(inc => inc.nodeID === node.id && inc.status !== 'resolved');
            const isEscalated = activeIncident?.status === 'escalated';
            const isDispatched = activeIncident?.status === 'acknowledged' || activeIncident?.status === 'dispatched';
            
            let icon = getNodeIcon(node.id, nodeStatuses);
            
            return (
              <Marker key={node.id} position={node.coords} icon={icon}>
                <Popup>
                  <div className="text-gray-900 min-w-[180px]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${isEscalated ? 'bg-orange-500' : isActive ? 'bg-red-500' : isDispatched ? 'bg-green-500' : 'bg-blue-400'}`} />
                      <span className="font-bold text-sm">{node.id}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">{node.name}</div>
                    <div className="text-xs">Status: <span className={isEscalated ? 'text-orange-600 font-bold' : isActive ? 'text-red-600 font-bold' : isDispatched ? 'text-green-600 font-bold' : 'text-blue-400'}>{isEscalated ? `\u26A0\uFE0F ESCALATED` : isActive ? `\u{1F6A8} ALERT` : isDispatched ? `\u2705 DISPATCHED` : '\u2705 ONLINE'}</span></div>
                    <div className="text-[10px] text-gray-500 mt-1 font-mono cursor-pointer hover:text-blue-600" onClick={() => openInGMaps(node.coords[0], node.coords[1])}>
                      {'\u{1F4CD}'} {node.coords[0].toFixed(6)}, {node.coords[1].toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {/* ── REAL GPS PINS from phone — drops at exact incident coordinates ── */}
          {incidents.filter(inc => inc.coords && inc.coords[0] && inc.coords[1]).map((inc) => {
            const cat = getCategoryInfo(inc);
            const isEscalated = inc.status === 'escalated';
            const isDispatched = inc.status === 'acknowledged' || inc.status === 'dispatched';
            const isResolved = inc.status === 'resolved';
            let icon = sosIcon;
            if (isEscalated) icon = escalatedIcon;
            else if (isResolved || isDispatched) icon = ackIcon;

            const mapCoords = getMapCoords(inc);
            const dist = getDistance(inc, [...STATIC_NODES, ...dynamicNodes]);

            return (
              <Marker 
                key={inc.alert_id || `pin-${inc.nodeID}-${inc.timestamp}`} 
                position={mapCoords} 
                icon={icon}
              >
                <Popup>
                  <div className="text-gray-900 min-w-[160px]">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${isEscalated ? 'bg-orange-500' : isResolved ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-bold text-sm">{inc.nodeID}</span>
                    </div>
                    <div className="text-xs font-semibold text-gray-700">{cat.label}</div>
                    {inc.citizenName && <div className="text-[10px] text-gray-600 mt-1">Reported by: {inc.citizenName}</div>}
                    {inc.note && <div className="text-[9px] text-gray-500 italic mt-0.5">“{inc.note.slice(0, 50)}...”</div>}
                    <div className="text-[10px] text-gray-600 mt-1">Status: {isEscalated ? 'ESCALATED' : isResolved ? 'Resolved' : isDispatched ? 'Dispatched' : 'Active'}</div>
                    <div className="text-[9px] text-gray-500 mt-1 font-mono">Time: {new Date(inc.timestamp).toLocaleString()}</div>
                    <div className="text-[9px] text-gray-400 mt-0.5 font-mono cursor-pointer hover:text-blue-600" onClick={() => openInGMaps(inc.coords[0], inc.coords[1])} title="Open in Google Maps">
                      {'\u{1F4CD}'} {inc.coords[0].toFixed(6)}, {inc.coords[1].toFixed(6)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          <MapBoundsFitter nodes={[...STATIC_NODES, ...dynamicNodes.filter(dn => !STATIC_NODES.some(sn => sn.id === dn.id))]} />
          {lastIncident && <MapFlyTo center={getMapCoords(lastIncident)} />}
          <CoverageOverlay nodes={STATIC_NODES} activeNodeIDs={activeNodeIDs} />
          <MapLegend />
          <NodeLabels nodes={[...STATIC_NODES, ...dynamicNodes.filter(dn => !STATIC_NODES.some(sn => sn.id === dn.id))]} />
          <MapResizer />
        </MapContainer>

        <div className="absolute top-4 right-4 z-[1000] bg-gray-900/90 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-800 text-xs flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-gray-300">{t.live}</span>
          </div>
          <div className="w-px h-4 bg-gray-800" />
          <span className="text-gray-500">ESP-B</span>
        </div>

        <div className="absolute bottom-4 left-4 z-[1000] bg-gray-900/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-gray-800 text-[10px] text-gray-500 font-mono cursor-pointer hover:text-blue-400 transition-colors" onClick={() => {
          const coords = lastIncident ? [lastIncident.coords[0], lastIncident.coords[1]] : (dynamicNodes[0] ? dynamicNodes[0].coords : [27.7, 85.3]);
          openInGMaps(coords[0], coords[1]);
        }} title="Open in Google Maps">
          {'\u{1F4CD}'} {lastIncident ? `${lastIncident.coords[0].toFixed(4)}, ${lastIncident.coords[1].toFixed(4)}` : (dynamicNodes[0] ? `${dynamicNodes[0].coords[0].toFixed(4)}, ${dynamicNodes[0].coords[1].toFixed(4)}` : '27.7000, 85.3000')}
        </div>
      </div>

      {/* NDRRMA Escalation Confirmation Modal */}
      {showNDRRMAForm && pendingNDRRMANodeID && (() => {
        const ndInc = incidents.find(x => x.nodeID === pendingNDRRMANodeID);
        if (!ndInc) return null;
        const ndCat = getCategoryInfo(ndInc);
        return (
          <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center">
            <div className="bg-gray-900 border border-purple-700 rounded-2xl p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{'\u{1F6A8}'}</span>
                  <h2 className="text-lg font-bold text-purple-300">{t.ndrrmATitle}</h2>
                </div>
                <button onClick={() => setShowNDRRMAForm(false)}><X size={18} className="text-gray-500 hover:text-white" /></button>
              </div>

              <div className="bg-purple-950/20 border border-purple-800/30 rounded-xl p-3 mb-4 text-[10px] text-gray-300 leading-relaxed">
                {t.ndrrmADesc}
              </div>

              {/* Incident summary */}
              <div className="space-y-1.5 mb-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700/30">
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">Node:</span>
                  <span className="font-mono text-gray-200">{ndInc.nodeID}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">Category:</span>
                  <span className={ndCat.color}>{ndCat.label}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">Severity:</span>
                  <span className="text-red-400 font-bold">{ndCat.severity}</span>
                </div>
                {ndInc.citizenName && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-500">Reported by:</span>
                    <span className="text-gray-200">{ndInc.citizenName}</span>
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">Triggered at:</span>
                  <span className="text-gray-200 font-mono">{new Date(ndInc.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-gray-500">GPS:</span>
                  <span className="text-gray-200 font-mono cursor-pointer hover:text-blue-400" onClick={() => openInGMaps(ndInc.coords?.[0], ndInc.coords?.[1])} title="Open in Google Maps">
                    {'\u{1F4CD}'} {ndInc.coords?.[0]?.toFixed(4)}, {ndInc.coords?.[1]?.toFixed(4)}
                  </span>
                </div>
                {ndInc.note && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-500">Note:</span>
                    <span className="text-gray-200 italic max-w-[180px] text-right">\u201C{ndInc.note}\u201D</span>
                  </div>
                )}
                {(ndInc.status === 'dispatched' && ndInc.dispatchInfo) && (
                  <>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Commander:</span>
                      <span className="text-gray-200">{ndInc.dispatchInfo.commander}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Personnel:</span>
                      <span className="text-gray-200">{ndInc.dispatchInfo.personnel}</span>
                    </div>
                  </>
                )}
                {ndInc.fir_number && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-500">FIR:</span>
                    <span className="text-gray-200 font-mono">{ndInc.fir_number}</span>
                  </div>
                )}
                {ndInc.ai_detected === 'FACE' && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-500">Face verified:</span>
                    <span className="text-emerald-400">{'\u2705'} {ndInc.ai_confidence}%</span>
                  </div>
                )}
              </div>

              {/* Confirmation checkbox */}
              <label className="flex items-start gap-2.5 p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 cursor-pointer hover:bg-gray-800/50 transition-colors">
                <input
                  type="checkbox"
                  checked={ndrrmAConfirmed}
                  onChange={(e) => setNdrrmAConfirmed(e.target.checked)}
                  className="mt-0.5 accent-purple-500 w-4 h-4"
                />
                <span className="text-[10px] text-gray-300 leading-relaxed">{t.ndrrmAConfirm}</span>
              </label>

              <div className="flex gap-3 mt-4">
                <button
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold rounded-lg"
                  onClick={() => setShowNDRRMAForm(false)}
                >
                  {t.cancel}
                </button>
                <button
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                    ndrrmAConfirmed
                      ? 'bg-purple-600 hover:bg-purple-500 text-white'
                      : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  }`}
                  disabled={!ndrrmAConfirmed}
                  onClick={() => {
                    // Generate CSV content
                    const esc = (v) => {
                      if (v === null || v === undefined) return '';
                      const s = String(v);
                      return s.includes(',') || s.includes('"') || s.includes('\\n') ? `"${s.replace(/"/g, '""')}"` : s;
                    };
                    const fields = [
                      ['Field', 'Value'],
                      ['Node ID', ndInc.nodeID],
                      ['Category', ndInc.category || ndInc.type],
                      ['Severity', ndCat.severity],
                      ['Reported by', ndInc.citizenName || 'N/A'],
                      ['GPS Latitude', ndInc.coords?.[0]?.toFixed(6) || 'N/A'],
                      ['GPS Longitude', ndInc.coords?.[1]?.toFixed(6) || 'N/A'],
                      ['Triggered At', ndInc.timestamp],
                      ['Citizen Note', ndInc.note || 'N/A'],
                      ['Face Verified', ndInc.ai_detected === 'FACE' ? `Yes (${ndInc.ai_confidence}%)` : 'No'],
                      ['Status', ndInc.status],
                      ['Commander', ndInc.dispatchInfo?.commander || 'N/A'],
                      ['Personnel', ndInc.dispatchInfo?.personnel || 'N/A'],
                      [
                        'Equipment',
                        (Array.isArray(ndInc.dispatchInfo?.equipment)
                          ? ndInc.dispatchInfo.equipment.join('; ')
                          : typeof ndInc.dispatchInfo?.equipment === 'string'
                          ? ndInc.dispatchInfo.equipment
                          : '') || 'N/A',
                      ],
                      ['Vehicle', ndInc.dispatchInfo?.vehicle || 'N/A'],
                      ['FIR Number', ndInc.fir_number || 'N/A'],
                      ['Battery %', ndInc.battery_pct ?? 'N/A'],
                      ['Solar', ndInc.solar_ok === 1 ? 'Active' : 'Inactive'],
                      ['Escalation Timestamp', new Date().toISOString()],
                    ];
                    const csvContent = fields.map(row => row.map(esc).join(',')).join('\n');
                    
                    // Download CSV locally
                    const fileName = `NDRRMA_ESCALATION_${ndInc.nodeID}_${Date.now()}.csv`;
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    URL.revokeObjectURL(url);

                    // Open Gmail compose with pre-filled fields
                    const subject = encodeURIComponent(`[PRARAHI-LINK] NDRRMA Escalation — ${ndInc.nodeID} — ${ndInc.category || ndInc.type}`);
                    const bodyLines = [
                      `This is an automated escalation from Prahari-Link Police Command Center.`,
                      ``,
                      `INCIDENT SUMMARY:`,
                      `Node: ${ndInc.nodeID}`,
                      `Category: ${ndInc.category || ndInc.type}`,
                      `Severity: ${ndCat.severity}`,
                      `Reported by: ${ndInc.citizenName || 'N/A'}`,
                      `GPS: ${ndInc.coords?.[0]?.toFixed(6) || 'N/A'}, ${ndInc.coords?.[1]?.toFixed(6) || 'N/A'}`,
                      `Triggered: ${new Date(ndInc.timestamp).toLocaleString()}`,
                      `Citizen Note: ${ndInc.note || 'N/A'}`,
                      `Status: ${ndInc.status}`,
                      `Face Verified: ${ndInc.ai_detected === 'FACE' ? 'Yes (' + ndInc.ai_confidence + '%)' : 'No'}`,
                      ndInc.dispatchInfo ? `Commander: ${ndInc.dispatchInfo.commander}, Personnel: ${ndInc.dispatchInfo.personnel}` : '',
                      `FIR: ${ndInc.fir_number || 'N/A'}`,
                      `Battery: ${ndInc.battery_pct ?? 'N/A'}%, Solar: ${ndInc.solar_ok === 1 ? 'Active' : 'Inactive'}`,
                      ``,
                      `The detailed CSV file (${fileName}) has been downloaded to your computer. Please attach it to this email before sending.`,
                      ``,
                      `— Prahari-Link Command Center`,
                    ].filter(Boolean).join('\n');
                    window.open(
                      `https://mail.google.com/mail/?view=cm&fs=1&to=ndrrma@gmail.com,dte-dpr@nepalarmy.mil.np&su=${subject}&body=${encodeURIComponent(bodyLines)}`,
                      '_blank'
                    );

                    // Optimistic update: mark as NDRRMA escalated on the card
                    setIncidents(prev => prev.map(x =>
                      x.nodeID === pendingNDRRMANodeID
                        ? { ...x, ndrrmA_escalated: true, ndrrmA_escalated_at: new Date().toISOString() }
                        : x
                    ));

                    setShowNDRRMAForm(false);
                    setPendingNDRRMANodeID(null);
                    setNdrrmAConfirmed(false);
                  }}
                >
                  {ndrrmAConfirmed ? '\u{1F4E5}' : ''} {t.ndrrmAGenerate}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Session Summary Modal */}
      {sessionSummary && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 border border-orange-700 rounded-2xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{'\u{1F9EA}'}</span>
                <h2 className="text-lg font-bold text-orange-300">{t.sessionSummary}</h2>
              </div>
              <button onClick={() => setSessionSummary(null)}><X size={18} className="text-gray-500 hover:text-white" /></button>
            </div>

            <div className="space-y-1.5 mb-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700/30">
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.traineeNameLabel}:</span>
                <span className="font-semibold text-gray-200">{sessionSummary.traineeName || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.scenarioLabel}:</span>
                <span className="text-gray-200">{sessionSummary.scenarioName || t.freeDrill}</span>
              </div>
              <div className="border-t border-gray-700/50 my-2" />
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.totalIncidentsLabel}:</span>
                <span className="text-gray-200 font-mono font-bold">{sessionSummary.totalIncidents}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.ackedLabel}:</span>
                <span className="text-green-400 font-mono">{sessionSummary.acknowledgedCount}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.escalatedLabel}:</span>
                <span className="text-orange-400 font-mono">{sessionSummary.escalatedCount}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.resolvedLabel}:</span>
                <span className="text-emerald-400 font-mono">{sessionSummary.resolvedCount}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-500">{t.avgResponseLabel}:</span>
                <span className="text-blue-400 font-mono">{sessionSummary.avgResponseTime}{t.secondsLabel}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-bold rounded-lg"
                onClick={() => {
                  window.open('http://localhost:3001/api/training/export/csv', '_blank');
                  setSessionSummary(null);
                }}
              >
                {'\u{1F4CA}'} {t.trainingExport}
              </button>
              <button
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold rounded-lg"
                onClick={() => setSessionSummary(null)}
              >
                {t.ok}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🚨 SMS Alert Modal — Animated demo of real SMS to superior officer */}
      {showSMSAlert && smsAlertData && <SMSAlertModal
        data={smsAlertData}
        onDismiss={() => { setShowSMSAlert(false); setSmsAlertData(null); }}
        getCategoryInfo={getCategoryInfo}
        openInGMaps={openInGMaps}
        t={t}
        superiorName={t.smsSuperiorName}
        superiorPhone={t.smsSuperiorPhone}
      />}
    </div>
  );
}
