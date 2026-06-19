import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACTIONS } from "../packages/product-core/dist/index.js";
import { manualQaRouteCues } from "./qa-route-plans.mjs";
import { manualQaPreflightCommands, renderCommandBlock } from "./release-verification-commands.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packetPath = "qa/manual-qa-packet.md";
const checkOnly = process.argv.includes("--check");
const failures = [];
const actionById = new Map(ACTIONS.map((action) => [action.id, action]));

const manifest = readJson("qa/release-artifact-manifest.json");
const evidence = readJson("qa/manual-qa-evidence.json");
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
    failures.push(`Missing manual QA packet: ${packetPath}. Run pnpm release:manual-qa-packet.`);
    return;
  }

  const current = read(packetPath);
  if (current !== packet) {
    failures.push(`${packetPath} is stale. Run pnpm release:manual-qa-packet after updating artifacts or manual QA evidence.`);
  }
}

function renderPacket() {
  const artifactRows = [
    artifactRow("Vite dist", manifest.artifacts.webDist),
    artifactRow("Android QA APK", manifest.artifacts.androidQaApk),
    artifactRow("Android AAB", manifest.artifacts.androidAab),
    artifactRow("iOS .app", manifest.artifacts.iosApp),
    artifactRow("AppsInToss ZIP", manifest.artifacts.appsInTossCandidate),
    artifactRow("AppsInToss .ait", manifest.artifacts.appsInTossAit)
  ].join("\n");

  const items = evidence.items.map(renderItem).join("\n\n");
  const unresolved = evidence.items.filter((item) => item.status !== "passed").map((item) => item.id);
  const unresolvedTargets = evidence.items.flatMap((item) => openTargetEvidence(item).map((entry) => `${item.id}/${entry.target}`));

  return `# Manual QA Handoff Packet

This file is generated from \`qa/release-artifact-manifest.json\` and \`qa/manual-qa-evidence.json\`.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |
| Evidence source | \`${manifest.manualQaEvidence.sourceFile}\` |

## Artifact Fingerprints

| Artifact | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
${artifactRows}

## Artifact Use Matrix

| Target | Use for manual QA | Do not use as proof |
| --- | --- | --- |
| Google Play | \`${manifest.artifacts.androidQaApk.path}\` for Android target-device QA, or a stable Play Console installed build reference after upload | Local unsigned/upload AAB alone; it is not a target-device run, including \`native-share\` |
| App Store | TestFlight, signed device install, or stable App Store Connect build reference after Apple Distribution upload | Local unsigned \`${manifest.artifacts.iosApp.path}\` alone |
| AppsInToss | \`${manifest.artifacts.appsInTossAit.path}\` plus AppsInToss console QR/test-scheme reference | Local \`.ait\` alone or local Vite preview alone |

## Preflight Commands

\`\`\`bash
${renderCommandBlock(manualQaPreflightCommands)}
\`\`\`

## Evidence Rule

For every passed target in \`qa/manual-qa-evidence.json\`, set the matching \`targetEvidence[]\` entry to \`passed\` and set \`buildArtifact\` to this format:

\`\`\`text
${manifest.manualQaBuildId}; <tested platform artifact path or store/TestFlight/AppsInToss build reference>
\`\`\`

Do not mark an item \`passed\` until every \`targetEvidence[]\` entry for that item is \`passed\`. Do not pass Google Play target-device QA from the local upload AAB alone, App Store target-device QA from the local unsigned iOS \`.app\`, or AppsInToss QA from local \`.ait\`/Vite preview alone. Target-device or console evidence is still required, and \`pnpm check:manual-qa\` enforces the current Manual QA build ID prefix plus at least one screenshot, recording, or console reference attachment for every passed or failed target. Local screenshot and recording paths must exist in the repo when checked; HTTPS URLs are allowed for externally hosted captures only when they are public, credential-free, non-placeholder URLs. Credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, \`.local\`, \`.test\`, \`.invalid\`, \`.example\`, and \`example.com\`-family URLs are rejected in manual QA evidence URL fields. For \`native-share\`, every passed target must also record \`receivedShareUrl\` with the actual recipient URL, and \`pnpm check:manual-qa\` rejects credentialed, non-public, non-HTTPS, non-canonical, unknown-ending, or hash-bearing ending URLs.

## Open Manual Items

${unresolved.length > 0 ? unresolved.map((id) => `- \`${id}\``).join("\n") : "- none"}

