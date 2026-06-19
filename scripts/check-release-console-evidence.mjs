import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasUrlCredentials, isBlockedPublicUrlHost } from "./public-url-guard.mjs";
import { getReleaseConsoleDependenciesById } from "./release-console-dependencies.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const jsonOutput = process.argv.includes("--json");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];

const expectedItems = [
  ["apps-in-toss-ait-upload", "AppsInToss"],
  ["apps-in-toss-qr-preview", "AppsInToss"],
  ["apps-in-toss-category-exposure", "AppsInToss"],
  ["apps-in-toss-game-rating", "AppsInToss"],
  ["apps-in-toss-deployment-approval", "AppsInToss"],
  ["google-play-signed-aab-upload", "Google Play"],
  ["google-play-content-rating", "Google Play"],
  ["google-play-korea-game-rating", "Google Play"],
  ["google-play-data-safety", "Google Play"],
  ["google-play-track-preview", "Google Play"],
  ["app-store-signed-build-upload", "App Store"],
  ["app-store-age-rating", "App Store"],
  ["app-store-privacy-export", "App Store"],
  ["app-store-review-metadata", "App Store"]
];
const expectedItemIds = expectedItems.map(([id]) => id);
const expectedTargetsById = new Map(expectedItems);
const dependenciesById = getReleaseConsoleDependenciesById();
const allowedStatuses = new Set(["pending", "blocked", "failed", "passed"]);
const requiredEvidenceFields = [
  "verifiedAt",
  "verifier",
  "accountOrWorkspace",
  "buildArtifact",
  "submissionReference",
  "result",
  "notes"
];
const requiredAttachmentFields = ["screenshots", "recordings", "consoleReferences"];
const unresolvedMarkers = ["확정 필요", "TODO", "TBD", ""];
const localAttachmentExtensions = {
  screenshots: /\.(png|jpe?g|webp)$/i,
  recordings: /\.(mp4|mov|webm)$/i
};
const evidencePath = process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json";
const manifestPath = process.env.RELEASE_ARTIFACT_MANIFEST_PATH ?? "qa/release-artifact-manifest.json";
const evidence = readJson(evidencePath);
const artifactManifest = exists(manifestPath) ? readJson(manifestPath) : null;

checkRoot();
checkItems();
checkDependencies();
checkRootStatus();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exit(1);
}

function checkRoot() {
  requireEqual("schemaVersion", evidence.schemaVersion, 1);
  requireEqual("appName", evidence.appName, "starlit-apprentice");
  if (!allowedStatuses.has(evidence.status)) {
    automatedFailures.push(`status has invalid value: ${JSON.stringify(evidence.status)}.`);
  }
  if (typeof evidence.lastUpdated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.lastUpdated)) {
    automatedFailures.push("lastUpdated must use YYYY-MM-DD format.");
  }
  if (evidence.releaseCandidateRequiresAllPassed !== true) {
    automatedFailures.push("releaseCandidateRequiresAllPassed must be true.");
  }
  if (!exists("docs/release-console-evidence.md")) {
    automatedFailures.push("Missing release console evidence documentation: docs/release-console-evidence.md");
  }
  if (!artifactManifest?.manualQaBuildId || typeof artifactManifest.manualQaBuildId !== "string") {
    automatedFailures.push(`Missing manual QA build ID in ${manifestPath}. Run pnpm release:artifact-manifest.`);
  }
}

function checkItems() {
  if (!Array.isArray(evidence.items)) {
    automatedFailures.push("items must be an array.");
    return;
  }

  const ids = new Set();
  for (const item of evidence.items) {
    if (!item || typeof item !== "object") {
      automatedFailures.push("Each release console evidence item must be an object.");
      continue;
    }

    const id = item.id;
    if (typeof id !== "string" || id.trim() === "") {
      automatedFailures.push("Each release console evidence item must include a non-empty id.");
      continue;
    }
    if (ids.has(id)) {
      automatedFailures.push(`Duplicate release console evidence item id: ${id}`);
    }
    ids.add(id);

    if (expectedTargetsById.has(id) && item.target !== expectedTargetsById.get(id)) {
      automatedFailures.push(`${id}.target must be ${JSON.stringify(expectedTargetsById.get(id))}, got ${JSON.stringify(item.target)}.`);
    }
    if (typeof item.title !== "string" || item.title.trim() === "") {
      automatedFailures.push(`${id} must include a title.`);
    }
    if (!Array.isArray(item.acceptance) || item.acceptance.length === 0) {
      automatedFailures.push(`${id} must include acceptance criteria.`);
    }
    if (!allowedStatuses.has(item.status)) {
      automatedFailures.push(`${id} has invalid status: ${JSON.stringify(item.status)}.`);
      continue;
    }

    checkEvidenceFields(item);
    if (item.status === "passed") {
      checkConclusiveEvidence(item, "passed");
    } else if (item.status === "failed") {
      checkConclusiveEvidence(item, "failed");
    } else {
      addManual(`${item.id}: ${item.title} is ${item.status}.`);
    }
  }

  for (const expectedId of expectedItemIds) {
    if (!ids.has(expectedId)) {
      automatedFailures.push(`Missing release console evidence item: ${expectedId}`);
    }
  }

  for (const id of ids) {
    if (!expectedItemIds.includes(id)) {
      warnings.push(`Unexpected release console evidence item is present: ${id}`);
    }
  }
}

