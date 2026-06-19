# Manual QA Handoff Packet

This file is generated from `qa/release-artifact-manifest.json` and `qa/manual-qa-evidence.json`.

## Build Identity

| Field | Value |
| --- | --- |
| App | `starlit-apprentice` |
| Version | `0.1.0` |
| Manifest generated | `2026-06-19T08:36:09.203Z` |
| Manual QA build ID | `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc` |
| Evidence source | `qa/manual-qa-evidence.json` |

## Artifact Fingerprints

| Artifact | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
| Vite dist | `apps/starlit-apprentice/dist` | 150 KiB / 3 files | `cb181a5a20f5ef598df2f9441d2128bd16aa50e56370c0339058271bd7adb583` |
| Android QA APK | `apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk` | 4.21 MiB | `4d6f56e0d303c10bc391daf458478f356afbd25548419c08d68a8f29125672ce` |
| Android AAB | `apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab` | 2.96 MiB | `607cae595c19ba0254aac04e3f190e2be5c2cfe1fbc52f1d39be51155ebbdd2e` |
| iOS .app | `apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app` | 2.22 MiB / 26 files | `8220090b068b70b26d5e66750a0f9be8b86f86cfbf7613188dc50d5f765cb5f1` |
| AppsInToss ZIP | `apps-in-toss/build/starlit-apprentice-webview-candidate.zip` | 39 KiB | `0e043fe9a11ee28bc0f78f4e253f2af9b9a129e2bf20347f286819e7b89fc9c9` |
| AppsInToss .ait | `apps-in-toss/build/starlit-apprentice.ait` | 3.55 MiB | `c1433d482ce9c92bacb4cdc71d4b173913d7bd8cc16d25b8f35bc1cc9e7957d9` |

## Artifact Use Matrix

