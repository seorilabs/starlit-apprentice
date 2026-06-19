# Google Play Store Listing

This file is the repo-local source of truth for Google Play listing preparation. Console-only values stay marked as `확정 필요` until verified in Play Console.

## Config

- Source file: `play-store/google-play.config.json`
- Release packaging: `docs/google-play-release.md`
- Package name: `com.seorilabs.starlitapprentice`
- Type: game
- Price: free
- Default language: `ko-KR`
- Contact email: `cs@seorilabs.com`

## Generated Assets

| Asset | Path | Size | Notes |
| --- | --- | --- | --- |
| Play icon | `play-store/assets/icon-512.png` | 512 x 512 | 32-bit PNG target |
| Feature graphic | `play-store/assets/feature-graphic-1024x500.png` | 1024 x 500 | 24-bit PNG, no alpha |
| Phone screenshots | `play-store/screenshots/phone/*.png` | 1080 x 1920 | 4 actual app UI states |
| 7-inch tablet screenshots | `play-store/screenshots/tablet-7/*.png` | 1440 x 2560 | 4 actual app UI states |
| 10-inch tablet screenshots | `play-store/screenshots/tablet-10/*.png` | 1800 x 3200 | 4 actual app UI states |

## Commands

```bash
pnpm assets:generate:stores
pnpm check:store-config
pnpm check:privacy
pnpm release:public-pages
pnpm check:public-pages
pnpm check:play
pnpm check:store-config:strict
```

`pnpm check:store-config` allows manual blockers and is suitable for local QA. `pnpm check:store-config:strict` intentionally fails until Play Console-only fields are completed.
The same gate also rejects stale listing copy that names old stat labels; full descriptions must reflect the current 14-stat model plus gold, energy/기력, and stress resources.

## Privacy And Data Safety

- Evidence file: `docs/privacy-and-data-safety.md`
- Public page source: `public-pages/privacy-policy.html`
- Handoff packet: `qa/public-release-pages.md`
- Candidate basis: no user data collected or shared; local progress and ending collection stay on-device only.
- Play Console Data safety submission still has to be completed from this evidence.
- Privacy policy URL remains a manual console gate.

## Manual Gates

- Privacy policy URL must be confirmed before launch; do not paste placeholder URLs before the generated privacy page is hosted on a real HTTPS domain.
- Verify the configured contact email `cs@seorilabs.com` in Play Console during listing upload.
- Android App Bundle must be signed with the upload key and uploaded.
- Data safety must be submitted in Play Console from the prepared repo evidence.
- Content rating and Korean game rating evidence must be completed in Play Console.
- Store listing upload and preview must be verified in the console.

## Official References

- Google Play preview assets: `https://support.google.com/googleplay/android-developer/answer/9866151`
- Google Play icon specification: `https://developer.android.com/distribute/google-play/resources/icon-design-specifications`
- Google Play Data safety: `https://support.google.com/googleplay/android-developer/answer/10787469?hl=en`
