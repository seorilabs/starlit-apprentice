import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getReleaseConsoleDependenciesById, releaseConsoleDependencies } from "./release-console-dependencies.mjs";
import { releaseConsolePreflightCommands, renderCommandBlock } from "./release-verification-commands.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packetPath = "qa/release-console-packet.md";
const checkOnly = process.argv.includes("--check");
const failures = [];

const manifest = readJson("qa/release-artifact-manifest.json");
const evidence = readJson("qa/release-console-evidence.json");
const dependenciesById = getReleaseConsoleDependenciesById();
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
    failures.push(`Missing release console packet: ${packetPath}. Run pnpm release:console-packet.`);
    return;
  }

  const current = read(packetPath);
  if (current !== packet) {
    failures.push(`${packetPath} is stale. Run pnpm release:console-packet after updating artifacts or release console evidence.`);
  }
}

function renderPacket() {
  const artifactRows = [
    artifactRow("Android QA APK", manifest.artifacts.androidQaApk),
    artifactRow("Android AAB", manifest.artifacts.androidAab),
    artifactRow("iOS .app", manifest.artifacts.iosApp),
    artifactRow("AppsInToss ZIP", manifest.artifacts.appsInTossCandidate),
    artifactRow("AppsInToss .ait", manifest.artifacts.appsInTossAit)
  ].join("\n");

  const openItems = evidence.items.filter((item) => item.status !== "passed");
  const targets = ["AppsInToss", "Google Play", "App Store"];
  const groupedItems = targets.map(renderTargetSection).join("\n\n");
  const dependencyRows = releaseConsoleDependencies
    .map((entry) => `| \`${entry.id}\` | ${entry.dependsOn.map((id) => `\`${id}\``).join(", ")} |`)
    .join("\n");

  return `# Release Console Handoff Packet

This file is generated from \`qa/release-artifact-manifest.json\` and \`qa/release-console-evidence.json\`.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |
| Console evidence source | \`qa/release-console-evidence.json\` |

## Artifact Fingerprints

| Artifact | Path | Size | SHA-256 |
| --- | --- | ---: | --- |
${artifactRows}

## Preflight Commands

\`\`\`bash
${renderCommandBlock(releaseConsolePreflightCommands)}
\`\`\`

## Evidence Rule

For every passed item in \`qa/release-console-evidence.json\`, set \`evidence.result\` to \`passed\` and set \`evidence.buildArtifact\` to this format:

\`\`\`text
${manifest.manualQaBuildId}; <uploaded artifact, selected build, test scheme, review ID, or console reference>
\`\`\`

Do not mark an item \`passed\` from local build output, Playwright, or this packet alone. Console evidence must come from AppsInToss Developer Center, Google Play Console, App Store Connect, TestFlight, or the actual store upload/review surface. \`buildArtifact\` must not use the local Android QA APK, local unsigned/upload AAB, local unsigned iOS \`.app\`, or local AppsInToss candidate ZIP as console proof. AppsInToss \`.ait\` can identify the uploaded package only when it is paired with a stable Developer Center upload, QR/test-scheme, review, or deployment reference.

Every passed item must include a target-specific console reference in \`buildArtifact\`, \`submissionReference\`, or \`attachments.consoleReferences\`: Play Console signed upload/build/questionnaire/track references for Google Play, App Store Connect/TestFlight signed build/rating/privacy/review references for App Store, and AppsInToss Developer Center upload/QR/test-scheme/category/rating/deployment references for AppsInToss. \`pnpm check:release-console\` enforces the current Manual QA build ID prefix plus at least one screenshot, recording, or console reference attachment for every passed or failed item. Local screenshot and recording paths must exist in the repo when checked; HTTPS URLs are allowed for externally hosted captures only when they are public, credential-free, non-placeholder URLs. Credentialed URLs with username/password, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, \`.local\`, \`.test\`, \`.invalid\`, \`.example\`, and \`example.com\`-family URLs are rejected in console evidence URL fields.

## Dependency Rules

These items cannot be marked \`passed\` until every prerequisite row is already \`passed\` in \`qa/release-console-evidence.json\`.

| Item | Prerequisites |
| --- | --- |
${dependencyRows}

## Open Console Items

${openItems.length > 0 ? openItems.map((item) => `- \`${item.id}\` (${item.target})`).join("\n") : "- none"}

## Console Items

${groupedItems}
`;
}

function renderTargetSection(target) {
  const items = evidence.items.filter((item) => item.target === target);
  return `### ${target}

${items.map(renderItem).join("\n\n")}`;
}

function artifactRow(label, artifact) {
  const size = artifact.kind === "directory" ? artifact.totalBytes : artifact.sizeBytes;
  const suffix = artifact.kind === "directory" ? ` / ${artifact.fileCount} files` : "";
  return `| ${label} | \`${artifact.path}\` | ${formatBytes(size)}${suffix} | \`${artifact.sha256}\` |`;
}

function renderItem(item) {
  const acceptance = item.acceptance.map((entry) => `- ${entry}`).join("\n");
  const steps = consoleSteps(item.id).map((entry) => `- ${entry}`).join("\n");
  const prerequisites = dependenciesById.get(item.id) ?? [];

  return `#### ${item.id}

| Field | Value |
| --- | --- |
| Title | ${item.title} |
| Target | \`${item.target}\` |
| Current status | \`${item.status}\` |
| Prerequisites | ${prerequisites.length > 0 ? prerequisites.map((id) => `\`${id}\``).join(", ") : "none"} |

