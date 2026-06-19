# Release Console Handoff Packet

This file is generated from `qa/release-artifact-manifest.json` and `qa/release-console-evidence.json`.

## Build Identity

| Field | Value |
| --- | --- |
| App | `starlit-apprentice` |
| Version | `0.1.0` |
| Manifest generated | `2026-06-19T08:36:09.203Z` |
| Manual QA build ID | `sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc` |
| Console evidence source | `qa/release-console-evidence.json` |

## Artifact Fingerprints

| Artifact | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
| Android QA APK | `apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk` | 4.21 MiB | `4d6f56e0d303c10bc391daf458478f356afbd25548419c08d68a8f29125672ce` |
| Android AAB | `apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab` | 2.96 MiB | `607cae595c19ba0254aac04e3f190e2be5c2cfe1fbc52f1d39be51155ebbdd2e` |
| iOS .app | `apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app` | 2.22 MiB / 26 files | `8220090b068b70b26d5e66750a0f9be8b86f86cfbf7613188dc50d5f765cb5f1` |
| AppsInToss ZIP | `apps-in-toss/build/starlit-apprentice-webview-candidate.zip` | 39 KiB | `0e043fe9a11ee28bc0f78f4e253f2af9b9a129e2bf20347f286819e7b89fc9c9` |
| AppsInToss .ait | `apps-in-toss/build/starlit-apprentice.ait` | 3.55 MiB | `c1433d482ce9c92bacb4cdc71d4b173913d7bd8cc16d25b8f35bc1cc9e7957d9` |

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
pnpm release:console-packet
pnpm check:release-console-packet
pnpm check:release-console
```

## Evidence Rule

For every passed item in `qa/release-console-evidence.json`, set `evidence.result` to `passed` and set `evidence.buildArtifact` to this format:

```text
sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact, selected build, test scheme, review ID, or console reference>
```

Do not mark an item `passed` from local build output, Playwright, or this packet alone. Console evidence must come from AppsInToss Developer Center, Google Play Console, App Store Connect, TestFlight, or the actual store upload/review surface. `buildArtifact` must not use the local Android QA APK, local unsigned/upload AAB, local unsigned iOS `.app`, or local AppsInToss candidate ZIP as console proof. AppsInToss `.ait` can identify the uploaded package only when it is paired with a stable Developer Center upload, QR/test-scheme, review, or deployment reference.

Every passed item must include a target-specific console reference in `buildArtifact`, `submissionReference`, or `attachments.consoleReferences`: Play Console signed upload/build/questionnaire/track references for Google Play, App Store Connect/TestFlight signed build/rating/privacy/review references for App Store, and AppsInToss Developer Center upload/QR/test-scheme/category/rating/deployment references for AppsInToss. `pnpm check:release-console` enforces the current Manual QA build ID prefix plus at least one screenshot, recording, or console reference attachment for every passed or failed item. Local screenshot and recording paths must exist in the repo when checked; HTTPS URLs are allowed for externally hosted captures only when they are public, credential-free, non-placeholder URLs. Credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, `.local`, `.test`, `.invalid`, `.example`, and `example.com`-family URLs are rejected in console evidence URL fields.

## Dependency Rules

These items cannot be marked `passed` until every prerequisite row is already `passed` in `qa/release-console-evidence.json`.

| Item | Prerequisites |
| --- | --- |
| `apps-in-toss-qr-preview` | `apps-in-toss-ait-upload` |
| `apps-in-toss-deployment-approval` | `apps-in-toss-ait-upload`, `apps-in-toss-qr-preview`, `apps-in-toss-category-exposure`, `apps-in-toss-game-rating` |
| `google-play-track-preview` | `google-play-signed-aab-upload`, `google-play-content-rating`, `google-play-korea-game-rating`, `google-play-data-safety` |
| `app-store-review-metadata` | `app-store-signed-build-upload`, `app-store-age-rating`, `app-store-privacy-export` |

## Open Console Items

- `apps-in-toss-ait-upload` (AppsInToss)
- `apps-in-toss-qr-preview` (AppsInToss)
- `apps-in-toss-category-exposure` (AppsInToss)
- `apps-in-toss-game-rating` (AppsInToss)
- `apps-in-toss-deployment-approval` (AppsInToss)
- `google-play-signed-aab-upload` (Google Play)
- `google-play-content-rating` (Google Play)
- `google-play-korea-game-rating` (Google Play)
- `google-play-data-safety` (Google Play)
- `google-play-track-preview` (Google Play)
- `app-store-signed-build-upload` (App Store)
- `app-store-age-rating` (App Store)
- `app-store-privacy-export` (App Store)
- `app-store-review-metadata` (App Store)

## Console Items

### AppsInToss

#### apps-in-toss-ait-upload

| Field | Value |
| --- | --- |
| Title | AppsInToss .ait console upload |
| Target | `AppsInToss` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The locally generated .ait artifact is uploaded to the AppsInToss console.
- The uploaded console artifact is tied to the current manualQaBuildId.
- The generated test scheme or QR reference is recorded.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Upload `apps-in-toss/build/starlit-apprentice.ait` in AppsInToss Developer Center.
- Record the generated test scheme, QR reference, or upload/build ID.
- Confirm the uploaded artifact is the one tied to the current AppsInToss .ait SHA-256.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### apps-in-toss-qr-preview

| Field | Value |
| --- | --- |
| Title | AppsInToss QR/Toss-app preview evidence |
| Target | `AppsInToss` |
| Current status | `pending` |
| Prerequisites | `apps-in-toss-ait-upload` |

Acceptance:

- The app is opened from the generated AppsInToss QR or test scheme.
- The preview reference matches the uploaded .ait artifact.
- The preview evidence is cross-referenced with target-device QA evidence.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Open the generated AppsInToss QR or test scheme in the Toss app.
- Confirm the preview references the uploaded .ait artifact.
- Cross-reference this evidence with `apps-in-toss-preview` in `qa/manual-qa-evidence.json`.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### apps-in-toss-category-exposure

| Field | Value |
| --- | --- |
| Title | AppsInToss game category and exposure settings |
| Target | `AppsInToss` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The AppsInToss console classifies the app as a game.
- Category, exposure, and service metadata are filled with the approved Star Apprentice values.
- No non-game feature registration blocker is introduced for this game-classified app.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Confirm the console classifies the mini app as a game.
- Fill category, exposure, and service metadata using the approved Star Apprentice values.
- Confirm no non-game feature-registration blocker is introduced.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### apps-in-toss-game-rating

| Field | Value |
| --- | --- |
| Title | AppsInToss game rating evidence |
| Target | `AppsInToss` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- A valid open-market self-rating/store URL or Game Rating and Administration Committee certificate is available.
- The rating evidence matches the submitted Star Apprentice build.
- The evidence reference is recorded before review request.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Attach open-market self-rating/store URL evidence or Game Rating and Administration Committee certificate evidence.
- Confirm the rating evidence matches this submitted build.
- Record the certificate/store/rating reference.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### apps-in-toss-deployment-approval

| Field | Value |
| --- | --- |
| Title | AppsInToss deployment approval |
| Target | `AppsInToss` |
| Current status | `pending` |
| Prerequisites | `apps-in-toss-ait-upload`, `apps-in-toss-qr-preview`, `apps-in-toss-category-exposure`, `apps-in-toss-game-rating` |

Acceptance:

- Review request is submitted only after upload, QR preview, category, and rating evidence are complete.
- Deployment approval or review status is recorded from the AppsInToss console.
- Production publish is not attempted without explicit approval evidence.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Submit review only after upload, QR preview, category, and rating evidence are complete.
- Record the review request, review status, or deployment approval reference.
- Do not publish production without explicit approval evidence.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

### Google Play

#### google-play-signed-aab-upload

| Field | Value |
| --- | --- |
| Title | Google Play signed AAB upload |
| Target | `Google Play` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The AAB uploaded to Play Console is signed with the configured upload key.
- The uploaded build version matches the repo version and current manualQaBuildId.
- Play Console processing status is recorded.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Upload the signed AAB to Google Play Console after upload-key signing is configured.
- Record the Play Console build/version processing reference.
- Confirm the uploaded version matches the current repo version and artifact identity.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### google-play-content-rating

| Field | Value |
| --- | --- |
| Title | Google Play content rating questionnaire |
| Target | `Google Play` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The Google Play content rating questionnaire is completed for the game.
- The resulting rating is recorded.
- The questionnaire outcome is consistent with the in-repo game content boundaries.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Complete the Google Play content rating questionnaire for the actual game content.
- Record the resulting rating.
- Confirm the outcome matches the repo-documented content boundaries.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### google-play-korea-game-rating

| Field | Value |
| --- | --- |
| Title | Google Play Korea game rating evidence |
| Target | `Google Play` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- Korea game rating evidence is provided when required for the selected distribution path.
- The rating evidence matches the submitted game build.
- The evidence reference is recorded before production rollout.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Provide Korea game rating evidence if required for the selected distribution path.
- Record the rating certificate, store self-rating, or exemption rationale reference.
- Confirm the evidence matches this build.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### google-play-data-safety

| Field | Value |
| --- | --- |
| Title | Google Play Data safety console submission |
| Target | `Google Play` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The repo-prepared Data safety evidence is submitted in Play Console.
- The console declaration remains Data Not Collected for the current MVP.
- The console preview is captured or referenced.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Submit the repo-prepared Data safety declaration in Play Console.
- Confirm the console declaration remains Data Not Collected for the MVP.
- Capture the console preview or stable reference.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### google-play-track-preview

| Field | Value |
| --- | --- |
| Title | Google Play track choice and store preview |
| Target | `Google Play` |
| Current status | `pending` |
| Prerequisites | `google-play-signed-aab-upload`, `google-play-content-rating`, `google-play-korea-game-rating`, `google-play-data-safety` |

Acceptance:

- The release track choice is recorded.
- Store listing, screenshots, content declarations, and uploaded build preview are checked in Play Console.
- Production rollout is not started without explicit approval evidence.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Record the chosen track and rollout state.
- Preview store listing, uploaded build, screenshots, and declarations together.
- Do not start production rollout without explicit approval evidence.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

### App Store

#### app-store-signed-build-upload

| Field | Value |
| --- | --- |
| Title | App Store signed archive upload |
| Target | `App Store` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- A signed Apple Distribution archive is uploaded to App Store Connect.
- The uploaded build version matches the repo version and current manualQaBuildId.
- Build processing and selection status are recorded.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Upload a signed Apple Distribution archive to App Store Connect.
- Record TestFlight/App Store Connect build processing and selected build reference.
- Confirm the uploaded version matches the current repo version and artifact identity.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### app-store-age-rating

| Field | Value |
| --- | --- |
| Title | App Store age rating questionnaire |
| Target | `App Store` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The App Store age rating questionnaire is completed for the actual game content.
- The resulting rating is recorded.
- The rating is consistent with the in-repo content and policy boundaries.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Complete the App Store age rating questionnaire for the actual game content.
- Record the resulting rating.
- Confirm the outcome matches the repo-documented content boundaries.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### app-store-privacy-export

| Field | Value |
| --- | --- |
| Title | App Store privacy and export compliance submission |
| Target | `App Store` |
| Current status | `pending` |
| Prerequisites | none |

Acceptance:

- The App Store privacy nutrition label is submitted as Data Not Collected for the current MVP.
- Export compliance is confirmed with no non-exempt encryption.
- The submitted console values match repo evidence.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Submit App Store privacy details as Data Not Collected for the current MVP.
- Confirm export compliance with no non-exempt encryption.
- Capture the App Store Connect privacy/export preview or stable reference.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```

#### app-store-review-metadata

| Field | Value |
| --- | --- |
| Title | App Store review metadata and submission |
| Target | `App Store` |
| Current status | `pending` |
| Prerequisites | `app-store-signed-build-upload`, `app-store-age-rating`, `app-store-privacy-export` |

Acceptance:

- Review contact, support URL, privacy policy URL, and review notes are completed in App Store Connect.
- The selected build, screenshots, metadata, privacy, export, and age rating are previewed together.
- Final review submission is not made without explicit approval evidence.

Suggested console path:

- Use the artifact hashes and Manual QA build ID above as the build identity.
- Record the console account or workspace used for verification.
- Capture at least one screenshot, recording, or stable console reference before marking the item passed.
- Fill review contact, support URL, privacy policy URL, and review notes in App Store Connect.
- Preview selected build, screenshots, metadata, privacy, export, and age rating together.
- Do not submit final review without explicit approval evidence.

Evidence fields to fill:

```json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "sha256:ab844098720ce98597f74a71d87fa5493b569906c16e5278fcca17346679cecc; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
```
