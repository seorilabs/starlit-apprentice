# Google Play Release

This document is the repo-local source of truth for Google Play release packaging. Store listing assets and text live in `play-store/google-play.config.json` and `docs/google-play-store-listing.md`.

## Current Official Requirements Checked

Checked on 2026-06-18 against official Google/Android documentation:

- New Google Play apps and updates must target Android 15 / API level 35 or higher.
- A Google Play upload artifact should be an Android App Bundle for this app, built from the Capacitor Android project.
- A Play-uploadable release bundle must be signed with an upload key. Play App Signing manages the app signing key after upload.
- New personal Play developer accounts may need a closed test with at least 12 opted-in testers for 14 continuous days before production access.

Source URLs:

- `https://support.google.com/googleplay/android-developer/answer/11926878?hl=en`
- `https://developer.android.com/build/building-cmdline`
- `https://support.google.com/googleplay/android-developer/answer/9842756?hl=en`
- `https://support.google.com/googleplay/android-developer/answer/14151465?hl=en`

## Android Package State

| Item | Value |
| --- | --- |
| Android project | `apps/starlit-apprentice/android` |
| Application ID | `com.seorilabs.starlitapprentice` |
| Compile SDK | 35 |
| Target SDK | 35 |
| Min SDK | 23 |
| Version | `versionName = 0.1.0`, `versionCode = 1` |
| Release bundle command | `pnpm build:android:aab` |
| Release bundle path | `apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab` |
| Current upload status | local unsigned AAB build verified; signed upload AAB still requires upload-key configuration |

`pnpm check:play` also compares `base/assets/public/*` inside the AAB with the current `apps/starlit-apprentice/dist` files by SHA-256. If the web build changes, run `pnpm build:android:aab` again before claiming Google Play package readiness.

`pnpm check:android:icons` verifies that Android launcher icons in `apps/starlit-apprentice/android/app/src/main/res/mipmap-*` are synced from `play-store/assets/icon-512.png`. The Android AAB and QA APK build scripts run `pnpm assets:sync:android-icons` before Gradle so installed launcher icons do not fall back to the default Capacitor icon.

`pnpm check:native-splash` verifies that Android splash images in `apps/starlit-apprentice/android/app/src/main/res/drawable*/splash.png` are synced from the branded Star Apprentice splash renderer. The Android AAB and QA APK checks also compare packaged splash PNGs against the source resources so stale default Capacitor splash assets fail the release package gate.

## Signing Configuration

Release signing can be provided either through environment variables:

```bash
STARLIT_UPLOAD_STORE_FILE=/absolute/path/to/upload-key.jks
STARLIT_UPLOAD_STORE_PASSWORD=...
STARLIT_UPLOAD_KEY_ALIAS=...
STARLIT_UPLOAD_KEY_PASSWORD=...
```

or through ignored local file `apps/starlit-apprentice/android/keystore.properties`:

```properties
storeFile=/absolute/path/to/upload-key.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Do not commit keystores, password files, or Play service account JSON. The root `.gitignore` and Android `.gitignore` ignore `*.jks`, `*.keystore`, `*.p12`, `keystore.properties`, and Play service account JSON patterns.

## Commands

```bash
pnpm build:android:aab
pnpm assets:sync:android-icons
pnpm assets:sync:native-splash
pnpm check:android:icons
pnpm check:native-splash
pnpm --filter @starlit-apprentice/app build
pnpm check:versioning
pnpm check:play
pnpm check:play:local-artifact
pnpm check:play:strict
```

`pnpm check:play` allows manual blockers and is suitable for local QA. `pnpm check:play:local-artifact` still allows account-bound manual blockers, but fails if the local AAB is missing or stale. `pnpm check:play:strict` intentionally fails until a signed AAB and account-bound console evidence are available.

The strict checker reads `play-store/google-play.config.json`, `qa/release-console-evidence.json`, and the release AAB. Fixture validation can override those sources with `GOOGLE_PLAY_CONFIG_PATH`, `RELEASE_CONSOLE_EVIDENCE_PATH`, and `ANDROID_AAB_PATH`. Google Play strict readiness clears only when the Play config has concrete privacy policy, rating, Data safety, signed AAB, listing preview, and policy questionnaire evidence, the corresponding release console evidence items are `passed`, and the inspected AAB contains signature metadata.

## Remaining Manual Gates

- Confirm Google Play contact email and privacy policy URL.
- Submit prepared Data safety evidence in Play Console.
- Complete content rating and Korea game rating evidence.
- Choose Play App Signing/upload-key handling and build a signed AAB.
- Upload the signed AAB to Play Console and choose internal/closed/production track.
- Verify store listing and generated assets in Play Console preview.
- If the developer account is a new personal account, complete the required closed testing path before production access.
