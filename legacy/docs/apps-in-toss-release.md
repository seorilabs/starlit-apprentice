# AppsInToss Release

This document is the repo-local source of truth for AppsInToss release readiness.

## Current Documentation Evidence

Checked on 2026-06-18 with AppsInToss Developer Center docs:

- A release review request should happen after final testing in the Toss app.
- App bundles are `.ait` files, and the unpacked bundle size policy is 100MB or less.
- Uploading a bundle creates a test scheme / QR code, and at least one Toss-app test must be completed before review request.
- Non-game apps require at least one app feature; this app is classified as a game, so feature registration is tracked as optional.
- Game apps require game rating evidence from an open-market self-rating/store URL or a Game Rating and Administration Committee certificate.
- WebView apps should disable pinch zoom unless the service requires zoom-like map behavior.
- External app install prompts and unsupported external-link flows can trigger operation/review issues.

Source URLs:

- `https://developers-apps-in-toss.toss.im/development/deploy.md`
- `https://developers-apps-in-toss.toss.im/development/test/toss.md`
- `https://developers-apps-in-toss.toss.im/prepare/console-workspace.md`
- `https://developers-apps-in-toss.toss.im/development/test/function.md`
- `https://developers-apps-in-toss.toss.im/bedrock/reference/framework/속성`
- `https://developers-apps-in-toss.toss.im/checklist/miniapp-external-link.md`

## Current Package State

| Item | Value |
| --- | --- |
| appName | `starlit-apprentice` |
| app type | game |
| entry route | `/` |
| app feature | optional for this game; candidate `intoss://starlit-apprentice/` |
| Vite dist source | `apps/starlit-apprentice/dist` |
| filtered runtime source | `apps-in-toss/build/webview-dist` |
| static candidate archive | `apps-in-toss/build/starlit-apprentice-webview-candidate.zip` |
| uploadable `.ait` | `apps-in-toss/build/starlit-apprentice.ait` |
| AIT build outDir | `apps/starlit-apprentice/ait-dist` |
| size gate | unpacked candidate <= 100MB |

## WebView Policy Evidence

- `apps/starlit-apprentice/index.html` disables pinch zoom with `maximum-scale=1, user-scalable=no`.
- `apps/starlit-apprentice/index.html` includes a CSP that keeps scripts and runtime connections self-only, blocks object/frame/media/form surfaces, and allows only bundled/data/blob image use.
- `apps/starlit-apprentice/granite.config.ts` declares `webViewProps.type = "game"`, disables pull-to-refresh/bounce/back-forward gestures, and builds AppsInToss output into `ait-dist` so the Capacitor `dist` remains a normal Vite bundle after candidate generation.
- The app is self-contained: no login, payment, server save, production ad SDK, external app install prompt, unsupported external link, iframe, or runtime network API.
- The static candidate archive filters out registration-only logo, thumbnail, and screenshot assets so the runtime bundle contains only files needed to run the mini-app.
- `pnpm check:apps-in-toss` scans app source for blocked external-link/network patterns.
- `pnpm check:webview-security` verifies source and production `dist/index.html` CSP plus the Capacitor local-bundle boundary.

## Commands

```bash
pnpm build:apps-in-toss:ait
pnpm build:apps-in-toss:candidate
pnpm check:webview-security
pnpm check:apps-in-toss
pnpm check:apps-in-toss:strict
```

`pnpm check:apps-in-toss` allows manual blockers and is suitable for local QA. `pnpm check:apps-in-toss:strict` intentionally fails until AppsInToss console upload, QR/Toss-app test, category/exposure, game rating, and deployment approval gates are completed.

The strict checker reads `apps-in-toss/apps-in-toss.config.json` and `qa/release-console-evidence.json`. Fixture validation can override those sources with `APPS_IN_TOSS_CONFIG_PATH` and `RELEASE_CONSOLE_EVIDENCE_PATH`. AppsInToss strict readiness clears only when the AppsInToss `manualEvidence` fields are concrete and the corresponding release console evidence items are `passed`.

`pnpm build:apps-in-toss:candidate` writes a deterministic static WebView ZIP by sorting archive entries, removing ZIP extra metadata, and normalizing copied file timestamps before compression. It also runs `ait build`, copies the generated `.ait` to `apps-in-toss/build/starlit-apprentice.ait`, and rebuilds the normal Vite `dist` afterward so Capacitor packaging and manifest hashing still see the standard web bundle. Both the ZIP and `.ait` are included in `qa/release-artifact-manifest.json` so target-device or AppsInToss preview evidence can refer to stable SHA-256 artifacts.

## Third-Party/License Note

The local `.ait` is produced with the official `@apps-in-toss/web-framework@2.9.1` CLI. The installed package has no `license` metadata and ships a GPL-3.0 `LICENSE` file, so this SDK/runtime notice should be reviewed before a production submission. This is tracked as release documentation evidence rather than a gameplay blocker.

## Remaining Manual Gates

- Upload `apps-in-toss/build/starlit-apprentice.ait` in AppsInToss Console or through `ait deploy`.
- Complete QR/Toss-app test at least once before review request.
- Confirm game category and exposure fields in the console.
- Submit game rating evidence.
- Obtain deployment approval before production release.
