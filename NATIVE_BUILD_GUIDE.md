# RoomMate – Native (Android & iOS) Production Build Guide

This project is a Capacitor-wrapped React/Vite app. Use this guide to produce
release builds for **Google Play (AAB / APK)** and the **Apple App Store**.

---

## 1. One-time setup

```bash
# Pull latest from GitHub
git pull

# Install JS deps
npm install

# Build the web assets
npm run build

# Add platforms (only if android/ or ios/ folders are missing)
npx cap add android
npx cap add ios

# Sync everything
npx cap sync
```

Capacitor plugins already wired in `package.json`:
- `@capacitor/camera`
- `@capacitor/filesystem`
- `@capacitor/share`
- `@capacitor/push-notifications`
- `@capacitor/local-notifications`

---

## 2. Android — Gradle / SDK versions

Open `android/variables.gradle` and set:

```groovy
ext {
    minSdkVersion = 21
    compileSdkVersion = 35
    targetSdkVersion = 35
    androidxActivityVersion = '1.9.2'
    androidxAppCompatVersion = '1.7.0'
    androidxCoordinatorLayoutVersion = '1.2.0'
    androidxCoreVersion = '1.13.1'
    androidxFragmentVersion = '1.8.4'
    coreSplashScreenVersion = '1.0.1'
    androidxWebkitVersion = '1.11.0'
    junitVersion = '4.13.2'
    androidxJunitVersion = '1.2.1'
    androidxEspressoCoreVersion = '3.6.1'
    cordovaAndroidVersion = '10.1.1'
}
```

These values survive `npx cap sync` — do **not** edit them inside
`android/app/build.gradle` directly.

## 3. Android Manifest (already configured)

`android/app/src/main/AndroidManifest.xml` ships with:
- `CAMERA`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`,
  `READ_EXTERNAL_STORAGE` (≤32), `WRITE_EXTERNAL_STORAGE` (≤29),
  `POST_NOTIFICATIONS`, `INTERNET`, `ACCESS_NETWORK_STATE`,
  `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `WAKE_LOCK`,
  `VIBRATE`, `FOREGROUND_SERVICE(_MEDIA_PLAYBACK)`,
  `RECEIVE_BOOT_COMPLETED`, `USE_FULL_SCREEN_INTENT`.
- `<uses-feature camera required="false" />` so the app installs on
  camera-less devices.
- A FileProvider at `${applicationId}.fileprovider` with
  `res/xml/file_paths.xml` (already created).
- Share-target activity aliases for "Add as Bill", "Settle Payment",
  "Send to Room Chat" with both `image/*`, `application/pdf` and `*/*`
  filters so screenshots from Redmi/Realme/Vivo/Oppo etc. always appear
  in the share sheet.

## 4. Firebase Cloud Messaging (Android)

1. In Firebase console → **Project Settings → General → Your apps → Android**
   register package `app.lovable.33f96bab05a84df9939e66df730e6530`.
2. Download `google-services.json` and place it at:
   `android/app/google-services.json`
3. In `android/build.gradle` (project level), add inside `buildscript.dependencies`:
   ```groovy
   classpath 'com.google.gms:google-services:4.4.2'
   ```
4. In `android/app/build.gradle` add at the **bottom**:
   ```groovy
   apply plugin: 'com.google.gms.google-services'
   ```
5. Add the FCM SDK to `android/app/build.gradle` dependencies:
   ```groovy
   implementation platform('com.google.firebase:firebase-bom:33.4.0')
   implementation 'com.google.firebase:firebase-messaging'
   ```
6. Re-run `npx cap sync android`.

Runtime permission for Android 13+ is already requested by
`@capacitor/push-notifications` via `PushNotifications.requestPermissions()`
(see `src/hooks/useNativeFcm.ts`).

## 5. iOS setup

```bash
npx cap add ios            # only if ios/ is missing
npx cap sync ios
npx cap open ios           # opens Xcode
```

In Xcode:
1. **Signing & Capabilities → + Capability → Push Notifications**.
2. **Signing & Capabilities → + Capability → Background Modes** → enable
   **Remote notifications** and **Audio, AirPlay, and Picture in Picture**
   (for the shared alarm sound).
3. Open `ios/App/App/Info.plist` and ensure these usage strings exist
   (Capacitor's camera/filesystem plugins require them or iOS will crash):
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>Take photos of bills and receipts.</string>
   <key>NSPhotoLibraryUsageDescription</key>
   <string>Attach photos to bills, chats and shared storage.</string>
   <key>NSPhotoLibraryAddUsageDescription</key>
   <string>Save shared images to your photo library.</string>
   <key>NSMicrophoneUsageDescription</key>
   <string>Record voice messages for your room chat.</string>
   ```
4. APNs: in the Apple Developer portal create an APNs key, upload it to
   Firebase → Cloud Messaging → Apple app configuration.
5. Set minimum deployment target to **iOS 14.0** in Xcode → Project → Info.

## 6. Native file picking & sharing in app code

Use the helpers in `src/lib/nativeMedia.ts`:

```ts
import { pickImage, shareContent } from "@/lib/nativeMedia";

const file = await pickImage({ fromCamera: true });
await shareContent({ title: "Bill", text: "Check this out", url });
```

`pickImage` uses `@capacitor/camera` on native (with the system gallery /
camera picker that works on every Android brand) and falls back to a hidden
`<input type="file">` on the web. `shareContent` uses `@capacitor/share` on
native and the Web Share API on the web.

## 7. Release builds

### Android
```bash
npm run build && npx cap sync android
cd android
./gradlew clean
./gradlew bundleRelease       # AAB for Play Store
./gradlew assembleRelease     # APK for sideloading
```
Output:
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`
- APK: `android/app/build/outputs/apk/release/app-release.apk`

Signing: configure `android/keystore.properties` + `signingConfigs` block
inside `android/app/build.gradle` as documented in
`PLAYSTORE_RELEASE.md`.

### iOS
```bash
npm run build && npx cap sync ios
npx cap open ios
```
In Xcode: **Product → Archive → Distribute App → App Store Connect**.

## 8. Stability checklist

- All file uploads go through `pickImage()` or `<input type="file">` (both
  work in WebView with the FileProvider configured above).
- Push tokens (FCM/APNs) are stored via `useNativeFcm`.
- `useAppVersionCheck` keeps the WebView on the latest deploy.
- `AlarmPlugin` (custom) handles exact-time alarms even when the device
  kills the JS runtime.
- Test before shipping: camera capture, gallery pick, share-from-other-app,
  push notification with app foreground/background/terminated, alarm fire
  with screen off.