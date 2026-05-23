# RoomMate – Final Android Native Setup

This is the single source of truth for finishing the Android build:
permissions, share intents, FCM push, and producing a working APK.

Everything that **can** be configured from the repo already is. The few
steps that require your Google account / Android Studio are listed below
with the exact files and line numbers to touch.

---

## 0. One-time prep (on your laptop)

```bash
git pull
npm install
npm run build
npx cap add android        # only if android/ folder is missing
npx cap sync android
```

After every JS change, repeat `npm run build && npx cap sync android`.

---

## 1. Permissions (already in the manifest)

`android/app/src/main/AndroidManifest.xml` already declares everything
the app needs. You do **not** have to edit it:

| Capability | Permission |
|---|---|
| Photos & videos (Android 13+) | `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` |
| Gallery / files (Android ≤12) | `READ_EXTERNAL_STORAGE` (maxSdk 32), `WRITE_EXTERNAL_STORAGE` (maxSdk 29) |
| Camera | `CAMERA` + `<uses-feature camera required="false">` |
| Notifications | `POST_NOTIFICATIONS`, `USE_FULL_SCREEN_INTENT` |
| Background / alarms | `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE` |
| Network | `INTERNET`, `ACCESS_NETWORK_STATE` |

These will all appear in **Settings → Apps → RoomMate → Permissions**
as soon as the APK is installed.

### Runtime prompts

Runtime prompts are triggered automatically by `useNativeAndroidPermissions`
(wired into `src/pages/Index.tsx`). On first launch the user sees:

1. Camera + Photos dialog (`@capacitor/camera`)
2. Notifications dialog (`@capacitor/local-notifications` + `@capacitor/push-notifications`)

No further code is needed.

---

## 2. Share intents (already wired)

The manifest registers four share-target activity aliases:

- **RoomMate – Add as Bill** (`ShareToBillActivity`)
- **RoomMate – Settle Payment** (`ShareToPaymentActivity`)
- **RoomMate – Send to Room Chat** (`ShareToChatActivity`)
- Main activity catches generic `SEND` / `SEND_MULTIPLE` for `image/*`,
  `application/pdf`, `text/plain`, and `*/*`

`MainActivity.kt` reads the incoming `EXTRA_STREAM` URIs, base64-encodes
them, and forwards to `/share-import?as=payment|bill|chat` inside the
WebView. This works on Redmi / Realme / Vivo / Oppo / Samsung
screenshots and gallery shares.

**Verify after install:** open Photos → share any image → RoomMate should
appear three times in the share sheet.

---

## 3. Firebase Cloud Messaging (the only manual step)

### 3a. Create the Firebase app

1. <https://console.firebase.google.com> → **Add project** (or pick existing).
2. **Add app → Android**, package name **exactly**:
   ```
   app.lovable.33f96bab05a84df9939e66df730e6530
   ```
3. Download **`google-services.json`**.

### 3b. Place the file (exact path)

```
android/app/google-services.json
```

(Same folder as `build.gradle` — not `android/`, not `android/app/src/`.)

### 3c. Wire the Gradle plugin

**`android/build.gradle`** (project-level), inside `buildscript { dependencies { … } }`:

```groovy
classpath 'com.google.gms:google-services:4.4.2'
```

**`android/app/build.gradle`** (module-level), at the very **bottom**:

```groovy
apply plugin: 'com.google.gms.google-services'
```

And in the same file's `dependencies { … }` block:

```groovy
implementation platform('com.google.firebase:firebase-bom:33.4.0')
implementation 'com.google.firebase:firebase-messaging'
```

### 3d. Sync & confirm

```bash
npx cap sync android
```

On first launch the device logs should show:

```
adb logcat | grep -iE "FCM|FirebaseMessaging|RoomMate"
```

`useNativeFcm` will save the FCM token into `push_subscriptions.fcm_token`
keyed to the signed-in user. The existing `send-push` edge function
(already deployed) delivers notifications via FCM HTTP v1 — no further
server work needed.

---

## 4. What works in the native APK

After steps 0–3 the installed APK supports:

- Foreground push notifications (sound + badge + alert)
- **Background / killed-app** push notifications (FCM wakes the app)
- Share sheet import of payment screenshots, bills, PDFs, and chat media
- Camera capture + gallery upload from any expense / chat / storage screen
- Full-screen shared alarm even when the screen is off

---

## 5. Build a release APK / AAB

```bash
npm run build
npx cap sync android
cd android
./gradlew clean
./gradlew assembleRelease         # APK at app/build/outputs/apk/release/
./gradlew bundleRelease           # AAB at app/build/outputs/bundle/release/
```

For signing, follow `PLAYSTORE_RELEASE.md` (keystore.properties + the
`signingConfigs` block already documented there).

---

## 6. Tested QA workflow before shipping

1. Install APK on a real Android 13+ device (`adb install -r app-release.apk`).
2. Open app → grant Camera, Photos, Notifications when prompted.
3. **Camera:** open an expense → "Scan receipt" → camera opens.
4. **Gallery:** in chat → 📎 attachment → pick image from gallery.
5. **Share intent:** Photos app → share a screenshot → confirm "RoomMate
   – Settle Payment / Add as Bill / Send to Room Chat" all appear.
6. **Notification (foreground):** trigger any in-app action (new task /
   expense) → banner appears.
7. **Notification (background):** background the app → trigger from
   another device → notification arrives + tapping opens the deep link.
8. **Notification (killed):** swipe RoomMate from recents → trigger →
   FCM still delivers (this is the FCM proof — won't work without
   `google-services.json`).
9. **Alarm:** create an alarm 1 min in the future → lock the phone →
   confirm full-screen alarm fires.

If any step fails, run `adb logcat | grep -iE "RoomMate|FCM|Capacitor"`
and share the output.