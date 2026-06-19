# Release Readiness

This document separates automated release evidence from manual console or human-test blockers.

## Automated Gate

Run:

```bash
pnpm check:release:automated
```

This verifies:

- app spec identity, game archetype, 12-month / 4-week / 30-ending implementation scope
- required release docs and market folders
- game content integrity, including action/icon parity, ending data references, ending requirement direction guard, and excluded-scope copy scan
- AppsInToss registration image dimensions, alpha restrictions, and full-month monthly-coaching result screenshot capture contract
- AppsInToss WebView dist size, deterministic candidate archive, local `.ait` generation, viewport/pinch-zoom settings, external-link/network policy scan, game-specific manual gate separation, and strict readiness tied to concrete `manualEvidence` plus passed AppsInToss release console evidence
- Google Play listing config, 512 x 512 icon, 1024 x 500 feature graphic, phone/tablet screenshots, and duplicate screenshot guardrails
- App Store listing config, 1024 x 1024 icon, iPhone 6.9 screenshots, iPad 13 screenshots, and duplicate screenshot guardrails
- structured manual QA evidence schema, target-specific evidence coverage for Google Play/App Store/AppsInToss, required screenshot/recording/console-reference attachments for conclusive target-device evidence, handoff packet, and release-candidate pending-state tracking
- structured release console evidence schema, prerequisite ordering, and generated handoff packet for AppsInToss, Google Play, and App Store upload/review/submission gates
- generated `qa/rating-content-inventory.md` with product-core content scope, repo-local rating answer snapshot, store config cross-checks, rating-questionnaire evidence, and risk keyword scan, verified by `pnpm check:rating-content-inventory`
- generated `qa/public-release-pages.md` with hostable privacy/support/marketing page mapping, copied page assets, unresolved URL fields, and placeholder URL stop rules, verified by `pnpm check:public-pages`
- generated `qa/store-submission-packet.md` with AppsInToss, Google Play, and App Store copy/paste metadata, asset paths, local artifact hashes, unresolved console-only fields, invalid public URL field counts, release gate status, `not-submittable` stop rules, and manual/console/approval open counts, verified by `pnpm check:store-submission-packet`
- generated `qa/release-gate-dashboard.md` with current release decision, open manual/console gate counts, unresolved store fields, invalid public URL field counts, dependency order, stop rules, native-share `targetEvidence[].receivedShareUrl` and known ending-code stop rules, and next actions, verified by `pnpm check:release-gate-dashboard`
- structured `qa/release-approval-evidence.json` and generated `qa/release-approval-packet.md` for final explicit approval before review submission, production publish, or rollout, verified by `pnpm check:release-approval`
- save contract migration, corrupted storage fallback, storage unavailable fallback, storage write failure fallback, storage remove failure reset fallback, versioned empty collection reset fallback, partial storage recovery, save schema version guard, collection save schema version guard, product-core loader JSON parse guard, new-run seed guard, zero-persist RNG seed guard, non-object direct run-state guard, serializeRun save-write version guard, serializeRun save-write finite-state guard, serializeRun save-write registry guard, serializeRun save-write flag guard, serializeRun save-write history guard, serializeCollection save-write registry guard, direct run-state version guard, direct run-state shape guard, schedule selection slot-index guard, schedule selection run-state bounds guard, monthly schedule overwrite guard, partial/orphan-slot schedule overwrite guard, progression slot-index/history continuity guard, progression finite-state guard, run-state bounds guard, registry-backed history label canonicalization, plausible flag count caps, unknown saved flag cleanup, known flag key guard, saved progress flag history cleanup, premature endingCode cleanup, completed run endingCode canonicalization, run unlocked ending scope cleanup, non-object/missing-version/unsupported-version/malformed JSON run save rejection, malformed JSON collection save rejection, not-started saved schedule affordability cleanup, in-progress saved schedule continuity cleanup, completed saved schedule continuity cleanup, saved month progress cleanup, saved schedule month progress cleanup, saved history progress cleanup, malformed history entry cleanup, invalid history month/slot cleanup, history event cleanup, generated monthly event round-trip, stale collection sanitization, versioned collection save sanitization, unsupported collection schema fallback, shared ending canonical URL cleanup, shared ending popstate cleanup, shared ending collection isolation, invalid shared ending URL cleanup, shared ending local run preservation, shared ending synthetic stat suppression, and confirmed local data reset
- analytics contract coverage through `pnpm check:analytics-contract`, including spec event names, local `starlit:analytics` CustomEvent transport, no analytics SDK, and production-preview event payload smoke coverage
- target guidance coverage through `pnpm check:target-guidance`, including packaged `getEndingActionRecommendations` export, every non-fallback ending having actionable target action recommendations, target recommendation affordability filtering, target recommendation planned-action guard coverage, and completed targets returning no extra recommendation
- packaged product-core schedule status, read-model, save-write, collection, and public URL guard coverage through `pnpm check:package`, including the static registry immutability guard for exported content registries, the built registry lookup guard for `getActionById()` and `getEndingByCode()`, the built new-run seed guard, the built zero-persist RNG seed guard, the built public URL guard for release/share/store URL helpers, the built known ending-code share URL guard, the built loader JSON parse guard for malformed run and collection JSON payloads, the built non-object direct run-state guard for save-write, schedule status, schedule forecast, progression, and read-model callers, the built serializeRun save-write version guard for non-v1 run save schema versions, the built serializeRun save-write finite-state guard, the built serializeRun save-write registry guard for known schedule actions and ending codes, the built serializeRun save-write flag guard for finite bounded flags, known flag keys, and history-bounded action/category progress flags, the built serializeRun save-write history guard for contiguous history, known actions, canonical labels/categories, daily outcomes, and saved events, the built serializeCollection save-write registry guard for known collection ending codes, the built collection load-time stale ending sanitization and unsupported schema rejection, the schedule resource forecast guard for direct forecast callers, the schedule plan status action-list guard for non-array action lists, unknown actions, and plans longer than 4 weekly slots, the schedule plan resource finite guard for non-finite `gold`, `energy`, or `stress`, the schedule plan finite forecast fallback for non-object direct run inputs, missing resource fields, and non-finite resource values, the schedule plan resource bounds guard for current resource values outside supported ranges, the schedule plan run-state bounds guard for malformed `month`, `slotIndex`, stats, or `rngSeed`, the built direct run-state version guard for schedule status, schedule forecast, progression, and read-model callers, the built direct run-state shape guard for malformed schedule arrays, flags, history, and ending references, the progression/read-model run-state bounds guard for direct run values outside supported ranges, the read-model finite-state guard for non-finite direct run state passed to ending/progress/coaching/profile APIs, and the read-model display limit guard for target recommendation and monthly coaching list limits
- public URL guard parity through `pnpm check:public-url-guard`, ensuring `scripts/public-url-guard.mjs` and `@starlit-apprentice/product-core` agree on public, placeholder, localhost, non-public/reserved IPv4 with the IANA globally reachable `192.0.0.9/32` and `192.0.0.10/32` exceptions, IPv6 local/documentation/multicast/special-purpose ranges including `64:ff9b:1::/48`, `100::/64`, `100:0:0:1::/64`, `2001:2::/48`, `3fff::/20`, and `5f00::/16`, canonical share URL cases, and unknown ending-code rejection
- 30-ending reachability through deterministic 12-month route simulation
- ending route schedule affordability plus final resource guardrails, currently every planned month must stay selectable and final `energy >= 20` / `stress <= 80`
- first-three-month pacing guardrails across guided-balanced, academic, creative, and work-heavy starts
- production preview runtime smoke across mobile and desktop viewports
- first-entry CTA state, first-run guidance, schedule readiness copy, schedule affordability, selected-slot correction, schedule action stale click guard, duplicate command event guard, duplicate result command guard, room command stale event guard, active target reselection guard, activity resume elapsed-time guard, activity reload resume guard, activity visibilitychange resume guard, activity monotonic clock guard, dynamic viewport resize guard, canvas visibilitychange render-loop pause, canvas pagehide/pageshow render-loop pause, canvas freeze/resume render-loop pause, in-progress monthly plan resume, start-over confirmation, collection guidance, target-ending guidance, target action recommendations, browser back navigation, stale browser history state guard, unknown DOM dataset guard, month-complete reload recovery, shared-ending canonical URL cleanup, shared ending popstate cleanup, shared ending collection isolation, invalid shared ending URL cleanup, shared ending local run preservation, shared ending synthetic stat suppression, event effect copy, monthly coaching copy/readability, premature endingCode recovery, saved-ending recovery, ending evidence copy, local analytics CustomEvent payloads, event/ending text readability, native share invocation, native share in-flight guard, native share stale completion guard, native share stale in-flight retarget guard, native share rejection fallback, native share internal URL guard, share clipboard fallback, corrupted-storage fallback, storage unavailable fallback, storage write failure fallback, storage remove failure reset fallback, versioned empty collection reset fallback, partial storage recovery, stale collection sanitization, versioned collection save sanitization, unsupported collection schema fallback, run unlocked ending scope cleanup, saved month progress cleanup, saved schedule month progress cleanup, saved progress flag history cleanup, confirmed local data reset, sticky action viewport guard, ad placeholder absence, horizontal overflow checks, and runtime screenshot viewport anchor checks
- UI accessibility baseline, including accessible control names, mobile 44 x 44 touch targets, text color contrast checks, sticky bottom action viewport/occlusion checks, image alt attributes, visible keyboard focus, reduced-motion CSS, reduced-motion canvas stability, and reduced-motion canvas render-loop pause
- WebView security boundary, including CSP, self-only script/connect policy, blocked frame/object/form surfaces, no runtime network APIs, and no Capacitor `server.url`
- native bundle sync parity, including Android/iOS public file hashes, Capacitor-generated config, CSP propagation, and allowed Capacitor `cordova.js` extras
- runtime bundle budget, including gzip/raw size ceilings, sourcemap exclusion, and registration-only asset exclusion from shipped Vite dist
- release artifact manifest and manual QA handoff packet, including Vite dist, Android AAB, iOS `.app`, AppsInToss candidate ZIP and `.ait` SHA-256 hashes, shared verification command set checked by `pnpm check:release-verification-commands`, `manualQaBuildId`, public URL guard parity preflight, open manual items, open target evidence entries, artifact-use boundaries, and device test paths
- release manual blocker fixture coverage through `pnpm check:release-manual-blockers`, proving evidence-conditioned manual blocker reporting can clear when manual QA, console evidence, store config fields, and final approval are concrete, passed, and accepted by the strict manual QA, release console, store config, and release approval checkers
- Android debug-signed QA APK generation and web-asset hash parity for target-device QA handoff, kept separate from Play-uploadable AAB evidence
- Android launcher icon sync from the Google Play icon source, including legacy, round, and adaptive foreground resources
- Android/iOS native splash sync from the branded Star Apprentice launch artwork, including packaged Android splash parity and iOS asset-catalog inclusion
- shipped third-party notices, including Capacitor runtime/native shell license metadata and third-party game engine exclusion
- local release package generation and artifact parity for Android AAB and iOS unsigned `.app`
- bundled Capacitor shell settings, including no `server.url`
- Android local-save backup disabled and portrait orientation
- iOS portrait-only orientation for the current vertical UI
- no production Firebase, ad, billing, or analytics SDK dependencies in the MVP app package
- product-core architecture boundary
- release version/build consistency across package metadata, Android, and iOS
- store listing text limits and unresolved console-only fields
- store public URL guardrails, including HTTPS-only credential-free privacy/support/marketing/contact website URLs, public HTTPS credential-free native share ending URL evidence, canonical ending-only share URLs with known `@starlit-apprentice/product-core` ending codes, required `targetEvidence[].receivedShareUrl` capture for passed native-share targets, shared product-core URL validation, and username/password credential plus localhost/non-public IPv4/IPv6 local, documentation, multicast, special-purpose, or reserved/placeholder host rejection
- Google Play Android package identity, targetSdk 35, release signing wiring, AAB artifact shape and current web-asset hash parity when present, upload-key/manual console gate separation, and strict readiness tied to concrete Play config evidence plus passed Google Play release console evidence
- App Store bundle identity, iPhone/iPad AppIcon completeness, local `.app` web-asset hash parity when present, privacy manifest, export compliance plist evidence, signing/manual console gate separation, and strict readiness tied to concrete App Store config evidence plus passed App Store release console evidence

