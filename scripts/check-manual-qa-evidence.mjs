import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ENDINGS } from "../packages/product-core/dist/index.js";
import { hasUrlCredentials, isBlockedPublicUrlHost } from "./public-url-guard.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const jsonOutput = process.argv.includes("--json");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];

const expectedItemIds = [
  "target-device-pacing",
  "target-device-readability",
  "native-share",
  "native-webview-back-reload",
  "apps-in-toss-preview"
];
const allowedStatuses = new Set(["pending", "blocked", "failed", "passed"]);
const requiredEvidenceFields = ["testedAt", "tester", "device", "osVersion", "buildArtifact", "result", "notes"];
const requiredTargetEvidenceFields = ["target", "status", ...requiredEvidenceFields];
const requiredAttachmentFields = ["screenshots", "recordings", "consoleReferences"];
const unresolvedMarkers = ["확정 필요", "TODO", "TBD", ""];
const localAttachmentExtensions = {
  screenshots: /\.(png|jpe?g|webp)$/i,
  recordings: /\.(mp4|mov|webm)$/i
};
const knownEndingCodes = new Set(ENDINGS.map((ending) => ending.code));

const evidencePath = process.env.MANUAL_QA_EVIDENCE_PATH ?? "qa/manual-qa-evidence.json";
const manifestPath = process.env.RELEASE_ARTIFACT_MANIFEST_PATH ?? "qa/release-artifact-manifest.json";
const evidence = readJson(evidencePath);
const artifactManifest = exists(manifestPath) ? readJson(manifestPath) : null;

checkRoot();
checkItems();
checkRootStatus();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exit(1);
}

function checkRoot() {
  requireEqual("schemaVersion", evidence.schemaVersion, 1);
  requireEqual("appName", evidence.appName, "starlit-apprentice");
  if (!["pending", "blocked", "failed", "passed"].includes(evidence.status)) {
    automatedFailures.push(`status has invalid value: ${JSON.stringify(evidence.status)}.`);
  }
  if (typeof evidence.lastUpdated !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.lastUpdated)) {
    automatedFailures.push("lastUpdated must use YYYY-MM-DD format.");
  }
  if (evidence.releaseCandidateRequiresAllPassed !== true) {
    automatedFailures.push("releaseCandidateRequiresAllPassed must be true.");
  }
  if (!exists("docs/manual-qa.md")) {
    automatedFailures.push("Missing manual QA documentation: docs/manual-qa.md");
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
      automatedFailures.push("Each manual QA item must be an object.");
      continue;
    }

    const id = item.id;
    if (typeof id !== "string" || id.trim() === "") {
      automatedFailures.push("Each manual QA item must include a non-empty id.");
      continue;
    }
    if (ids.has(id)) {
      automatedFailures.push(`Duplicate manual QA item id: ${id}`);
    }
    ids.add(id);

    if (typeof item.title !== "string" || item.title.trim() === "") {
      automatedFailures.push(`${id} must include a title.`);
    }
    if (!Array.isArray(item.targets) || item.targets.length === 0) {
      automatedFailures.push(`${id} must include at least one release target.`);
    }
    if (!Array.isArray(item.acceptance) || item.acceptance.length === 0) {
      automatedFailures.push(`${id} must include acceptance criteria.`);
    }
    if (!allowedStatuses.has(item.status)) {
      automatedFailures.push(`${id} has invalid status: ${JSON.stringify(item.status)}.`);
      continue;
    }

    checkEvidenceFields(item);
    const hasTargetEvidence = checkTargetEvidence(item);
    if (item.status === "passed") {
      checkConclusiveEvidence(item, "passed");
    } else if (item.status === "failed") {
      checkConclusiveEvidence(item, "failed");
      addManual(`${item.id}: ${item.title} is failed.`);
    } else {
      if (!hasTargetEvidence) {
        addManual(`${item.id}: ${item.title} is ${item.status}.`);
      }
    }
  }

  for (const expectedId of expectedItemIds) {
    if (!ids.has(expectedId)) {
      automatedFailures.push(`Missing manual QA item: ${expectedId}`);
    }
  }

  for (const id of ids) {
    if (!expectedItemIds.includes(id)) {
      warnings.push(`Unexpected manual QA item is present: ${id}`);
    }
  }
}

