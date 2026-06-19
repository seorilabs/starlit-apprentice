# Google Play Notes

- Android package candidate: `com.seorilabs.starlitapprentice`
- Shell: Capacitor with bundled Vite build output.
- MVP has no login, payment, server sync, sensitive data collection, or production ad SDK.
- Listing config: `play-store/google-play.config.json`
- Release packaging: `docs/google-play-release.md`
- Generated assets:
  - `play-store/assets/icon-512.png`
  - `play-store/assets/feature-graphic-1024x500.png`
  - `play-store/screenshots/phone/*.png`
  - `play-store/screenshots/tablet-7/*.png`
  - `play-store/screenshots/tablet-10/*.png`

Before submission:

- Build a signed Android App Bundle from the Capacitor Android project.
- Submit Data safety answers from the prepared local-only/no-data-collected evidence.
- Confirm content rating and ad disclosure if ads are added later.
- Confirm privacy policy URL and verify contact email `cs@seorilabs.com`.
- Verify uploaded assets in Play Console preview.

Commands:

```bash
pnpm assets:generate:stores
pnpm check:store-config
pnpm build:android:aab
pnpm check:play
```
