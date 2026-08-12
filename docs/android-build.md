# Building the Android app

The Android app is the shared Tauri/Vite frontend packaged with the native
`tauri-plugin-android-blocker` (Kotlin AccessibilityService + WorkManager). A
build runs three stages back to back: Vite bundles `src/` → Rust cross-compiles
the Tauri core for the Android ABI(s) → Gradle compiles the Kotlin/Java and
packages the APK.

The generated Gradle project lives in `src-tauri/gen/android/` and is committed
(see [android-generated-project-manual-edits.md](android-generated-project-manual-edits.md)
for the app-specific edits to preserve if it's ever re-initialized).

## App identity

- **Package id:** `net.kollnig.reddblockandroid` (Android override in
  `src-tauri/tauri.android.conf.json`; the desktop identifier is `com.reddblock`)
- **Launcher activity:** `net.kollnig.reddblockandroid/.MainActivity`
- **Accessibility service (enforcement):**
  `net.kollnig.reddblockandroid/net.kollnig.reddblockandroid.service.BlockerService`

## Prerequisites

- **Android SDK** with platform-tools and build-tools (via Android Studio).
- **Android NDK** — install through Android Studio's SDK Manager. It lands in
  `$ANDROID_HOME/ndk/<version>/`.
- **JDK 17+** — Android Studio bundles one (JBR); a standalone JDK works too.
- **Rust Android targets** — install the ones matching the device/emulator ABI:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi \
                    i686-linux-android x86_64-linux-android
  ```
- **Tauri CLI** (`npm install` provides it locally as `./node_modules/.bin/tauri`).

## Build cache

Tauri commands launched through npm use a shared Cargo target cache outside the
repository, so linked Git worktrees reuse compiled Rust dependencies instead of
creating a separate `src-tauri/target/` in each checkout. Set
`REDD_BLOCK_CARGO_TARGET_DIR` to override the location, or
`REDD_BLOCK_BUILD_CACHE_DIR` to change the cache root.

The cache includes every Rust target and build profile you use. Stop active
builds before pruning it:

```bash
npm run clean:build-cache -- --all
```

This removes generated Cargo, Vite, and Android build output only. It does not
remove `node_modules` or files in `for-distribution/`.

## Environment variables

The Tauri/Gradle build reads the SDK, NDK, and JDK from the environment. These
are **not** set by `npm install`, so a bare `npm run build:android` fails with an
empty `ANDROID_HOME` unless you export them (Android Studio sets them itself when
you build from the IDE). Add to your shell profile, or `export` per session:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
# Pick the installed NDK dynamically so this doesn't rot when it updates:
export NDK_HOME="$ANDROID_HOME/ndk/$(ls "$ANDROID_HOME/ndk" | sort -V | tail -1)"
export JAVA_HOME="$(/usr/libexec/java_home)"   # macOS; or your JDK path
```

Paths above are macOS defaults. On Linux the SDK is typically
`$HOME/Android/Sdk`; on Windows, `%LOCALAPPDATA%\Android\Sdk`.

### Toolchain gotcha (costs an hour if you hit it blind)

`cargo`/`rustc` on PATH may resolve to **Homebrew's** rust
(`/opt/homebrew/bin/cargo`), which does **not** carry the Android std targets and
fails with `can't find crate for std`. `rustup target add` will not fix it,
because the target lands in the rustup toolchain that is not being used. Put the
rustup toolchain first:

```bash
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
```

## Debug APK (for local testing)

```bash
npm run build:android:debug
```

- `--apk` — build the APK, skip the Play Store AAB. (In Tauri CLI 2.11.x the
  `--apk`/`--aab` options are boolean flags.)
- `--debug` — debuggable, unminified build (`android:debuggable=true`).
- `--target aarch64` — build a single ABI (`arm64-v8a`) instead of all four.
  This covers physical devices and Apple-silicon/arm64 emulators, and is much
  faster. Omit `--target` to build a universal APK (all ABIs) for, e.g., an
  x86_64 emulator.

Output:

```
src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

## Install and grant accessibility

Blocking does not run until the accessibility service is enabled. You can do
that by hand under **Android Settings → Accessibility**, or grant it via secure
settings *before* first launch — which is what you want in a build/measure loop,
since it skips the in-app onboarding gate:

```bash
ADB="$ANDROID_HOME/platform-tools/adb"
DEV=<serial>            # from `adb devices -l`; e.g. a physical Pixel vs emulator-5554
PKG=net.kollnig.reddblockandroid
SVC="$PKG/net.kollnig.reddblockandroid.service.BlockerService"
APK=src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

$ADB -s $DEV install -r "$APK"          # reinstall keeps app data
$ADB -s $DEV shell settings put secure enabled_accessibility_services "$SVC"
$ADB -s $DEV shell settings put secure accessibility_enabled 1
$ADB -s $DEV shell settings get secure enabled_accessibility_services   # should list $SVC
$ADB -s $DEV logcat | grep -i reddblock
```

`force-stop` does **not** clear the grant, so a relaunch loop can reuse it. But
the grant *is* dropped when the service is uninstalled or replaced (and some
ROMs clear it on `install -r`), so re-apply the two `settings put` lines after
any reinstall. Otherwise the app cold-starts into the onboarding gate instead of
the main UI, which looks like a regression but is not — check the grant before
chasing it.

## Measuring startup

```bash
$ADB -s $DEV shell am force-stop $PKG
$ADB -s $DEV shell am start -W -n "$PKG/.MainActivity"
```

`am start -W`'s `TotalTime` covers the **native activity + webview shell** first
frame only. The JS bundle parse and first meaningful paint happen *after* that
inside the webview, so this under-reports perceived startup — startup cost here
is dominated by parsing `dist/assets/main-*.js` in the Android System WebView,
not by native code. To measure the JS phase, trace logcat
(`$ADB -s $DEV logcat -v time`) and bracket against the webview `chromium`
console line from `checkAndroidPermissions`
(`console.log('Android permissions:', ...)` in `src/blocking-platform.js`).

## Frontend bundle

`tauri android build` runs `npm run vite:build:android` (`vite build --mode
android`) via the `beforeBuildCommand` override in `tauri.android.conf.json`, so
the Android-only build optimizations — `stripNonAndroidUi`,
`pruneOrphanAndroidAssets`, and the `__ANDROID_BUILD__` compile-time guards —
apply to the real APK. Plain `tauri build` uses `vite:build` (desktop mode,
`__ANDROID_BUILD__ = false`).

Measure the shipped bundle with `ANALYZE=1 npx vite build --mode android`, which
writes a treemap to `dist/stats.html`. See the build-time platform gating
section of [../AGENTS.md](../AGENTS.md) for when `__ANDROID_BUILD__` is the right
tool and when it is not.

## Live development

For an iterate-and-reload loop on a running device/emulator (hot-reload of the
frontend), use dev mode instead of a full build:

```bash
npm run dev:android          # = tauri android dev
npm run tauri -- android dev --open   # also opens Android Studio
```

## Release build

```bash
npm run build:android        # = tauri android build (all ABIs, release, APK + AAB)
```

Ordinary release builds still use the generated debug signing config unless the
Keychain-backed Play Store script below supplies a release key. Do not upload an
ordinary `npm run build:android` artifact to Google Play.

## Google Play bundle with macOS Keychain signing

For a locally signed Play Store bundle, use the repository signing script. It
stores the keystore password, key password, and alias in the macOS Keychain;
normal builds do not prompt for credentials and no signing secret is written to
the repository:

```bash
./scripts/build-android-play.sh --setup   # one time per Mac/keychain
./scripts/build-android-play.sh
```

The script uses `~/StudioProjects/Keys/redd.jks` by default, or the path in
`REDD_BLOCK_ANDROID_KEYSTORE`, and writes the verified AAB to
`for-distribution/android/`. It also configures Gradle's release signing only
for the credentials supplied by this script; ordinary local release builds
retain the existing debug-key fallback.

## Building from Android Studio

You can open `src-tauri/gen/android/` in Android Studio to run/debug the project,
but the Gradle Rust task calls back into a running Tauri CLI:

1. Keep the CLI running in a terminal while you build:
   `npm run tauri -- android dev --open`. Without it the build panics with
   "failed to read CLI options".
2. `node`/`npm` and `cargo` must be on Gradle's PATH. Android Studio launched
   from the Dock doesn't inherit your shell PATH — either launch it from a
   terminal (`open -a "Android Studio"`) or rely on the PATH patch in
   `buildSrc/.../BuildTask.kt` (which is dropped if `tauri android init` is
   re-run).

## Troubleshooting

- **`ANDROID_HOME` / `sdk.dir` not found** — export the env vars above, or set
  `sdk.dir` in `src-tauri/gen/android/local.properties`.
- **NDK not found** — confirm `$NDK_HOME` points at an existing
  `$ANDROID_HOME/ndk/<version>` directory.
- **Missing Rust target** — `error: ... target may not be installed` →
  `rustup target add <triple>` for the ABI you're building.
- **`adb devices` empty** — a device isn't required to *build* the APK, only to
  install it. Enable USB debugging (physical) or start an emulator.
