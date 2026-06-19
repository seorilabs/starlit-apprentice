# Store Submission Packet

This file is generated from store config files, release evidence files, and `qa/release-artifact-manifest.json`.

## Build Identity

| Field | Value |
| --- | --- |
| App | `starlit-apprentice` |
| Version | `0.1.0` |
| Manifest generated | `2026-06-19T08:36:09.203Z` |
| Manual QA build ID | `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc` |

## Preflight Commands

```bash
pnpm check:release-packages
pnpm build:apps-in-toss:candidate
pnpm check:package
pnpm release:artifact-manifest
pnpm check:release-artifact-manifest
pnpm check:release-verification-commands
pnpm check:release-manual-blockers
pnpm check:public-url-guard
pnpm release:manual-qa-packet
pnpm check:manual-qa-packet
pnpm release:console-packet
pnpm check:release-console-packet
pnpm release:rating-content-inventory
pnpm check:rating-content-inventory
pnpm release:public-pages
pnpm check:public-pages
pnpm release:store-submission-packet
pnpm check:store-submission-packet
pnpm release:gate-dashboard
pnpm check:release-gate-dashboard
pnpm release:approval-packet
pnpm check:release-approval-packet
pnpm check:release:automated
```

## Handoff Packets

| Packet | Purpose |
| --- | --- |
| `qa/manual-qa-packet.md` | Target-device QA runbook and evidence snippets |
| `qa/release-console-packet.md` | Console upload/review runbook and evidence snippets |
| `qa/rating-content-inventory.md` | Rating questionnaire content inventory and risk keyword scan |
| `qa/public-release-pages.md` | Hostable privacy/support/marketing page handoff and URL mapping |
| `qa/store-submission-packet.md` | Copy/paste metadata, asset paths, and unresolved console fields |
| `qa/release-gate-dashboard.md` | Release decision, dependency order, and open gate summary |
| `qa/release-approval-packet.md` | Final explicit release approval handoff and stop rules |

## Release Gate Status

| Field | Value |
| --- | --- |
| Submission decision | `not-submittable` |
| Manual QA open targets | 12 |
| Console evidence open items | 14 |
| Store unresolved fields | 19 |
| Store invalid public URL fields | 0 |
| Final approval status | `pending` |

Stop rules:

- Do not paste, submit, request review, publish, or start rollout from this packet while the submission decision is `not-submittable`.
- Store metadata still has unresolved fields; resolve the fields listed below before copying store values.
- Target-device manual QA evidence is incomplete; complete every open target before review submission.
- Console upload/review evidence is incomplete; complete signed upload, QR/test, rating, privacy, preview, and metadata gates in the real consoles.
- Final release approval is not recorded for the current `manualQaBuildId`.

## Public Release Pages

| Page | Local file | Store field |
| --- | --- | --- |
| Marketing page | `public-pages/index.html` | App Store `marketingUrl` |
| Privacy policy | `public-pages/privacy-policy.html` | Google Play/App Store `privacyPolicyUrl` |
| Support page | `public-pages/support.html` | App Store `supportUrl` |

Run `pnpm release:public-pages` before hosting these files. Do not paste placeholder URLs into store consoles; final URLs still require a confirmed public HTTPS domain.

## Public URL Rules

- Store public URLs must use `https://`.
- Do not use username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, `.local`, `.test`, `.invalid`, or placeholder domains such as `example.com`.
- Google Play `privacyPolicyUrl` and optional `contactWebsite` must point to public HTTPS URLs when resolved.
- App Store `privacyPolicyUrl`, `supportUrl`, and `marketingUrl` must point to public HTTPS URLs when resolved.

## AppsInToss

### Identity

| Field | Value |
| --- | --- |
| appName | `starlit-apprentice` |
| appType | `game` |
| entryRoute | `/` |
| feature status | `game-optional` |
| candidate feature ko | 육성하기 |
| candidate feature en | Raise |
| candidate feature URL | `intoss://starlit-apprentice/` |

### Build Artifacts

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Static WebView ZIP | `apps-in-toss/build/starlit-apprentice-webview-candidate.zip` | `0e043fe9a11ee28bc0f78f4e253f2af9b9a129e2bf20347f286819e7b89fc9c9` |
| Uploadable .ait | `apps-in-toss/build/starlit-apprentice.ait` | `c1433d482ce9c92bacb4cdc71d4b173913d7bd8cc16d25b8f35bc1cc9e7957d9` |

### Registration Assets

