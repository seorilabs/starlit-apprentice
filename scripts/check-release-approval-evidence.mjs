import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasUrlCredentials, isBlockedPublicUrlHost } from "./public-url-guard.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const jsonOutput = process.argv.includes("--json");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];

const allowedStatuses = new Set(["pending", "blocked", "rejected", "approved"]);
const expectedTargets = ["AppsInToss", "Google Play", "App Store"];
const unresolvedMarkers = ["확정 필요", "TODO", "TBD", ""];
const localAttachmentExtensions = {
  screenshots: /\.(png|jpe?g|webp)$/i,
  recordings: /\.(mp4|mov|webm)$/i
};
const evidencePath = process.env.RELEASE_APPROVAL_EVIDENCE_PATH ?? "qa/release-approval-evidence.json";
const manifestPath = process.env.RELEASE_ARTIFACT_MANIFEST_PATH ?? "qa/release-artifact-manifest.json";
const manualQaPath = process.env.MANUAL_QA_EVIDENCE_PATH ?? "qa/manual-qa-evidence.json";
const consoleEvidencePath = process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json";
const appsInTossConfigPath = process.env.APPS_IN_TOSS_CONFIG_PATH ?? "apps-in-toss/apps-in-toss.config.json";
const googlePlayConfigPath = process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json";
const appStoreConfigPath = process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json";
const evidence = readJson(evidencePath);
const manifest = exists(manifestPath) ? readJson(manifestPath) : null;
const manualQa = exists(manualQaPath) ? readJson(manualQaPath) : null;
const consoleEvidence = exists(consoleEvidencePath) ? readJson(consoleEvidencePath) : null;
const appsInToss = readJson(appsInTossConfigPath);
const googlePlay = readJson(googlePlayConfigPath);
const appStore = readJson(appStoreConfigPath);

checkRoot();
checkScope();
checkDecisionShape();
checkApprovalStatus();
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
  if (evidence.releaseCandidateRequiresApproval !== true) {
    automatedFailures.push("releaseCandidateRequiresApproval must be true.");
  }
  if (!exists("docs/release-approval.md")) {
    automatedFailures.push("Missing release approval documentation: docs/release-approval.md");
  }
  if (!manifest?.manualQaBuildId || typeof manifest.manualQaBuildId !== "string") {
    automatedFailures.push(`Missing manual QA build ID in ${manifestPath}. Run pnpm release:artifact-manifest.`);
  }
}

function checkScope() {
  const scope = evidence.scope;
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    automatedFailures.push("scope must be an object.");
    return;
  }
  requireEqual("scope.version", scope.version, "0.1.0");
  requireEqual("scope.requiresManualQaPassed", scope.requiresManualQaPassed, true);
  requireEqual("scope.requiresConsoleEvidencePassed", scope.requiresConsoleEvidencePassed, true);
  requireEqual("scope.requiresNoUnresolvedStoreFields", scope.requiresNoUnresolvedStoreFields, true);
  if (!Array.isArray(scope.targets)) {
    automatedFailures.push("scope.targets must be an array.");
    return;
  }
  for (const target of expectedTargets) {
    if (!scope.targets.includes(target)) {
      automatedFailures.push(`scope.targets must include ${target}.`);
    }
  }
  for (const target of scope.targets) {
    if (!expectedTargets.includes(target)) {
      warnings.push(`Unexpected release approval target is present: ${target}`);
    }
  }
}

function checkDecisionShape() {
  const decision = evidence.decision;
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    automatedFailures.push("decision must be an object.");
    return;
  }
  for (const field of ["approvedAt", "approver", "manualQaBuildId", "decision", "releaseAction", "notes"]) {
    if (!(field in decision)) {
      automatedFailures.push(`decision.${field} is required.`);
    }
  }
  if (!Array.isArray(decision.targetsApproved)) {
    automatedFailures.push("decision.targetsApproved must be an array.");
  }
  if (!decision.attachments || typeof decision.attachments !== "object" || Array.isArray(decision.attachments)) {
    automatedFailures.push("decision.attachments is required.");
    return;
  }
  for (const field of ["screenshots", "recordings", "consoleReferences"]) {
    const value = decision.attachments[field];
    if (!Array.isArray(value)) {
      automatedFailures.push(`decision.attachments.${field} must be an array.`);
      continue;
    }
    for (const entry of value) {
      if (isUnresolved(entry)) {
        automatedFailures.push(`decision.attachments.${field} contains an unresolved or invalid entry.`);
        continue;
      }
      checkAttachmentEntry(field, entry);
    }
  }
}

