# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# React Native SVG
-keep class com.horcrux.svg.** { *; }
-dontwarn com.horcrux.svg.**

# React Native Bluetooth Serial
-keep class com.nuttawutmalee.RCTBluetoothSerial.** { *; }
-dontwarn com.nuttawutmalee.RCTBluetoothSerial.**

# Expo Modules
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# Keep all React Native packages (auto-linked)
-keep public class * extends com.facebook.react.ReactPackage
-keep public class * extends com.facebook.react.bridge.JavaScriptModule
-keep public class * extends com.facebook.react.bridge.NativeModule
-keep public class * extends com.facebook.react.bridge.BaseJavaModule
-keep public class * extends com.facebook.react.uimanager.ViewManager
-keep public class * extends com.facebook.react.views.view.ReactViewManager

# Keep ReactInstanceManager and related classes
-keep class com.facebook.react.ReactInstanceManager { *; }
-keep class com.facebook.react.ReactRootView { *; }

# Keep all classes that use @ReactMethod annotation
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}

# Keep JavaScript engine interfaces
-keep class * implements com.facebook.react.bridge.JSIModulePackage { *; }

# Keep OkHttp (used by React Native networking)
-dontwarn okhttp3.**
-dontwarn okio.**

# Keep Fresco (used by React Native for images)
-keep class com.facebook.imagepipeline.** { *; }
-keep class com.facebook.drawee.** { *; }

# Keep AndroidX
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
