# App Store Release

This document is the repo-local source of truth for iOS release packaging. Listing assets and text live in `app-store/app-store.config.json` and `docs/app-store-registration.md`.

## Current Official Requirements Checked

Checked on 2026-06-18 against official Apple documentation:

- After creating an App Store Connect app record, builds can be uploaded using Xcode, Swift Playground, `altool`, Transporter, or API-authenticated Transporter workflows.
- App Privacy details must describe data collected by the app and integrated third-party partners.
- Export compliance information is handled in App Store Connect, and `Info.plist` can include the encryption answer to avoid repeated submission questions.
- Apps or SDKs using required reason APIs must declare approved reasons in a privacy manifest.

Source URLs:

- `https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/`
- `https://developer.apple.com/app-store/app-privacy-details/`
- `https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/`
- `https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api`

## iOS Package State

| Item | Value |
| --- | --- |
| Xcode project | `apps/starlit-apprentice/ios/App/App.xcodeproj` |
| Workspace | `apps/starlit-apprentice/ios/App/App.xcworkspace` |
| Scheme | `App` |
| Bundle ID | `com.seorilabs.starlitapprentice` |
| Version | `MARKETING_VERSION = 0.1.0`, `CURRENT_PROJECT_VERSION = 1` |
| Device family | iPhone and iPad, `TARGETED_DEVICE_FAMILY = "1,2"` |
| Orientation | Portrait-only with `UIRequiresFullScreen=true` for the current iPad target |
| Local unsigned release build command | `pnpm build:ios:release` |
| Local unsigned `.app` path | `apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app` |
| Release check command | `pnpm check:app-store` |
| Current upload status | local release build and AppIcon/privacy/export evidence can be verified; signed archive/upload still requires Apple Distribution signing and App Store Connect state |

`pnpm check:app-store` also compares `App.app/public/*` with the current `apps/starlit-apprentice/dist` files by SHA-256. If the web build changes, run `pnpm build:ios:release` again before claiming App Store package readiness.

`pnpm check:native-splash` verifies `apps/starlit-apprentice/ios/App/App/Assets.xcassets/Splash.imageset/*.png` against the branded splash renderer. `pnpm build:ios:release` runs the splash sync before Xcode so `Assets.car` includes the current launch-screen artwork.

## AppIcon

The App Store icon source is `app-store/assets/starlit-apprentice-store-icon-1024.png`. Run:

```bash
pnpm assets:sync:ios-icons
```

This fills the Xcode `AppIcon.appiconset` with iPhone, iPad, iPad Pro `167 x 167`, iPad `152 x 152`, and marketing `1024 x 1024` PNG slots. `pnpm check:app-store` verifies the slots and fails if alpha is present.

The sync command also removes orphan PNGs that are not referenced by `Contents.json`; otherwise Xcode `actool` can warn about unassigned app icon children during release builds.

## Privacy And Export Evidence

- `apps/starlit-apprentice/ios/App/App/PrivacyInfo.xcprivacy` declares no tracking, no collected data types, no tracking domains, and no required reason API declarations for the current MVP boundary.
- `apps/starlit-apprentice/ios/App/App/Info.plist` includes `ITSAppUsesNonExemptEncryption=false` for the current no custom/non-exempt encryption boundary.
- `app-store/app-store.config.json` tracks App Privacy as `Data Not Collected` and export compliance as repo evidence prepared.

## Commands

```bash
pnpm assets:sync:native-splash
pnpm check:native-splash
pnpm assets:sync:ios-icons
pnpm build:ios:release
pnpm --filter @starlit-apprentice/app build
pnpm check:versioning
pnpm check:app-store
pnpm check:app-store:local-artifact
pnpm check:app-store:strict
```

`pnpm check:app-store` allows manual blockers and is suitable for local QA. `pnpm check:app-store:local-artifact` still allows account-bound manual blockers, but fails if the local unsigned `.app` is missing or stale. `pnpm check:app-store:strict` intentionally fails until account-bound App Store Connect and signing gates are available.

The strict checker reads `app-store/app-store.config.json`, `qa/release-console-evidence.json`, and the release `.app`. Fixture validation can override those sources with `APP_STORE_CONFIG_PATH`, `RELEASE_CONSOLE_EVIDENCE_PATH`, and `IOS_APP_PATH`. App Store strict readiness clears only when the App Store config has concrete SKU, contact, privacy/support URLs, age rating, privacy/export console evidence, the corresponding release console evidence items are `passed`, and the inspected `.app` contains `_CodeSignature/CodeResources` metadata.

## Remaining Manual Gates

- Confirm SKU, review contact name/phone, support URL, and privacy policy URL. Verify support/review email `cs@seorilabs.com`.
- Complete age rating in App Store Connect.
- Submit prepared App Privacy and export compliance evidence in App Store Connect.
- Configure Apple Distribution signing, Team ID, and an App Store provisioning profile.
- Create or confirm the App Store Connect app record.
- Archive, upload, wait for processing, choose the build, configure TestFlight if needed, and submit for review.
