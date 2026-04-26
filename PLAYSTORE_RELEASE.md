# RoomMate — Play Store Release Checklist

Step-by-step from your machine to a published Play Store listing.

---

## 1. Sync your code locally

```bash
git pull
npm install
npm run build              # builds /dist with the new code-split bundle
npx cap sync android       # copies web build + plugins into Android project
```

If you don't have Android yet:
```bash
npx cap add android
npx cap sync android
```

Open the project in Android Studio:
```bash
npx cap open android
```

---

## 2. Bump version (every release)

Edit `android/app/build.gradle`:

```gradle
android {
  defaultConfig {
    applicationId "app.lovable.33f96bab05a84df9939e66df730e6530"
    minSdkVersion 23
    targetSdkVersion 34   // Play Store currently requires 34+
    versionCode 2          // ← INCREMENT every upload (integer)
    versionName "1.0.1"    // ← Human-readable (string)
  }
}
```

Rule: `versionCode` must be **higher than the previous upload**, even for internal testing.

---

## 3. Generate an upload keystore (one-time)

```bash
keytool -genkey -v -keystore ~/roommate-upload-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias roommate
```

Save the password somewhere safe (1Password, etc.) — losing it means losing the ability to update the app.

Create `android/key.properties` (do NOT commit):

```properties
storePassword=YOUR_PASSWORD
keyPassword=YOUR_PASSWORD
keyAlias=roommate
storeFile=/absolute/path/to/roommate-upload-key.jks
```

Add to `android/app/build.gradle` above `android { ... }`:

```gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file('key.properties')
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Inside `android { ... }`:

```gradle
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

Add `android/key.properties` and `*.jks` to `.gitignore`.

---

## 4. Build the signed AAB

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab` — this is what you upload.

---

## 5. Play Console setup

1. Go to https://play.google.com/console → **Create app**
2. App name: **RoomMate**
3. Default language: English (United States)
4. App or game: **App**
5. Free or paid: **Free**
6. Accept Play developer policies & US export laws.

### Store listing
- **Short description** (80 chars): `Split bills, plan tasks, sync music & chat with your roommates.`
- **Full description** (≤4000 chars): describe expense splitting, shared alarms, tasks, chat, games, music sync, solo mode.
- **App icon**: 512×512 PNG (use `public/icon-512.png`).
- **Feature graphic**: 1024×500 PNG.
- **Phone screenshots**: 4–8 PNGs, min 320 px on the short side. Capture from the device or emulator: Home, Expenses, Chat, Tasks, Alarms, Games.

### Privacy policy
You already host one: `https://<your-domain>/privacy`. Paste the URL into Play Console → **App content → Privacy policy**.

### Data safety form
Fill out **App content → Data safety**. Declare:
- Collected: email, name, profile photo (uploaded), chat messages, photos in shared storage.
- Purpose: account, app functionality.
- Encrypted in transit: **Yes**.
- User can request deletion: **Yes** — link to your `/delete-account` route.

### Permissions justification
You will be asked about:
- `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`: "Used to ring shared roommate alarms at the exact requested time."
- `POST_NOTIFICATIONS`: "Used to deliver chat, expense, task, and alarm notifications."
- `FOREGROUND_SERVICE_MEDIA_PLAYBACK`: "Used to keep the alarm sound playing reliably while ringing."
- `USE_FULL_SCREEN_INTENT`: "Shows the alarm UI over the lock screen."

### Content rating
Run the questionnaire — RoomMate is **Everyone**.

---

## 6. Upload track

1. Release → **Internal testing** → Create release → upload `app-release.aab`.
2. Add yourself as a tester via an email list.
3. After you verify everything works, promote to **Closed → Open → Production**.

First production review usually takes 1–7 days.

---

## 7. Post-release

- Monitor crashes in Play Console → **Quality → Android vitals**.
- Each new upload: bump `versionCode` (integer, +1) and `versionName`.
- Keep the upload keystore backed up — losing it means you can never update the app under the same listing.

---

## What was already optimized in this release

- All routes are now **lazy-loaded** — initial bundle is much smaller and the app cold-starts faster on low-end Android devices.
- React Query no longer refetches on window focus — fewer redundant network calls and less re-renders.
- Vite builds vendor chunks (React, Supabase, Radix, charts, icons) separately so updates are cached better.
- Bill scanner now shows the photo immediately and runs heavy CPU preprocessing in idle time, so the UI doesn't freeze.