| Target | Use for manual QA | Do not use as proof |
| --- | --- | --- |
| Google Play | `apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk` for Android target-device QA, or a stable Play Console installed build reference after upload | Local unsigned/upload AAB alone; it is not a target-device run, including `native-share` |
| App Store | TestFlight, signed device install, or stable App Store Connect build reference after Apple Distribution upload | Local unsigned `apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app` alone |
| AppsInToss | `apps-in-toss/build/starlit-apprentice.ait` plus AppsInToss console QR/test-scheme reference | Local `.ait` alone or local Vite preview alone |

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
pnpm check:manual-qa
```

## Evidence Rule

For every passed target in `qa/manual-qa-evidence.json`, set the matching `targetEvidence[]` entry to `passed` and set `buildArtifact` to this format:

```text
sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested platform artifact path or store/TestFlight/AppsInToss build reference>
```

Do not mark an item `passed` until every `targetEvidence[]` entry for that item is `passed`. Do not pass Google Play target-device QA from the local upload AAB alone, App Store target-device QA from the local unsigned iOS `.app`, or AppsInToss QA from local `.ait`/Vite preview alone. Target-device or console evidence is still required, and `pnpm check:manual-qa` enforces the current Manual QA build ID prefix plus at least one screenshot, recording, or console reference attachment for every passed or failed target. Local screenshot and recording paths must exist in the repo when checked; HTTPS URLs are allowed for externally hosted captures only when they are public, credential-free, non-placeholder URLs. Credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, `.local`, `.test`, `.invalid`, `.example`, and `example.com`-family URLs are rejected in manual QA evidence URL fields. For `native-share`, every passed target must also record `receivedShareUrl` with the actual recipient URL, and `pnpm check:manual-qa` rejects credentialed, non-public, non-HTTPS, non-canonical, unknown-ending, or hash-bearing ending URLs.

## Open Manual Items

- `target-device-pacing`
- `target-device-readability`
- `native-share`
- `native-webview-back-reload`
- `apps-in-toss-preview`

## Open Manual Targets

- `target-device-pacing/Google Play`
- `target-device-pacing/App Store`
- `target-device-pacing/AppsInToss`
- `target-device-readability/Google Play`
- `target-device-readability/App Store`
- `target-device-readability/AppsInToss`
- `native-share/Google Play`
- `native-share/App Store`
- `native-webview-back-reload/Google Play`
- `native-webview-back-reload/App Store`
- `native-webview-back-reload/AppsInToss`
- `apps-in-toss-preview/AppsInToss`

## Test Items

### target-device-pacing

| Field | Value |
| --- | --- |
| Title | Target-device 1-month and 3-month pacing feel |
| Targets | `Google Play`, `App Store`, `AppsInToss` |
| Current status | `pending` |

Target evidence:

| Target | Status | Build artifact | Attachments |
| --- | --- | --- | ---: |
| Google Play | `pending` | `확정 필요` | 0 |
| App Store | `pending` | `확정 필요` | 0 |
| AppsInToss | `pending` | `확정 필요` | 0 |

Acceptance:

- A new player can understand the first month goal without external instructions.
- The first month has no stalled or confusing schedule state.
- The first three months feel readable and do not create obvious resource exhaustion.

Suggested target-device path:

- Install or open the build tied to the Manual QA build ID above.
- Start from a clean save unless the item explicitly tests reload or resume behavior.
- Record device model, OS version, tested build reference, and notable screen observations.
- Tap `새로 시작` and confirm the first-month goal is understandable without external instructions.
- Select four weekly actions and verify the schedule readiness copy changes from 0/4 to ready.
- Advance through month 1, then continue to month 3 with a balanced mix of lesson, work, rest, and outing.
- Confirm there is no stalled state, obvious resource exhaustion, or confusing month transition.

Deterministic route cue:

Use this exact route when checking the 1-month and 3-month pacing feel. It is the same guided-balanced path protected by `pnpm check:pacing`.

| Month | Week 1 | Week 2 | Week 3 | Week 4 |
| --- | --- | --- | --- | --- |
| 1 | 별빛학 (`star-lore`) | 문장학 (`letters`) | 집에서 쉬기 (`home-rest`) | 공원 (`park`) |
| 2 | 음악 (`music`) | 예법 (`manners`) | 집에서 쉬기 (`home-rest`) | 광장 (`plaza`) |
| 3 | 공예 (`crafts`) | 찻집 서빙 (`tea-service`) | 집에서 쉬기 (`home-rest`) | 도서관 보조 (`library-help`) |

Expected local guardrail from automation: month 3 reaches month 4 schedule selection, keeps resources healthy, surfaces at least one event, and points toward `mentor`.

Target evidence fields to fill:

```json
{
  "targetEvidence": [
    {
      "target": "Google Play",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested Google Play artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    },
    {
      "target": "App Store",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested App Store artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    },
    {
      "target": "AppsInToss",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested AppsInToss artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    }
  ]
}
```

### target-device-readability

| Field | Value |
| --- | --- |
| Title | Target-device event and ending readability |
| Targets | `Google Play`, `App Store`, `AppsInToss` |
| Current status | `pending` |

Target evidence:

| Target | Status | Build artifact | Attachments |
| --- | --- | --- | ---: |
| Google Play | `pending` | `확정 필요` | 0 |
| App Store | `pending` | `확정 필요` | 0 |
| AppsInToss | `pending` | `확정 필요` | 0 |

Acceptance:

- Event copy, effect deltas, ending title, ending body, and ending evidence are readable on target hardware.
- No important text is clipped, hidden behind native chrome, or too small to read.
- Scrolling remains predictable after reload and back navigation.

Suggested target-device path:

- Install or open the build tied to the Manual QA build ID above.
- Start from a clean save unless the item explicitly tests reload or resume behavior.
- Record device model, OS version, tested build reference, and notable screen observations.
- Reach a month-end event result and inspect event body plus effect delta readability.
- Reach an ending screen or open a shared ending URL.
- Inspect ending title, body, and ending evidence on the physical screen.
- Use native back/reload once and confirm scrolling remains predictable and text is not clipped.

Deterministic route cue:

Use this one-month event route when checking event copy and delta readability. For ending readability without a full playthrough, open the same test host with `?ending=scholar` and still capture target-device evidence.

| Month | Week 1 | Week 2 | Week 3 | Week 4 |
| --- | --- | --- | --- | --- |
| 1 | 별빛학 (`star-lore`) | 문장학 (`letters`) | 집에서 쉬기 (`home-rest`) | 공원 (`park`) |

Target evidence fields to fill:

```json
{
  "targetEvidence": [
    {
      "target": "Google Play",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested Google Play artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    },
    {
      "target": "App Store",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested App Store artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    },
    {
      "target": "AppsInToss",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested AppsInToss artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    }
  ]
}
```

### native-share

| Field | Value |
| --- | --- |
| Title | Target-device native share sheet and recipient handoff |
| Targets | `Google Play`, `App Store` |
| Current status | `pending` |

Target evidence:

| Target | Status | Build artifact | Attachments |
| --- | --- | --- | ---: |
| Google Play | `pending` | `확정 필요` | 0 |
| App Store | `pending` | `확정 필요` | 0 |

Acceptance:

- The native share sheet opens from an ending screen.
- The shared payload includes title, text, and ending URL.
- The ending URL is public HTTPS, canonical with only one known product ending query parameter, has no hash fragment, and is not a capacitor://, file://, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast range, placeholder domain, or preview-only URL.
- The received ending URL is recorded in targetEvidence[].receivedShareUrl.
- At least one recipient app receives a readable shared message.

Suggested target-device path:

- Install or open the build tied to the Manual QA build ID above.
- Start from a clean save unless the item explicitly tests reload or resume behavior.
- Record device model, OS version, tested build reference, and notable screen observations.
- Reach an ending screen in the Android or iOS shell.
- Tap the share action and confirm the native share sheet appears.
- Send to at least one recipient app.
- Confirm the received payload includes readable title, text, and an ending URL.
- Confirm the ending URL is public HTTPS without username/password credentials, has only one known ending query parameter, has no hash fragment, and is not a capacitor://, file://, credentialed HTTPS URL, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast range, or preview-only URL.

Deterministic route cue:

Use a target-device ending screen. If the tested container exposes the web URL, open `?ending=scholar`; otherwise use an already completed ending save or play to an ending before checking the native share sheet.

Do not pass this item from a `capacitor://localhost`, `file://`, credentialed HTTPS URL, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast range, placeholder domain such as `example.com`, or preview-only shared URL. The received ending URL must be public HTTPS without username/password credentials and canonical with only `?ending=<known-ending-code>`; if the public share origin is not configured yet, keep this item pending.

