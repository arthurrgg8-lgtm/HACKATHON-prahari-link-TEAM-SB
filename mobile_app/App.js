import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, Alert, SafeAreaView, PermissionsAndroid, Platform, ScrollView, NativeModules, AppState, InteractionManager, Image, Vibration, Linking } from 'react-native';
import BluetoothSerial from 'react-native-bluetooth-serial-next';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import LivenessCamera from './LivenessCamera';
import { BleManager } from 'react-native-ble-plx';
import { io } from 'socket.io-client';

const decodeBase64 = (input) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let str = String(input).replace(/=+$/, '');
  let output = '';
  for (let i = 0, bc = 0, bs; i < str.length; i++) {
    const char = str.charAt(i);
    const idx = chars.indexOf(char);
    if (idx === -1) continue;
    bs = bc % 4 ? bs * 64 + idx : idx;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
    }
  }
  return output;
};

const bleManager = new BleManager();
const { PrahariLinkModule } = NativeModules;

// ── Backend Server URL ──────────────────────────────────────────────────────
// Change this to your laptop's IP when testing on physical devices
// e.g. 'http://192.168.1.100:3001'
const BACKEND_URL = 'http://192.168.80.159:3001';

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
    searching: 'Searching for Relay...', notePlaceholder: 'Describe the emergency... (e.g. Fire near school) *',
    helpComing: 'HELP IS ON THE WAY!', ackSub: 'Police have acknowledged your alert',
    ackFoot: 'Stay where you are. Assistance arriving ASAP.',
    reassurance: 'You are not alone. Move to a safe place, breathe slowly, and stay available for police contact.',
    reassuranceNepali: 'तपाईं एक्लै हुनुहुन्न। सुरक्षित स्थानमा बस्नुहोस्, बिस्तारै सास लिनुहोस् र प्रहरीको सम्पर्कको लागि तयार रहनुहोस्।',
    playReassurance: 'PLAY NEPALI REASSURANCE',
    sending: 'Sending Emergency Alert', cancel: 'CANCEL', selectCategory: 'Select Incident Type',
    namePlaceholder: 'Your Name (so police know who reported) *',
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
    volunteerAccept: '✋ ACCEPT & RESPOND',
    volunteerAccepted: '✅ YOU ARE RESPONDING',
    // Lobby, lock, and validation
    lobbyWaiting: 'ALERT TRANSMITTED',
    lobbySub: 'Waiting for police acknowledgment...',
    resolvedTitle: 'Incident Resolved / All Clear',
    resolvedSub: 'Emergency response has successfully resolved the incident. Application lockout remains active to prevent duplicate reports.',
    lockedLabel: '🔒 ALERT LOCKOUT ACTIVE',
    lockedDesc: 'You have already sent an alert. You cannot send another alert at this time.',
    requiredFields: 'Required Fields',
    requiredDesc: 'Both Name and Description are compulsory to send an SOS!',
  },
  ne: {
    title: 'प्रहरी-लिंक', subtitle: 'प्रमाणित उत्तरदाता', connected: 'गाउँ नोडमा जोडियो',
    searching: 'रिले खोज्दै...', notePlaceholder: 'आपतकालिन वर्णन गर्नुहोस्... (जस्तै: विद्यालयमा आगो) *',
    helpComing: 'सहायता आउँदैछ!', ackSub: 'प्रहरीले तपाईंको सूचना स्वीकार गरेको छ',
    ackFoot: 'कृपया पर्खनुहोस्। सहायता चाँडै आइपुग्नेछ।',
    reassurance: 'तपाईं एक्लै हुनुहुन्न। सुरक्षित स्थानमा बस्नुहोस्, बिस्तारै सास लिनुहोस् र प्रहरीको सम्पर्कको लागि तयार रहनुहोस्।',
    reassuranceNepali: 'You are not alone. Move to a safe place, breathe slowly, and stay available for police contact.',
    playReassurance: 'नेपाली सन्देश सुन्नुहोस्',
    sending: 'आपतकालिन सूचना पठाउँदै', cancel: 'रद्द गर्नुहोस्',
    selectCategory: 'घटना प्रकार चयन गर्नुहोस्',
    namePlaceholder: 'तपाईंको नाम (प्रहरीलाई जानकारीको लागि) *',
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
    volunteerAccept: '✋ स्वीकार गर्नुहोस्',
    volunteerAccepted: '✅ तपाईं जाँदै हुनुहुन्छ',
    // Lobby, lock, and validation
    lobbyWaiting: 'अलर्ट पठाइयो',
    lobbySub: 'प्रहरी स्वीकृतिको प्रतीक्षामा...',
    resolvedTitle: 'घटना समाधान भयो / सबै ठीक छ',
    resolvedSub: 'आपतकालीन प्रतिक्रिया सफल भएको छ। दोहोरो रिपोर्टहरू रोक्नको लागि सुरक्षा लक सक्रिय छ।',
    lockedLabel: '🔒 अलर्ट लक सक्रिय',
    lockedDesc: 'तपाईंले पहिले नै अलर्ट पठाइसक्नुभएको छ। यस समयमा अर्को अलर्ट पठाउन अनुमति छैन।',
    requiredFields: 'आवश्यक विवरण',
    requiredDesc: 'एसओएस (SOS) पठाउन नाम र विवरण दुबै अनिवार्य छ!',
  },
};

