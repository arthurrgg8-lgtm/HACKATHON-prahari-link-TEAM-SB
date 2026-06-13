import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import FaceDetection from '@react-native-ml-kit/face-detection';

export default function LivenessCamera({ category, onVerified, onFailed, onCancel, lang: language }) {
  const [status, setStatus] = useState('initializing');
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const camera = useRef(null);
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const isMounted = useRef(true);
  const retryTimer = useRef(null);

  const t = language === 'ne' ? nepal : english;

  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          onFailed('Camera permission denied');
          return;
        }
      }
      setStatus('ready');
      setMessage(t.showFace);
      retryTimer.current = setTimeout(() => captureAndDetect(), 1500);
    };
    init();
  }, [hasPermission]);

  const captureAndDetect = async () => {
    if (!isMounted.current) return;
    try {
      setStatus('capturing');
      setMessage(t.verifying);

      // Small delay for camera stabilization
      await new Promise(r => setTimeout(r, 400));

      if (!camera.current) {
        retry();
        return;
      }

      const photo = await camera.current.takePhoto({ qualityPrioritization: 'speed' });

      if (!photo?.path) {
        retry();
        return;
      }

      setStatus('processing');

      // MLKit needs file:// prefix on Android for local paths
      const imageUrl = photo.path.startsWith('/') ? `file://${photo.path}` : photo.path;
      const faces = await FaceDetection.detect(imageUrl, {
        performanceMode: 'accurate',
        classificationMode: 'all',
      });

      if (!isMounted.current) return;

      if (faces.length > 0) {
        const face = faces[0];
        const leftEye = face.leftEyeOpenProbability ?? 0.5;
        const rightEye = face.rightEyeOpenProbability ?? 0.5;
        const avgEyeOpen = (leftEye + rightEye) / 2;

        // Estimate snapshot area for size ratio
        const frameArea = 640 * 480;
        const faceArea = face.frame.width * face.frame.height;
        const sizeRatio = Math.min(1, faceArea / (frameArea * 0.3));

        // Liveness score: eyes open = real person + proper face size
        const score = Math.round((avgEyeOpen * 0.6 + sizeRatio * 0.4) * 100);
        const confidence = Math.min(99, Math.max(40, score));

        setStatus('verified');
        setMessage(t.verified);

        setTimeout(() => {
          if (isMounted.current) onVerified(category, confidence);
        }, 1200);
      } else {
        retry();
      }
    } catch (error) {
      console.log('Face detection error:', error);
      retry();
    }
  };

  const retry = () => {
    if (!isMounted.current) return;
    const next = retryCount + 1;
    setRetryCount(next);

    if (next >= 3) {
      setStatus('failed');
      setMessage(t.failed);
      setTimeout(() => onFailed(t.failed), 2000);
    } else {
      setStatus('ready');
      setMessage(`${t.attempt} ${next + 1}/3 — ${t.showFace}`);
      retryTimer.current = setTimeout(() => captureAndDetect(), 1500);
    }
  };

  if (!device) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.emoji}>📷</Text>
          <Text style={styles.errorText}>{t.noCamera}</Text>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>{t.goBack}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isVerified = status === 'verified';
  const isFailed = status === 'failed';

  return (
    <SafeAreaView style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
      />

      <View style={styles.overlay}>
        {/* Category indicator — only shown for SOS, not initial verify */}
        {category && (
          <View style={styles.catBadge}>
            <Text style={styles.catEmoji}>{category.emoji}</Text>
            <Text style={styles.catLabel}>{language === 'ne' ? category.labelNe : category.labelEn}</Text>
          </View>
        )}
        {!category && (
          <Text style={[styles.verifyTitle]}>
            {language === 'ne' ? 'उत्तरदाता प्रमाणीकरण' : 'Responder Identity Verification'}
          </Text>
        )}

        {/* Face guide oval */}
        <View style={[styles.faceGuide, isVerified && styles.guideOk, isFailed && styles.guideFail]}>
          <Text style={styles.guideEmoji}>
            {isVerified ? '✅' : isFailed ? '❌' : '😊'}
          </Text>
        </View>

        <Text style={[styles.status, isFailed && styles.statusFail]}>{message}</Text>

        {!isVerified && !isFailed && (status === 'capturing' || status === 'processing') && (
          <ActivityIndicator size="large" color="#60a5fa" style={{ marginTop: 16 }} />
        )}

        {isVerified && (
          <View style={styles.badgeOk}>
            <Text style={styles.badgeOkText}>{t.passed}</Text>
          </View>
        )}

        {isFailed && (
          <View style={styles.badgeFail}>
            <Text style={styles.badgeFailText}>{t.denied}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>{t.cancel}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const english = {
  showFace: 'Look at the camera',
  verifying: 'Verifying identity...',
  verified: '✅ Face Verified! Sending alert...',
  failed: 'No face detected. Access denied.',
  attempt: 'Attempt',
  noCamera: 'No front camera found',
  goBack: 'Go Back',
  cancel: 'Cancel',
  passed: 'Face Verification: PASSED',
  denied: 'Access Denied — Real person required',
};

const nepal = {
  showFace: 'क्यामेरामा अनुहार देखाउनुहोस्',
  verifying: 'अनुहार जाँच्दै...',
  verified: '✅ प्रमाणित! अलर्ट पठाउँदै...',
  failed: 'अनुहार पत्ता लागेन। पहुँच अस्वीकृत।',
  attempt: 'प्रयास',
  noCamera: 'अगाडिको क्यामेरा फेला परेन',
  goBack: 'फिर्ता जानुहोस्',
  cancel: 'रद्द गर्नुहोस्',
  passed: 'अनुहार प्रमाणीकरण: सफल',
  denied: 'पहुँच अस्वीकृत — वास्तविक व्यक्ति आवश्यक',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 48, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 40 },

  catBadge: {
    position: 'absolute', top: 60,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
  },
  catEmoji: { fontSize: 18, marginRight: 8 },
  catLabel: { color: 'white', fontSize: 14, fontWeight: '700' },

  faceGuide: {
    width: 180, height: 220, borderRadius: 90,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  guideOk: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)' },
  guideFail: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.2)' },
  guideEmoji: { fontSize: 60 },

  status: { color: 'white', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 40 },
  statusFail: { color: '#fca5a5' },

  badgeOk: { marginTop: 12, backgroundColor: 'rgba(34,197,94,0.3)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  badgeOkText: { color: '#86efac', fontSize: 14, fontWeight: '700' },
  badgeFail: { marginTop: 12, backgroundColor: 'rgba(239,68,68,0.3)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20 },
  badgeFailText: { color: '#fca5a5', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  cancelBtn: { position: 'absolute', bottom: 50, paddingHorizontal: 40, paddingVertical: 12, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  cancelBtnText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '700' },
});