`pnpm qa` runs this automated release gate at the end, after unit, architecture, content, asset, store, privacy, local Android/iOS package generation, AppsInToss packaging, release artifact manifest generation, release verification command inventory, manual blocker clearability fixture, manual QA packet generation, release console packet generation, rating content inventory generation, public release page generation, store submission packet generation, release gate dashboard generation, release approval packet generation, save contract, target guidance, `cap:sync`, native bundle sync, runtime, accessibility, package, public URL guard parity, and e2e checks.

Run the strict form before a release-candidate claim:

```bash
pnpm check:release
```

The strict form intentionally fails while manual blockers remain.
Manual blocker reporting is evidence-conditioned: once the matching target-device QA, console evidence, store config fields, and final approval evidence are concrete and `passed`, the corresponding manual blocker must clear instead of staying as a static warning.

## Manual Blockers

- Human QA evidence is incomplete in `qa/manual-qa-evidence.json`: target-device pacing, target-device readability, native share, native WebView back/reload, and AppsInToss preview.
- Release console evidence is incomplete in `qa/release-console-evidence.json`: AppsInToss upload/QR/category/rating/approval, Google Play signed upload/rating/Data safety/track preview, and App Store signed upload/age rating/privacy/export/review metadata.
- AppsInToss console game category and exposure fields must be confirmed in the console.
- AppsInToss game rating evidence is required for game apps.
- AppsInToss `.ait` console upload, QR/Toss-app test, and deployment approval are not complete; do not submit or publish production versions.
- Google Play release has local unsigned AAB build evidence, but still needs signed AAB upload, content rating, production/internal-track decision, and Play Console submission of the prepared Data safety evidence.
- App Store release has local unsigned release build, AppIcon, privacy, and export evidence, but still needs signed archive/upload, age rating, App Review metadata, and App Store Connect submission of the prepared privacy/export evidence.
- Google Play/App Store console uploads and previews must be verified with the generated market-specific assets.
- Public privacy/support/marketing pages are generated in `public-pages/`, and the support email is `cs@seorilabs.com`; the final HTTPS domain and store config URL fields remain manual gates.
- Final release approval must be recorded in `qa/release-approval-evidence.json` for the current `manualQaBuildId` before review submission, production publish, or rollout.

