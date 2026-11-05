# Proguard rules for Voter App
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.voterapp.union.** { *; }
