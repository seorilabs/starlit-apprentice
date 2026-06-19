import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBlockedPublicUrlHost } from "./public-url-guard.mjs";
import { releaseDashboardVerificationCommands, renderCommandBlock } from "./release-verification-commands.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const dashboardPath = process.env.RELEASE_GATE_DASHBOARD_PATH ?? "qa/release-gate-dashboard.md";
const checkOnly = process.argv.includes("--check");
const failures = [];

const manifest = readJson(process.env.RELEASE_ARTIFACT_MANIFEST_PATH ?? "qa/release-artifact-manifest.json");
const manualQa = readJson(process.env.MANUAL_QA_EVIDENCE_PATH ?? "qa/manual-qa-evidence.json");
const consoleEvidence = readJson(process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json");
const releaseApproval = readJson(process.env.RELEASE_APPROVAL_EVIDENCE_PATH ?? "qa/release-approval-evidence.json");
const appsInToss = readJson(process.env.APPS_IN_TOSS_CONFIG_PATH ?? "apps-in-toss/apps-in-toss.config.json");
const googlePlay = readJson(process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json");
const appStore = readJson(process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json");
const dashboard = renderDashboard();

if (checkOnly) {
  checkDashboard();
} else {
  writeFileSync(resolve(repoRoot, dashboardPath), dashboard);
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkDashboard() {
  if (!existsSync(resolve(repoRoot, dashboardPath))) {
    failures.push(`Missing release gate dashboard: ${dashboardPath}. Run pnpm release:gate-dashboard.`);
    return;
  }

  const current = read(dashboardPath);
  if (current !== dashboard) {
    failures.push(`${dashboardPath} is stale. Run pnpm release:gate-dashboard after updating artifacts, evidence, or store configs.`);
  }
}

function renderDashboard() {
  const manualOpen = openItems(manualQa.items);
  const manualTargetEntries = targetEvidenceEntries(manualQa.items);
  const manualTargetOpen = manualTargetEntries.filter((entry) => entry.status !== "passed");
  const consoleOpen = openItems(consoleEvidence.items);
  const unresolvedFields = [
    ...findUnresolved("AppsInToss", appsInToss),
    ...findUnresolved("Google Play", googlePlay),
    ...findUnresolved("App Store", appStore)
  ];
  const invalidPublicUrlFields = invalidStorePublicUrlFields();
  const approvalOpen = releaseApproval.status === "approved" ? [] : [releaseApproval.status];
  const releaseStatus = manualOpen.length === 0 && consoleOpen.length === 0 && unresolvedFields.length === 0 && invalidPublicUrlFields.length === 0 && approvalOpen.length === 0
    ? "release-approved"
    : manualOpen.length === 0 && consoleOpen.length === 0 && unresolvedFields.length === 0 && invalidPublicUrlFields.length === 0
      ? "candidate-ready-pending-approval"
      : "not-a-release-candidate";

  return `# Release Gate Dashboard

This file is generated from release artifacts, manual QA evidence, console evidence, and store configs.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |
| Release decision | \`${releaseStatus}\` |

## Gate Summary

| Gate area | Source | Passed | Open | Failed | Blocked |
| --- | --- | ---: | ---: | ---: | ---: |
| Manual target-device QA | \`qa/manual-qa-evidence.json\` | ${countStatus(manualTargetEntries, "passed")} | ${manualTargetOpen.length} | ${countStatus(manualTargetEntries, "failed")} | ${countStatus(manualTargetEntries, "blocked")} |
| Release console evidence | \`qa/release-console-evidence.json\` | ${countStatus(consoleEvidence.items, "passed")} | ${consoleOpen.length} | ${countStatus(consoleEvidence.items, "failed")} | ${countStatus(consoleEvidence.items, "blocked")} |
| Store unresolved fields | store config JSON | ${unresolvedFields.length === 0 ? 1 : 0} | ${unresolvedFields.length} | 0 | 0 |
| Store invalid public URL fields | store config JSON | ${invalidPublicUrlFields.length === 0 ? 1 : 0} | ${invalidPublicUrlFields.length} | 0 | 0 |
| Final release approval | \`qa/release-approval-evidence.json\` | ${releaseApproval.status === "approved" ? 1 : 0} | ${releaseApproval.status === "approved" ? 0 : 1} | ${releaseApproval.status === "rejected" ? 1 : 0} | ${releaseApproval.status === "blocked" ? 1 : 0} |

## Release Flow

\`\`\`mermaid
flowchart TD
  A[Local package and artifact manifest] --> B[Store metadata fields resolved]
  B --> C[Signed upload or AppsInToss .ait upload]
  C --> D[Target-device and AppsInToss preview QA]
  D --> E[Ratings, privacy, data safety, review metadata]
  E --> F[Console preview and explicit release approval]
  F --> G[Production submission or publish]
\`\`\`

## Current Stop Rules

${renderStopRules({ manualOpen, manualTargetOpen, consoleOpen, unresolvedFields, invalidPublicUrlFields, approvalOpen })}

## Next Actions

${renderNextActions({ manualOpen, manualTargetOpen, consoleOpen, unresolvedFields, invalidPublicUrlFields, approvalOpen })}

## Open Manual QA Items

${renderItems(manualOpen, "targets")}

## Open Manual QA Targets

${renderManualTargetItems(manualTargetOpen)}

## Open Console Items

${renderItems(consoleOpen, "target")}

## Unresolved Store Fields

${unresolvedFields.length > 0 ? unresolvedFields.map((item) => `- ${item}`).join("\n") : "- none"}

## Invalid Public URL Fields

${invalidPublicUrlFields.length > 0 ? invalidPublicUrlFields.map((item) => `- ${item}`).join("\n") : "- none"}

## Handoff Files

| File | Purpose |
| --- | --- |
| \`qa/manual-qa-packet.md\` | Target-device QA steps and evidence snippets |
| \`qa/release-console-packet.md\` | Console upload/review steps and evidence snippets |
| \`qa/rating-content-inventory.md\` | Repo-local content inventory for rating questionnaires |
| \`qa/public-release-pages.md\` | Hostable privacy/support/marketing page mapping and unresolved URL fields |
| \`qa/store-submission-packet.md\` | Copy/paste metadata, asset paths, hashes, and unresolved console fields |
| \`qa/release-gate-dashboard.md\` | Release decision, dependency order, and open gate summary |
| \`qa/release-approval-packet.md\` | Final explicit release approval handoff and stop rules |

## Verification Commands

\`\`\`bash
${renderCommandBlock(releaseDashboardVerificationCommands)}
\`\`\`
`;
}

function renderStopRules({ manualOpen, manualTargetOpen, consoleOpen, unresolvedFields, invalidPublicUrlFields, approvalOpen }) {
  const rules = [];
  if (unresolvedFields.length > 0) {
    rules.push("Do not submit store metadata while store config fields still contain `확정 필요`.");
    rules.push("Do not paste privacy/support/marketing placeholder URLs; host `public-pages/*` on a confirmed HTTPS domain first.");
  }
  if (invalidPublicUrlFields.length > 0) {
    rules.push("Do not submit store metadata while privacy/support/marketing/contact website URLs use non-HTTPS, username/password credentials, localhost, non-public/reserved IP, IPv6 local/documentation/multicast, or placeholder hosts.");
  }
  if (manualOpen.length > 0 || manualTargetOpen.length > 0) {
    rules.push("Do not claim a release candidate while target-device manual QA evidence is incomplete.");
    rules.push("Do not mark a multi-target manual QA item `passed` until every `targetEvidence[]` entry for that item is `passed`.");
  }
  rules.push("Do not mark `native-share` target evidence `passed` unless `targetEvidence[].receivedShareUrl` is the actual recipient URL, public HTTPS without username/password credentials, canonical with only `?ending=<known product-core ending code>`, and has no extra query parameters or hash fragment.");
  if (consoleOpen.length > 0) {
    rules.push("Do not submit or publish production versions while console upload/review evidence is incomplete.");
    rules.push("Do not mark dependent console evidence `passed` before its prerequisite console evidence items are also `passed`.");
  }
  if (approvalOpen.length > 0) {
    rules.push("Do not submit review, publish production, or start rollout while `qa/release-approval-evidence.json` is not `approved` for the current `manualQaBuildId`.");
  }
  rules.push("Do not mark evidence `passed` unless it is tied to the current `manualQaBuildId` and includes at least one screenshot, recording, or stable console reference.");
  return rules.map((rule) => `- ${rule}`).join("\n");
}

function renderNextActions({ manualOpen, manualTargetOpen, consoleOpen, unresolvedFields, invalidPublicUrlFields, approvalOpen }) {
  const actions = [];

  if (unresolvedFields.length > 0) {
    actions.push(["Resolve store metadata fields", "Fill contact, policy URL, SKU, rating, and console-only fields in the target store configs before copy/paste submission."]);
    actions.push(["Host public release pages", "Use `public-pages/index.html`, `public-pages/privacy-policy.html`, and `public-pages/support.html` as static source files after the final HTTPS domain is confirmed."]);
  }
  if (invalidPublicUrlFields.length > 0) {
    actions.push(["Replace invalid store public URLs", "Use confirmed public HTTPS URLs for privacy, support, marketing, and contact website fields before copy/paste submission."]);
  }
  if (hasAny(consoleOpen, ["apps-in-toss-ait-upload", "google-play-signed-aab-upload", "app-store-signed-build-upload"])) {
    actions.push(["Upload platform artifacts", "Upload the AppsInToss .ait, signed Google Play AAB, and signed App Store archive where account credentials are available."]);
  }
  if (manualOpen.length > 0 || manualTargetOpen.length > 0 || hasAny(consoleOpen, ["apps-in-toss-qr-preview"])) {
    actions.push(["Run target-device QA", "Use the generated packets to capture Android/iOS/AppsInToss preview evidence for every open target against the current Manual QA build ID."]);
  }
  if (hasAny(consoleOpen, ["apps-in-toss-game-rating", "google-play-content-rating", "google-play-korea-game-rating", "app-store-age-rating"])) {
    actions.push(["Complete rating gates", "Use `qa/rating-content-inventory.md`, then complete store-specific content/age/Korea game rating evidence from the real console or rating authority flow."]);
  }
  if (hasAny(consoleOpen, ["google-play-data-safety", "app-store-privacy-export"])) {
    actions.push(["Submit privacy declarations", "Submit repo-prepared Data Not Collected/privacy/export evidence in Play Console and App Store Connect."]);
  }
  if (hasAny(consoleOpen, ["apps-in-toss-deployment-approval", "google-play-track-preview", "app-store-review-metadata"])) {
    actions.push(["Preview and request review", "Preview uploaded build plus listing/declarations together, then request review only after explicit approval evidence exists."]);
  }
  if (approvalOpen.length > 0) {
    actions.push(["Record final release approval", "After every manual QA, console evidence, store field, and preview gate is clear, fill `qa/release-approval-evidence.json` and attach a stable approval reference."]);
  }

  if (actions.length === 0) {
    return "- none";
  }

  return actions.map(([title, detail], index) => `${index + 1}. **${title}**: ${detail}`).join("\n");
}

function renderItems(items, targetField) {
  if (items.length === 0) {
    return "- none";
  }
  return items.map((item) => {
    const target = targetField === "targets" ? item.targets.join(", ") : item.target;
    return `- \`${item.id}\` (${target}) - ${item.title} - \`${item.status}\``;
  }).join("\n");
}

function renderManualTargetItems(items) {
  if (items.length === 0) {
    return "- none";
  }
  return items.map((entry) => `- \`${entry.itemId}/${entry.target}\` - ${entry.title} - \`${entry.status}\``).join("\n");
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

function countStatus(items, status) {
  return (items ?? []).filter((item) => item?.status === status).length;
}

function hasAny(items, ids) {
  const itemIds = new Set(items.map((item) => item.id));
  return ids.some((id) => itemIds.has(id));
}

function findUnresolved(target, value, prefix = "") {
  if (typeof value === "string") {
    return value.includes("확정 필요") ? [`${target}: \`${prefix}\` = ${value}`] : [];
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
    return reason ? [`${target}: \`${field}\` = ${value} (${reason})`] : [];
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
  console.log(checkOnly ? "Release gate dashboard check" : "Release gate dashboard");
  console.log(checkOnly ? "============================" : "======================");
  console.log("");
  console.log(`Dashboard: ${dashboardPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Release gate dashboard checks: PASS" : "Release gate dashboard checks: FAIL");
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