Target evidence fields to fill:

```json
{
  "targetEvidence": [
    {
      "target": "Google Play",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested Google Play artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>",
      "receivedShareUrl": "https://<confirmed-domain>/starlit-apprentice/?ending=<known-ending-code>"
    },
    {
      "target": "App Store",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested App Store artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>",
      "receivedShareUrl": "https://<confirmed-domain>/starlit-apprentice/?ending=<known-ending-code>"
    }
  ]
}
```

### native-webview-back-reload

| Field | Value |
| --- | --- |
| Title | Target-device WebView back and reload behavior |
| Targets | `Google Play`, `App Store`, `AppsInToss` |
| Current status | `pending` |

Target evidence:

| Target | Status | Build artifact | Attachments |
| --- | --- | --- | ---: |
| Google Play | `pending` | `확정 필요` | 0 |
| App Store | `pending` | `확정 필요` | 0 |
| AppsInToss | `pending` | `확정 필요` | 0 |

Acceptance:

- Native back returns from schedule, collection, and ending screens without corrupting progress.
- Reload or app resume after a completed month advances correctly instead of replaying the same slot.
- No native chrome or safe-area behavior blocks primary actions.

Suggested target-device path:

- Install or open the build tied to the Manual QA build ID above.
- Start from a clean save unless the item explicitly tests reload or resume behavior.
- Record device model, OS version, tested build reference, and notable screen observations.
- Use native back from schedule, collection, and ending screens.
- Complete a month, stop on the result screen before tapping next month, then reload or background/resume.
- Confirm continuing advances to the correct next month or ending without replaying the same slot.
- Confirm native safe areas and chrome do not block primary actions.

Deterministic route cue:

Use this exact first-month route before testing reload or app resume from the month-complete result screen.

| Month | Week 1 | Week 2 | Week 3 | Week 4 |
| --- | --- | --- | --- | --- |
| 1 | 별빛학 (`star-lore`) | 문장학 (`letters`) | 집에서 쉬기 (`home-rest`) | 공원 (`park`) |

Target evidence fields to fill:

```json
{
  "targetEvidence": [
    {
      "target": "Google Play",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested Google Play artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    },
    {
      "target": "App Store",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested App Store artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    },
    {
      "target": "AppsInToss",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested AppsInToss artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    }
  ]
}
```

### apps-in-toss-preview

| Field | Value |
| --- | --- |
| Title | AppsInToss QR/Toss-app preview |
| Targets | `AppsInToss` |
| Current status | `pending` |

Target evidence:

| Target | Status | Build artifact | Attachments |
| --- | --- | --- | ---: |
| AppsInToss | `pending` | `확정 필요` | 0 |

Acceptance:

- The app is opened through the AppsInToss QR/Toss-app preview path at least once.
- The first-run, schedule, result, ending, and collection screens render in the Toss WebView.
- Toss WebView back/reload behavior does not break saved progress.

Suggested target-device path:

- Install or open the build tied to the Manual QA build ID above.
- Start from a clean save unless the item explicitly tests reload or resume behavior.
- Record device model, OS version, tested build reference, and notable screen observations.
- Open the app through the AppsInToss QR/Toss-app preview path.
- Visit first-run, schedule, result, ending, and collection screens.
- Use Toss WebView back/reload controls where available.
- Confirm saved progress remains intact and no Toss chrome blocks primary controls.

Deterministic route cue:

Use this exact first-month route inside the Toss preview, then visit collection and shared ending states if the preview URL supports `?ending=scholar`.

| Month | Week 1 | Week 2 | Week 3 | Week 4 |
| --- | --- | --- | --- | --- |
| 1 | 별빛학 (`star-lore`) | 문장학 (`letters`) | 집에서 쉬기 (`home-rest`) | 공원 (`park`) |

Target evidence fields to fill:

```json
{
  "targetEvidence": [
    {
      "target": "AppsInToss",
      "status": "passed",
      "testedAt": "<ISO timestamp or local time with timezone>",
      "tester": "<tester name>",
      "device": "<device model>",
      "osVersion": "<OS and app container version>",
      "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <tested AppsInToss artifact/reference>",
      "result": "passed",
      "attachments": {
        "screenshots": [
          "<path or URL to target-device screenshot>"
        ],
        "recordings": [],
        "consoleReferences": []
      },
      "notes": "<short concrete observation>"
    }
  ]
}
```