function checkEvidenceFields(item) {
  if (!item.evidence || typeof item.evidence !== "object") {
    automatedFailures.push(`${item.id} must include evidence.`);
    return;
  }

  checkEvidencePayloadFields(item.evidence, `${item.id}.evidence`);
}

function checkEvidencePayloadFields(payload, label) {
  for (const field of requiredEvidenceFields) {
    if (!(field in payload)) {
      automatedFailures.push(`${label}.${field} is required.`);
    }
  }

  if (!payload.attachments || typeof payload.attachments !== "object" || Array.isArray(payload.attachments)) {
    automatedFailures.push(`${label}.attachments is required.`);
    return;
  }

  for (const field of requiredAttachmentFields) {
    const value = payload.attachments[field];
    if (!Array.isArray(value)) {
      automatedFailures.push(`${label}.attachments.${field} must be an array.`);
      continue;
    }
    for (const entry of value) {
      if (isUnresolved(entry)) {
        automatedFailures.push(`${label}.attachments.${field} contains an unresolved or invalid entry.`);
        continue;
      }
      checkAttachmentEntry(label, field, entry);
    }
  }
}

function checkTargetEvidence(item) {
  if (!Array.isArray(item.targetEvidence)) {
    automatedFailures.push(`${item.id}.targetEvidence must be an array with one entry per target.`);
    return false;
  }

  const targets = Array.isArray(item.targets) ? item.targets : [];
  const expectedTargets = new Set(targets);
  const seenTargets = new Set();
  const targetStatuses = [];

  for (const [index, entry] of item.targetEvidence.entries()) {
    const label = `${item.id}.targetEvidence[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      automatedFailures.push(`${label} must be an object.`);
      continue;
    }

    for (const field of requiredTargetEvidenceFields) {
      if (!(field in entry)) {
        automatedFailures.push(`${label}.${field} is required.`);
      }
    }

    if (typeof entry.target !== "string" || entry.target.trim() === "") {
      automatedFailures.push(`${label}.target must be a non-empty string.`);
    } else if (!expectedTargets.has(entry.target)) {
      automatedFailures.push(`${label}.target must match one of item.targets, got ${JSON.stringify(entry.target)}.`);
    } else if (seenTargets.has(entry.target)) {
      automatedFailures.push(`${item.id}.targetEvidence has duplicate target: ${entry.target}`);
    } else {
      seenTargets.add(entry.target);
    }

    if (!allowedStatuses.has(entry.status)) {
      automatedFailures.push(`${label}.status has invalid value: ${JSON.stringify(entry.status)}.`);
      continue;
    }

    targetStatuses.push(entry.status);
    checkEvidencePayloadFields(entry, label);

    if (entry.status === "passed") {
      checkConclusiveTargetEvidence(item.id, entry, "passed", label);
    } else if (entry.status === "failed") {
      checkConclusiveTargetEvidence(item.id, entry, "failed", label);
      addManual(`${item.id}/${entry.target}: ${item.title} is failed.`);
    } else {
      addManual(`${item.id}/${entry.target}: ${item.title} is ${entry.status}.`);
    }
  }

  for (const target of expectedTargets) {
    if (!seenTargets.has(target)) {
      automatedFailures.push(`${item.id}.targetEvidence is missing target: ${target}`);
    }
  }

  const unexpectedTargets = item.targetEvidence.length - seenTargets.size;
  if (seenTargets.size !== expectedTargets.size || unexpectedTargets > 0) {
    return true;
  }

  const expectedItemStatus = deriveStatus(targetStatuses);
  if (item.status !== expectedItemStatus) {
    automatedFailures.push(`${item.id}.status must be ${JSON.stringify(expectedItemStatus)} based on targetEvidence statuses, got ${JSON.stringify(item.status)}.`);
  }

  return true;
}

function checkRootStatus() {
  if (!Array.isArray(evidence.items)) {
    return;
  }
  const statuses = evidence.items.map((item) => {
    if (Array.isArray(item?.targetEvidence)) {
      return deriveStatus(item.targetEvidence.map((entry) => entry?.status));
    }
    return item?.status;
  });
  const expectedStatus = deriveStatus(statuses);
  requireEqual("status", evidence.status, expectedStatus);
}

function deriveStatus(statuses) {
  return statuses.every((status) => status === "passed")
    ? "passed"
    : statuses.some((status) => status === "failed")
      ? "failed"
      : statuses.some((status) => status === "blocked")
        ? "blocked"
        : "pending";
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
  checkEvidenceTimestamp(item, "testedAt", expectedResult);
  const manualQaBuildId = artifactManifest?.manualQaBuildId;
  if (manualQaBuildId && !item.evidence?.buildArtifact?.startsWith(`${manualQaBuildId}; `)) {
    automatedFailures.push(
      `${item.id}.evidence.buildArtifact must start with "${manualQaBuildId}; " so evidence is tied to the current release artifact manifest.`
    );
  } else if (manualQaBuildId) {
    const testedArtifact = item.evidence.buildArtifact.slice(`${manualQaBuildId}; `.length).trim();
    if (testedArtifact.length === 0) {
      automatedFailures.push(`${item.id}.evidence.buildArtifact must include the tested artifact path or external build reference after the current manualQaBuildId.`);
    }
  }
  checkConclusiveAttachments(item, expectedResult);
}

function checkConclusiveTargetEvidence(itemId, entry, expectedResult, label) {
  for (const field of requiredEvidenceFields) {
    const value = entry?.[field];
    if (isUnresolved(value)) {
      automatedFailures.push(`${label}.${field} must be concrete when status is ${expectedResult}.`);
    }
  }
  if (entry?.result !== expectedResult) {
    automatedFailures.push(`${label}.result must be ${JSON.stringify(expectedResult)} when status is ${expectedResult}.`);
  }
  checkEvidenceTimestamp({ id: label, evidence: entry }, "testedAt", expectedResult);
  const manualQaBuildId = artifactManifest?.manualQaBuildId;
  if (manualQaBuildId && !entry?.buildArtifact?.startsWith(`${manualQaBuildId}; `)) {
    automatedFailures.push(
      `${label}.buildArtifact must start with "${manualQaBuildId}; " so target evidence is tied to the current release artifact manifest.`
    );
  } else if (manualQaBuildId) {
    const testedArtifact = entry.buildArtifact.slice(`${manualQaBuildId}; `.length).trim();
    if (testedArtifact.length === 0) {
      automatedFailures.push(`${label}.buildArtifact must include the tested artifact path or external build reference after the current manualQaBuildId.`);
    }
    checkTargetBuildArtifact(entry.target, testedArtifact, label, entry);
  }
  if (itemId === "native-share" && expectedResult === "passed") {
    checkNativeShareReceivedUrl(entry.receivedShareUrl, label);
  }
  checkConclusiveTargetAttachments(entry, expectedResult, label);
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

function checkConclusiveTargetAttachments(entry, expectedResult, label) {
  const attachments = entry?.attachments;
  const entries = requiredAttachmentFields.flatMap((field) => attachments?.[field] ?? []);
  if (entries.length === 0) {
    automatedFailures.push(
      `${label}.attachments must include at least one screenshot, recording, or console reference when status is ${expectedResult}.`
    );
  }
}

function checkEvidenceTimestamp(item, field, expectedResult) {
  const value = item.evidence?.[field];
  if (!isDateOrDateTime(value)) {
    automatedFailures.push(`${item.id}.evidence.${field} must be an ISO date or timestamp when status is ${expectedResult}.`);
  }
}

function checkTargetBuildArtifact(target, testedArtifact, label, entry) {
  if (target === "App Store" && testedArtifact === artifactManifest?.artifacts?.iosApp?.path) {
    automatedFailures.push(`${label}.buildArtifact cannot use the local unsigned iOS .app for App Store target-device QA; use a signed device/TestFlight/App Store Connect build reference.`);
  }
  if (target === "Google Play" && testedArtifact === artifactManifest?.artifacts?.androidAab?.path) {
    automatedFailures.push(`${label}.buildArtifact should use the Android QA APK or a Play Console installed build for target-device QA, not the upload AAB.`);
  }
  if (target === "AppsInToss") {
    const hasPreviewReference = hasAppsInTossPreviewReference(testedArtifact, entry);
    if (testedArtifact === artifactManifest?.artifacts?.appsInTossAit?.path && !hasPreviewReference) {
      automatedFailures.push(`${label}.buildArtifact cannot use only the local .ait for AppsInToss target-device QA; include a stable AppsInToss console QR/test-scheme reference.`);
    } else if (testedArtifact !== artifactManifest?.artifacts?.appsInTossAit?.path && !hasPreviewReference) {
      automatedFailures.push(`${label}.buildArtifact for AppsInToss should reference the .ait artifact or a stable AppsInToss console QR/test-scheme reference.`);
    }
  }
}

function hasAppsInTossPreviewReference(testedArtifact, entry) {
  return [testedArtifact, ...(entry?.attachments?.consoleReferences ?? [])].some((value) => {
    if (typeof value !== "string") {
      return false;
    }
    return /\b(Toss-app|Toss app|QR|console|test scheme|preview)\b|콘솔|큐알|테스트/i.test(value);
  });
}

function checkNativeShareReceivedUrl(value, label) {
  if (isUnresolved(value)) {
    automatedFailures.push(`${label}.receivedShareUrl must include the actual received native share ending URL when status is passed.`);
    return;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    automatedFailures.push(`${label}.receivedShareUrl must be a valid public HTTPS ending URL: ${JSON.stringify(value)}.`);
    return;
  }

  if (url.protocol !== "https:" || hasUrlCredentials(url) || isBlockedPublicUrlHost(url.hostname)) {
    automatedFailures.push(`${label}.receivedShareUrl must be a public HTTPS URL, got ${JSON.stringify(value)}.`);
  }

  const endingValues = url.searchParams.getAll("ending");
  const unexpectedParams = [...url.searchParams.keys()].filter((key) => key !== "ending");
  if (endingValues.length !== 1 || endingValues[0]?.trim() === "" || unexpectedParams.length > 0 || url.hash) {
    automatedFailures.push(`${label}.receivedShareUrl must be canonical with only one non-empty ending query parameter and no hash: ${JSON.stringify(value)}.`);
  } else if (!knownEndingCodes.has(endingValues[0])) {
    automatedFailures.push(`${label}.receivedShareUrl ending query must match a known product ending code, got ${JSON.stringify(endingValues[0])}.`);
  }
}

function checkAttachmentEntry(label, field, entry) {
  if (field === "consoleReferences") {
    if (!isStableReference(entry)) {
      automatedFailures.push(`${label}.attachments.${field} must contain stable console/build references, not free-form placeholder text.`);
    }
    checkPublicHttpsEvidenceUrl(`${label}.attachments.${field}`, entry);
    return;
  }

  if (isHttpsUrl(entry)) {
    checkPublicHttpsEvidenceUrl(`${label}.attachments.${field}`, entry);
    return;
  }

  if (!localAttachmentExtensions[field]?.test(entry)) {
    automatedFailures.push(`${label}.attachments.${field} must use an expected file extension or an HTTPS URL: ${entry}`);
    return;
  }

  if (entry.startsWith("/") || entry.startsWith("~") || entry.split("/").includes("..")) {
    automatedFailures.push(`${label}.attachments.${field} must use a repo-relative path or HTTPS URL: ${entry}`);
    return;
  }

  if (!exists(entry)) {
    automatedFailures.push(`${label}.attachments.${field} points to a missing local file: ${entry}`);
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
    automatedFailures.push(`${label} must not use localhost, non-public/reserved IP, IPv6 local/documentation/multicast, or placeholder HTTPS URLs as manual QA evidence: ${value}`);
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

  console.log("Manual QA evidence check");
  console.log("========================");
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated manual-QA checks: PASS" : "Automated manual-QA checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Manual QA gates: CLEAR" : `Manual QA gates: ${manualBlockers.length} blocker(s)`);
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
