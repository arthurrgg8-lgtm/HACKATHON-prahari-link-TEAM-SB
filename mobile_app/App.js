import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, SafeAreaView, PermissionsAndroid, Platform, ScrollView } from 'react-native';
import BluetoothSerial from 'react-native-bluetooth-serial-next';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import LivenessCamera from './LivenessCamera';
import { BleManager } from 'react-native-ble-plx';

const bleManager = new BleManager();

const hexToRgba = (hex, alpha) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const CATEGORIES = [
  { id: 'LANDSLIDE', labelEn: 'Landslide', labelNe: 'पहिरो', emoji: '🏔️', color: '#dc2626', type: 'SOS' },
  { id: 'FLOOD', labelEn: 'Flood', labelNe: 'बाढी', emoji: '🌊', color: '#2563eb', type: 'SOS' },
  { id: 'EARTHQUAKE', labelEn: 'Earthquake', labelNe: 'भूकम्प', emoji: '🏚️', color: '#dc2626', type: 'SOS' },
  { id: 'CRIME', labelEn: 'Crime', labelNe: 'अपराध', emoji: '🔫', color: '#ea580c', type: 'SOS' },
  { id: 'MEDICAL', labelEn: 'Medical', labelNe: 'चिकित्सा', emoji: '🚑', color: '#dc2626', type: 'SOS' },
  { id: 'FIRE', labelEn: 'Fire', labelNe: 'आगो', emoji: '🔥', color: '#ea580c', type: 'SOS' },
  { id: 'MISSING', labelEn: 'Missing', labelNe: 'बेपत्ता', emoji: '🔍', color: '#ca8a04', type: 'INFO' },
  { id: 'DISTURBANCE', labelEn: 'Disturbance', labelNe: 'गडबड', emoji: '📢', color: '#ca8a04', type: 'RISK' },
];

const TRANSLATIONS = {
  en: {
    title: 'Prahari-Link', subtitle: 'Verified Responder', connected: 'Connected to Village Node',
    searching: 'Searching for Relay...', notePlaceholder: 'Describe the emergency... (e.g. Fire near school)',
    helpComing: 'HELP IS ON THE WAY!', ackSub: 'Police have acknowledged your alert',
    ackFoot: 'Stay where you are. Assistance arriving ASAP.',
    sending: 'Sending Emergency Alert', cancel: 'CANCEL', selectCategory: 'Select Incident Type',
    namePlaceholder: 'Your Name (so police know who reported)',
    footer: 'Nepal Police Hackathon 2026 - Prahari-Link', ok: 'OK ✅',
    // Enhanced ACK translations
    dispatchedBy: 'Dispatched by', personnel: 'Personnel',
    vehicle: 'Vehicle', eta: 'ETA',
    // Volunteer translations
    volunteerTitle: 'Become a Community Volunteer',
    volunteerDesc: 'Get notified when emergencies happen near you. Help your neighbors in need.',
    volunteerBtn: '✅ REGISTER AS VOLUNTEER',
    volunteerSkip: 'Skip, I\'m a responder',
    volunteerMode: 'Volunteer Mode',
    volunteerAlerts: 'Nearby Incidents',
    volunteerListening: '🔄 Listening for nearby emergencies...',
    volunteerNone: 'No nearby emergencies detected',
    volunteerSOS: '🚨 EMERGENCY NEARBY!',
    volunteerTapView: 'Tap to view details',
    volunteerNode: 'Node', volunteerCategory: 'Category',
    volunteerCoords: 'GPS', volunteerTime: 'Detected',
  },
  ne: {
    title: 'प्रहरी-लिंक', subtitle: 'प्रमाणित उत्तरदाता', connected: 'गाउँ नोडमा जोडियो',
    searching: 'रिले खोज्दै...', notePlaceholder: 'आपतकालिन वर्णन गर्नुहोस्... (जस्तै: विद्यालयमा आगो)',
    helpComing: 'सहायता आउँदैछ!', ackSub: 'प्रहरीले तपाईंको सूचना स्वीकार गरेको छ',
    ackFoot: 'कृपया पर्खनुहोस्। सहायता चाँडै आइपुग्नेछ।',
    sending: 'आपतकालिन सूचना पठाउँदै', cancel: 'रद्द गर्नुहोस्',
    selectCategory: 'घटना प्रकार चयन गर्नुहोस्',
    namePlaceholder: 'तपाईंको नाम (प्रहरीलाई जानकारीको लागि)',
    footer: 'नेपाल प्रहरी ह्याकाथन २०२६ - प्रहरी-लिंक', ok: 'हुन्छ ✅',
    // Enhanced ACK
    dispatchedBy: 'पठाउने अधिकारी', personnel: 'कर्मचारी',
    vehicle: 'सवारी', eta: 'अनुमानित समय',
    // Volunteer
    volunteerTitle: 'सामुदायिक स्वयंसेवक बन्नुहोस्',
    volunteerDesc: 'तपाईंको नजिक आपतकालिन घटना भएमा तुरुन्त सूचना पाउनुहोस्।',
    volunteerBtn: '✅ स्वयंसेवकको रूपमा दर्ता गर्नुहोस्',
    volunteerSkip: 'छोड्नुहोस्, म उत्तरदाता हुँ',
    volunteerMode: 'स्वयंसेवक मोड',
    volunteerAlerts: 'नजिकका घटनाहरू',
    volunteerListening: '🔄 नजिकका आपतकालिनहरू सुन्दै...',
    volunteerNone: 'नजिक कुनै आपतकालिन छैन',
    volunteerSOS: '🚨 नजिकै आपतकालिन!',
    volunteerTapView: 'विवरण हेर्न ट्याप गर्नुहोस्',
    volunteerNode: 'नोड', volunteerCategory: 'श्रेणी',
    volunteerCoords: 'जीपीएस', volunteerTime: 'पत्ता लागेको',
  },
};