## Open Manual Targets

${unresolvedTargets.length > 0 ? unresolvedTargets.map((id) => `- \`${id}\``).join("\n") : "- none"}

## Test Items

${items}
`;
}

function artifactRow(label, artifact) {
  const size = artifact.kind === "directory" ? artifact.totalBytes : artifact.sizeBytes;
  const suffix = artifact.kind === "directory" ? ` / ${artifact.fileCount} files` : "";
  return `| ${label} | \`${artifact.path}\` | ${formatBytes(size)}${suffix} | \`${artifact.sha256}\` |`;
}

function renderItem(item) {
  const acceptance = item.acceptance.map((entry) => `- ${entry}`).join("\n");
  const steps = scenarioSteps(item.id).map((entry) => `- ${entry}`).join("\n");
  const routeCue = renderRouteCue(item.id);
  const targets = item.targets.map((target) => `\`${target}\``).join(", ");
  const targetEvidence = renderTargetEvidenceTable(item);
  const targetEvidenceSnippet = renderTargetEvidenceSnippet(item);

  return `### ${item.id}

| Field | Value |
| --- | --- |
| Title | ${item.title} |
| Targets | ${targets} |
| Current status | \`${item.status}\` |

Target evidence:

${targetEvidence}

Acceptance:

${acceptance}

Suggested target-device path:

${steps}

${routeCue}

Target evidence fields to fill:

\`\`\`json
${targetEvidenceSnippet}
\`\`\``;
}

function renderTargetEvidenceTable(item) {
  if (!Array.isArray(item.targetEvidence) || item.targetEvidence.length === 0) {
    return "_Missing target evidence entries._";
  }
  const rows = item.targetEvidence.map((entry) => {
    const attachmentCount = ["screenshots", "recordings", "consoleReferences"]
      .flatMap((field) => entry.attachments?.[field] ?? [])
      .length;
    return `| ${entry.target} | \`${entry.status}\` | \`${entry.buildArtifact}\` | ${attachmentCount} |`;
  });
  return `| Target | Status | Build artifact | Attachments |
| --- | --- | --- | ---: |
${rows.join("\n")}`;
}

function renderTargetEvidenceSnippet(item) {
  const entries = (item.targetEvidence ?? []).map((entry) => {
    const snippet = {
      target: entry.target,
      status: "passed",
      testedAt: "<ISO timestamp or local time with timezone>",
      tester: "<tester name>",
      device: "<device model>",
      osVersion: "<OS and app container version>",
      buildArtifact: `${manifest.manualQaBuildId}; <tested ${entry.target} artifact/reference>`,
      result: "passed",
      attachments: {
        screenshots: ["<path or URL to target-device screenshot>"],
        recordings: [],
        consoleReferences: []
      },
      notes: "<short concrete observation>"
    };
    if (item.id === "native-share") {
      snippet.receivedShareUrl = "https://<confirmed-domain>/starlit-apprentice/?ending=<known-ending-code>";
    }
    return snippet;
  });
  return JSON.stringify({ targetEvidence: entries }, null, 2);
}

function openTargetEvidence(item) {
  if (!Array.isArray(item.targetEvidence)) {
    return item.status === "passed" ? [] : [{ target: "missing-target-evidence" }];
  }
  return item.targetEvidence.filter((entry) => entry?.status !== "passed");
}