| Asset | Path |
| --- | --- |
| Logo 600 x 600 | `apps/starlit-apprentice/public/starlit-apprentice-icon-600.png` |
| Thumbnail 1932 x 828 | `apps/starlit-apprentice/public/starlit-apprentice-thumbnail-1932x828.png` |
| Screenshot 1 636 x 1048 | `apps/starlit-apprentice/public/screenshots/starlit-apprentice-start-636x1048.png` |
| Screenshot 2 636 x 1048 | `apps/starlit-apprentice/public/screenshots/starlit-apprentice-main-636x1048.png` |
| Screenshot 3 636 x 1048 | `apps/starlit-apprentice/public/screenshots/starlit-apprentice-result-636x1048.png` |

### Manual Console Fields

| Field | Value |
| --- | --- |
| `consoleGameCategoryAndExposure` | 확정 필요 |
| `gameRatingEvidence` | 확정 필요 |
| `aitBundleUpload` | 확정 필요 |
| `qrTossAppTest` | 확정 필요 |
| `deploymentApproval` | 확정 필요 |


## Google Play

### Identity

| Field | Value |
| --- | --- |
| packageName | `com.seorilabs.starlitapprentice` |
| defaultLanguage | `ko-KR` |
| appType | `game` |
| freeOrPaid | `free` |
| contactEmail | cs@seorilabs.com |
| privacyPolicyUrl | 확정 필요 |

### Store Listing

#### App name

- `ko-KR`: 별빛 견습생
- `en-US`: Star Apprentice

#### Short description

- `ko-KR`: 4주 일정을 선택해 견습생을 성장시키는 픽셀 육성 시뮬레이션
- `en-US`: Raise an apprentice through monthly plans in a pixel life sim

#### Full description

- `ko-KR`: 별빛 견습생은 한 달 4주 일정을 정해 견습생의 능력과 미래를 만들어 가는 픽셀 육성 시뮬레이션 게임입니다.<br><br>공부, 일, 휴식, 외출을 조합해 12개월을 보내고, 선택의 누적 결과에 따라 서로 다른 엔딩을 확인합니다. 모든 진행은 기기 안에 저장되며, 초기 버전에는 로그인, 결제, 서버 저장, 광고 SDK가 포함되지 않습니다.<br><br>주요 특징<br>- 월마다 4주 일정을 선택하는 간결한 육성 루프<br>- 지성, 감성, 예법, 기술, 체력, 평판 등 14가지 능력과 골드, 기력, 스트레스 자원 변화<br>- 성장 방향에 따라 달라지는 30가지 엔딩<br>- 짧은 세션으로 진행할 수 있는 모바일 중심 UI<br>- 오프라인에서도 유지되는 로컬 저장 기반 진행
- `en-US`: Star Apprentice is a pixel life simulation game where you choose four weekly activities each month and guide an apprentice toward a future.<br><br>Balance study, work, rest, and outings across 12 months. Your accumulated choices change the apprentice's 14 growth stats and resources, then lead to different endings. The first version stores progress on the device and does not include login, payments, server saves, or production ad SDKs.<br><br>Features<br>- A compact monthly planning loop with four weekly choices<br>- Changes across 14 growth stats plus gold, energy, and stress resources<br>- 30 endings shaped by long-term growth choices<br>- Mobile-first screens designed for short play sessions<br>- Local save progress that remains available offline

### Assets

| Asset | Path |
| --- | --- |
| Play icon 512 x 512 | `play-store/assets/icon-512.png` |
| Feature graphic 1024 x 500 | `play-store/assets/feature-graphic-1024x500.png` |
| Phone screenshot 1 | `play-store/screenshots/phone/starlit-apprentice-start-1080x1920.png` |
| Phone screenshot 2 | `play-store/screenshots/phone/starlit-apprentice-main-1080x1920.png` |
| Phone screenshot 3 | `play-store/screenshots/phone/starlit-apprentice-schedule-1080x1920.png` |
| Phone screenshot 4 | `play-store/screenshots/phone/starlit-apprentice-result-1080x1920.png` |
| 7-inch tablet screenshot 1 | `play-store/screenshots/tablet-7/starlit-apprentice-start-1440x2560.png` |
| 7-inch tablet screenshot 2 | `play-store/screenshots/tablet-7/starlit-apprentice-main-1440x2560.png` |
| 7-inch tablet screenshot 3 | `play-store/screenshots/tablet-7/starlit-apprentice-schedule-1440x2560.png` |
| 7-inch tablet screenshot 4 | `play-store/screenshots/tablet-7/starlit-apprentice-result-1440x2560.png` |
| 10-inch tablet screenshot 1 | `play-store/screenshots/tablet-10/starlit-apprentice-start-1800x3200.png` |
| 10-inch tablet screenshot 2 | `play-store/screenshots/tablet-10/starlit-apprentice-main-1800x3200.png` |
| 10-inch tablet screenshot 3 | `play-store/screenshots/tablet-10/starlit-apprentice-schedule-1800x3200.png` |
| 10-inch tablet screenshot 4 | `play-store/screenshots/tablet-10/starlit-apprentice-result-1800x3200.png` |

