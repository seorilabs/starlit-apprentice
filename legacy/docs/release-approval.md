# Release Approval

This document records the final explicit approval gate before review submission, production publish, or rollout.

## Source Of Truth

- Evidence file: `qa/release-approval-evidence.json`
- Handoff packet: `qa/release-approval-packet.md`
- Checker: `pnpm check:release-approval`
- Strict checker: `pnpm check:release-approval:strict`
- Artifact binding: `qa/release-artifact-manifest.json`

`pnpm check:release-approval` validates the approval schema and current artifact-manifest binding while allowing the approval to remain pending as a manual blocker. `pnpm check:release-approval:strict` intentionally fails until final approval is recorded as `approved` with concrete evidence.

When the approval status is `approved`, the checker also reruns `pnpm check:manual-qa:strict`, `pnpm check:release-console:strict`, and `pnpm check:store-config:strict`. This prevents final approval from bypassing target-device evidence details, console evidence details, native-share `receivedShareUrl` validation, unresolved store config fields, or store public URL guardrails.

For fixture validation, `pnpm check:release-approval` supports `RELEASE_APPROVAL_EVIDENCE_PATH`, `RELEASE_ARTIFACT_MANIFEST_PATH`, `MANUAL_QA_EVIDENCE_PATH`, `RELEASE_CONSOLE_EVIDENCE_PATH`, `APPS_IN_TOSS_CONFIG_PATH`, `GOOGLE_PLAY_CONFIG_PATH`, and `APP_STORE_CONFIG_PATH`. When approval is `approved`, these override paths are passed through to the strict prerequisite checkers so final approval cannot be validated against mixed default and fixture evidence.

## Approval Rules

The approval can be set to `approved` only when all of these are true:

- every `qa/manual-qa-evidence.json` item is `passed`
- every `qa/release-console-evidence.json` item is `passed`
- store config files no longer contain `확정 필요`
- privacy/support/marketing/contact website URLs are confirmed public HTTPS URLs and do not use username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts such as `example.com`
- `pnpm check:manual-qa:strict`, `pnpm check:release-console:strict`, and `pnpm check:store-config:strict` all pass
- `decision.manualQaBuildId` equals the current `qa/release-artifact-manifest.json` `manualQaBuildId`
- `decision.targetsApproved` includes AppsInToss, Google Play, and App Store unless the release scope is intentionally changed before approval
- at least one concrete screenshot, recording, or stable reference is attached

`approvedAt` must be an ISO date or timestamp. Local screenshot and recording paths must be repo-relative files that exist at check time. Screenshot paths must end in `.png`, `.jpg`, `.jpeg`, or `.webp`; recording paths must end in `.mp4`, `.mov`, or `.webm`. HTTPS URLs are allowed for externally hosted captures, but they must be real public HTTPS URLs without username/password credentials. Credentialed URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, and placeholder hosts such as `example.com` are rejected for approval screenshots, recordings, and console references. `consoleReferences` must be stable approval references rather than placeholder prose.

`consoleReferences` must point to the final approval, review, submission, rollout, deployment, or console reference. Do not use repo-local generated packets, local build artifacts, source/config files, Playwright output, or placeholder URLs such as `example.com` as final approval evidence.

Allowed `releaseAction` values:

- `submit-review`
- `publish-production`
- `rollout-internal-test`

## Stop Rules

- Do not submit review, publish production, or start rollout while `qa/release-approval-evidence.json` is not `approved`.
- Do not use local build output, Playwright, or generated packets as approval evidence by themselves.
- Do not approve a stale build ID.
- Do not approve while any manual QA, console evidence, rating, privacy, URL, signing, or store preview gate is still unresolved.
- Do not approve while any store public URL field uses non-HTTPS, username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts such as `example.com`.
- Do not approve with final approval screenshot, recording, or console-reference URLs that use username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts.
- Do not approve if any strict prerequisite checker fails.

## Current Status

Final release approval is pending. This is expected while the repo remains in local QA state, but strict release readiness must keep failing until the evidence file is completed.
