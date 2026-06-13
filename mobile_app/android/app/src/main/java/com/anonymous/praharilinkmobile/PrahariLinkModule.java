package com.anonymous.praharilinkmobile;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class PrahariLinkModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;

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
}