### Local Artifact

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Android QA APK | `apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk` | `4d6f56e0d303c10bc391daf458478f356afbd25548419c08d68a8f29125672ce` |
| Android AAB | `apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab` | `607cae595c19ba0254aac04e3f190e2be5c2cfe1fbc52f1d39be51155ebbdd2e` |

### Content Declarations

| Field | Value |
| --- | --- |
| `dataSafety.status` | repo-evidence-prepared |
| `dataSafety.dataCollected` | none |
| `dataSafety.dataShared` | none |
| `dataSafety.onDeviceData` | local progress and ending collection only |
| `dataSafety.accountDeletion` | not-applicable-no-account-system |
| `dataSafety.privacyPolicyRequired` | true |
| `dataSafety.evidence` | docs/privacy-and-data-safety.md |
| `dataSafety.consoleStatus` | pending-play-console-submission |
| `contentRating` | 확정 필요 - IARC 및 한국 게임 등급 증빙 필요 |
| `targetAudience` | general-audience-not-children |
| `ads` | no |
| `koreaDistribution` | yes |
| `koreaGameRating` | 확정 필요 - Play Console 또는 게임물관리위원회 증빙 필요 |

### Manual Evidence Fields

| Field | Value |
| --- | --- |
| `androidAppBundle` | 확정 필요 |
| `playConsoleListing` | 확정 필요 |
| `policyQuestionnaire` | 확정 필요 |


## App Store

### Identity

| Field | Value |
| --- | --- |
| bundleId | `com.seorilabs.starlitapprentice` |
| sku | 확정 필요 |
| primaryLocale | `ko-KR` |
| platform | `ios` |
| pricing | `free` |
| deviceFamilies | iphone, ipad |
| category | Games / Simulation / Role Playing |
| privacyPolicyUrl | 확정 필요 |
| supportUrl | 확정 필요 |
| marketingUrl | 확정 필요 |

### Contact

| Field | Value |
| --- | --- |
| `firstName` | 확정 필요 |
| `lastName` | 확정 필요 |
| `email` | cs@seorilabs.com |
| `phone` | 확정 필요 |

### Store Listing

#### App name

- `ko-KR`: 별빛 견습생
- `en-US`: Star Apprentice

#### Subtitle

- `ko-KR`: 픽셀 육성 시뮬
- `en-US`: Pixel life sim

#### Promotional text

- `ko-KR`: 한 달 4주 일정을 정하고 견습생의 미래를 만들어 보세요.
- `en-US`: Plan each month and guide an apprentice toward one of many futures.

#### Description

- `ko-KR`: 별빛 견습생은 한 달 4주 일정을 정해 견습생의 능력과 미래를 만들어 가는 픽셀 육성 시뮬레이션 게임입니다.<br><br>공부, 일, 휴식, 외출을 조합해 12개월을 보내고, 선택의 누적 결과에 따라 서로 다른 엔딩을 확인합니다. 모든 진행은 기기 안에 저장되며, 초기 버전에는 로그인, 결제, 서버 저장, 광고 SDK가 포함되지 않습니다.<br><br>주요 특징<br>- 월마다 4주 일정을 선택하는 간결한 육성 루프<br>- 지성, 감성, 예법, 기술, 체력, 평판 등 14가지 능력과 골드, 기력, 스트레스 자원 변화<br>- 성장 방향에 따라 달라지는 30가지 엔딩<br>- 짧은 세션으로 진행할 수 있는 모바일 중심 UI<br>- 오프라인에서도 유지되는 로컬 저장 기반 진행
- `en-US`: Star Apprentice is a pixel life simulation game where you choose four weekly activities each month and guide an apprentice toward a future.<br><br>Balance study, work, rest, and outings across 12 months. Your accumulated choices change the apprentice's 14 growth stats and resources, then lead to different endings. The first version stores progress on the device and does not include login, payments, server saves, or production ad SDKs.<br><br>Features<br>- A compact monthly planning loop with four weekly choices<br>- Changes across 14 growth stats plus gold, energy, and stress resources<br>- 30 endings shaped by long-term growth choices<br>- Mobile-first screens designed for short play sessions<br>- Local save progress that remains available offline

#### Keywords

- `ko-KR`: 육성,시뮬레이션,픽셀,엔딩,캐주얼,선택
- `en-US`: life sim,pixel,simulation,endings,casual,choice

