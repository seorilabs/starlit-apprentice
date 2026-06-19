# App Store Registration

This file is the repo-local source of truth for App Store Connect registration preparation. Console-only values stay marked as `확정 필요` until verified in App Store Connect.

## Config

- Source file: `app-store/app-store.config.json`
- Release packaging: `docs/app-store-release.md`
- Bundle ID: `com.seorilabs.starlitapprentice`
- Platform: iOS
- Primary locale: `ko-KR`
- Category: Games / Simulation
- Device families: iPhone and iPad
- Support/review email: `cs@seorilabs.com`

The Xcode project currently sets `TARGETED_DEVICE_FAMILY = "1,2"`, so iPad screenshots are required unless the target is intentionally changed to iPhone-only.

## Generated Assets

| Asset | Path | Size | Notes |
| --- | --- | --- | --- |
| App Store icon | `app-store/assets/starlit-apprentice-store-icon-1024.png` | 1024 x 1024 | No alpha |
| iPhone 6.9 screenshots | `app-store/screenshots/iphone-6-9/*.png` | 1290 x 2796 | 4 actual app UI states |
| iPad 13 screenshots | `app-store/screenshots/ipad-13/*.png` | 2048 x 2732 | 4 actual app UI states |

## Commands

```bash
pnpm assets:generate:stores
pnpm check:store-config
pnpm check:privacy
pnpm release:public-pages
pnpm check:public-pages
pnpm check:app-store
pnpm check:store-config:strict
```

`pnpm check:store-config` allows manual blockers and is suitable for local QA. `pnpm check:store-config:strict` intentionally fails until App Store Connect-only fields are completed.
The same gate also rejects stale listing copy that names old stat labels; descriptions must reflect the current 14-stat model plus gold, energy/기력, and stress resources.

## Privacy

- Evidence file: `docs/privacy-and-data-safety.md`
- Public page source: `public-pages/privacy-policy.html`
- Support/marketing page source: `public-pages/support.html`, `public-pages/index.html`
- Handoff packet: `qa/public-release-pages.md`
- Candidate label: Data Not Collected.
- Tracking: no.
- App Store Connect privacy label submission still has to be completed from this evidence.
- Privacy policy URL remains a manual console gate.

## Export Compliance

- Evidence file: `docs/app-store-release.md`
- `Info.plist` includes `ITSAppUsesNonExemptEncryption=false` for the current no custom/non-exempt encryption boundary.
- App Store Connect confirmation still has to be completed from this evidence.

## Manual Gates

- SKU, review contact name/phone, support URL, marketing URL, and privacy policy URL must be confirmed; do not paste placeholder URLs before the generated pages are hosted on a real HTTPS domain.
- Verify the configured support/review email `cs@seorilabs.com` in App Store Connect during metadata entry.
- Xcode archive and App Store Connect upload must be completed.
- Age rating, prepared privacy label evidence submission, prepared export compliance confirmation, and App Review metadata must be confirmed in App Store Connect.
- Store listing upload and device preview must be verified in the console.

## Official References

- Screenshot specifications: `https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/`
- Product page guidance: `https://developer.apple.com/app-store/product-page/`
- App privacy details: `https://developer.apple.com/app-store/app-privacy-details/`
- Upload builds: `https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/`
- Export compliance: `https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/`