function checkDependencies() {
  if (!Array.isArray(evidence.items)) {
    return;
  }

  const itemById = new Map(evidence.items.map((item) => [item?.id, item]));
  for (const [id, dependencyIds] of dependenciesById) {
    if (!expectedItemIds.includes(id)) {
      automatedFailures.push(`Release console dependency references unknown item: ${id}`);
    }
    const item = itemById.get(id);
    if (!item) {
      continue;
    }

    for (const dependencyId of dependencyIds) {
      if (!expectedItemIds.includes(dependencyId)) {
        automatedFailures.push(`${id} depends on unknown release console evidence item: ${dependencyId}`);
      }
      if (!itemById.has(dependencyId)) {
        automatedFailures.push(`${id} depends on missing release console evidence item: ${dependencyId}`);
      }
    }

    if (item.status !== "passed") {
      continue;
    }

    const openDependencies = dependencyIds.filter((dependencyId) => itemById.get(dependencyId)?.status !== "passed");
    if (openDependencies.length > 0) {
      automatedFailures.push(`${id} cannot be passed until prerequisite console evidence is passed: ${openDependencies.join(", ")}.`);
    }
  }
}

function checkEvidenceFields(item) {
  if (!item.evidence || typeof item.evidence !== "object") {
    automatedFailures.push(`${item.id} must include evidence.`);
    return;
  }

  for (const field of requiredEvidenceFields) {
    if (!(field in item.evidence)) {
      automatedFailures.push(`${item.id}.evidence.${field} is required.`);
    }
  }

  if (!item.evidence.attachments || typeof item.evidence.attachments !== "object" || Array.isArray(item.evidence.attachments)) {
    automatedFailures.push(`${item.id}.evidence.attachments is required.`);
    return;
  }

  for (const field of requiredAttachmentFields) {
    const value = item.evidence.attachments[field];
    if (!Array.isArray(value)) {
      automatedFailures.push(`${item.id}.evidence.attachments.${field} must be an array.`);
      continue;
    }
    for (const entry of value) {
      if (isUnresolved(entry)) {
        automatedFailures.push(`${item.id}.evidence.attachments.${field} contains an unresolved or invalid entry.`);
        continue;
      }
      checkAttachmentEntry(item.id, field, entry);
    }
  }
}

function checkRootStatus() {
  if (!Array.isArray(evidence.items)) {
    return;
  }
  const statuses = evidence.items.map((item) => item?.status);
  const expectedStatus = statuses.every((status) => status === "passed")
    ? "passed"
    : statuses.some((status) => status === "failed")
      ? "failed"
      : statuses.some((status) => status === "blocked")
        ? "blocked"
        : "pending";
  requireEqual("status", evidence.status, expectedStatus);
}

function checkConclusiveEvidence(item, expectedResult) {
  for (const field of requiredEvidenceFields) {
    const value = item.evidence?.[field];
    if (isUnresolved(value)) {
      automatedFailures.push(`${item.id}.evidence.${field} must be concrete when status is ${expectedResult}.`);
    }
  }
  if (item.evidence?.result !== expectedResult) {
    automatedFailures.push(`${item.id}.evidence.result must be ${JSON.stringify(expectedResult)} when status is ${expectedResult}.`);
  }
  checkEvidenceTimestamp(item, "verifiedAt", expectedResult);
  const manualQaBuildId = artifactManifest?.manualQaBuildId;
  if (manualQaBuildId && !item.evidence?.buildArtifact?.startsWith(`${manualQaBuildId}; `)) {
    automatedFailures.push(
      `${item.id}.evidence.buildArtifact must start with "${manualQaBuildId}; " so console evidence is tied to the current release artifact manifest.`
    );
  } else if (manualQaBuildId) {
    const selectedArtifact = item.evidence.buildArtifact.slice(`${manualQaBuildId}; `.length).trim();
    if (selectedArtifact.length === 0) {
      automatedFailures.push(`${item.id}.evidence.buildArtifact must include the uploaded artifact or selected console build reference after the current manualQaBuildId.`);
    }
    checkPublicHttpsEvidenceUrl(`${item.id}.evidence.buildArtifact`, selectedArtifact);
    checkConsoleEvidenceReference(item, selectedArtifact);
  }
  checkPublicHttpsEvidenceUrl(`${item.id}.evidence.submissionReference`, item.evidence?.submissionReference);
  checkConclusiveAttachments(item, expectedResult);
}

