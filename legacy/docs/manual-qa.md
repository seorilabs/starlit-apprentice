# Manual QA Evidence

This document records the target-device QA gate that cannot be fully proven by Playwright, Vite preview, or local package checks.

## Source Of Truth

- Evidence file: `qa/manual-qa-evidence.json`
- Handoff packet: `qa/manual-qa-packet.md`
- Checker: `pnpm check:manual-qa`
- Strict checker: `pnpm check:manual-qa:strict`

`pnpm check:manual-qa` validates the evidence schema, current artifact-manifest binding, target-specific evidence coverage, placeholder/internal URL rejection, and root status while allowing incomplete target-device items as manual blockers. `pnpm check:manual-qa:strict` intentionally fails until every item and every target-specific evidence entry is marked `passed` with concrete evidence.

For fixture validation, `pnpm check:manual-qa` supports `MANUAL_QA_EVIDENCE_PATH` and `RELEASE_ARTIFACT_MANIFEST_PATH`. Use those override paths only for checker tests; release-candidate evidence still comes from `qa/manual-qa-evidence.json` bound to the current `qa/release-artifact-manifest.json` `manualQaBuildId`.

## Required Items

| ID | Scope | Release impact |
| --- | --- | --- |
| `target-device-pacing` | 1-month and 3-month subjective pacing on target hardware | Required before release-candidate claim |
| `target-device-readability` | Event/ending copy and evidence readability on target hardware | Required before release-candidate claim |
| `native-share` | Native share sheet and recipient handoff | Required for Google Play/App Store |
| `native-webview-back-reload` | Native WebView back/reload/app-resume behavior | Required before release-candidate claim |
| `apps-in-toss-preview` | QR/Toss-app preview path | Required before AppsInToss review request |

## Evidence Rules

An item can be marked `passed` only after every `targetEvidence[]` entry for that item is also `passed`. Each target entry must fill `testedAt`, `tester`, `device`, `osVersion`, `buildArtifact`, `result`, `attachments`, and `notes` with concrete values. `testedAt` must be an ISO date or timestamp, `result` must be `passed`, and `buildArtifact` must start with the current `manualQaBuildId` plus `; ` followed by the tested artifact path or external build reference. Keep unresolved values as `확정 필요`.

For every `passed` or `failed` item and target entry, `attachments` must include at least one concrete screenshot, recording, or console reference. Local screenshot and recording paths must be repo-relative files that exist at check time. Screenshot paths must end in `.png`, `.jpg`, `.jpeg`, or `.webp`; recording paths must end in `.mp4`, `.mov`, or `.webm`. HTTPS URLs are allowed for externally hosted captures only when they are public, credential-free, non-placeholder URLs; credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, `.local`, `.test`, `.invalid`, `.example`, and `example.com`-family URLs are rejected. `consoleReferences` must be stable console/build references rather than placeholder prose.

```json
"attachments": {
  "screenshots": ["qa/manual-evidence/<item-id>-<device>-<screen>.png"],
  "recordings": [],
  "consoleReferences": []
}
```

Before target-device testing, regenerate release artifacts and the artifact manifest:

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
pnpm check:manual-qa
```

`pnpm check:release-packages` creates and verifies an Android debug-signed QA APK at `apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk`. `pnpm check:android:qa-apk` compares the APK's bundled `assets/public/*` files against the current Vite dist and rejects stale web assets, sourcemaps, and registration-only images. Use this APK for Android target-device QA only. Play upload still requires the separate signed AAB flow, and the AAB alone is not target-device QA evidence.

The `buildArtifact` field must include the `manualQaBuildId` from `qa/release-artifact-manifest.json` plus the actual tested platform artifact or external console build reference. This ties manual QA evidence to the release artifact hash set, but each target still needs the correct proof source:

- Google Play target-device QA: Android QA APK or a stable Play Console installed build reference. The local upload AAB alone is never target-device QA evidence, including `native-share`.
- App Store target-device QA: TestFlight, signed device install, or stable App Store Connect build reference. The local unsigned iOS `.app` is package evidence only.
- AppsInToss target-device QA: AppsInToss `.ait` plus stable console QR/test-scheme evidence. The local `.ait` alone is package evidence only, and local Vite preview alone is not enough.

For `native-share`, every passed target entry must fill `targetEvidence[].receivedShareUrl` with the actual URL received by the recipient app. The received ending URL must be a public HTTPS URL without username/password credentials and a canonical ending-only link whose `ending` query value is a known `@starlit-apprentice/product-core` ending code, with no extra query parameters or hash fragments; `pnpm check:manual-qa` rejects missing, credentialed, non-public, non-HTTPS, non-canonical, unknown-ending, or hash-bearing received URLs. Do not pass native share evidence from `capacitor://localhost`, `file://`, credentialed HTTPS URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, placeholder domains such as `example.com`, or preview-only URLs; if the public share origin is not configured yet, keep the item pending.

`pnpm release:manual-qa-packet` generates `qa/manual-qa-packet.md` from the current artifact manifest and manual QA item list. Use that packet as the target-device test runbook; it includes artifact hashes, an artifact-use matrix, open manual items, open target evidence entries, suggested device paths, deterministic route cues for repeatable pacing/readability checks, and evidence field snippets with attachment placeholders. `pnpm check:manual-qa-packet` fails if the packet is stale.

The deterministic route cues are generated from `scripts/qa-route-plans.mjs` and product-core action data after rebuilding `@starlit-apprentice/product-core`, so route tables show the exact Korean action label plus action ID that the tester should tap. The 3-month pacing cue shares the same `guided-balanced` route used by `pnpm check:pacing`, preventing the manual QA runbook from drifting away from the automated pacing gate.

Allowed statuses:

- `pending`: not tested yet
- `blocked`: cannot be completed until an external artifact, account, console, or device is available
- `failed`: tested and failed; do not release
- `passed`: tested and accepted with evidence

## Current Status

All target-device evidence is still pending. This is expected while the repo is in local QA state, but strict release readiness must keep failing until the evidence file is completed.