function checkApprovalStatus() {
  if (evidence.status !== "approved") {
    addManual(`Final release approval is ${evidence.status}; production submission or publish is not approved.`);
    return;
  }

  const decision = evidence.decision;
  for (const field of ["approver", "manualQaBuildId", "decision", "releaseAction", "notes"]) {
    if (isUnresolved(decision?.[field])) {
      automatedFailures.push(`decision.${field} must be concrete when release approval status is approved.`);
    }
  }
  if (!isDateOrDateTime(decision?.approvedAt)) {
    automatedFailures.push("decision.approvedAt must be an ISO date or timestamp when release approval status is approved.");
  }
  requireEqual("decision.decision", decision?.decision, "approved");
  if (!["submit-review", "publish-production", "rollout-internal-test"].includes(decision?.releaseAction)) {
    automatedFailures.push("decision.releaseAction must be submit-review, publish-production, or rollout-internal-test when release approval status is approved.");
  }
  if (manifest?.manualQaBuildId && decision?.manualQaBuildId !== manifest.manualQaBuildId) {
    automatedFailures.push(`decision.manualQaBuildId must equal current manifest manualQaBuildId ${manifest.manualQaBuildId}.`);
  }
  for (const target of expectedTargets) {
    if (!decision?.targetsApproved?.includes(target)) {
      automatedFailures.push(`decision.targetsApproved must include ${target} when releasing all configured targets.`);
    }
  }
  const attachmentCount = ["screenshots", "recordings", "consoleReferences"]
    .flatMap((field) => decision?.attachments?.[field] ?? [])
    .length;
  if (attachmentCount === 0) {
    automatedFailures.push("decision.attachments must include at least one screenshot, recording, or stable reference when release approval status is approved.");
  }

  checkApprovedPrerequisites();
}

function checkApprovedPrerequisites() {
  const openManualQa = openItems(manualQa?.items);
  const openManualQaTargets = targetEvidenceEntries(manualQa?.items).filter((entry) => entry.status !== "passed");
  const openConsoleEvidence = openItems(consoleEvidence?.items);
  const unresolvedFields = [
    ...findUnresolved("AppsInToss", appsInToss),
    ...findUnresolved("Google Play", googlePlay),
    ...findUnresolved("App Store", appStore)
  ];

  if (openManualQa.length > 0) {
    automatedFailures.push(`Release approval cannot be approved while manual QA items are open: ${openManualQa.map((item) => item.id).join(", ")}.`);
  }
  if (openManualQaTargets.length > 0) {
    automatedFailures.push(`Release approval cannot be approved while manual QA target evidence is open: ${openManualQaTargets.map((entry) => `${entry.itemId}/${entry.target}`).join(", ")}.`);
  }
  if (openConsoleEvidence.length > 0) {
    automatedFailures.push(`Release approval cannot be approved while console evidence items are open: ${openConsoleEvidence.map((item) => item.id).join(", ")}.`);
  }
  if (unresolvedFields.length > 0) {
    automatedFailures.push(`Release approval cannot be approved while store fields are unresolved: ${unresolvedFields.join("; ")}.`);
  }
  runStrictPrerequisiteCheck("manual QA strict evidence check", ["pnpm", "check:manual-qa:strict"]);
  runStrictPrerequisiteCheck("release console strict evidence check", ["pnpm", "check:release-console:strict"]);
  runStrictPrerequisiteCheck("store config strict check", ["pnpm", "check:store-config:strict"]);
}

function runStrictPrerequisiteCheck(label, args) {
  try {
    execFileSync(args[0], args.slice(1), {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        RELEASE_ARTIFACT_MANIFEST_PATH: manifestPath,
        MANUAL_QA_EVIDENCE_PATH: manualQaPath,
        RELEASE_CONSOLE_EVIDENCE_PATH: consoleEvidencePath,
        APPS_IN_TOSS_CONFIG_PATH: appsInTossConfigPath,
        GOOGLE_PLAY_CONFIG_PATH: googlePlayConfigPath,
        APP_STORE_CONFIG_PATH: appStoreConfigPath
      },
      stdio: "pipe"
    });
  } catch (error) {
    automatedFailures.push(`${label} must pass before final release approval can be accepted: ${extractLastOutputLine(error)}`);
  }
}

function extractLastOutputLine(error) {
  return pickOutputSummary(error?.stdout) ?? pickOutputSummary(error?.stderr) ?? error?.message ?? "unknown failure";
}