function scenarioSteps(id) {
  const shared = [
    "Install or open the build tied to the Manual QA build ID above.",
    "Start from a clean save unless the item explicitly tests reload or resume behavior.",
    "Record device model, OS version, tested build reference, and notable screen observations."
  ];

  const scenarios = {
    "target-device-pacing": [
      ...shared,
      "Tap `새로 시작` and confirm the first-month goal is understandable without external instructions.",
      "Select four weekly actions and verify the schedule readiness copy changes from 0/4 to ready.",
      "Advance through month 1, then continue to month 3 with a balanced mix of lesson, work, rest, and outing.",
      "Confirm there is no stalled state, obvious resource exhaustion, or confusing month transition."
    ],
    "target-device-readability": [
      ...shared,
      "Reach a month-end event result and inspect event body plus effect delta readability.",
      "Reach an ending screen or open a shared ending URL.",
      "Inspect ending title, body, and ending evidence on the physical screen.",
      "Use native back/reload once and confirm scrolling remains predictable and text is not clipped."
    ],
    "native-share": [
      ...shared,
      "Reach an ending screen in the Android or iOS shell.",
      "Tap the share action and confirm the native share sheet appears.",
      "Send to at least one recipient app.",
      "Confirm the received payload includes readable title, text, and an ending URL.",
      "Confirm the ending URL is public HTTPS without username/password credentials, has only one known ending query parameter, has no hash fragment, and is not a capacitor://, file://, credentialed HTTPS URL, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast range, or preview-only URL."
    ],
    "native-webview-back-reload": [
      ...shared,
      "Use native back from schedule, collection, and ending screens.",
      "Complete a month, stop on the result screen before tapping next month, then reload or background/resume.",
      "Confirm continuing advances to the correct next month or ending without replaying the same slot.",
      "Confirm native safe areas and chrome do not block primary actions."
    ],
    "apps-in-toss-preview": [
      ...shared,
      "Open the app through the AppsInToss QR/Toss-app preview path.",
      "Visit first-run, schedule, result, ending, and collection screens.",
      "Use Toss WebView back/reload controls where available.",
      "Confirm saved progress remains intact and no Toss chrome blocks primary controls."
    ]
  };

  return scenarios[id] ?? shared;
}

function renderRouteCue(id) {
  const cues = {
    "target-device-pacing": `Deterministic route cue:

Use this exact route when checking the 1-month and 3-month pacing feel. It is the same guided-balanced path protected by \`pnpm check:pacing\`.

${renderRouteTable(manualQaRouteCues.guidedBalancedPacing)}

Expected local guardrail from automation: month 3 reaches month 4 schedule selection, keeps resources healthy, surfaces at least one event, and points toward \`mentor\`.`,
    "target-device-readability": `Deterministic route cue:

Use this one-month event route when checking event copy and delta readability. For ending readability without a full playthrough, open the same test host with \`?ending=scholar\` and still capture target-device evidence.

${renderRouteTable(manualQaRouteCues.firstMonthEvent)}`,
    "native-share": `Deterministic route cue:

Use a target-device ending screen. If the tested container exposes the web URL, open \`?ending=scholar\`; otherwise use an already completed ending save or play to an ending before checking the native share sheet.

Do not pass this item from a \`capacitor://localhost\`, \`file://\`, credentialed HTTPS URL, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast range, placeholder domain such as \`example.com\`, or preview-only shared URL. The received ending URL must be public HTTPS without username/password credentials and canonical with only \`?ending=<known-ending-code>\`; if the public share origin is not configured yet, keep this item pending.`,
    "native-webview-back-reload": `Deterministic route cue:

Use this exact first-month route before testing reload or app resume from the month-complete result screen.

${renderRouteTable(manualQaRouteCues.firstMonthEvent)}`,
    "apps-in-toss-preview": `Deterministic route cue:

Use this exact first-month route inside the Toss preview, then visit collection and shared ending states if the preview URL supports \`?ending=scholar\`.

${renderRouteTable(manualQaRouteCues.firstMonthEvent)}`
  };

  return cues[id] ?? "";
}

function renderRouteTable(months) {
  const rows = months
    .map((actions, index) => `| ${index + 1} | ${actions.map(formatActionCell).join(" | ")} |`)
    .join("\n");

  return `| Month | Week 1 | Week 2 | Week 3 | Week 4 |
| --- | --- | --- | --- | --- |
${rows}`;
}

function formatActionCell(actionId) {
  const action = actionById.get(actionId);
  return action ? `${action.label} (\`${action.id}\`)` : `Unknown (\`${actionId}\`)`;
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log(checkOnly ? "Manual QA packet check" : "Manual QA packet");
  console.log(checkOnly ? "======================" : "================");
  console.log("");
  console.log(`Packet: ${packetPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Manual QA packet checks: PASS" : "Manual QA packet checks: FAIL");
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

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