function checkConsoleEvidenceReference(item, selectedArtifact) {
  const artifacts = artifactManifest?.artifacts ?? {};

  if (item.target === "Google Play") {
    for (const localPath of [artifacts.androidQaApk?.path, artifacts.androidAab?.path]) {
      if (selectedArtifact === localPath) {
        automatedFailures.push(`${item.id}.evidence.buildArtifact cannot use local Android package output as Google Play console evidence; use the Play Console signed upload, build, questionnaire, or track reference.`);
      }
    }
  }

  if (item.target === "App Store" && selectedArtifact === artifacts.iosApp?.path) {
    automatedFailures.push(`${item.id}.evidence.buildArtifact cannot use the local unsigned iOS .app as App Store console evidence; use an App Store Connect, TestFlight, signed archive, or selected build reference.`);
  }

  if (item.target === "AppsInToss" && selectedArtifact === artifacts.appsInTossCandidate?.path) {
    automatedFailures.push(`${item.id}.evidence.buildArtifact cannot use the local AppsInToss candidate ZIP as console evidence; use the .ait upload plus a Developer Center, QR, test-scheme, review, or deployment reference.`);
  }

  const rule = consoleReferenceRule(item.id);
  if (!rule) {
    return;
  }
  if (!referenceValues(item, selectedArtifact).some((value) => rule.pattern.test(value))) {
    automatedFailures.push(`${item.id}.evidence must include a stable ${rule.label} reference in buildArtifact, submissionReference, or attachments.consoleReferences.`);
  }
}

function consoleReferenceRule(itemId) {
  const rules = {
    "apps-in-toss-ait-upload": {
      label: "AppsInToss upload/build",
      pattern: /\b(AppsInToss|Developer Center|Toss|upload|build|QR|test scheme)\b|콘솔|업로드|빌드|큐알|테스트/i
    },
    "apps-in-toss-qr-preview": {
      label: "AppsInToss QR/test preview",
      pattern: /\b(QR|test scheme|preview|Toss-app|Toss app|Toss)\b|큐알|테스트|미리보기/i
    },
    "apps-in-toss-category-exposure": {
      label: "AppsInToss category/exposure",
      pattern: /\b(AppsInToss|Developer Center|category|exposure|game|console)\b|카테고리|노출|게임|콘솔/i
    },
    "apps-in-toss-game-rating": {
      label: "game rating",
      pattern: /\b(rating|GRAC|Game Rating|certificate|store URL)\b|등급|게임물|증빙|인증/i
    },
    "apps-in-toss-deployment-approval": {
      label: "AppsInToss review/deployment approval",
      pattern: /\b(deployment|approval|approved|review|publish|AppsInToss)\b|배포|승인|심사|게시/i
    },
    "google-play-signed-aab-upload": {
      label: "Play Console signed AAB upload/build",
      pattern: /\b(Play Console|Google Play|version code|bundle|AAB|upload|processing|release|track)\b|플레이|콘솔|버전|업로드|처리|트랙/i
    },
    "google-play-content-rating": {
      label: "Google Play content rating",
      pattern: /\b(Play Console|content rating|IARC|rating|questionnaire)\b|등급|설문|콘텐츠/i
    },
    "google-play-korea-game-rating": {
      label: "Korea game rating",
      pattern: /\b(Play Console|Korea|GRAC|Game Rating|rating|certificate|IARC)\b|한국|등급|게임물|증빙|인증/i
    },
    "google-play-data-safety": {
      label: "Google Play Data safety",
      pattern: /\b(Play Console|Data safety|privacy|declaration)\b|데이터 보안|개인정보|선언/i
    },
    "google-play-track-preview": {
      label: "Google Play track/rollout preview",
      pattern: /\b(Play Console|track|rollout|release|preview|internal|production)\b|트랙|출시|미리보기|프로덕션/i
    },
    "app-store-signed-build-upload": {
      label: "App Store Connect signed build upload",
      pattern: /\b(App Store Connect|TestFlight|build|archive|upload|processing|Xcode|Transporter|Apple Distribution)\b|빌드|업로드|처리/i
    },
    "app-store-age-rating": {
      label: "App Store age rating",
      pattern: /\b(App Store Connect|age rating|rating)\b|연령|등급/i
    },
    "app-store-privacy-export": {
      label: "App Store privacy/export compliance",
      pattern: /\b(App Store Connect|privacy|export|compliance)\b|개인정보|수출|준수/i
    },
    "app-store-review-metadata": {
      label: "App Store review metadata/submission",
      pattern: /\b(App Store Connect|review|metadata|submission)\b|심사|메타데이터|제출/i
    }
  };
  return rules[itemId] ?? null;
}

