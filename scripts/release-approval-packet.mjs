import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBlockedPublicUrlHost } from "./public-url-guard.mjs";
import { releaseApprovalPreflightCommands, renderCommandBlock } from "./release-verification-commands.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packetPath = process.env.RELEASE_APPROVAL_PACKET_PATH ?? "qa/release-approval-packet.md";
const checkOnly = process.argv.includes("--check");
const failures = [];

const manifest = readJson(process.env.RELEASE_ARTIFACT_MANIFEST_PATH ?? "qa/release-artifact-manifest.json");
const manualQa = readJson(process.env.MANUAL_QA_EVIDENCE_PATH ?? "qa/manual-qa-evidence.json");
const consoleEvidence = readJson(process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json");
const approval = readJson(process.env.RELEASE_APPROVAL_EVIDENCE_PATH ?? "qa/release-approval-evidence.json");
const appsInToss = readJson(process.env.APPS_IN_TOSS_CONFIG_PATH ?? "apps-in-toss/apps-in-toss.config.json");
const googlePlay = readJson(process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json");
const appStore = readJson(process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json");
const packet = renderPacket();

if (checkOnly) {
  checkPacket();
} else {
  writeFileSync(resolve(repoRoot, packetPath), packet);
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkPacket() {
  if (!existsSync(resolve(repoRoot, packetPath))) {
    failures.push(`Missing release approval packet: ${packetPath}. Run pnpm release:approval-packet.`);
    return;
  }

  const current = read(packetPath);
  if (current !== packet) {
    failures.push(`${packetPath} is stale. Run pnpm release:approval-packet after updating artifacts, evidence, or store configs.`);
  }
}

function renderPacket() {
  const manualOpen = openItems(manualQa.items);
  const manualTargetOpen = targetEvidenceEntries(manualQa.items).filter((entry) => entry.status !== "passed");
  const consoleOpen = openItems(consoleEvidence.items);
  const unresolvedFields = [
    ...findUnresolved("AppsInToss", appsInToss),
    ...findUnresolved("Google Play", googlePlay),
    ...findUnresolved("App Store", appStore)
  ];
  const invalidPublicUrlFields = invalidStorePublicUrlFields();
  const prereqRows = [
    [
      "Manual target-device QA",
      manualOpen.length === 0 && manualTargetOpen.length === 0 ? "clear" : `${manualOpen.length} item open / ${manualTargetOpen.length} target open`,
      manualTargetOpen.map((entry) => `${entry.itemId}/${entry.target}`).join(", ") || "none"
    ],
    ["Release console evidence", consoleOpen.length === 0 ? "clear" : `${consoleOpen.length} open`, consoleOpen.map((item) => item.id).join(", ") || "none"],
    ["Store unresolved fields", unresolvedFields.length === 0 ? "clear" : `${unresolvedFields.length} open`, unresolvedFields.join("<br>") || "none"],
    ["Store invalid public URL fields", invalidPublicUrlFields.length === 0 ? "clear" : `${invalidPublicUrlFields.length} open`, invalidPublicUrlFields.join("<br>") || "none"],
    ["Final release approval", approval.status, approval.status === "approved" ? "approved" : "approval pending"]
  ];

  return `# Release Approval Packet

This file is generated from release artifacts, manual QA evidence, console evidence, store configs, and \`qa/release-approval-evidence.json\`.

It is the final human approval handoff. It does not grant release by itself.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |
| AppsInToss .ait SHA-256 | \`${manifest.artifacts.appsInTossAit.sha256}\` |

## Preflight Commands

\`\`\`bash
${renderCommandBlock(releaseApprovalPreflightCommands)}
\`\`\`

Fixture validation can override the evidence and config sources with \`RELEASE_APPROVAL_EVIDENCE_PATH\`, \`RELEASE_ARTIFACT_MANIFEST_PATH\`, \`MANUAL_QA_EVIDENCE_PATH\`, \`RELEASE_CONSOLE_EVIDENCE_PATH\`, \`APPS_IN_TOSS_CONFIG_PATH\`, \`GOOGLE_PLAY_CONFIG_PATH\`, and \`APP_STORE_CONFIG_PATH\`. When approval is \`approved\`, \`pnpm check:release-approval\` passes these override paths through to the strict prerequisite checkers.

## Prerequisite Summary

| Gate | State | Open items |
| --- | --- | --- |
${prereqRows.map(([gate, state, open]) => `| ${gate} | \`${state}\` | ${open} |`).join("\n")}

## Approval Evidence Rule

Do not set \`qa/release-approval-evidence.json\` to \`approved\` until manual QA, every target-specific manual QA evidence entry, console evidence, store metadata fields, store public URLs, and final preview are complete for the intended targets. Store public URLs must be confirmed public HTTPS URLs without username/password credentials, not credentialed URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts. When approval is marked \`approved\`, \`pnpm check:release-approval\` reruns \`pnpm check:manual-qa:strict\`, \`pnpm check:release-console:strict\`, and \`pnpm check:store-config:strict\`; final approval is rejected if any prerequisite strict checker fails.

When approving, fill \`qa/release-approval-evidence.json\` with this shape:

\`\`\`json
{
  "status": "approved",
  "decision": {
    "approvedAt": "2026-06-18T18:00:00+09:00",
    "approver": "<approver name>",
    "manualQaBuildId": "${manifest.manualQaBuildId}",
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
\`\`\`

Allowed \`releaseAction\` values:

- \`submit-review\`
- \`publish-production\`
- \`rollout-internal-test\`

Local screenshot and recording paths must exist in the repo when checked. HTTPS URLs are allowed for externally hosted captures, but they must be real public HTTPS URLs without username/password credentials; credentialed URLs, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, and placeholder hosts such as \`example.com\` are rejected for approval screenshots, recordings, and console references. Console references must be stable final approval, review, submission, rollout, deployment, or console references, not placeholder prose. Do not use repo-local generated packets, local build artifacts, source/config files, Playwright output, or placeholder URLs such as \`example.com\` as final approval evidence.

## Stop Rules

- Do not submit review, publish production, or start rollout while this approval status is not \`approved\`.
- Do not approve a stale build ID; \`decision.manualQaBuildId\` must equal \`${manifest.manualQaBuildId}\`.
- Do not approve while any manual QA item, manual QA target evidence entry, console evidence item, or store config field is still unresolved.
- Do not approve while any store public URL field uses non-HTTPS, username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, or placeholder hosts such as \`example.com\`.
- Do not approve unless \`pnpm check:manual-qa:strict\`, \`pnpm check:release-console:strict\`, and \`pnpm check:store-config:strict\` all pass.
- Do not use this file as a substitute for Play Console, App Store Connect, or AppsInToss console evidence.
`;
}

function openItems(items) {
  return (items ?? []).filter((item) => item?.status !== "passed");
}

function targetEvidenceEntries(items) {
  return (items ?? []).flatMap((item) => {
    if (Array.isArray(item?.targetEvidence)) {
      return item.targetEvidence.map((entry) => ({
        ...entry,
        itemId: item.id,
        title: item.title
      }));
    }
    if (item?.status === "passed") {
      return [];
    }
    return [{
      itemId: item?.id ?? "unknown",
      title: item?.title ?? "Missing target evidence",
      target: "missing-target-evidence",
      status: item?.status ?? "pending"
    }];
  });
}

function findUnresolved(target, value, prefix = "") {
  if (typeof value === "string") {
    return value.includes("확정 필요") ? [`${target}: \`${prefix}\``] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findUnresolved(target, entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return findUnresolved(target, entry, nextPrefix);
    });
  }
  return [];
}

function invalidStorePublicUrlFields() {
  return [
    ["Google Play", "privacyPolicyUrl", googlePlay.privacyPolicyUrl],
    ["Google Play", "contactWebsite", googlePlay.contactWebsite],
    ["App Store", "privacyPolicyUrl", appStore.privacyPolicyUrl],
    ["App Store", "supportUrl", appStore.supportUrl],
    ["App Store", "marketingUrl", appStore.marketingUrl]
  ].flatMap(([target, field, value]) => {
    const reason = invalidPublicUrlReason(value);
    return reason ? [`${target}: \`${field}\` (${reason})`] : [];
  });
}

function invalidPublicUrlReason(value) {
  if (value === undefined || String(value ?? "").includes("확정 필요")) {
    return null;
  }
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || !url.hostname) {
      return "must use https";
    }
    if (isBlockedPublicUrlHost(url.hostname)) {
      return "blocked localhost/non-public-or-reserved/placeholder host";
    }
    return null;
  } catch {
    return "must be a valid URL";
  }
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log(checkOnly ? "Release approval packet check" : "Release approval packet");
  console.log(checkOnly ? "=============================" : "=======================");
  console.log("");
  console.log(`Packet: ${packetPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Release approval packet checks: PASS" : "Release approval packet checks: FAIL");
}

function printSection(title, items) {
  console.log(title);
  if (items.length === 0) {
    console.log("- none");
  } else {
    for (const item of items) {
      console.log(`- ${item}`);
    }
  }
  console.log("");
}