## AppsInToss Documentation Evidence

- App features: AppsInToss docs state non-game apps require at least one app feature and feature review can take 1-2 business days. This app is classified as a game, so feature registration is not treated as an automated blocker.
- App registration: AppsInToss docs require game apps to provide game rating classification evidence, either from an open market self-rating entry or a Game Rating and Administration Committee certificate.
- Release/test: AppsInToss docs require uploading an app bundle, completing at least one Toss-app test before review request, and keeping unpacked bundle size <= 100MB.
- WebView: AppsInToss docs say pinch zoom should be disabled unless the service requires it, and unsupported external-link/app-install flows can trigger review/operation issues.

Source URLs:

- `https://developers-apps-in-toss.toss.im/development/test/function.md`
- `https://developers-apps-in-toss.toss.im/prepare/console-workspace.md`
- `https://developers-apps-in-toss.toss.im/development/test/toss.md`
- `https://developers-apps-in-toss.toss.im/development/deploy.md`
- `https://developers-apps-in-toss.toss.im/bedrock/reference/framework/속성`
- `https://developers-apps-in-toss.toss.im/checklist/miniapp-external-link.md`

## Google Play and App Store Documentation Evidence

- Google Play preview asset docs require a 512 x 512 Play icon, a 1024 x 500 feature graphic, and JPEG or 24-bit PNG screenshots with no alpha.
- Google Play docs recommend at least four 1080 x 1920 portrait screenshots for app/game recommendation surfaces.
- Google Play target API policy requires new apps and updates to target Android 15 / API level 35 or higher.
- Android docs state release App Bundles for Play upload need signing information, and Play App Signing uses an upload key for bundle upload.
- Apple docs state builds can be uploaded with Xcode or Transporter after an app record exists, privacy details must include app and third-party partner data practices, and export compliance is managed in App Store Connect with optional `Info.plist` evidence.
- Apple App Store Connect screenshot specs allow 1290 x 2796 portrait iPhone 6.9 screenshots and require iPad 13 screenshots when the app runs on iPad.

Source URLs:

- `https://support.google.com/googleplay/android-developer/answer/9866151`
- `https://developer.android.com/distribute/google-play/resources/icon-design-specifications`
- `https://support.google.com/googleplay/android-developer/answer/11926878?hl=en`
- `https://developer.android.com/build/building-cmdline`
- `https://support.google.com/googleplay/android-developer/answer/9842756?hl=en`
- `https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/`
- `https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/`
- `https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/`
- `https://developer.apple.com/app-store/product-page/`

## Current Position

The repo can prove automated QA and release-asset readiness, but it is not a release candidate until manual blockers above are resolved and explicit release approval is recorded.