function PoliceBrand({ lang, title, compact = false }) {
  return (
    <View style={styles.policeBrand}>
      <View style={[styles.brandMark, compact && styles.brandMarkCompact]}>
        <Text style={[styles.brandMarkText, compact && styles.brandMarkTextCompact]}>NP</Text>
      </View>
      <View>
        <Text style={[styles.policeBrandBanner, compact && styles.policeBrandBannerCompact]}>
          {lang === 'en' ? 'NEPAL POLICE' : 'नेपाल प्रहरी'}
        </Text>
        <Text style={[styles.policeBrandNepali, compact && styles.policeBrandNepaliCompact]}>
          {lang === 'en' ? 'नेपाल प्रहरी' : 'NEPAL POLICE'}
        </Text>
        {title ? <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text> : null}
      </View>
    </View>
  );
}

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
  const sosSendTimeoutRef = useRef(null);
  const reassurancePlayedRef = useRef(false);
  const batterySubRef = useRef(null);
  const bleScanRef = useRef(null);
  // Face verification state — verify identity before SOS
  const [faceVerified, setFaceVerified] = useState(false);
  // Volunteer state
  const [isVolunteer, setIsVolunteer] = useState(null); // null = landing page, true/false
  const [volunteerAlerts, setVolunteerAlerts] = useState([]);
  const isVolunteerRef = useRef(null); // Ref mirror to avoid stale closures in socket callbacks
  const [selectedAlertIndex, setSelectedAlertIndex] = useState(null);
  const [acceptedAlerts, setAcceptedAlerts] = useState(new Set());
  
  // Custom states for waiting lobby, resolutions, and lockout
  const [sosStatus, setSosStatus] = useState('idle'); // idle | waiting | acknowledged | resolved
  const [isLocked, setIsLocked] = useState(false);
  const [developerTapCount, setDeveloperTapCount] = useState(0);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const socketRef = useRef(null);

  // Initialize socket inside useEffect
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(BACKEND_URL, {
        auth: { token: 'prahari-ingest-demo-2026' },
        autoConnect: true,
        transports: ['websocket'],
      });

      socketRef.current.on('connect', () => console.log('Connected to Prahari Server'));
      socketRef.current.on('connect_error', (err) => console.log('Socket Error:', err.message));

      // ── Volunteer Socket.IO Fallback ─────────────────────────────────────
      // Listen for new incidents from the backend so volunteer phones can
      // receive SOS events even without ESP-A BLE hardware nearby.
      socketRef.current.on('new_incident', (data) => {
        if (isVolunteerRef.current !== true) return; // Only process in volunteer mode

        const catLookup = {
          'LANDSLIDE': { emoji: '🏔️', color: '#dc2626' },
          'FLOOD':     { emoji: '🌊', color: '#2563eb' },
          'EARTHQUAKE':{ emoji: '🏚️', color: '#dc2626' },
          'CRIME':     { emoji: '🔫', color: '#ea580c' },
          'MEDICAL':   { emoji: '🚑', color: '#dc2626' },
          'FIRE':      { emoji: '🔥', color: '#ea580c' },
          'MISSING':   { emoji: '🔍', color: '#ca8a04' },
          'DISTURBANCE':{ emoji: '📢', color: '#ca8a04' },
        };
        const cat = data.alert_category || data.category || 'UNKNOWN';
        const catInfo = catLookup[cat] || { emoji: '🚨', color: '#ef4444' };
        const alertKey = `socket-${data.alert_id || Date.now()}`;

        setVolunteerAlerts(prev => {
          if (prev.some(a => a.key === alertKey)) return prev;

          // Buzz/Vibrate for volunteer — same pattern as BLE detection
          Vibration.vibrate([0, 500, 200, 500]);
          if (Platform.OS === 'android' && PrahariLinkModule?.playNotificationSound) {
            PrahariLinkModule.playNotificationSound().catch(e => console.log('Sound play error:', e.message));
          }

          const coords = data.coords || [];
          const lat = coords[0] || data.lat || 0;
          const lon = coords[1] || data.lon || 0;

          return [{
            key: alertKey,
            nodeID: data.nodeID || data.node_id || 'UNKNOWN',
            category: cat,
            emoji: catInfo.emoji,
            color: catInfo.color,
            coords: (lat && lon) ? `${lat},${lon}` : 'N/A',
            timestamp: new Date().toLocaleTimeString(),
            rssi: -50, // Simulated — received via network, not BLE
            source: 'socket',
            citizenName: data.citizenName || '',
            note: data.note || '',
          }, ...prev].slice(0, 10);
        });
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  // 15-min Cooldown Timer
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(null);
  const cooldownTimerRef = useRef(null);

  const t = TRANSLATIONS[lang];
  const NEPALI_REASSURANCE = 'तपाईं सुरक्षित स्थानमा बस्नुहोस्। बिस्तारै सास लिनुहोस्। नेपाल प्रहरीलाई तपाईंको सूचना प्राप्त भएको छ। सहायता तपाईं तर्फ आउँदैछ।';

  // ── 15-min Cooldown Timer ───────────────────────────────────────────────
  const startCooldownTimer = (until) => {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }
    cooldownTimerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((until - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        if (cooldownTimerRef.current) {
          clearInterval(cooldownTimerRef.current);
          cooldownTimerRef.current = null;
        }
        setIsLocked(false);
        setCooldownUntil(null);
        setCooldownRemaining(null);
        if (Platform.OS === 'android' && PrahariLinkModule) {
          PrahariLinkModule.setCooldown(0);
        }
      }
    }, 1000);
  };

  const speakReassurance = () => {
    if (Platform.OS !== 'android' || !PrahariLinkModule?.speakNepali) return;
    PrahariLinkModule.speakNepali(NEPALI_REASSURANCE).catch(error => {
      console.warn('Nepali speech unavailable:', error);
    });
  };

  useEffect(() => {
    if (sosStatus === 'acknowledged' && ackReceived && !reassurancePlayedRef.current) {
      reassurancePlayedRef.current = true;
      speakReassurance();
    }
    if (sosStatus === 'idle') reassurancePlayedRef.current = false;
  }, [sosStatus, ackReceived]);

  // Helper to handle going back to landing page and stopping background service
  const handleBackToLanding = () => {
    if (Platform.OS === 'android' && PrahariLinkModule) {
      PrahariLinkModule.stopService().then(console.log).catch(console.warn);
      PrahariLinkModule.setAlertStatus('idle');
    }
    setIsVolunteer(null);
    setFaceVerified(false);
    setConnected(false);
    setBtStatus('searching');
    setSosStatus('idle');
    setIsLocked(false);
    setAckReceived(false);
  };

  const handleBackToForm = () => {
    console.log('Forcing back to form...');
    setSosStatus('idle');
    setIsLocked(false);
    setAckReceived(false);
    setAckDispatchInfo(null);
    if (Platform.OS === 'android' && PrahariLinkModule) {
      PrahariLinkModule.setAlertStatus('idle').catch(e => console.warn('Native status reset failed:', e));
    }
  };

  const enterVolunteerMode = () => {
    setIsVolunteer(true);
    if (Platform.OS === 'android' && PrahariLinkModule) {
      PrahariLinkModule.startService().then(console.log).catch(console.warn);
    }
  };

  const enterResponderMode = () => {
    setIsVolunteer(false);
    if (Platform.OS === 'android' && PrahariLinkModule) {
      PrahariLinkModule.startService().then(console.log).catch(console.warn);
      PrahariLinkModule.getAlertStatus().then(status => {
        if (status && status !== 'idle') {
          // For demo, we still allow going back to the form
          setFaceVerified(true);
        } else {
          setFaceVerified(false);
        }
      }).catch(() => setFaceVerified(false));
    } else {
      setFaceVerified(false);
    }
  };

  // Developer backdoor reset for hackathon evaluation testing (5 taps in footer)
  const handleDeveloperReset = () => {
    const count = developerTapCount + 1;
    setDeveloperTapCount(count);
    if (count >= 5) {
      setDeveloperTapCount(0);
      setIsLocked(false);
      setSosStatus('idle');
      setAckReceived(false);
      setAckDispatchInfo(null);
      setCooldownUntil(null);
      setCooldownRemaining(null);
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      if (Platform.OS === 'android' && PrahariLinkModule) {
        PrahariLinkModule.setAlertStatus('idle');
        PrahariLinkModule.setCooldown(0);
      }
      Alert.alert('Developer Mode', 'All-Clear: Alert lock, cooldown, and session status reset!');
    }
  };

  const waitForActivity = async () => {
    if (AppState.currentState !== 'active') {
      await new Promise(resolve => {
        const subscription = AppState.addEventListener('change', state => {
          if (state === 'active') {
            subscription.remove();
            resolve();
          }
        });
      });
    }
    await new Promise(resolve => InteractionManager.runAfterInteractions(resolve));
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return;
    try {
      await waitForActivity();
      const perms = [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ];
      if (Platform.Version >= 31) {
        perms.push(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        );
      }
      if (Platform.Version >= 33) {
        perms.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      }
      await PermissionsAndroid.requestMultiple(perms.filter(Boolean));
    } catch (err) {
      console.warn('Permission request failed:', err);
    }
  };

  // Track Bluetooth connection status for better UX
  const [btStatus, setBtStatus] = useState('searching'); // searching | scanning | connecting | connected | failed
  const [btDeviceName, setBtDeviceName] = useState('');
  const [btErrorMessage, setBtErrorMessage] = useState('');
  const btRetryCountRef = useRef(0);
  const btRetryTimerRef = useRef(null);
  const btHealthTimerRef = useRef(null);

  // Helper: find a device by name (exact then partial)
  const findRelay = (devices) => {
    let relay = devices.find(d => d.name && d.name.trim() === 'Prahari-Link-V1');
    if (relay) return relay;
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
      try {
        const isEnabled = await BluetoothSerial.isEnabled();
        if (!isEnabled) await BluetoothSerial.enable();
      } catch (btEnableErr) {
        console.log('BT enable error:', btEnableErr);
      }

      let devices = [];
      try {
        devices = await BluetoothSerial.list();
        console.log('BT bonded devices:', devices.map(d => d.name));
      } catch (listErr) {
        console.log('BT list error:', listErr);
      }
      let relay = findRelay(devices);

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

      if (relay) {
        setBtStatus('connecting');
        setBtErrorMessage('Connecting to ' + relay.name + '...');
        try {
          await BluetoothSerial.connect(relay.id);
          setConnected(true);
          setBtStatus('connected');
          setBtErrorMessage('');
          btRetryCountRef.current = 0; 

          try {
            await BluetoothSerial.withDelimiter('\n');
            BluetoothSerial.on('data', (data) => {
              const message = data.data?.toString().trim();
              console.log('BT Received:', message);
              
              if (message && message.startsWith('ACK:')) {
                const ackParts = message.replace('ACK:', '').split('|');
                const nodeID = ackParts[0];
                setAckNodeID(nodeID);

                let statusStr = `acknowledged|${nodeID}`;
                if (ackParts.length >= 5 && ackParts[1] && ackParts[1] !== '') {
                  const dispatcherInfo = {
                    commander: ackParts[1],
                    personnel: ackParts[2],
                    vehicle: ackParts[3],
                    eta: ackParts[4],
                  };
                  setAckDispatchInfo(dispatcherInfo);
                  statusStr += `|${ackParts[1]}|${ackParts[2]}|${ackParts[3]}|${ackParts[4]}`;
                } else {
                  setAckDispatchInfo(null);
                }

                setSosStatus('acknowledged');
                setAckReceived(true);
                
                if (Platform.OS === 'android' && PrahariLinkModule) {
                  PrahariLinkModule.setAlertStatus(statusStr);
                }
              } else if (message && message.startsWith('RESOLVED:')) {
                setSosStatus('resolved');
                if (Platform.OS === 'android' && PrahariLinkModule) {
                  PrahariLinkModule.setAlertStatus('resolved');
                }
              }
            });
          } catch (err) {
            console.log('BT Listener error:', err);
            setBtErrorMessage('Listener setup failed: ' + (err.message || ''));
          }
        } catch (connectErr) {
          console.log('BT connect error:', connectErr);
          btRetryCountRef.current += 1;
          if (btRetryCountRef.current < 3) {
            setBtStatus('scanning');
            setBtErrorMessage(`Connection failed, retrying (${btRetryCountRef.current}/3)...`);
            btRetryTimerRef.current = setTimeout(() => scanForRelay(), 3000);
          } else {
            setBtStatus('failed');
            setBtErrorMessage('Relay unavailable. Foreground reconnection remains active.');
            btRetryCountRef.current = 0;
            btRetryTimerRef.current = setTimeout(() => scanForRelay(), 10000);
          }
        }
      } else {
        setBtStatus('failed');
        setBtErrorMessage('Relay not found. Foreground reconnection will retry automatically.');
        btRetryTimerRef.current = setTimeout(() => scanForRelay(), 10000);
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
    if (bleScanRef.current) return;
    try {
      bleManager.startDeviceScan(
        null,
        null,
        (error, scannedDevice) => {
          if (error) {
            console.log('BLE scan error:', error);
            return;
          }
          if (scannedDevice) {
            const mfgData = scannedDevice.manufacturerData || '';
            let rawMfgData = '';
            try { rawMfgData = decodeBase64(mfgData); } catch (e) { console.log('Base64 decode error:', e); }
            if (rawMfgData.includes('P|')) {
              const parts = rawMfgData.split('|');
              if (parts.length >= 4) {
                const alertKey = `${scannedDevice.id}-${parts[2]}`;
                setVolunteerAlerts(prev => {
                  if (prev.some(a => a.key === alertKey)) return prev;
                  
                  // Buzz/Vibrate for volunteer
                  Vibration.vibrate([0, 500, 200, 500]);
                  if (Platform.OS === 'android' && PrahariLinkModule?.playNotificationSound) {
                    PrahariLinkModule.playNotificationSound().catch(e => console.log('Sound play error:', e.message));
                  }
                  
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
                  return [newAlert, ...prev].slice(0, 10);
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
    } catch (e) { }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await requestPermissions();
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            setLocation(await Location.getCurrentPositionAsync({}));
          }
        } catch (locErr) { console.log('Location error:', locErr); }
        try {
          const batLevel = await Battery.getBatteryLevelAsync();
          setDeviceBattery(Math.round(batLevel * 100));
        } catch (e) { console.log('Battery read error:', e); }
        batterySubRef.current = Battery.addBatteryLevelListener(({ batteryLevel }) => {
          setDeviceBattery(Math.round(batteryLevel * 100));
        });
        
        // Load persistent alert/incident status from Native SharedPreferences
        if (Platform.OS === 'android' && PrahariLinkModule) {
          // Also load 15-min cooldown
          PrahariLinkModule.getCooldown().then(cooldownTs => {
            const now = Date.now();
            if (cooldownTs && cooldownTs > now) {
              setCooldownUntil(cooldownTs);
              setIsLocked(true);
              startCooldownTimer(cooldownTs);
              setCooldownRemaining(Math.floor((cooldownTs - now) / 1000));
            }
          }).catch(() => {});

          PrahariLinkModule.getAlertStatus().then(status => {
            if (status) {
              console.log('Loaded persistent status:', status);
              if (status === 'waiting') {
                setSosStatus('waiting');
                setIsLocked(true);
                setIsVolunteer(false);
                setFaceVerified(true);
              } else if (status.startsWith('acknowledged')) {
                const parts = status.split('|');
                setSosStatus('acknowledged');
                setIsLocked(true);
                setIsVolunteer(false);
                setFaceVerified(true);
                setAckNodeID(parts[1] || 'NODE_A');
                if (parts.length >= 6 && parts[2]) {
                  setAckDispatchInfo({
                    commander: parts[2],
                    personnel: parts[3],
                    vehicle: parts[4],
                    eta: parts[5],
                  });
                }
                setAckReceived(true);
              } else if (status === 'resolved') {
                setSosStatus('resolved');
                setIsLocked(true);
                setIsVolunteer(false);
                setFaceVerified(true);
              }
            }
          }).catch(err => console.log('SharedPreferences error:', err));
        }

        setTimeout(async () => {
          await scanForRelay();
        }, 2000);
        btHealthTimerRef.current = setInterval(async () => {
          try {
            const active = await BluetoothSerial.isConnected();
            if (!active && !btRetryTimerRef.current) await scanForRelay();
          } catch (error) {
            console.log('Bluetooth health check failed:', error);
          }
        }, 15000);
      } catch (e) { console.log('Init error:', e); }
    };
    init();
    return () => {
      if (batterySubRef.current) batterySubRef.current.remove();
      if (btRetryTimerRef.current) clearTimeout(btRetryTimerRef.current);
      if (btHealthTimerRef.current) clearInterval(btHealthTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (sosSendTimeoutRef.current) clearTimeout(sosSendTimeoutRef.current);
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
      stopBLEScan();
      if (bleManager) bleManager.destroy();
    };
  }, []); 

  // Sync isVolunteerRef for use in socket callbacks (avoids stale closures)
  useEffect(() => {
    isVolunteerRef.current = isVolunteer;
  }, [isVolunteer]);

  // Start BLE scanning when user registers as volunteer
  useEffect(() => {
    if (isVolunteer === true) {
      startBLEScan();
    } else {
      stopBLEScan();
    }
    return () => stopBLEScan();
  }, [isVolunteer]);

  const scheduleSOS = (category, confidence) => {
    clearInterval(countdownRef.current);
    clearTimeout(sosSendTimeoutRef.current);
    setSelectedCategory(category);
    setCountdown(3);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => prev > 1 ? prev - 1 : 1);
    }, 1000);
    sosSendTimeoutRef.current = setTimeout(() => {
      clearInterval(countdownRef.current);
      setCountdown(null);
      fireSOS(category, confidence);
    }, 3000);
  };

  // Called by LivenessCamera when face is verified
  const handleFaceVerified = (category, confidence) => {
    setShowLiveness(false);
    setLivenessCategory(null);
    
    if (!category) {
      setFaceVerified(true);
      return;
    }

    scheduleSOS(category, confidence);
  };

  const handleLivenessFailed = (reason) => {
    setShowLiveness(false);
    setLivenessCategory(null);
    Alert.alert('🔒 Verification Failed', reason || 'Face not recognised. Only verified responders can send alerts.');
  };

  const cancelCountdown = () => {
    clearInterval(countdownRef.current);
    clearTimeout(sosSendTimeoutRef.current);
    countdownRef.current = null;
    sosSendTimeoutRef.current = null;
    setCountdown(null);
    setSelectedCategory(null);
  };

  // Category tap: validate required fields, then run per-alert liveness verification
  const handleCategorySelect = (cat) => {
    if (!connected) {
      Alert.alert('Error', 'Not connected to Village Relay Node!');
      return;
    }
    // Lockout disabled for demo
    if (citizenName.trim() === '' || userNote.trim() === '') {
      setShowValidationErrors(true);
      Alert.alert(t.requiredFields, t.requiredDesc);
      return;
    }
    setShowValidationErrors(false);
    setLivenessCategory(cat);
    setShowLiveness(true);
  };

  const fireSOS = async (category, confidence = 50) => {
    const isSocketConnected = socketRef.current && socketRef.current.connected;
    if (!connected && !isSocketConnected) {
      Alert.alert('Error', 'Not connected to Village Relay Node or Backend Server!');
      return;
    }
    const lat = location?.coords?.latitude || 27.7172;
    const lon = location?.coords?.longitude || 85.3240;
    const safeNote = userNote.replace(/\|/g, '-');
    const safeName = (citizenName || 'Anonymous').replace(/\|/g, '-');
    const type = category.type || 'SOS';
    
    let batteryPct = 50;
    try {
      const batLevel = await Battery.getBatteryLevelAsync();
      batteryPct = Math.round(batLevel * 100);
      setDeviceBattery(batteryPct);
    } catch (e) { }
    
    const payload = `${type}|${lat}|${lon}|${category.id}|${safeNote}|FACE|${confidence}|${safeName}|${batteryPct}\n`;
    
    // 1. Send via Bluetooth Serial if connected to ESP32 node
    if (connected) {
      try {
        await BluetoothSerial.write(payload);
      } catch (e) {
        console.warn('Failed to write to Bluetooth Serial:', e.message);
      }
    }
    
    // 2. Hybrid/Fallback: Send via Socket.io directly to Backend if connected to Wi-Fi/Internet
    if (isSocketConnected) {
      try {
        const socketPayload = {
          nodeID: 'CITIZEN_PHONE',
          type,
          category: category.id,
          citizenName: safeName,
          note: safeNote,
          ai_detected: 'FACE',
          ai_confidence: confidence,
          battery_pct: batteryPct,
          solar_ok: 1,
          coords: [lat, lon],
          timestamp: new Date().toISOString(),
          source: 'real',
          status: 'active'
        };
        socketRef.current.emit('new_incident', socketPayload);
      } catch (e) {
        console.warn('Failed to emit SOS via Socket:', e.message);
      }
    }

    // Update app status to waiting for visual feedback
    setSosStatus('waiting');
    
    // Cooldown/Lockout disabled for demo
    if (Platform.OS === 'android' && PrahariLinkModule) {
      PrahariLinkModule.setAlertStatus('waiting');
    }
  };

  const acceptIncident = (alert) => {
    if (acceptedAlerts.has(alert.key)) return;
    
    const volunteerName = citizenName || 'Citizen Volunteer';
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('phone_ble_ack', {
        nodeID: alert.nodeID,
        volunteerName: volunteerName,
        rssi: alert.rssi,
        source: 'real',
      });
    } else {
      console.warn('Socket not connected, cannot accept incident');
    }
    
    setAcceptedAlerts(prev => new Set([...prev, alert.key]));
    Alert.alert('✅ Accepted', 'You are now responding to this incident. Stay safe!');
  };

  // ── Prahari-Link Premium Landing Page ──────────────────────────────────────
  if (isVolunteer === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#011f30' }]}>
        <View style={styles.landingContainer}>
          <View style={styles.officialHeader}>
            <View style={styles.nepalFlagBar} />
            <View style={styles.officialHeaderContent}>
              <Image source={require('./assets/nepal-police-logo.png')} style={styles.landingLogo} resizeMode="contain" />
              <View style={styles.officialHeaderCopy}>
                <Text style={styles.officialNepali}>नेपाल प्रहरी</Text>
                <Text style={styles.officialEnglish}>NEPAL POLICE</Text>
                <Text style={styles.officialMotto}>सत्य सेवा सुरक्षणम्</Text>
              </View>
            </View>
          </View>

          <View style={styles.landingRadioWaves}>
            <View style={styles.meshDot} />
            <Text style={styles.meshText}>OFFLINE MESH NETWORK  •  READY</Text>
          </View>
          
          <Text style={styles.landingTitle}>
            {lang === 'en' ? 'PRAHARI-LINK' : 'प्रहरी-लिंक'}
          </Text>
          <Text style={styles.landingSubtitle}>
            {lang === 'en' ? 'Offline Emergency Coordination' : 'अफलाइन आपतकालीन नेटवर्क'}
          </Text>
          
          <Text style={styles.landingDesc}>
            {lang === 'en' 
              ? 'Nepal Police Hackathon 2026. Connecting responders and volunteers in communication dead zones.'
              : 'नेपाल प्रहरी ह्याकाथन २०२६। सञ्चार नभएका क्षेत्रहरूमा उद्धारकर्ता र स्वयंसेवकहरूलाई जोड्ने प्रणाली।'}
          </Text>

          {/* Core Action Buttons */}
          <View style={styles.landingButtonsRow}>
            <TouchableOpacity
              style={[styles.landingBtn, { backgroundColor: '#10b981', borderColor: '#059669' }]}
              onPress={enterVolunteerMode}
              activeOpacity={0.8}
            >
              <Text style={styles.landingBtnEyebrow}>{lang === 'en' ? 'COMMUNITY' : 'समुदाय'}</Text>
              <Text style={styles.landingBtnText}>
                {lang === 'en' ? 'Volunteer' : 'स्वयंसेवक'}
              </Text>
              <Text style={styles.landingBtnArrow}>→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.landingBtn, { backgroundColor: '#cb2027', borderColor: '#991b1b' }]}
              onPress={enterResponderMode}
              activeOpacity={0.8}
            >
              <Text style={styles.landingBtnEyebrow}>{lang === 'en' ? 'AUTHORIZED' : 'अधिकृत'}</Text>
              <Text style={styles.landingBtnText}>
                {lang === 'en' ? 'Responder' : 'उत्तरदाता'}
              </Text>
              <Text style={styles.landingBtnArrow}>→</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.volunteerFooter}>
            <Text style={styles.volunteerFooterText}>
              {lang === 'en' ? 'Prahari-Link App v6.0' : 'प्रहरी-लिंक एप संस्करण ६.०'}
            </Text>
            <TouchableOpacity onPress={handleBackToLanding} style={{ marginTop: 10 }}>
              <Text style={{ color: '#cb2027', fontSize: 10, fontWeight: 'bold' }}>[ HARD RESET APP ]</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Language Toggle */}
        <TouchableOpacity
          style={styles.volunteerLangToggle}
          onPress={() => setLang(lang === 'en' ? 'ne' : 'en')}
        >
          <Text style={{ color: '#8abcd7', fontSize: 12, fontWeight: '900' }}>
            {lang === 'en' ? 'नेपाली' : 'ENGLISH'}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Volunteer Mode — BLE scanning + incident feed ──────────────────────────
  if (isVolunteer === true) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#011f30' }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TouchableOpacity onPress={handleBackToLanding} style={styles.backButton}>
                <Text style={{ color: '#8abcd7', fontSize: 22, fontWeight: '900' }}>←</Text>
              </TouchableOpacity>
              <PoliceBrand
                lang={lang}
                title={lang === 'en' ? TRANSLATIONS.en.volunteerMode : TRANSLATIONS.ne.volunteerMode}
                compact
              />
            </View>
            <View style={styles.headerRight}>
              {deviceBattery !== null && (
                <View style={[styles.batteryBadge, {
                  backgroundColor: deviceBattery > 20 ? '#002d45' : 'rgba(239,68,68,0.3)',
                  borderColor: deviceBattery > 20 ? '#8abcd7' : 'rgba(239,68,68,0.5)',
                }]}>
                  <Text style={[styles.batteryText, {
                    color: deviceBattery > 60 ? '#10b981' : deviceBattery > 20 ? '#eab308' : '#ef4444',
                  }]}>
                    {'\u26A1'}{deviceBattery}%
                  </Text>
                </View>
              )}
              <TouchableOpacity onPress={() => setLang(lang === 'en' ? 'ne' : 'en')} style={styles.langToggle}>
                <Text style={styles.langText}>{lang === 'en' ? 'ने' : 'EN'}</Text>
              </TouchableOpacity>
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
            <Text style={[styles.sectionTitle, { marginBottom: 0, color: '#8abcd7' }]}>
              {lang === 'en' ? TRANSLATIONS.en.volunteerAlerts : TRANSLATIONS.ne.volunteerAlerts}
            </Text>
            <Text style={styles.volunteerCountBadge}>{volunteerAlerts.length}</Text>
          </View>

          {volunteerAlerts.length === 0 ? (
            <View style={styles.volunteerEmptyState}>
              <Text style={{ fontSize: 44, marginBottom: 12 }}>📡</Text>
              <Text style={{ color: '#8abcd7', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                {lang === 'en' ? TRANSLATIONS.en.volunteerNone : TRANSLATIONS.ne.volunteerNone}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 10, marginTop: 6, textAlign: 'center' }}>
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
                    backgroundColor: '#002d45',
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
                      backgroundColor: alert.rssi > -70 ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)',
                    }]}>
                      <Text style={[styles.volunteerSignalText, {
                        color: alert.rssi > -70 ? '#10b981' : '#eab308',
                      }]}>
                        {alert.rssi} dBm
                      </Text>
                    </View>
                  </View>

                  <View style={styles.volunteerAlertMeta}>
                    <Text style={styles.volunteerAlertMetaText}>
                      {lang === 'en' ? TRANSLATIONS.en.volunteerNode : TRANSLATIONS.ne.volunteerNode}: <Text style={{ color: 'white', fontWeight: '700' }}>{alert.nodeID}</Text>
                      {'  ·  '}
                      {lang === 'en' ? TRANSLATIONS.en.volunteerCategory : TRANSLATIONS.ne.volunteerCategory}: <Text style={{ color: '#8abcd7' }}>{alert.category}</Text>
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
                      <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                        <TouchableOpacity
                          style={[styles.volunteerActionBtn, { backgroundColor: '#1e40af', flex: 1 }]}
                          onPress={() => {
                            Alert.alert(
                              `🚨 ${alert.category}`,
                              `${lang === 'en' ? TRANSLATIONS.en.volunteerNode : TRANSLATIONS.ne.volunteerNode}: ${alert.nodeID}\n${lang === 'en' ? TRANSLATIONS.en.volunteerCategory : TRANSLATIONS.ne.volunteerCategory}: ${alert.category}\n📍 ${alert.coords}\n⏱ ${alert.timestamp}\n\nStay safe! Police have been notified.`,
                              [{ text: t.ok }]
                            );
                          }}
                        >
                          <Text style={styles.volunteerActionText}>
                            {lang === 'en' ? 'Details' : 'विवरण'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.volunteerActionBtn, { 
                            backgroundColor: acceptedAlerts.has(alert.key) ? '#047857' : '#10b981', 
                            flex: 1.5 
                          }]}
                          onPress={() => acceptIncident(alert)}
                          disabled={acceptedAlerts.has(alert.key)}
                        >
                          <Text style={styles.volunteerActionText}>
                            {acceptedAlerts.has(alert.key) ? t.volunteerAccepted : t.volunteerAccept}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Google Maps Navigation Button */}
                      {alert.coords && alert.coords !== 'N/A' && (
                        <TouchableOpacity
                          style={{
                            backgroundColor: '#1e3a5f',
                            padding: 12,
                            borderRadius: 10,
                            marginTop: 8,
                            alignItems: 'center',
                            flexDirection: 'row',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: '#2563eb',
                          }}
                          onPress={() => {
                            const [lat, lon] = alert.coords.split(',');
                            const myLat = location?.coords?.latitude || '';
                            const myLon = location?.coords?.longitude || '';
                            const url = myLat
                              ? `https://www.google.com/maps/dir/?api=1&origin=${myLat},${myLon}&destination=${lat},${lon}&travelmode=walking`
                              : `https://www.google.com/maps?q=${lat},${lon}`;
                            Linking.openURL(url).catch(err => console.log('Map open error:', err));
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ color: '#93c5fd', fontWeight: '800', fontSize: 13 }}>
                            🗺️ {lang === 'en' ? 'NAVIGATE TO INCIDENT' : 'घटनास्थलमा जानुहोस्'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <TouchableOpacity onPress={handleDeveloperReset} style={styles.footer}>
          <Text style={styles.footerText}>{t.footer}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── SOS Waiting Lobby Screen (Requirement 7) ──────────────────────────────
  if (sosStatus === 'waiting') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#011f30' }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleBackToForm} style={styles.backButton}>
              <Text style={{ color: '#8abcd7', fontSize: 22, fontWeight: '900' }}>←</Text>
            </TouchableOpacity>
            <PoliceBrand lang={lang} title={t.title} compact />
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleBackToForm} style={[styles.statusBadge, { backgroundColor: '#eab308' }]}>
                <Text style={styles.statusBadgeText}>RESET</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.lobbyContainer}>
          <View style={styles.lobbyPulseRing}>
            <Text style={{ fontSize: 72 }}>🚨</Text>
          </View>
          <Text style={styles.lobbyTitle}>{t.lobbyWaiting}</Text>
          <Text style={styles.lobbySubtitle}>{t.lobbySub}</Text>
          
          <View style={styles.lobbyInfoCard}>
            <Text style={styles.lobbyInfoLabel}>
              {lang === 'en' ? 'Report Details' : 'विवरण विवरण'}
            </Text>
            <View style={styles.lobbyInfoRow}>
              <Text style={styles.lobbyInfoName}>{citizenName || 'Verified Responder'}</Text>
            </View>
            <Text style={styles.lobbyInfoNote}>{userNote || 'SOS Emergency Alert'}</Text>
          </View>

          <TouchableOpacity style={[styles.ackHomeButton, { backgroundColor: '#eab308' }]} onPress={handleBackToForm}>
            <Text style={[styles.ackHomeButtonText, { color: '#011f30' }]}>
              {lang === 'en' ? '⚠️ NEW EMERGENCY (RESET)' : '⚠️ नयाँ आपतकाल (रिसेट)'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleDeveloperReset} style={styles.footer}>
          <Text style={styles.footerText}>{t.footer}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Enhanced ACK Screen (Help is coming - Requirement 7) ───────────────────
  if (sosStatus === 'acknowledged' && ackReceived) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#011f30' }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleBackToForm} style={styles.backButton}>
              <Text style={{ color: '#8abcd7', fontSize: 22, fontWeight: '900' }}>←</Text>
            </TouchableOpacity>
            <PoliceBrand lang={lang} title={t.title} compact />
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleBackToForm} style={[styles.statusBadge, { backgroundColor: '#10b981' }]}>
                <Text style={styles.statusBadgeText}>RESET</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.ackOverlayContent}>
          <Text style={{ fontSize: 64, marginBottom: 12 }}>🚔</Text>
          <Text style={styles.ackTitle}>{t.helpComing}</Text>
          <Text style={styles.ackSub}>{t.ackSub}</Text>
          <View style={styles.ackBadge}>
            <Text style={styles.ackBadgeText}>{ackNodeID || 'NODE_A'}</Text>
          </View>

          {ackDispatchInfo && (
            <View style={styles.ackDispatchDetails}>
              <View style={styles.ackDispatchRow}>
                <Text style={styles.ackDispatchIcon}>🚓</Text>
                <Text style={styles.ackDispatchLabel}>{t.dispatchedBy}</Text>
                <Text style={styles.ackDispatchValue}>{ackDispatchInfo.commander}</Text>
              </View>
              <View style={styles.ackDispatchRow}>
                <Text style={styles.ackDispatchIcon}>👥</Text>
                <Text style={styles.ackDispatchLabel}>{t.personnel}</Text>
                <Text style={styles.ackDispatchValue}>{ackDispatchInfo.personnel}</Text>
              </View>
              <View style={styles.ackDispatchRow}>
                <Text style={styles.ackDispatchIcon}>🚙</Text>
                <Text style={styles.ackDispatchLabel}>{t.vehicle}</Text>
                <Text style={styles.ackDispatchValue}>{ackDispatchInfo.vehicle}</Text>
              </View>
              <View style={[styles.ackDispatchRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.ackDispatchIcon}>⏱</Text>
                <Text style={styles.ackDispatchLabel}>{t.eta}</Text>
                <Text style={[styles.ackDispatchValue, { color: '#fbbf24' }]}>{ackDispatchInfo.eta}</Text>
              </View>
            </View>
          )}

          <Text style={styles.ackFoot}>{t.ackFoot}</Text>
          <View style={styles.reassuranceCard}>
            <Text style={styles.reassurancePrimary}>{t.reassurance}</Text>
            <Text style={styles.reassuranceSecondary}>{t.reassuranceNepali}</Text>
            <TouchableOpacity style={styles.speechButton} onPress={speakReassurance}>
              <Text style={styles.speechButtonText}>▶ {t.playReassurance}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.ackHomeButton, { backgroundColor: '#10b981' }]} onPress={handleBackToForm}>
            <Text style={styles.ackHomeButtonText}>
              {lang === 'en' ? '🚨 SEND ANOTHER SOS' : '🚨 अर्को एसओएस पठाउनुहोस्'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleDeveloperReset} style={styles.footer}>
          <Text style={styles.footerText}>{t.footer}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Resolved Incident Screen (Requirement 9) ──────────────────────────────
  if (sosStatus === 'resolved') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#011f30' }]}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleBackToForm} style={styles.backButton}>
              <Text style={{ color: '#8abcd7', fontSize: 22, fontWeight: '900' }}>←</Text>
            </TouchableOpacity>
            <PoliceBrand lang={lang} title={t.title} compact />
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={handleBackToForm} style={[styles.statusBadge, { backgroundColor: '#10b981' }]}>
                <Text style={styles.statusBadgeText}>RESET</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.resolvedContainer}>
          <Text style={{ fontSize: 72, marginBottom: 16 }}>✅</Text>
          <Text style={styles.resolvedTitle}>{t.resolvedTitle}</Text>
          <Text style={styles.resolvedSubtitle}>{t.resolvedSub}</Text>
          
          <TouchableOpacity style={[styles.resolvedHomeBtn, { backgroundColor: '#10b981' }]} onPress={handleBackToForm}>
            <Text style={styles.resolvedHomeBtnText}>
              {lang === 'en' ? 'NEW SOS' : 'नयाँ एसओएस'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleDeveloperReset} style={styles.footer}>
          <Text style={styles.footerText}>{t.footer}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Liveness camera screen for SOS trigger
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

  // Countdown view
  if (countdown !== null && selectedCategory) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#011f30', justifyContent: 'center', alignItems: 'center' }]}>
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

  // ── Responder Form Screen (Default view) ──────────────────────────────────
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#011f30' }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={handleBackToLanding} style={styles.backButton}>
              <Text style={{ color: '#8abcd7', fontSize: 22, fontWeight: '900' }}>←</Text>
            </TouchableOpacity>
            <PoliceBrand lang={lang} title={t.title} compact />
          </View>
          <View style={styles.headerRight}>
            {deviceBattery !== null && (
              <View style={[styles.batteryBadge, {
                backgroundColor: deviceBattery > 20 ? '#002d45' : 'rgba(239,68,68,0.3)',
                borderColor: deviceBattery > 20 ? '#8abcd7' : 'rgba(239,68,68,0.5)',
              }]}>
                <Text style={[styles.batteryText, {
                  color: deviceBattery > 60 ? '#10b981' : deviceBattery > 20 ? '#eab308' : '#ef4444',
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
        </View>
        
        {!connected && btStatus === 'failed' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
            <TouchableOpacity
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
                backgroundColor: '#cb2027', marginRight: 8,
              }}
              onPress={() => scanForRelay()}
              activeOpacity={0.7}
            >
              <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>
                🔄 Scan for Node
              </Text>
            </TouchableOpacity>
            {btDeviceName !== '' && (
              <Text style={{ color: '#8abcd7', fontSize: 9 }}>
                Found: {btDeviceName}
              </Text>
            )}
          </View>
        )}
        {connected && btDeviceName && (
          <Text style={{ color: '#10b981', fontSize: 9, marginTop: 4 }}>
            ✅ {btDeviceName}
          </Text>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.main}>
        {isLocked ? (
          <View style={styles.lockoutContainer}>
            <Text style={{ fontSize: 64, marginBottom: 16 }}>🔒</Text>
            <Text style={styles.lockoutTitle}>{t.lockedLabel}</Text>
            <Text style={styles.lockoutDesc}>{t.lockedDesc}</Text>
            {cooldownRemaining !== null && cooldownRemaining > 0 && (
              <View style={styles.cooldownTimerRow}>
                <Text style={styles.cooldownTimerIcon}>⏱</Text>
                <Text style={styles.cooldownTimerText}>
                  {lang === 'en'
                    ? `${Math.floor(cooldownRemaining / 60)}:${String(cooldownRemaining % 60).padStart(2, '0')} until next trigger`
                    : `अर्को ट्रिगरको लागि ${Math.floor(cooldownRemaining / 60)}:${String(cooldownRemaining % 60).padStart(2, '0')} पर्खनुहोस्`}
                </Text>
              </View>
            )}
            <View style={styles.lockoutBadge}>
              <Text style={styles.lockoutBadgeText}>LOCKED</Text>
            </View>
            <Text style={styles.lockoutFoot}>{t.ackFoot}</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: '#8abcd7' }]}>{t.selectCategory}</Text>

            <View style={styles.noteContainer}>
              <TextInput
                style={[styles.nameInput, showValidationErrors && !citizenName.trim() && styles.inputError]}
                placeholder={t.namePlaceholder}
                placeholderTextColor="#64748b"
                maxLength={30}
                value={citizenName}
                onChangeText={(value) => {
                  setCitizenName(value);
                  if (value.trim() && userNote.trim()) setShowValidationErrors(false);
                }}
              />
              {showValidationErrors && !citizenName.trim() && (
                <Text style={styles.validationText}>{lang === 'en' ? 'Name is required' : 'नाम अनिवार्य छ'}</Text>
              )}
            </View>

            <View style={styles.noteContainer}>
              <TextInput
                style={[styles.noteInput, showValidationErrors && !userNote.trim() && styles.inputError]}
                placeholder={t.notePlaceholder}
                placeholderTextColor="#64748b"
                multiline maxLength={99}
                value={userNote}
                onChangeText={(value) => {
                  setUserNote(value);
                  if (value.trim() && citizenName.trim()) setShowValidationErrors(false);
                }}
              />
              {showValidationErrors && !userNote.trim() && (
                <Text style={styles.validationText}>{lang === 'en' ? 'Emergency description is required' : 'आपतकालीन विवरण अनिवार्य छ'}</Text>
              )}
              <Text style={styles.noteCounter}>{userNote.length}/99</Text>
            </View>

            <View style={styles.catGrid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catItem, { backgroundColor: '#002d45', borderColor: '#8abcd7' }]}
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

      <TouchableOpacity onPress={handleDeveloperReset} style={styles.footer}>
        <Text style={styles.footerText}>{t.footer}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#011f30' },
  header: { padding: 16, paddingTop: 40, backgroundColor: '#004163', borderTopWidth: 4, borderTopColor: '#cb2027', borderBottomWidth: 1, borderBottomColor: '#8abcd7' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  policeBrand: { flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 42, height: 48, borderRadius: 8, backgroundColor: '#cb2027', borderWidth: 2, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brandMarkCompact: { width: 30, height: 34, borderRadius: 6, marginRight: 8 },
  brandMarkText: { color: 'white', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  brandMarkTextCompact: { fontSize: 11 },
  policeBrandBanner: { color: '#ffffff', fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  policeBrandBannerCompact: { fontSize: 9, letterSpacing: 0.8 },
  policeBrandNepali: { color: '#8abcd7', fontSize: 12, fontWeight: '800', marginTop: 1 },
  policeBrandNepaliCompact: { fontSize: 9 },
  title: { fontSize: 24, fontWeight: '900', color: 'white' },
  titleCompact: { fontSize: 20 },
  langToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#002d45', borderWidth: 1, borderColor: '#8abcd7' },
  langText: { color: '#8abcd7', fontSize: 12, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText: { color: '#8abcd7', fontSize: 12 },
  main: { padding: 16, alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#8abcd7', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  noteContainer: { width: '100%', marginBottom: 12 },
  nameInput: {
    backgroundColor: '#002d45', borderRadius: 12, padding: 12, color: 'white',
    fontSize: 13, borderWidth: 1, borderColor: '#8abcd7',
  },
  noteInput: {
    backgroundColor: '#002d45', borderRadius: 12, padding: 12, color: 'white',
    fontSize: 13, minHeight: 50, maxHeight: 70, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#8abcd7',
  },
  noteCounter: { textAlign: 'right', color: '#64748b', fontSize: 10, marginTop: 3 },
  inputError: { borderColor: '#cb2027', borderWidth: 2 },
  validationText: { color: '#f87171', fontSize: 10, fontWeight: '700', marginTop: 4 },
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

  // ACK screen overlay styles (Requirement 7)
  ackOverlayContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  ackTitle: { fontSize: 26, fontWeight: '900', color: '#10b981', textAlign: 'center', marginTop: 8 },
  ackSub: { fontSize: 13, color: '#8abcd7', marginTop: 8, textAlign: 'center' },
  ackBadge: { backgroundColor: '#002d45', borderWidth: 1, borderColor: '#8abcd7', paddingHorizontal: 20, paddingVertical: 6, borderRadius: 20, marginTop: 16 },
  ackBadgeText: { color: 'white', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  ackFoot: { fontSize: 12, color: '#64748b', marginTop: 24, textAlign: 'center' },
  reassuranceCard: {
    width: '100%', backgroundColor: 'rgba(0,65,99,0.72)', borderWidth: 1,
    borderColor: '#d4af37', borderRadius: 12, padding: 14, marginTop: 16,
  },
  reassurancePrimary: { color: 'white', fontSize: 13, fontWeight: '800', lineHeight: 20, textAlign: 'center' },
  reassuranceSecondary: { color: '#8abcd7', fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 7 },
  speechButton: {
    alignSelf: 'center', backgroundColor: '#d4af37', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 9, marginTop: 12,
  },
  speechButtonText: { color: '#102030', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },

  // Enhanced ACK dispatch details
  ackDispatchDetails: {
    width: '100%',
    backgroundColor: '#002d45',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#8abcd7',
  },
  ackDispatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(138, 205, 215, 0.15)',
  },
  ackDispatchIcon: { fontSize: 14, width: 28 },
  ackDispatchLabel: { fontSize: 11, color: '#8abcd7', flex: 1 },
  ackDispatchValue: { fontSize: 12, color: 'white', fontWeight: '700', textAlign: 'right' },
  ackHomeButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
  ackHomeButtonText: { color: 'white', fontSize: 13, fontWeight: '800' },

  // Premium Landing Page Styles (Requirement 4)
  landingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  officialHeader: { width: '100%', backgroundColor: '#004163', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#8abcd7', marginBottom: 16, elevation: 8 },
  nepalFlagBar: { height: 7, backgroundColor: '#cb2027' },
  officialHeaderContent: { flexDirection: 'row', alignItems: 'center', padding: 18 },
  officialHeaderCopy: { flex: 1, marginLeft: 18 },
  officialNepali: { color: '#ffffff', fontSize: 25, fontWeight: '900' },
  officialEnglish: { color: '#8abcd7', fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  officialMotto: { color: '#ffffff', fontSize: 11, marginTop: 7, opacity: 0.8 },
  landingLogo: { width: 98, height: 92 },
  crestInner: { width: 62, height: 70, borderRadius: 12, borderWidth: 1, borderColor: '#8abcd7', justifyContent: 'center', alignItems: 'center' },
  crestNP: { color: '#ffffff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  crestDivider: { width: 34, height: 1, backgroundColor: '#8abcd7', marginVertical: 4 },
  crestNepali: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  landingRadioWaves: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(138, 205, 215, 0.12)', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(138, 205, 215, 0.35)', marginBottom: 22 },
  meshDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 8 },
  meshText: { color: '#8abcd7', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  landingTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
    letterSpacing: 2,
  },
  landingSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8abcd7',
    textAlign: 'center',
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  landingDesc: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 20,
    paddingHorizontal: 10,
  },
  landingButtonsRow: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 28,
    width: '100%',
    justifyContent: 'center',
  },
  landingBtn: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  landingBtnEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 7 },
  landingBtnText: { color: 'white', fontSize: 17, fontWeight: '900', textAlign: 'center' },
  landingBtnArrow: { color: 'white', fontSize: 21, fontWeight: '500', marginTop: 7 },

  // Back Button Styles (Requirement 8)
  backButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },

  // Waiting Lobby Styles (Requirement 7)
  lobbyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  lobbyPulseRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(203, 32, 39, 0.12)',
    borderWidth: 3,
    borderColor: '#cb2027',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  lobbyTitle: { fontSize: 24, fontWeight: '900', color: 'white', textAlign: 'center' },
  lobbySubtitle: { fontSize: 13, color: '#8abcd7', textAlign: 'center', marginTop: 8 },
  lobbyInfoCard: {
    width: '100%',
    backgroundColor: '#002d45',
    borderRadius: 16,
    padding: 16,
    marginTop: 40,
    borderWidth: 1,
    borderColor: '#8abcd7',
  },
  lobbyInfoLabel: { fontSize: 11, color: '#8abcd7', textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  lobbyInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  lobbyInfoName: { fontSize: 13, color: 'white', fontWeight: '800' },
  lobbyInfoNote: { fontSize: 13, color: '#e2e8f0', marginTop: 4, fontStyle: 'italic' },

  // Resolved Incident View Styles (Requirement 9)
  resolvedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  resolvedTitle: { fontSize: 24, fontWeight: '900', color: '#10b981', textAlign: 'center' },
  resolvedSubtitle: { fontSize: 13, color: '#8abcd7', textAlign: 'center', marginTop: 12, lineHeight: 20 },
  resolvedHomeBtn: {
    backgroundColor: '#002d45',
    borderWidth: 1.5,
    borderColor: '#8abcd7',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 32,
    width: '100%',
    alignItems: 'center',
  },
  resolvedHomeBtnText: { color: 'white', fontSize: 13, fontWeight: '800' },

  // Volunteer Mode Styles
  volunteerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  volunteerCountBadge: {
    backgroundColor: '#cb2027',
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
    color: '#8abcd7',
    fontSize: 11,
  },
  volunteerAlertCoords: {
    color: '#8abcd7',
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
    color: '#8abcd7',
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
  footerText: { color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1 },

  // SOS Lockout — Already Reported
  lockoutContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  lockoutTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
    marginBottom: 12,
  },
  lockoutDesc: {
    fontSize: 13,
    color: '#8abcd7',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 4,
  },
  lockoutBadge: {
    backgroundColor: 'rgba(203,32,39,0.15)',
    borderWidth: 1.5,
    borderColor: '#cb2027',
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  lockoutBadgeText: {
    color: '#cb2027',
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
  cooldownTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234,179,8,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  cooldownTimerIcon: { fontSize: 18, marginRight: 8 },
  cooldownTimerText: {
    color: '#eab308',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
});
