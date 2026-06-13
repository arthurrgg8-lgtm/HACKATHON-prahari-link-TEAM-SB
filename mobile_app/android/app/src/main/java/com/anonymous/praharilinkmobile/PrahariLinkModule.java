package com.anonymous.praharilinkmobile;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.speech.tts.TextToSpeech;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.util.Locale;

public class PrahariLinkModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private TextToSpeech textToSpeech;
    private Ringtone activeRingtone;

    public PrahariLinkModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "PrahariLinkModule";
    }

    @ReactMethod
    public void startService(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, PrahariLinkService.class);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent);
            } else {
                reactContext.startService(serviceIntent);
            }
            promise.resolve("Service started");
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void stopService(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, PrahariLinkService.class);
            reactContext.stopService(serviceIntent);
            promise.resolve("Service stopped");
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void setAlertStatus(String status, Promise promise) {
        try {
            SharedPreferences sharedPref = reactContext.getSharedPreferences("PrahariLinkPrefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = sharedPref.edit();
            editor.putString("alert_status", status);
            editor.apply();
            promise.resolve("Status updated to: " + status);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void getAlertStatus(Promise promise) {
        try {
            SharedPreferences sharedPref = reactContext.getSharedPreferences("PrahariLinkPrefs", Context.MODE_PRIVATE);
            String status = sharedPref.getString("alert_status", "idle");
            promise.resolve(status);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void setCooldown(double cooldownUntil, Promise promise) {
        try {
            SharedPreferences sharedPref = reactContext.getSharedPreferences("PrahariLinkPrefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = sharedPref.edit();
            editor.putLong("cooldown_until", (long) cooldownUntil);
            editor.apply();
            promise.resolve("Cooldown set to: " + cooldownUntil);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void getCooldown(Promise promise) {
        try {
            SharedPreferences sharedPref = reactContext.getSharedPreferences("PrahariLinkPrefs", Context.MODE_PRIVATE);
            long cooldownUntil = sharedPref.getLong("cooldown_until", 0L);
            promise.resolve((double) cooldownUntil);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void speakNepali(String message, Promise promise) {
        if (message == null || message.trim().isEmpty()) {
            promise.reject("TTS_ERROR", "Speech message is empty");
            return;
        }
        if (textToSpeech != null) {
            speakWithEngine(message, promise);
            return;
        }
        textToSpeech = new TextToSpeech(reactContext, status -> {
            if (status != TextToSpeech.SUCCESS) {
                textToSpeech = null;
                promise.reject("TTS_ERROR", "Unable to initialize speech");
                return;
            }
            speakWithEngine(message, promise);
        });
    }

    private void speakWithEngine(String message, Promise promise) {
        Locale nepali = new Locale("ne", "NP");
        int languageStatus = textToSpeech.setLanguage(nepali);
        if (languageStatus == TextToSpeech.LANG_MISSING_DATA
                || languageStatus == TextToSpeech.LANG_NOT_SUPPORTED) {
            promise.reject("TTS_UNAVAILABLE", "Nepali speech is not installed on this device");
            return;
        }
        textToSpeech.setSpeechRate(0.88f);
        textToSpeech.setPitch(1.0f);
        textToSpeech.speak(message, TextToSpeech.QUEUE_FLUSH, null, "prahari_reassurance");
        promise.resolve("Speaking reassurance");
    }

    @ReactMethod
    public void playNotificationSound(Promise promise) {
        try {
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtoneUri == null) {
                ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            Ringtone r = RingtoneManager.getRingtone(reactContext.getApplicationContext(), ringtoneUri);
            if (r != null) {
                r.play();
                promise.resolve("Sound played");
            } else {
                promise.reject("Error", "Ringtone object is null");
            }
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void playSiren(Promise promise) {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                promise.resolve("Siren already playing");
                return;
            }
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtoneUri == null) {
                ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            activeRingtone = RingtoneManager.getRingtone(reactContext.getApplicationContext(), ringtoneUri);
            if (activeRingtone != null) {
                activeRingtone.play();
                promise.resolve("Siren started");
            } else {
                promise.reject("Error", "Ringtone is null");
            }
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void stopSiren(Promise promise) {
        try {
            if (activeRingtone != null) {
                activeRingtone.stop();
                activeRingtone = null;
                promise.resolve("Siren stopped");
            } else {
                promise.resolve("No active siren");
            }
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void setConfigString(String key, String value, Promise promise) {
        try {
            SharedPreferences sharedPref = reactContext.getSharedPreferences("PrahariLinkPrefs", Context.MODE_PRIVATE);
            SharedPreferences.Editor editor = sharedPref.edit();
            editor.putString(key, value);
            editor.apply();
            promise.resolve("Config " + key + " updated to: " + value);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @ReactMethod
    public void getConfigString(String key, String defaultValue, Promise promise) {
        try {
            SharedPreferences sharedPref = reactContext.getSharedPreferences("PrahariLinkPrefs", Context.MODE_PRIVATE);
            String value = sharedPref.getString(key, defaultValue);
            promise.resolve(value);
        } catch (Exception e) {
            promise.reject("Error", e.getMessage());
        }
    }

    @Override
    public void invalidate() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.invalidate();
    }
}
