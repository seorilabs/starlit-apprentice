# Release Versioning

This document records the repo-local release version contract for `starlit-apprentice`.

## Current Version

| Field | Value | Source |
| --- | --- | --- |
| Marketing version | `0.1.0` | Root `package.json`, app `package.json`, product-core `package.json`, Android `versionName`, iOS `MARKETING_VERSION` |
| Build number | `1` | Android `versionCode`, iOS `CURRENT_PROJECT_VERSION` |

## Rules

- Root, app, and product-core package versions must match.
- Android `versionName` must match the package marketing version.
- iOS Debug and Release `MARKETING_VERSION` values must match the package marketing version.
- Android `versionCode` and iOS Debug/Release `CURRENT_PROJECT_VERSION` must be positive integers and match each other.
- Release notes, Play Console upload, App Store Connect build selection, and AppsInToss review notes should refer to this version/build pair until it is intentionally bumped.

## Verification

```bash
pnpm check:versioning
```

`pnpm check:versioning` fails when native package metadata drifts from the package version or when build numbers diverge between Android and iOS.
