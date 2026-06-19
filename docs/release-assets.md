# Release Assets

`starlit-apprentice` registration image candidates are generated from the built app UI and repo-local HTML composites.

Last regenerated on 2026-06-18 from the Canvas renderer build. Representative AppsInToss thumbnail, Google Play feature graphic, AppsInToss vertical screenshot, and App Store iPad screenshot were visually sampled after generation. Result-state screenshots are captured after a full month so the current monthly coaching UI is visible without the sticky action bar covering the copy.

## Creative Brief

- Service promise: 한 달 4주 일정을 정해 견습생의 미래를 여는 픽셀 육성 시뮬레이션.
- Target user/category: 모바일 캐주얼 게임 사용자, 픽셀 아트/육성/멀티 엔딩 선호층.
- Visual tone: 밤하늘, 별빛 금색, 청록색 바닥, 보라 견습생 의상.
- Logo concept: 별 문장과 견습생 모자를 결합한 단순 픽셀 마크.
- Thumbnail scene: 실제 시작/방/결과 화면을 나란히 보여주는 게임플레이 중심 이미지.

## Files

### AppsInToss

| Asset | Path | Size |
| --- | --- | --- |
| Logo | `apps/starlit-apprentice/public/starlit-apprentice-icon-600.png` | 600 x 600 |
| Thumbnail | `apps/starlit-apprentice/public/starlit-apprentice-thumbnail-1932x828.png` | 1932 x 828 |
| Screenshot 1 | `apps/starlit-apprentice/public/screenshots/starlit-apprentice-start-636x1048.png` | 636 x 1048 |
| Screenshot 2 | `apps/starlit-apprentice/public/screenshots/starlit-apprentice-main-636x1048.png` | 636 x 1048 |
| Screenshot 3 | `apps/starlit-apprentice/public/screenshots/starlit-apprentice-result-636x1048.png` | 636 x 1048 |

### Google Play

| Asset | Path | Size |
| --- | --- | --- |
| Play icon | `play-store/assets/icon-512.png` | 512 x 512 |
| Feature graphic | `play-store/assets/feature-graphic-1024x500.png` | 1024 x 500 |
| Phone screenshots | `play-store/screenshots/phone/*.png` | 1080 x 1920 |
| 7-inch tablet screenshots | `play-store/screenshots/tablet-7/*.png` | 1440 x 2560 |
| 10-inch tablet screenshots | `play-store/screenshots/tablet-10/*.png` | 1800 x 3200 |

### Android Native Shell

| Asset | Path | Size |
| --- | --- | --- |
| Legacy launcher icons | `apps/starlit-apprentice/android/app/src/main/res/mipmap-*/ic_launcher.png` | 48 x 48 to 192 x 192 |
| Legacy round launcher icons | `apps/starlit-apprentice/android/app/src/main/res/mipmap-*/ic_launcher_round.png` | 48 x 48 to 192 x 192 |
| Adaptive foreground icons | `apps/starlit-apprentice/android/app/src/main/res/mipmap-*/ic_launcher_foreground.png` | 108 x 108 to 432 x 432 |
| Adaptive icon XML/background | `apps/starlit-apprentice/android/app/src/main/res/mipmap-anydpi-v26/*.xml`, `values/ic_launcher_background.xml` | source-controlled XML |
| Splash images | `apps/starlit-apprentice/android/app/src/main/res/drawable*/splash.png` | 320 x 480 to 1920 x 1280 |

Android launcher icons are synced from `play-store/assets/icon-512.png`. This keeps the installed QA APK/AAB launcher surface aligned with the Google Play icon instead of the default Capacitor icon.

Native splash images are generated from the branded Star Apprentice launch artwork for Android and iOS. This keeps the launch surface aligned with the installed icon instead of the default Capacitor splash.

### App Store

| Asset | Path | Size |
| --- | --- | --- |
| Store icon | `app-store/assets/starlit-apprentice-store-icon-1024.png` | 1024 x 1024 |
| iOS splash images | `apps/starlit-apprentice/ios/App/App/Assets.xcassets/Splash.imageset/*.png` | 2732 x 2732 |
| iPhone 6.9 screenshots | `app-store/screenshots/iphone-6-9/*.png` | 1290 x 2796 |
| iPad 13 screenshots | `app-store/screenshots/ipad-13/*.png` | 2048 x 2732 |

## Commands

```bash
pnpm assets:generate
pnpm assets:sync:android-icons
pnpm assets:sync:native-splash
pnpm check:assets
pnpm check:android:icons
pnpm check:native-splash
pnpm check:store-config
python3 /Users/syous/.codex/skills/apps-in-toss-registration-images/scripts/validate_registration_images.py --spec specs/starlit-apprentice.json
```

## Remaining Review Notes

- Re-capture screenshots after human QA if the UI changes.
- Keep each store screenshot set distinct; `pnpm check:store-config` rejects repeated screenshot paths and byte-identical screenshots inside the same Google Play or App Store screenshot set.
- Market-specific assets are generated, but Play Console and App Store Connect upload previews are not verified yet.
- Google Play contact email is `cs@seorilabs.com`; the privacy policy URL remains unresolved until the generated page is hosted on a confirmed public HTTPS domain.
- Do not submit or promote without explicit deployment approval.