function pickOutputSummary(value) {
  const meaningful = outputLines(value).filter((line) => !line.startsWith("$ ") && !line.startsWith("[ELIFECYCLE]"));
  const priority = meaningful.filter((line) => /\b(FAIL|blocker|blockers|failed|must|cannot|pending|unresolved)\b/i.test(line));
  return priority.at(-1) ?? meaningful.at(-1);
}

function outputLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function openItems(items) {
  return Array.isArray(items) ? items.filter((item) => item?.status !== "passed") : [];
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
    return value.includes("확정 필요") ? [`${target}.${prefix}`] : [];
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

function checkAttachmentEntry(field, entry) {
  if (field === "consoleReferences") {
    if (!isStableReference(entry)) {
      automatedFailures.push(`decision.attachments.${field} must contain stable approval references, not free-form placeholder text.`);
    } else {
      checkApprovalReference(entry);
    }
    return;
  }

  if (isHttpsUrl(entry)) {
    checkApprovalEvidenceUrl(`decision.attachments.${field}`, entry);
    return;
  }

  if (!localAttachmentExtensions[field]?.test(entry)) {
    automatedFailures.push(`decision.attachments.${field} must use an expected file extension or an HTTPS URL: ${entry}`);
    return;
  }
  if (entry.startsWith("/") || entry.startsWith("~") || entry.split("/").includes("..")) {
    automatedFailures.push(`decision.attachments.${field} must use a repo-relative path or HTTPS URL: ${entry}`);
    return;
  }
  if (!exists(entry)) {
    automatedFailures.push(`decision.attachments.${field} points to a missing local file: ${entry}`);
  }
}

function checkApprovalReference(entry) {
  if (isHttpsUrl(entry)) {
    checkApprovalEvidenceUrl("decision.attachments.consoleReferences", entry);
    return;
  }

  if (entry.startsWith("/") || entry.startsWith("~") || entry.split("/").includes("..")) {
    automatedFailures.push(`decision.attachments.consoleReferences must use external approval references, not local filesystem paths: ${entry}`);
    return;
  }

  if (looksLikeRepoLocalReference(entry) || knownLocalArtifactPaths().has(entry)) {
    automatedFailures.push(`decision.attachments.consoleReferences must not use repo-local generated packets, source files, or local build artifacts as final approval evidence: ${entry}`);
    return;
  }

  if (!/\b(approval|approved|review|submission|release|rollout|deployment|App Store Connect|Play Console|AppsInToss|TestFlight|console)\b|승인|심사|제출|배포|출시|롤아웃|콘솔/i.test(entry)) {
    automatedFailures.push(`decision.attachments.consoleReferences must describe a stable final approval, review, submission, rollout, or console reference: ${entry}`);
  }
}

function checkApprovalEvidenceUrl(label, entry) {
  try {
    const url = new URL(entry);
    if (url.protocol !== "https:" || hasUrlCredentials(url) || isBlockedPublicUrlHost(url.hostname)) {
      automatedFailures.push(`${label} must use real public HTTPS approval evidence, not localhost, non-public/reserved IP, IPv6 local/documentation/multicast, or placeholder URLs: ${entry}`);
    }
  } catch {
    automatedFailures.push(`${label} must use a valid HTTPS approval evidence URL: ${entry}`);
  }
}

function looksLikeRepoLocalReference(entry) {
  return /^(qa|docs|scripts|apps|packages|play-store|app-store|apps-in-toss|test-results|playwright-report)\//.test(entry) ||
    /\.(md|json|mjs|ts|tsx|apk|aab|app|zip|ait)$/i.test(entry);
}

function knownLocalArtifactPaths() {
  const artifacts = manifest?.artifacts ?? {};
  return new Set(Object.values(artifacts).map((artifact) => artifact?.path).filter(Boolean));
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

function isDateOrDateTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value);
}

function isHttpsUrl(value) {
  return typeof value === "string" && /^https:\/\/\S+$/i.test(value);
}

function isStableReference(value) {
  if (isHttpsUrl(value)) {
    return true;
  }
  return typeof value === "string" && value.trim().length >= 8 && !/\b(TODO|TBD|확정 필요)\b/i.test(value);
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

  console.log("Release approval evidence check");
  console.log("===============================");
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated release-approval checks: PASS" : "Automated release-approval checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Release approval gate: CLEAR" : `Release approval gate: ${manualBlockers.length} blocker(s)`);
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
