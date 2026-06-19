# Release Approval Packet

This file is generated from release artifacts, manual QA evidence, console evidence, store configs, and `qa/release-approval-evidence.json`.

It is the final human approval handoff. It does not grant release by itself.

## Build Identity

| Field | Value |
| --- | --- |
| App | `starlit-apprentice` |
| Version | `0.1.0` |
| Manifest generated | `2026-06-19T08:36:09.203Z` |
| Manual QA build ID | `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc` |
| AppsInToss .ait SHA-256 | `c1433d482ce9c92bacb4cdc71d4b173913d7bd8cc16d25b8f35bc1cc9e7957d9` |

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
pnpm check:manual-qa:strict
pnpm release:console-packet
pnpm check:release-console-packet
pnpm check:release-console
pnpm check:release-console:strict
pnpm release:store-submission-packet
pnpm check:store-submission-packet
pnpm check:store-config:strict
pnpm release:gate-dashboard
pnpm check:release-gate-dashboard
pnpm release:approval-packet
pnpm check:release-approval-packet
pnpm check:release-approval
pnpm check:release:automated
```

Fixture validation can override the evidence and config sources with `RELEASE_APPROVAL_EVIDENCE_PATH`, `RELEASE_ARTIFACT_MANIFEST_PATH`, `MANUAL_QA_EVIDENCE_PATH`, `RELEASE_CONSOLE_EVIDENCE_PATH`, `APPS_IN_TOSS_CONFIG_PATH`, `GOOGLE_PLAY_CONFIG_PATH`, and `APP_STORE_CONFIG_PATH`. When approval is `approved`, `pnpm check:release-approval` passes these override paths through to the strict prerequisite checkers.

## Prerequisite Summary

| Gate | State | Open items |
| --- | --- | --- |
| Manual target-device QA | `5 item open / 12 target open` | target-device-pacing/Google Play, target-device-pacing/App Store, target-device-pacing/AppsInToss, target-device-readability/Google Play, target-device-readability/App Store, target-device-readability/AppsInToss, native-share/Google Play, native-share/App Store, native-webview-back-reload/Google Play, native-webview-back-reload/App Store, native-webview-back-reload/AppsInToss, apps-in-toss-preview/AppsInToss |
| Release console evidence | `14 open` | apps-in-toss-ait-upload, apps-in-toss-qr-preview, apps-in-toss-category-exposure, apps-in-toss-game-rating, apps-in-toss-deployment-approval, google-play-signed-aab-upload, google-play-content-rating, google-play-korea-game-rating, google-play-data-safety, google-play-track-preview, app-store-signed-build-upload, app-store-age-rating, app-store-privacy-export, app-store-review-metadata |
| Store unresolved fields | `19 open` | AppsInToss: `manualEvidence.consoleGameCategoryAndExposure`<br>AppsInToss: `manualEvidence.gameRatingEvidence`<br>AppsInToss: `manualEvidence.aitBundleUpload`<br>AppsInToss: `manualEvidence.qrTossAppTest`<br>AppsInToss: `manualEvidence.deploymentApproval`<br>Google Play: `privacyPolicyUrl`<br>Google Play: `contentDeclarations.contentRating`<br>Google Play: `contentDeclarations.koreaGameRating`<br>Google Play: `manualEvidence.androidAppBundle`<br>Google Play: `manualEvidence.playConsoleListing`<br>Google Play: `manualEvidence.policyQuestionnaire`<br>App Store: `sku`<br>App Store: `contact.firstName`<br>App Store: `contact.lastName`<br>App Store: `contact.phone`<br>App Store: `privacyPolicyUrl`<br>App Store: `supportUrl`<br>App Store: `marketingUrl`<br>App Store: `reviewDeclarations.ageRating` |
| Store invalid public URL fields | `clear` | none |
| Final release approval | `pending` | approval pending |

## Approval Evidence Rule

Do not set `qa/release-approval-evidence.json` to `approved` until manual QA, every target-specific manual QA evidence entry, console evidence, store metadata fields, store public URLs, and final preview are complete for the intended targets. Store public URLs must be confirmed public HTTPS URLs without username/password credentials, not credentialed URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts. When approval is marked `approved`, `pnpm check:release-approval` reruns `pnpm check:manual-qa:strict`, `pnpm check:release-console:strict`, and `pnpm check:store-config:strict`; final approval is rejected if any prerequisite strict checker fails.

When approving, fill `qa/release-approval-evidence.json` with this shape:

```json
{
  "status": "approved",
  "decision": {
    "approvedAt": "2026-06-18T18:00:00+09:00",
    "approver": "<approver name>",
    "manualQaBuildId": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc",
    "targetsApproved": ["AppsInToss", "Google Play", "App Store"],
    "decision": "approved",
    "releaseAction": "submit-review",
    "attachments": {
      "screenshots": ["qa/release-approval/<approval-screenshot>.png"],
      "recordings": [],
      "consoleReferences": ["<stable approval reference>"]
    },
    "notes": "<short concrete approval note>"
  }
}
```

Allowed `releaseAction` values:

- `submit-review`
- `publish-production`
- `rollout-internal-test`

Local screenshot and recording paths must exist in the repo when checked. HTTPS URLs are allowed for externally hosted captures, but they must be real public HTTPS URLs without username/password credentials; credentialed URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, and placeholder hosts such as `example.com` are rejected for approval screenshots, recordings, and console references. Console references must be stable final approval, review, submission, rollout, deployment, or console references, not placeholder prose. Do not use repo-local generated packets, local build artifacts, source/config files, Playwright output, or placeholder URLs such as `example.com` as final approval evidence.

## Stop Rules

- Do not submit review, publish production, or start rollout while this approval status is not `approved`.
- Do not approve a stale build ID; `decision.manualQaBuildId` must equal `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc`.
- Do not approve while any manual QA item, manual QA target evidence entry, console evidence item, or store config field is still unresolved.
- Do not approve while any store public URL field uses non-HTTPS, username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts such as `example.com`.
- Do not approve unless `pnpm check:manual-qa:strict`, `pnpm check:release-console:strict`, and `pnpm check:store-config:strict` all pass.
- Do not use this file as a substitute for Play Console, App Store Connect, or AppsInToss console evidence.