Acceptance:

${acceptance}

Suggested console path:

${steps}

Evidence fields to fill:

\`\`\`json
{
  "verifiedAt": "<ISO timestamp or local time with timezone>",
  "verifier": "<verifier name>",
  "accountOrWorkspace": "<console account/workspace>",
  "buildArtifact": "${manifest.manualQaBuildId}; <uploaded artifact or selected build reference>",
  "submissionReference": "<console URL, build ID, review ID, QR/test scheme, or track reference>",
  "result": "passed",
  "attachments": {
    "screenshots": ["<path or URL to console screenshot>"],
    "recordings": [],
    "consoleReferences": ["<stable console URL or immutable reference>"]
  },
  "notes": "<short concrete observation>"
}
\`\`\``;
}

function consoleSteps(id) {
  const shared = [
    "Use the artifact hashes and Manual QA build ID above as the build identity.",
    "Record the console account or workspace used for verification.",
    "Capture at least one screenshot, recording, or stable console reference before marking the item passed."
  ];

  const scenarios = {
    "apps-in-toss-ait-upload": [
      ...shared,
      "Upload `apps-in-toss/build/starlit-apprentice.ait` in AppsInToss Developer Center.",
      "Record the generated test scheme, QR reference, or upload/build ID.",
      "Confirm the uploaded artifact is the one tied to the current AppsInToss .ait SHA-256."
    ],
    "apps-in-toss-qr-preview": [
      ...shared,
      "Open the generated AppsInToss QR or test scheme in the Toss app.",
      "Confirm the preview references the uploaded .ait artifact.",
      "Cross-reference this evidence with `apps-in-toss-preview` in `qa/manual-qa-evidence.json`."
    ],
    "apps-in-toss-category-exposure": [
      ...shared,
      "Confirm the console classifies the mini app as a game.",
      "Fill category, exposure, and service metadata using the approved Star Apprentice values.",
      "Confirm no non-game feature-registration blocker is introduced."
    ],
    "apps-in-toss-game-rating": [
      ...shared,
      "Attach open-market self-rating/store URL evidence or Game Rating and Administration Committee certificate evidence.",
      "Confirm the rating evidence matches this submitted build.",
      "Record the certificate/store/rating reference."
    ],
    "apps-in-toss-deployment-approval": [
      ...shared,
      "Submit review only after upload, QR preview, category, and rating evidence are complete.",
      "Record the review request, review status, or deployment approval reference.",
      "Do not publish production without explicit approval evidence."
    ],
    "google-play-signed-aab-upload": [
      ...shared,
      "Upload the signed AAB to Google Play Console after upload-key signing is configured.",
      "Record the Play Console build/version processing reference.",
      "Confirm the uploaded version matches the current repo version and artifact identity."
    ],
    "google-play-content-rating": [
      ...shared,
      "Complete the Google Play content rating questionnaire for the actual game content.",
      "Record the resulting rating.",
      "Confirm the outcome matches the repo-documented content boundaries."
    ],
    "google-play-korea-game-rating": [
      ...shared,
      "Provide Korea game rating evidence if required for the selected distribution path.",
      "Record the rating certificate, store self-rating, or exemption rationale reference.",
      "Confirm the evidence matches this build."
    ],
    "google-play-data-safety": [
      ...shared,
      "Submit the repo-prepared Data safety declaration in Play Console.",
      "Confirm the console declaration remains Data Not Collected for the MVP.",
      "Capture the console preview or stable reference."
    ],
    "google-play-track-preview": [
      ...shared,
      "Record the chosen track and rollout state.",
      "Preview store listing, uploaded build, screenshots, and declarations together.",
      "Do not start production rollout without explicit approval evidence."
    ],
    "app-store-signed-build-upload": [
      ...shared,
      "Upload a signed Apple Distribution archive to App Store Connect.",
      "Record TestFlight/App Store Connect build processing and selected build reference.",
      "Confirm the uploaded version matches the current repo version and artifact identity."
    ],
    "app-store-age-rating": [
      ...shared,
      "Complete the App Store age rating questionnaire for the actual game content.",
      "Record the resulting rating.",
      "Confirm the outcome matches the repo-documented content boundaries."
    ],
    "app-store-privacy-export": [
      ...shared,
      "Submit App Store privacy details as Data Not Collected for the current MVP.",
      "Confirm export compliance with no non-exempt encryption.",
      "Capture the App Store Connect privacy/export preview or stable reference."
    ],
    "app-store-review-metadata": [
      ...shared,
      "Fill review contact, support URL, privacy policy URL, and review notes in App Store Connect.",
      "Preview selected build, screenshots, metadata, privacy, export, and age rating together.",
      "Do not submit final review without explicit approval evidence."
    ]
  };

  return scenarios[id] ?? shared;
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log(checkOnly ? "Release console packet check" : "Release console packet");
  console.log(checkOnly ? "============================" : "======================");
  console.log("");
  console.log(`Packet: ${packetPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Release console packet checks: PASS" : "Release console packet checks: FAIL");
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