function referenceValues(item, selectedArtifact) {
  const values = [
    item.evidence?.submissionReference,
    ...(item.evidence?.attachments?.consoleReferences ?? [])
  ];
  if (selectedArtifact && !knownLocalArtifactPaths().has(selectedArtifact)) {
    values.push(selectedArtifact);
  }
  return values.filter((value) => typeof value === "string" && !isUnresolved(value));
}

function knownLocalArtifactPaths() {
  const artifacts = artifactManifest?.artifacts ?? {};
  return new Set(Object.values(artifacts).map((artifact) => artifact?.path).filter(Boolean));
}

function checkConclusiveAttachments(item, expectedResult) {
  const attachments = item.evidence?.attachments;
  const entries = requiredAttachmentFields.flatMap((field) => attachments?.[field] ?? []);
  if (entries.length === 0) {
    automatedFailures.push(
      `${item.id}.evidence.attachments must include at least one screenshot, recording, or console reference when status is ${expectedResult}.`
    );
  }
}

function checkEvidenceTimestamp(item, field, expectedResult) {
  const value = item.evidence?.[field];
  if (!isDateOrDateTime(value)) {
    automatedFailures.push(`${item.id}.evidence.${field} must be an ISO date or timestamp when status is ${expectedResult}.`);
  }
}

function checkAttachmentEntry(itemId, field, entry) {
  if (field === "consoleReferences") {
    if (!isStableReference(entry)) {
      automatedFailures.push(`${itemId}.evidence.attachments.${field} must contain stable console/build references, not free-form placeholder text.`);
    }
    checkPublicHttpsEvidenceUrl(`${itemId}.evidence.attachments.${field}`, entry);
    return;
  }

  if (isHttpsUrl(entry)) {
    checkPublicHttpsEvidenceUrl(`${itemId}.evidence.attachments.${field}`, entry);
    return;
  }

  if (!localAttachmentExtensions[field]?.test(entry)) {
    automatedFailures.push(`${itemId}.evidence.attachments.${field} must use an expected file extension or an HTTPS URL: ${entry}`);
    return;
  }

  if (entry.startsWith("/") || entry.startsWith("~") || entry.split("/").includes("..")) {
    automatedFailures.push(`${itemId}.evidence.attachments.${field} must use a repo-relative path or HTTPS URL: ${entry}`);
    return;
  }

  if (!exists(entry)) {
    automatedFailures.push(`${itemId}.evidence.attachments.${field} points to a missing local file: ${entry}`);
  }
}

function isDateOrDateTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value);
}

function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\/\S+$/i.test(value);
}

function isStableReference(value) {
  if (isHttpsUrl(value)) {
    return !isBlockedEvidenceUrl(value);
  }
  return typeof value === "string" && value.trim().length >= 8 && !/\b(TODO|TBD|확정 필요)\b/i.test(value);
}

function checkPublicHttpsEvidenceUrl(label, value) {
  if (!isHttpsUrl(value)) {
    return;
  }
  if (isBlockedEvidenceUrl(value)) {
    automatedFailures.push(`${label} must not use localhost, non-public/reserved IP, IPv6 local/documentation/multicast, or placeholder HTTPS URLs as release console evidence: ${value}`);
  }
}

function isBlockedEvidenceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (hasUrlCredentials(url) || isBlockedPublicUrlHost(url.hostname));
  } catch {
    return false;
  }
}

function addManual(message) {
  if (allowManualBlockers) {
    manualBlockers.push(message);
  } else {
    automatedFailures.push(message);
  }
}

function isUnresolved(value) {
  if (typeof value !== "string") {
    return true;
  }
  const trimmed = value.trim();
  return unresolvedMarkers.some((marker) => marker === "" ? trimmed === "" : trimmed.includes(marker));
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    automatedFailures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function printReport() {
  const report = { automatedFailures, manualBlockers, warnings };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Release console evidence check");
  console.log("==============================");
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated release-console checks: PASS" : "Automated release-console checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Release console gates: CLEAR" : `Release console gates: ${manualBlockers.length} blocker(s)`);
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
