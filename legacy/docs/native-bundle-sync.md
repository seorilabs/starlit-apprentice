# Native Bundle Sync

This document records the release boundary for the Capacitor Android/iOS bundled-web shells.

## Boundary

- `apps/starlit-apprentice/dist` is the canonical web build output.
- `apps/starlit-apprentice/android/app/src/main/assets/public` must contain the same `dist` files byte-for-byte after `pnpm cap:sync`.
- `apps/starlit-apprentice/ios/App/App/public` must contain the same `dist` files byte-for-byte after `pnpm cap:sync`.
- Capacitor may add `cordova.js` and `cordova_plugins.js` to native public bundles; other extra files are treated as stale or unintended release files.
- Native public bundles must not include sourcemaps, registration-only images, or `screenshots/`.
- Generated native `capacitor.config.json` files must keep `webDir: "dist"` and must not include `server.url`.
- Native `index.html` files must retain the release `Content-Security-Policy` meta tag.

## Verification

```bash
pnpm --filter @starlit-apprentice/app build
pnpm cap:sync
pnpm check:native-bundle-sync
```

`pnpm check:native-bundle-sync` rebuilds the app, compares `dist` against Android/iOS public bundles by SHA-256, validates generated Capacitor runtime config, allows only Capacitor's `cordova.js` and `cordova_plugins.js` extras, and checks that the native `Content-Security-Policy` stayed in sync.
