# Tauri discovers @Command methods via reflection, and the Accessibility
# Service / BootReceiver are instantiated by the system from manifest
# entries — keep everything in this library when the app minifies.
-keep class com.reddblock.androidblock.** { *; }