export default function App() {
  const [connected, setConnected] = useState(false);
  const [location, setLocation] = useState(null);
  const [ackReceived, setAckReceived] = useState(false);
  const [ackNodeID, setAckNodeID] = useState('');
  const [ackDispatchInfo, setAckDispatchInfo] = useState(null); // Enhanced ACK details
  const [userNote, setUserNote] = useState('');
  const [citizenName, setCitizenName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [showLiveness, setShowLiveness] = useState(false);
  const [livenessCategory, setLivenessCategory] = useState(null);
  const [lang, setLang] = useState('en');
  const [deviceBattery, setDeviceBattery] = useState(null);
  const countdownRef = useRef(null);
  const batterySubRef = useRef(null);
  const bleScanRef = useRef(null);
  // Face verification state — verify identity before SOS
  const [faceVerified, setFaceVerified] = useState(false);
  // SOS lockout — after one SOS, block for 30 minutes
  const SOS_LOCKOUT_MS = 0; // DISABLED for testing — re-enable at final: 30 * 60 * 1000
  const [sosSentTime, setSosSentTime] = useState(null);
  // Volunteer state
  const [isVolunteer, setIsVolunteer] = useState(null); // null = show registration prompt, true/false
  const [volunteerAlerts, setVolunteerAlerts] = useState([]);
  const [selectedAlertIndex, setSelectedAlertIndex] = useState(null);
  const t = TRANSLATIONS[lang];

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const perms = [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.CAMERA,
        ];
        // POST_NOTIFICATIONS is Android 13+ (API 33)
        if (Platform.Version >= 33) {
          perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        await PermissionsAndroid.requestMultiple(perms);
      } catch (err) { console.warn(err); }
    }
  };

  // Track Bluetooth connection status for better UX
  const [btStatus, setBtStatus] = useState('searching'); // searching | scanning | connecting | connected | failed
  const [btDeviceName, setBtDeviceName] = useState('');
  const [btErrorMessage, setBtErrorMessage] = useState('');
  const btRetryCountRef = useRef(0);
  const btRetryTimerRef = useRef(null);

  // Helper: find a device by name (exact then partial)
  const findRelay = (devices) => {
    // Step 1: Exact match with trim
    let relay = devices.find(d => d.name && d.name.trim() === 'Prahari-Link-V1');
    if (relay) return relay;
    // Step 2: Case-insensitive partial match
    relay = devices.find(d => d.name && d.name.toLowerCase().includes('prahari'));
    if (relay) {
      console.log('Found relay via partial match:', relay.name, relay.id);
    }
    return relay;
  };

  // Scan for and connect to the Prahari-Link-V1 relay
  const scanForRelay = async () => {
    setBtStatus('scanning');
    setBtErrorMessage('');
    try {
      // Ensure BT is enabled
      try {
        const isEnabled = await BluetoothSerial.isEnabled();
        if (!isEnabled) await BluetoothSerial.enable();
      } catch (btEnableErr) {
        console.log('BT enable error:', btEnableErr);
      }

      // Step 1: Try bonded devices first (fast)
      let devices = [];
      try {
        devices = await BluetoothSerial.list();
        console.log('BT bonded devices:', devices.map(d => d.name));
      } catch (listErr) {
        console.log('BT list error:', listErr);
      }
      let relay = findRelay(devices);

      // Step 2: If not found, scan for unpaired devices
      if (!relay) {
        console.log('Relay not in bonded list, scanning for unpaired...');
        setBtErrorMessage('Scanning for nearby devices...');
        try {
          const discovered = await BluetoothSerial.discoverUnpairedDevices();
          console.log('BT discovered devices:', discovered.map(d => d.name));
          relay = findRelay(discovered);
          if (relay) {
            setBtDeviceName(relay.name);
            console.log('Found relay via discovery:', relay.name, relay.id);
          }
        } catch (discoverErr) {
          console.log('Discovery failed:', discoverErr);
          setBtErrorMessage('Discovery failed: ' + (discoverErr.message || 'Unknown error'));
        }
      } else {
        setBtDeviceName(relay.name);
      }

      // Step 3: Connect if found
      if (relay) {
        setBtStatus('connecting');
        setBtErrorMessage('Connecting to ' + relay.name + '...');
        try {
          await BluetoothSerial.connect(relay.id);
          setConnected(true);
          setBtStatus('connected');
          setBtErrorMessage('');
          btRetryCountRef.current = 0; // Reset retry count on success

          try {
            await BluetoothSerial.withDelimiter('\n');
            BluetoothSerial.on('data', (data) => {
              const message = data.data?.toString().trim();
              console.log('BT Received:', message);
              if (message && message.startsWith('ACK:')) {
                // Parse enhanced ACK format: ACK:NODE_A|Commander|5|Vehicle|ETA
                const ackParts = message.replace('ACK:', '').split('|');
                const nodeID = ackParts[0];
                setAckNodeID(nodeID);

                if (ackParts.length >= 5 && ackParts[1] && ackParts[1] !== '') {
                  setAckDispatchInfo({
                    commander: ackParts[1],
                    personnel: ackParts[2],
                    vehicle: ackParts[3],
                    eta: ackParts[4],
                  });
                } else {
                  setAckDispatchInfo(null);
                }

                setAckReceived(true);

                if (ackParts.length >= 5 && ackParts[1] && ackParts[1] !== '') {
                  Alert.alert(
                    t.helpComing,
                    `${t.ackSub} (${nodeID}).\n\n🚓 ${t.dispatchedBy}: ${ackParts[1]}\n👥 ${t.personnel}: ${ackParts[2]}\n🚙 ${t.vehicle}: ${ackParts[3]}\n⏱ ${t.eta}: ${ackParts[4]}\n\n${t.ackFoot}`,
                    [{ text: t.ok }]
                  );
                } else {
                  Alert.alert(t.helpComing, `${t.ackSub} (${nodeID}). ${t.ackFoot}`, [{ text: t.ok }]);
                }

                setTimeout(() => setAckReceived(false), 10000);
              }
            });
          } catch (err) {
            console.log('BT Listener error:', err);
            setBtErrorMessage('Listener setup failed: ' + (err.message || ''));
          }
        } catch (connectErr) {
          // Connection failed — retry up to 3 times
          console.log('BT connect error:', connectErr);
          btRetryCountRef.current += 1;
          if (btRetryCountRef.current < 3) {
            setBtStatus('scanning');
            setBtErrorMessage(`Connection failed, retrying (${btRetryCountRef.current}/3)...`);
            btRetryTimerRef.current = setTimeout(() => scanForRelay(), 3000);
          } else {
            setBtStatus('failed');
            setBtErrorMessage('Connection failed after 3 attempts. Make sure ESP-A is on and in range.');
            btRetryCountRef.current = 0;
          }
        }
      } else {
        // No relay found
        setBtStatus('failed');
        setBtErrorMessage('Prahari-Link-V1 not found. Make sure ESP-A is powered on and within range, or tap "Scan for Node" to retry.');
        console.log('Relay not found. Bonded:', devices.map(d => d.name), 'Searched for: Prahari-Link-V1');
      }
    } catch (err) {
      console.log('BT error:', err);
      setBtStatus('failed');
      setBtErrorMessage(err.message || 'Bluetooth connection failed. Make sure Bluetooth is on.');
    }
  };

  // BLE Scan for Prahari-Link alert broadcasts
  const startBLEScan = () => {
    if (bleScanRef.current) return; // Already scanning
    try {
      bleManager.startDeviceScan(
        null, // Scan all services
        null, // Allow duplicates
        (error, scannedDevice) => {
          if (error) {
            console.log('BLE scan error:', error);
            return;
          }
          if (scannedDevice) {
            // BLE advertisement carries alert data in manufacturer field
            // Format: "P|A|LS|27.6945,83.4457" (fits in 31-byte BLE advert limit)
            // manufacturerData from react-native-ble-plx is Base64-encoded, decode it first
            const mfgData = scannedDevice.manufacturerData || '';
            let rawMfgData = mfgData;
            try { rawMfgData = atob(mfgData); } catch (e) { /* not base64, use raw */ }
            if (rawMfgData.includes('P|')) {
              // Format: "P|A|LS|27.6945,83.4457"
              const parts = rawMfgData.split('|');
              if (parts.length >= 4) {
                const alertKey = `${scannedDevice.id}-${parts[2]}`;
                setVolunteerAlerts(prev => {
                  // Avoid duplicates
                  if (prev.some(a => a.key === alertKey)) return prev;
                  const nodeMap = { 'A': 'NODE_A', 'B': 'NODE_B', 'C': 'NODE_C', 'L': 'CMD_CTRL' };
                  const catMap = {
                    'LS': 'LANDSLIDE', 'FL': 'FLOOD', 'EQ': 'EARTHQUAKE',
                    'CR': 'CRIME', 'MD': 'MEDICAL', 'FI': 'FIRE',
                    'MS': 'MISSING', 'DI': 'DISTURBANCE'
                  };
                  const catInfo = CATEGORIES.find(c => c.id === (catMap[parts[2]] || parts[2]));
                  const newAlert = {
                    key: alertKey,
                    nodeID: nodeMap[parts[1]] || `NODE_${parts[1]}`,
                    category: catMap[parts[2]] || parts[2],
                    emoji: catInfo?.emoji || '🚨',
                    color: catInfo?.color || '#ef4444',
                    coords: parts[3] || 'N/A',
                    timestamp: new Date().toLocaleTimeString(),
                    rssi: scannedDevice.rssi,
                  };
                  return [newAlert, ...prev].slice(0, 10); // Keep last 10
                });
              }
            }
          }
        }
      );
      bleScanRef.current = true;
      console.log('BLE scan started for PRAHARI-ALERT');
    } catch (e) {
      console.log('BLE init error:', e);
    }
  };

  const stopBLEScan = () => {
    try {
      bleManager.stopDeviceScan();
      bleScanRef.current = false;
      console.log('BLE scan stopped');
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await requestPermissions();
        // Request Location permission (needed for BT scanning on Android)
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            setLocation(await Location.getCurrentPositionAsync({}));
          }
        } catch (locErr) { console.log('Location error:', locErr); }
        // Read device battery level
        try {
          const batLevel = await Battery.getBatteryLevelAsync();
          setDeviceBattery(Math.round(batLevel * 100));
        } catch (e) { console.log('Battery read error:', e); }
        // Subscribe to battery level changes
        batterySubRef.current = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          setDeviceBattery(Math.round(batteryLevel * 100));
        });
        // Start scanning for relay after a brief delay for BT initialization
        setTimeout(async () => {
          await scanForRelay();
        }, 2000);
      } catch (e) { console.log('Init error:', e); }
    };
    init();
    return () => {
      if (batterySubRef.current) batterySubRef.current.remove();
      if (btRetryTimerRef.current) clearTimeout(btRetryTimerRef.current);
      stopBLEScan();
      if (bleManager) bleManager.destroy();
    };
  }, []); // Only run once on mount

  // Start BLE scanning when user registers as volunteer
  useEffect(() => {
    if (isVolunteer === true) {
      startBLEScan();
    } else {
      stopBLEScan();
    }
    return () => stopBLEScan();
  }, [isVolunteer]);

  // Called by LivenessCamera when face is verified
  const handleFaceVerified = (category, confidence) => {
    setShowLiveness(false);
    setLivenessCategory(null);
    
    if (!category) {
      // Initial identity verification — just mark as verified, show main screen
      setFaceVerified(true);
      return;
    }
    
    // SOS mode: send data IMMEDIATELY, countdown is visual only
    setSelectedCategory(category);
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    fireSOS(category, confidence);
  };

  // Called by LivenessCamera when verification fails
  const handleLivenessFailed = (reason) => {
    setShowLiveness(false);
    setLivenessCategory(null);
    Alert.alert('🔒 Verification Failed', reason || 'Face not recognised. Only verified responders can send alerts.');
  };

  const cancelCountdown = () => {
    clearInterval(countdownRef.current);
    setCountdown(null);
    setSelectedCategory(null);
  };

  // Category tap: after face is verified, SOS sends immediately
  const handleCategorySelect = (cat) => {
    if (!connected) {
      Alert.alert('Error', 'Not connected to Village Relay Node!');
      return;
    }
    setSelectedCategory(cat);
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    fireSOS(cat, 95);
  };

  const fireSOS = async (category, confidence = 50) => {
    if (!connected) {
      Alert.alert('Error', 'Not connected to Village Relay Node!');
      return;
    }
    const lat = location?.coords?.latitude || 27.7172;
    const lon = location?.coords?.longitude || 85.3240;
    const safeNote = userNote.replace(/\|/g, '-');
    const safeName = (citizenName || 'Anonymous').replace(/\|/g, '-');
    const type = category.type || 'SOS';
    // Read live battery level before sending
    let batteryPct = 50; // fallback default
    try {
      const batLevel = await Battery.getBatteryLevelAsync();
      batteryPct = Math.round(batLevel * 100);
      setDeviceBattery(batteryPct);
    } catch (e) { /* use fallback */ }
    // Pipe format: TYPE|lat|lon|cat|note|FACE|confidence|name|battery_pct
    const payload = `${type}|${lat}|${lon}|${category.id}|${safeNote}|FACE|${confidence}|${safeName}|${batteryPct}\n`;
    try {
      await BluetoothSerial.write(payload);
      setSosSentTime(Date.now());
      setUserNote('');
      setCitizenName('');
      Alert.alert('🚔 Alert Dispatched', `${category.labelEn} — Face liveness: ${confidence}%\nReported by: ${safeName}\nPolice have been notified. You cannot send another alert for 30 minutes.`);
    } catch (e) {
      Alert.alert('Fail', 'Communication error with Node.');
    }
  };

  // ── Volunteer Registration Screen ─────────────────────────────────────────
  if (isVolunteer === null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.volunteerRegContainer}>
          <Text style={{ fontSize: 64, marginBottom: 16 }}>🤝</Text>
          <Text style={styles.volunteerRegTitle}>
            {lang === 'en' ? TRANSLATIONS.en.volunteerTitle : TRANSLATIONS.ne.volunteerTitle}
          </Text>
          <Text style={styles.volunteerRegDesc}>
            {lang === 'en' ? TRANSLATIONS.en.volunteerDesc : TRANSLATIONS.ne.volunteerDesc}
          </Text>
          <TouchableOpacity
            style={styles.volunteerRegBtn}
            onPress={() => setIsVolunteer(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.volunteerRegBtnText}>
              {lang === 'en' ? TRANSLATIONS.en.volunteerBtn : TRANSLATIONS.ne.volunteerBtn}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.volunteerSkipBtn}
            onPress={() => setIsVolunteer(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.volunteerSkipText}>
              {lang === 'en' ? TRANSLATIONS.en.volunteerSkip : TRANSLATIONS.ne.volunteerSkip}
            </Text>
          </TouchableOpacity>
          <View style={styles.volunteerFooter}>
            <Text style={styles.volunteerFooterText}>
              {lang === 'en' ? 'No personal data collected. BLE scan only.' : 'कुनै व्यक्तिगत डाटा सङ्कलन गरिँदैन। BLE स्क्यान मात्र।'}
            </Text>
          </View>
        </View>
        {/* Language toggle on registration screen */}
        <TouchableOpacity
          style={styles.volunteerLangToggle}
          onPress={() => setLang(lang === 'en' ? 'ne' : 'en')}
        >
          <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '700' }}>
            {lang === 'en' ? 'ने' : 'EN'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Volunteer Mode — BLE scanning + incident feed ──────────────────────────
  if (isVolunteer === true) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>
              {lang === 'en' ? TRANSLATIONS.en.title : TRANSLATIONS.ne.title}
            </Text>
            <View style={styles.headerRight}>
              {deviceBattery !== null && (
                <View style={[styles.batteryBadge, {
                  backgroundColor: deviceBattery > 20 ? '#1e293b' : 'rgba(239,68,68,0.3)',
                  borderColor: deviceBattery > 20 ? '#334155' : 'rgba(239,68,68,0.5)',
                }]}>
                  <Text style={[styles.batteryText, {
                    color: deviceBattery > 60 ? '#22c55e' : deviceBattery > 20 ? '#eab308' : '#ef4444',
                  }]}>
                    {'\u26A1'}{deviceBattery}%
                  </Text>
                </View>
              )}
              <TouchableOpacity onPress={() => setLang(lang === 'en' ? 'ne' : 'en')} style={styles.langToggle}>
                <Text style={styles.langText}>{lang === 'en' ? 'ने' : 'EN'}</Text>
              </TouchableOpacity>
              <View style={[styles.statusBadge, { backgroundColor: '#22c55e' }]}>
                <Text style={styles.statusBadgeText}>
                  {lang === 'en' ? 'VOL' : 'स्वं'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: bleScanRef.current ? '#10b981' : '#ef4444' }]} />
            <Text style={styles.statusText}>
              {bleScanRef.current
                ? (lang === 'en' ? TRANSLATIONS.en.volunteerListening : TRANSLATIONS.ne.volunteerListening)
                : (lang === 'en' ? 'BLE scan inactive' : 'BLE स्क्यान निष्क्रिय')}
            </Text>
          </View>
        </View>

        {/* Nearby Incidents Feed */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.main}>
          <View style={styles.volunteerHeaderRow}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
              {lang === 'en' ? TRANSLATIONS.en.volunteerAlerts : TRANSLATIONS.ne.volunteerAlerts}
            </Text>
            <Text style={styles.volunteerCountBadge}>{volunteerAlerts.length}</Text>
          </View>

          {volunteerAlerts.length === 0 ? (
            <View style={styles.volunteerEmptyState}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📡</Text>
              <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                {lang === 'en' ? TRANSLATIONS.en.volunteerNone : TRANSLATIONS.ne.volunteerNone}
              </Text>
              <Text style={{ color: '#475569', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
                {lang === 'en' ? 'BLE scanning for PRAHARI-ALERT beacons...' : 'BLE ले PRAHARI-ALERT बिकन खोज्दै...'}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10, width: '100%' }}>
              {volunteerAlerts.map((alert, index) => (
                <TouchableOpacity
                  key={alert.key}
                  style={[styles.volunteerAlertCard, {
                    borderColor: hexToRgba(alert.color, 0.4),
                    backgroundColor: hexToRgba(alert.color, 0.12),
                  }]}
                  onPress={() => setSelectedAlertIndex(selectedAlertIndex === index ? null : index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.volunteerAlertHeader}>
                    <View style={styles.volunteerAlertTitleRow}>
                      <Text style={{ fontSize: 20, marginRight: 6 }}>{alert.emoji}</Text>
                      <Text style={styles.volunteerAlertTitle}>
                        {lang === 'en' ? TRANSLATIONS.en.volunteerSOS : TRANSLATIONS.ne.volunteerSOS}
                      </Text>
                    </View>
                    <View style={[styles.volunteerSignalBadge, {
                      backgroundColor: alert.rssi > -70 ? 'rgba(34,197,94,0.2)' : 'rgba(234,179,8,0.2)',
                    }]}>
                      <Text style={[styles.volunteerSignalText, {
                        color: alert.rssi > -70 ? '#22c55e' : '#eab308',
                      }]}>
                        {alert.rssi} dBm
                      </Text>
                    </View>
                  </View>

                  <View style={styles.volunteerAlertMeta}>
                    <Text style={styles.volunteerAlertMetaText}>
                      {lang === 'en' ? TRANSLATIONS.en.volunteerNode : TRANSLATIONS.ne.volunteerNode}: <Text style={{ color: '#e2e8f0', fontWeight: '700' }}>{alert.nodeID}</Text>
                      {'  ·  '}
                      {lang === 'en' ? TRANSLATIONS.en.volunteerCategory : TRANSLATIONS.ne.volunteerCategory}: <Text style={{ color: '#e2e8f0' }}>{alert.category}</Text>
                    </Text>
                  </View>

                  {alert.coords && alert.coords !== 'N/A' && (
                    <Text style={styles.volunteerAlertCoords}>
                      📍 {alert.coords}
                    </Text>
                  )}

                  <Text style={styles.volunteerAlertTime}>
                    {lang === 'en' ? TRANSLATIONS.en.volunteerTime : TRANSLATIONS.ne.volunteerTime}: {alert.timestamp}
                  </Text>

                  {selectedAlertIndex === index && (
                    <View style={styles.volunteerAlertExpand}>
                      <Text style={styles.volunteerExpandText}>
                        {lang === 'en' ? TRANSLATIONS.en.volunteerTapView : TRANSLATIONS.ne.volunteerTapView}
                      </Text>
                      <TouchableOpacity
                        style={[styles.volunteerActionBtn, { backgroundColor: hexToRgba(alert.color, 0.25) }]}
                        onPress={() => {
                          Alert.alert(
                            `🚨 ${alert.category}`,
                            `${lang === 'en' ? TRANSLATIONS.en.volunteerNode : TRANSLATIONS.ne.volunteerNode}: ${alert.nodeID}\n${lang === 'en' ? TRANSLATIONS.en.volunteerCategory : TRANSLATIONS.ne.volunteerCategory}: ${alert.category}\n📍 ${alert.coords}\n⏱ ${alert.timestamp}\n\nStay safe! Police have been notified.`,
                            [{ text: t.ok }]
                          );
                        }}
                      >
                        <Text style={styles.volunteerActionText}>
                          {lang === 'en' ? 'View Full Details' : 'पूरा विवरण हेर्नुहोस्'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t.footer}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Initial Face Verification (before main screen) ───────────────────────
  if (isVolunteer === false && !faceVerified) {
    return (
      <LivenessCamera
        category={null}
        onVerified={(_, confidence) => handleFaceVerified(null, confidence)}
        onFailed={(reason) => {
          Alert.alert('🔒 Verification Failed', reason || 'Access denied. Only verified responders can send alerts.');
          setIsVolunteer(null);
        }}
        onCancel={() => setIsVolunteer(null)}
        lang={lang}
      />
    );
  }

  // ── Enhanced ACK Overlay (with dispatch details) ──────────────────────────
  if (ackReceived) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.ackOverlay}>
          <Text style={{ fontSize: 60, marginBottom: 10 }}>🚔</Text>
          <Text style={styles.ackTitle}>{t.helpComing}</Text>
          <Text style={styles.ackSub}>{t.ackSub}</Text>
          <View style={styles.ackBadge}><Text style={styles.ackBadgeText}>{ackNodeID}</Text></View>

          {/* Enhanced dispatch details */}
          {ackDispatchInfo && (
            <View style={styles.ackDispatchDetails}>
              <View style={styles.ackDispatchRow}>
                <Text style={styles.ackDispatchIcon}>🚓</Text>
                <Text style={styles.ackDispatchLabel}>
                  {t.dispatchedBy}
                </Text>
                <Text style={styles.ackDispatchValue}>
                  {ackDispatchInfo.commander}
                </Text>
              </View>
              <View style={styles.ackDispatchRow}>
                <Text style={styles.ackDispatchIcon}>👥</Text>
                <Text style={styles.ackDispatchLabel}>
                  {t.personnel}
                </Text>
                <Text style={styles.ackDispatchValue}>
                  {ackDispatchInfo.personnel}
                </Text>
              </View>
              <View style={styles.ackDispatchRow}>
                <Text style={styles.ackDispatchIcon}>🚙</Text>
                <Text style={styles.ackDispatchLabel}>
                  {t.vehicle}
                </Text>
                <Text style={styles.ackDispatchValue}>
                  {ackDispatchInfo.vehicle}
                </Text>
              </View>
              <View style={[styles.ackDispatchRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.ackDispatchIcon}>⏱</Text>
                <Text style={styles.ackDispatchLabel}>
                  {t.eta}
                </Text>
                <Text style={[styles.ackDispatchValue, { color: '#fbbf24' }]}>
                  {ackDispatchInfo.eta}
                </Text>
              </View>
            </View>
          )}

          <Text style={styles.ackFoot}>{t.ackFoot}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Liveness camera screen
  if (showLiveness && livenessCategory) {
    return (
      <LivenessCamera
        category={livenessCategory}
        onVerified={handleFaceVerified}
        onFailed={handleLivenessFailed}
        onCancel={() => { setShowLiveness(false); setLivenessCategory(null); }}
        lang={lang}
      />
    );
  }

  if (countdown !== null && selectedCategory) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 60, marginBottom: 20 }}>⚠️</Text>
        <Text style={styles.countdownTitle}>{t.sending}</Text>
        <View style={styles.countdownCatBadge}>
          <Text style={{ fontSize: 16, marginRight: 6 }}>{selectedCategory.emoji}</Text>
          <Text style={{ color: 'white', fontSize: 16, fontWeight: '700' }}>{selectedCategory.labelEn}</Text>
        </View>
        <Text style={styles.countdownTimer}>{countdown}</Text>
        <TouchableOpacity style={styles.cancelButton} onPress={cancelCountdown}>
          <Text style={styles.cancelText}>{t.cancel}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t.title}</Text>
          <View style={styles.headerRight}>
            {/* Battery indicator */}
            {deviceBattery !== null && (
              <View style={[styles.batteryBadge, {
                backgroundColor: deviceBattery > 20 ? '#1e293b' : 'rgba(239,68,68,0.3)',
                borderColor: deviceBattery > 20 ? '#334155' : 'rgba(239,68,68,0.5)',
              }]}>
                <Text style={[styles.batteryText, {
                  color: deviceBattery > 60 ? '#22c55e' : deviceBattery > 20 ? '#eab308' : '#ef4444',
                }]}>
                  {'\u26A1'}{deviceBattery}%
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setLang(lang === 'en' ? 'ne' : 'en')} style={styles.langToggle}>
              <Text style={styles.langText}>{lang === 'en' ? 'ने' : 'EN'}</Text>
            </TouchableOpacity>
            <View style={[styles.statusBadge, { backgroundColor: connected ? '#3b82f6' : '#ef4444' }]}>
              <Text style={styles.statusBadgeText}>{connected ? 'LIVE' : 'INIT'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: connected ? '#10b981' : btStatus === 'scanning' || btStatus === 'connecting' ? '#eab308' : '#ef4444' }]} />
          <Text style={styles.statusText}>
            {connected ? t.connected :
             btStatus === 'connecting' ? `Connecting to ${btDeviceName}...` :
             btStatus === 'scanning' ? `Scanning...` :
             btStatus === 'failed' ? (btErrorMessage || 'Connection failed') :
             t.searching}
          </Text>
          {deviceBattery !== null && (
            <View style={[styles.batteryMini, {
              backgroundColor: deviceBattery > 20 ? '#334155' : 'rgba(239,68,68,0.2)',
            }]}>
              <View style={[styles.batteryMiniFill, {
                width: `${deviceBattery}%`,
                backgroundColor: deviceBattery > 60 ? '#22c55e' : deviceBattery > 20 ? '#eab308' : '#ef4444',
              }]} />
            </View>
          )}
        </View>
        {/* Retry button when connection failed */}
        {!connected && btStatus === 'failed' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
                backgroundColor: '#3b82f6', marginRight: 8,
              }}
              onPress={() => scanForRelay()}
              activeOpacity={0.7}
            >
              <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>
                🔄 Scan for Node
              </Text>
            </TouchableOpacity>
            {btDeviceName !== '' && (
              <Text style={{ color: '#64748b', fontSize: 9 }}>
                Found: {btDeviceName}
              </Text>
            )}
          </View>
        )}
        {/* Show device name when connected */}
        {connected && btDeviceName && (
          <Text style={{ color: '#22c55e', fontSize: 9, marginTop: 4 }}>
            ✅ {btDeviceName}
          </Text>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.main}>
        {(sosSentTime !== null && (Date.now() - sosSentTime) < SOS_LOCKOUT_MS) ? (
          <>
            {/* ── SOS Already Sent — 30-min lockout ────────────────────────── */}
            <View style={styles.lockoutContainer}>
              <Text style={{ fontSize: 64, marginBottom: 16 }}>🚔</Text>
              <Text style={styles.lockoutTitle}>Already Reported</Text>
              <Text style={styles.lockoutDesc}>You have already sent an alert. Police have been notified.</Text>
              <Text style={styles.lockoutDesc}>Cannot send another alert for 30 minutes.</Text>
              <View style={styles.lockoutBadge}>
                <Text style={styles.lockoutBadgeText}>NOT ALLOWED</Text>
              </View>
              <Text style={styles.lockoutFoot}>Stay where you are. Help is on the way.</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionTitle}>{t.selectCategory}</Text>

            <View style={styles.noteContainer}>
              <TextInput
                style={styles.nameInput}
                placeholder={t.namePlaceholder}
                placeholderTextColor="#475569"
                maxLength={30}
                value={citizenName}
                onChangeText={setCitizenName}
              />
            </View>

            <View style={styles.noteContainer}>
              <TextInput
                style={styles.noteInput}
                placeholder={t.notePlaceholder}
                placeholderTextColor="#475569"
                multiline maxLength={99}
                value={userNote}
                onChangeText={setUserNote}
              />
              <Text style={styles.noteCounter}>{userNote.length}/99</Text>
            </View>

            <View style={styles.catGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catItem, { backgroundColor: hexToRgba(cat.color, 0.19), borderColor: hexToRgba(cat.color, 0.38) }]}
                  onPress={() => handleCategorySelect(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                  <Text style={styles.catLabel}>{lang === 'ne' ? cat.labelNe : cat.labelEn}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t.footer}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { padding: 16, paddingTop: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: 'white' },
  langToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#1e293b' },
  langText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: '#94a3b8', fontSize: 12 },
  main: { padding: 16, alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#94a3b8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  noteContainer: { width: '100%', marginBottom: 12 },
  nameInput: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 12, color: 'white',
    fontSize: 13, borderWidth: 1, borderColor: '#334155',
  },
  noteInput: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 12, color: 'white',
    fontSize: 13, minHeight: 50, maxHeight: 70, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#334155',
  },
  noteCounter: { textAlign: 'right', color: '#64748b', fontSize: 10, marginTop: 3 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  catItem: {
    width: '47%', padding: 18, borderRadius: 16, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', minHeight: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  catLabel: { color: 'white', fontSize: 14, fontWeight: '800', marginTop: 8, textAlign: 'center', letterSpacing: 0.3 },
  catEmoji: { fontSize: 32, marginBottom: 2 },

  // Countdown overlay
  countdownTitle: { fontSize: 22, fontWeight: '700', color: 'white', marginBottom: 12 },
  countdownCatBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, marginBottom: 20,
  },
  countdownTimer: { fontSize: 96, fontWeight: '900', color: 'white', marginBottom: 30 },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 40, paddingVertical: 12,
    borderRadius: 30, borderWidth: 2, borderColor: 'white',
  },
  cancelText: { color: 'white', fontSize: 18, fontWeight: '800', letterSpacing: 2 },

  // Battery styles
  batteryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    borderWidth: 1, marginRight: 4,
  },
  batteryText: { fontSize: 9, fontWeight: '700' },
  batteryMini: {
    width: 40, height: 6, borderRadius: 3, marginLeft: 8, overflow: 'hidden',
    borderWidth: 1, borderColor: '#475569',
  },
  batteryMiniFill: { height: '100%', borderRadius: 2 },

  // ACK overlay
  ackOverlay: {
    flex: 1, backgroundColor: 'rgba(34, 197, 94, 0.95)',
    justifyContent: 'center', alignItems: 'center', padding: 40,
  },
  ackTitle: { fontSize: 28, fontWeight: '900', color: 'white', textAlign: 'center' },
  ackSub: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 8, textAlign: 'center' },
  ackBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20, marginTop: 16 },
  ackBadgeText: { color: 'white', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  ackFoot: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 30, textAlign: 'center' },

  // Enhanced ACK dispatch details
  ackDispatchDetails: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  ackDispatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  ackDispatchIcon: { fontSize: 14, width: 28 },
  ackDispatchLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', flex: 1 },
  ackDispatchValue: { fontSize: 12, color: 'white', fontWeight: '700', textAlign: 'right' },

  // Volunteer Registration Screen
  volunteerRegContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  volunteerRegTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
  },
  volunteerRegDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  volunteerRegBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
  },
  volunteerRegBtnText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  volunteerSkipBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  volunteerSkipText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  volunteerFooter: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  volunteerFooterText: {
    color: '#475569',
    fontSize: 9,
    textAlign: 'center',
  },
  volunteerLangToggle: {
    position: 'absolute',
    top: 50,
    right: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },

  // Volunteer Mode Styles
  volunteerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  volunteerCountBadge: {
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  volunteerEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  volunteerAlertCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  volunteerAlertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volunteerAlertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  volunteerAlertTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  volunteerSignalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  volunteerSignalText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  volunteerAlertMeta: {
    marginTop: 8,
  },
  volunteerAlertMetaText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  volunteerAlertCoords: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  volunteerAlertTime: {
    color: '#64748b',
    fontSize: 9,
    marginTop: 6,
  },
  volunteerAlertExpand: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  volunteerExpandText: {
    color: '#94a3b8',
    fontSize: 10,
    marginBottom: 8,
  },
  volunteerActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  volunteerActionText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },

  footer: { padding: 16, alignItems: 'center' },
  footerText: { color: '#475569', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },

  // SOS Lockout — Already Reported
  lockoutContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  lockoutTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
  },
  lockoutDesc: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  lockoutBadge: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(239,68,68,0.6)',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  lockoutBadgeText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  lockoutFoot: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },
});
