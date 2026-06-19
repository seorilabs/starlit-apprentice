# App Store Notes

- Bundle ID candidate: `com.seorilabs.starlitapprentice`
- Shell: Capacitor with bundled Vite build output.
- MVP has no account, payment, server sync, sensitive data collection, or production ad SDK.
- Listing config: `app-store/app-store.config.json`
- Release packaging: `docs/app-store-release.md`
- Current Xcode target supports iPhone and iPad: `TARGETED_DEVICE_FAMILY = "1,2"`.
- Generated assets:
  - `app-store/assets/starlit-apprentice-store-icon-1024.png`
  - `app-store/screenshots/iphone-6-9/*.png`
  - `app-store/screenshots/ipad-13/*.png`

Before submission:

- Confirm the app is presented as a bundled interactive game, not a remote web wrapper.
- Prepare App Review notes with the reviewer flow in `docs/store-review-notes.md`.
- Confirm privacy nutrition labels after any ad or analytics SDK is added.
- Confirm SKU, review contact name/phone, support URL, privacy policy URL, age rating, and App Store Connect submission of prepared privacy/export evidence. Verify support/review email `cs@seorilabs.com`.
- Verify uploaded screenshots in App Store Connect preview.

Commands:

```bash
pnpm assets:generate:stores
pnpm check:store-config
pnpm assets:sync:ios-icons
pnpm build:ios:release
pnpm check:app-store
```
