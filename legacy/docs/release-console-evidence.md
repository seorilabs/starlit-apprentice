# Release Console Evidence

This document records the account-bound release gates that cannot be proven from local packages alone.

## Source Of Truth

- Evidence file: `qa/release-console-evidence.json`
- Handoff packet: `qa/release-console-packet.md`
- Checker: `pnpm check:release-console`
- Strict checker: `pnpm check:release-console:strict`
- Artifact binding: `qa/release-artifact-manifest.json`

`pnpm check:release-console` validates the evidence schema, current artifact-manifest binding, placeholder/internal URL rejection, and prerequisite ordering while allowing incomplete console items as manual blockers. `pnpm check:release-console:strict` intentionally fails until every item is marked `passed` with concrete console evidence.

`pnpm release:console-packet` generates `qa/release-console-packet.md` from the current artifact manifest and console evidence list. Use that packet as the console submission runbook; it includes artifact hashes, open console items, dependency rules, target-specific console paths, and evidence field snippets. `pnpm check:release-console-packet` fails if the packet is stale.

For fixture validation, `pnpm check:release-console` supports `RELEASE_CONSOLE_EVIDENCE_PATH` and `RELEASE_ARTIFACT_MANIFEST_PATH`. Use those override paths only for checker tests; release-candidate evidence still comes from `qa/release-console-evidence.json` bound to the current `qa/release-artifact-manifest.json` `manualQaBuildId`.

## Required Items

| ID | Target | Release impact |
| --- | --- | --- |
| `apps-in-toss-ait-upload` | AppsInToss | Required before AppsInToss review request |
| `apps-in-toss-qr-preview` | AppsInToss | Required before AppsInToss review request and target-device QA closure |
| `apps-in-toss-category-exposure` | AppsInToss | Required before AppsInToss review request |
| `apps-in-toss-game-rating` | AppsInToss | Required for game app review |
| `apps-in-toss-deployment-approval` | AppsInToss | Required before production publish |
| `google-play-signed-aab-upload` | Google Play | Required before Play track rollout |
| `google-play-content-rating` | Google Play | Required before Play submission |
| `google-play-korea-game-rating` | Google Play | Required when Korea game distribution needs rating evidence |
| `google-play-data-safety` | Google Play | Required before Play submission |
| `google-play-track-preview` | Google Play | Required before rollout approval |
| `app-store-signed-build-upload` | App Store | Required before App Review submission |
| `app-store-age-rating` | App Store | Required before App Review submission |
| `app-store-privacy-export` | App Store | Required before App Review submission |
| `app-store-review-metadata` | App Store | Required before final review submission |

## Dependency Rules

These items cannot be marked `passed` until every prerequisite row is already `passed`:

| Item | Prerequisites |
| --- | --- |
| `apps-in-toss-qr-preview` | `apps-in-toss-ait-upload` |
| `apps-in-toss-deployment-approval` | `apps-in-toss-ait-upload`, `apps-in-toss-qr-preview`, `apps-in-toss-category-exposure`, `apps-in-toss-game-rating` |
| `google-play-track-preview` | `google-play-signed-aab-upload`, `google-play-content-rating`, `google-play-korea-game-rating`, `google-play-data-safety` |
| `app-store-review-metadata` | `app-store-signed-build-upload`, `app-store-age-rating`, `app-store-privacy-export` |

## Evidence Rules

An item can be marked `passed` only after `verifiedAt`, `verifier`, `accountOrWorkspace`, `buildArtifact`, `submissionReference`, `result`, `attachments`, and `notes` are filled with concrete values. `verifiedAt` must be an ISO date or timestamp, `evidence.result` must be `passed`, and `buildArtifact` must start with the current `manualQaBuildId` plus `; ` followed by the uploaded artifact or selected console build reference.

For every `passed` or `failed` item, `evidence.attachments` must include at least one concrete screenshot, recording, or console reference. Local screenshot and recording paths must be repo-relative files that exist at check time. Screenshot paths must end in `.png`, `.jpg`, `.jpeg`, or `.webp`; recording paths must end in `.mp4`, `.mov`, or `.webm`. HTTPS URLs are allowed for externally hosted captures only when they are public, credential-free, non-placeholder URLs; credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, `.local`, `.test`, `.invalid`, `.example`, and `example.com`-family URLs are rejected. `consoleReferences` must be stable console/build references rather than placeholder prose.

```json
"evidence": {
  "verifiedAt": "2026-06-18T18:00:00+09:00",
  "verifier": "<name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "<manualQaBuildId>; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["qa/console-evidence/<target>/<item-id>.png"],
    "recordings": [],
    "consoleReferences": ["<console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

Do not mark an item `passed` from local build output, Playwright, or reviewer intent alone. Console evidence must come from AppsInToss Developer Center, Google Play Console, App Store Connect, TestFlight, or the actual store review/upload surface.

`buildArtifact` must not use the local Android QA APK, local unsigned/upload AAB, local unsigned iOS `.app`, or local AppsInToss candidate ZIP as console proof. AppsInToss `.ait` can identify the uploaded package only when it is paired with a stable Developer Center upload, QR/test-scheme, review, or deployment reference.

Every passed item must include a target-specific console reference in `buildArtifact`, `submissionReference`, or `attachments.consoleReferences`: Play Console signed upload/build/questionnaire/track references for Google Play, App Store Connect/TestFlight signed build/rating/privacy/review references for App Store, and AppsInToss Developer Center upload/QR/test-scheme/category/rating/deployment references for AppsInToss. If any of those reference fields use an HTTPS URL, it must be a public, credential-free, non-placeholder URL from the relevant console or hosted evidence surface.

Before console submission, regenerate release artifacts and both handoff packets:

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
pnpm check:release-console
```

## Current Status

All console evidence is still pending. This is expected while the repo is in local QA state, but strict release readiness must keep failing until the evidence file is completed.
