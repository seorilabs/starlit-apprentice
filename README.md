# starlit-apprentice

별빛 견습생은 한 명의 견습생을 월간 일정으로 키워 1년 뒤 다양한 미래를 여는 픽셀 육성 시뮬레이션 MVP다.

## Stack

- Canvas renderer + Vite + TypeScript
- Capacitor bundled-web shell for Android/iOS
- `packages/product-core` for pure game rules and content data
- LocalStorage for one progress slot and ending collection

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm assets:generate:registration
pnpm assets:generate:stores
pnpm assets:sync:ios-icons
pnpm assets:sync:android-icons
pnpm assets:sync:native-splash
pnpm assets:generate
pnpm build:android:qa-apk
pnpm build:android:aab
pnpm build:ios:release
pnpm build:apps-in-toss:ait
pnpm build:apps-in-toss:candidate
pnpm release:artifact-manifest
pnpm release:manual-qa-packet
pnpm release:console-packet
pnpm release:rating-content-inventory
pnpm release:public-pages
pnpm release:store-submission-packet
pnpm release:gate-dashboard
pnpm release:approval-packet
pnpm check:architecture
pnpm check:assets
pnpm check:store-config
pnpm check:store-config:strict
pnpm check:versioning
pnpm check:webview-security
pnpm check:native-bundle-sync
pnpm check:privacy
pnpm check:analytics-contract
pnpm check:third-party-notices
pnpm check:android:icons
pnpm check:native-splash
pnpm check:android:qa-apk
pnpm check:play
pnpm check:play:local-artifact
pnpm check:play:strict
pnpm check:app-store
pnpm check:app-store:local-artifact
pnpm check:app-store:strict
pnpm check:apps-in-toss
pnpm check:apps-in-toss:strict
pnpm check:manual-qa
pnpm check:manual-qa:strict
pnpm check:release-console-packet
pnpm check:release-console
pnpm check:release-console:strict
pnpm check:rating-content-inventory
pnpm check:public-pages
pnpm check:store-submission-packet
pnpm check:release-gate-dashboard
pnpm check:release-approval-packet
pnpm check:release-approval
pnpm check:release-approval:strict
pnpm check:content
pnpm check:save-contract
pnpm check:target-guidance
pnpm check:balance
pnpm check:pacing
pnpm check:runtime
pnpm check:ui-accessibility
pnpm check:bundle-budget
pnpm check:package
pnpm check:public-url-guard
pnpm check:release-verification-commands
pnpm check:release-manual-blockers
pnpm check:release-artifact-manifest
pnpm check:manual-qa-packet
pnpm check:release-packages
pnpm check:release:automated
pnpm check:release
pnpm test:e2e
pnpm qa
pnpm cap:sync
```

## Boundaries

- No remote game URL wrapper. Store builds must bundle the generated `dist` assets inside the native app.
- No login, payment, server save, sensitive data collection, or production ad SDK in the MVP.
- No direct reuse of existing IP names, characters, UI, events, or endings.