#### What's new

- `ko-KR`: 초기 출시 후보입니다. 12개월 육성 루프와 30가지 엔딩을 포함합니다.
- `en-US`: Initial release candidate with a 12-month growth loop and 30 endings.

### Assets

| Asset | Path |
| --- | --- |
| App Store icon 1024 x 1024 | `app-store/assets/starlit-apprentice-store-icon-1024.png` |
| iPhone 6.9 screenshot 1 | `app-store/screenshots/iphone-6-9/starlit-apprentice-start-1290x2796.png` |
| iPhone 6.9 screenshot 2 | `app-store/screenshots/iphone-6-9/starlit-apprentice-main-1290x2796.png` |
| iPhone 6.9 screenshot 3 | `app-store/screenshots/iphone-6-9/starlit-apprentice-schedule-1290x2796.png` |
| iPhone 6.9 screenshot 4 | `app-store/screenshots/iphone-6-9/starlit-apprentice-result-1290x2796.png` |
| iPad 13 screenshot 1 | `app-store/screenshots/ipad-13/starlit-apprentice-start-2048x2732.png` |
| iPad 13 screenshot 2 | `app-store/screenshots/ipad-13/starlit-apprentice-main-2048x2732.png` |
| iPad 13 screenshot 3 | `app-store/screenshots/ipad-13/starlit-apprentice-schedule-2048x2732.png` |
| iPad 13 screenshot 4 | `app-store/screenshots/ipad-13/starlit-apprentice-result-2048x2732.png` |

### Local Artifact

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| iOS unsigned .app | `apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app` | `8220090b068b70b26d5e66750a0f9be8b86f86cfbf7613188dc50d5f765cb5f1` |

### Review Declarations

| Field | Value |
| --- | --- |
| `ageRating` | 확정 필요 - App Store Connect 연령 등급 설문 입력 필요 |
| `privacyNutritionLabels.status` | repo-evidence-prepared |
| `privacyNutritionLabels.appPrivacyLabel` | Data Not Collected |
| `privacyNutritionLabels.dataCollected` | none |
| `privacyNutritionLabels.tracking` | no |
| `privacyNutritionLabels.thirdPartyPartnerCollection` | none |
| `privacyNutritionLabels.evidence` | docs/privacy-and-data-safety.md |
| `privacyNutritionLabels.consoleStatus` | pending-app-store-connect-submission |
| `exportCompliance.status` | repo-evidence-prepared |
| `exportCompliance.usesNonExemptEncryption` | false |
| `exportCompliance.infoPlistKey` | ITSAppUsesNonExemptEncryption=false |
| `exportCompliance.evidence` | docs/app-store-release.md |
| `exportCompliance.consoleStatus` | pending-app-store-connect-confirmation |
| `contentRights` | owns-or-has-rights |
| `advertisingIdentifier` | no |

### Review Notes

| Field | Value |
| --- | --- |
| `position` | Bundled Capacitor game. It is not a remote website wrapper and does not download executable game code after review. |
| `flow` | Launch app, Tap 새로 시작, Select four weekly actions, Advance through 12 months, Confirm ending card and collection |


## Unresolved Fields

- AppsInToss: `manualEvidence.consoleGameCategoryAndExposure` = 확정 필요
- AppsInToss: `manualEvidence.gameRatingEvidence` = 확정 필요
- AppsInToss: `manualEvidence.aitBundleUpload` = 확정 필요
- AppsInToss: `manualEvidence.qrTossAppTest` = 확정 필요
- AppsInToss: `manualEvidence.deploymentApproval` = 확정 필요
- Google Play: `privacyPolicyUrl` = 확정 필요
- Google Play: `contentDeclarations.contentRating` = 확정 필요 - IARC 및 한국 게임 등급 증빙 필요
- Google Play: `contentDeclarations.koreaGameRating` = 확정 필요 - Play Console 또는 게임물관리위원회 증빙 필요
- Google Play: `manualEvidence.androidAppBundle` = 확정 필요
- Google Play: `manualEvidence.playConsoleListing` = 확정 필요
- Google Play: `manualEvidence.policyQuestionnaire` = 확정 필요
- App Store: `sku` = 확정 필요
- App Store: `contact.firstName` = 확정 필요
- App Store: `contact.lastName` = 확정 필요
- App Store: `contact.phone` = 확정 필요
- App Store: `privacyPolicyUrl` = 확정 필요
- App Store: `supportUrl` = 확정 필요
- App Store: `marketingUrl` = 확정 필요
- App Store: `reviewDeclarations.ageRating` = 확정 필요 - App Store Connect 연령 등급 설문 입력 필요

## Invalid Public URL Fields

- none
