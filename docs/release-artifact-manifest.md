# Release Artifact Manifest

This document records how release package artifacts are fingerprinted before target-device QA or console handoff.

## Gate

Generate the manifest after local release packages and the AppsInToss static WebView candidate plus `.ait` bundle have been rebuilt:

```bash
pnpm check:release-packages
pnpm build:apps-in-toss:candidate
pnpm check:package
pnpm release:artifact-manifest
pnpm check:release-artifact-manifest
pnpm check:release-verification-commands
pnpm check:release-manual-blockers
pnpm check:public-url-guard
```

The manifest is written to:

```text
qa/release-artifact-manifest.json
```

`pnpm check:release-artifact-manifest` recomputes the current artifact hashes and fails if the manifest is missing or stale.

## Covered Artifacts

The manifest fingerprints:

- Vite runtime dist: `apps/starlit-apprentice/dist`
- Android debug-signed QA APK: `apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk`
- Android local AAB: `apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab`
- iOS unsigned release `.app`: `apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app`
- AppsInToss static WebView candidate ZIP: `apps-in-toss/build/starlit-apprentice-webview-candidate.zip`
- AppsInToss uploadable `.ait`: `apps-in-toss/build/starlit-apprentice.ait`

Each file or directory gets SHA-256 evidence. Directory artifacts include file count, total size, per-file hashes, and a combined directory hash.

The AppsInToss candidate ZIP is generated deterministically: archive entries are sorted, ZIP extra metadata is removed, and copied file timestamps are normalized before compression. If this check starts failing after a no-op rebuild, fix the artifact generation before relying on the manifest.

## Manual QA Link

The manifest includes the shared verification command set from `scripts/release-verification-commands.mjs`, validated by `pnpm check:release-verification-commands` and including `pnpm check:release-manual-blockers` plus `pnpm check:public-url-guard`, so manual handoff packets do not drift away from automated release checks. The same checker also requires `README.md` and `AGENT.md` to document every `package.json` script as a `pnpm <script>` command, keeping repo entrypoint command lists aligned with the executable release surface.

The manifest includes a `manualQaBuildId` derived from the artifact hashes and verification command set. When completing `qa/manual-qa-evidence.json`, put this ID in each passed item's `evidence.buildArtifact` together with the tested platform artifact path or external build reference.

Example:

```text
sha256:...; Android target-device QA installed from apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk
```

This does not replace signed store upload, TestFlight, Play Console, AppsInToss QR/Toss-app, or human QA. It only proves which local release artifacts were handed off for those manual steps.
