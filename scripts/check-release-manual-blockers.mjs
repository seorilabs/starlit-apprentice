import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const tmpDir = mkdtempSync(join(tmpdir(), "starlit-release-blockers-"));
const fixtureDate = "2026-06-19";
const screenshotFixture = "qa/runtime-smoke/mobile-390-ending.png";
const shareUrlFixture = "https://starlit-apprentice.seorilabs.com/play/?ending=scholar";

try {
  const manifest = readJson("qa/release-artifact-manifest.json");
  const manualQaBuildId = manifest.manualQaBuildId;
  if (typeof manualQaBuildId !== "string" || manualQaBuildId.trim() === "") {
    throw new Error("qa/release-artifact-manifest.json must include manualQaBuildId.");
  }

  const paths = {
    manualQa: writeFixture("manual-qa-evidence.json", passedManualQa(readJson("qa/manual-qa-evidence.json"), manifest)),
    consoleEvidence: writeFixture(
      "release-console-evidence.json",
      passedConsoleEvidence(readJson("qa/release-console-evidence.json"), manualQaBuildId)
    ),
    approval: writeFixture(
      "release-approval-evidence.json",
      approvedReleaseApproval(readJson("qa/release-approval-evidence.json"), manualQaBuildId)
    ),
    appsInToss: writeFixture(
      "apps-in-toss.config.json",
      resolvedAppsInTossConfig(readJson("apps-in-toss/apps-in-toss.config.json"))
    ),
    googlePlay: writeFixture(
      "google-play.config.json",
      resolvedGooglePlayConfig(readJson("play-store/google-play.config.json"))
    ),
    appStore: writeFixture(
      "app-store.config.json",
      resolvedAppStoreConfig(readJson("app-store/app-store.config.json"))
    )
  };
  const fixtureEnv = {
    ...process.env,
    MANUAL_QA_EVIDENCE_PATH: paths.manualQa,
    RELEASE_CONSOLE_EVIDENCE_PATH: paths.consoleEvidence,
    RELEASE_APPROVAL_EVIDENCE_PATH: paths.approval,
    APPS_IN_TOSS_CONFIG_PATH: paths.appsInToss,
    GOOGLE_PLAY_CONFIG_PATH: paths.googlePlay,
    APP_STORE_CONFIG_PATH: paths.appStore
  };

  runFixtureCheck("manual QA strict fixture", ["pnpm", "check:manual-qa:strict"], fixtureEnv);
  runFixtureCheck("release console strict fixture", ["pnpm", "check:release-console:strict"], fixtureEnv);
  runFixtureCheck("store config strict fixture", ["pnpm", "check:store-config:strict"], fixtureEnv);
  runFixtureCheck("release approval strict fixture", ["pnpm", "check:release-approval:strict"], fixtureEnv);

  runExpectedFailure(
    "manual QA credentialed native-share URL fixture",
    ["pnpm", "check:manual-qa:strict"],
    {
      ...fixtureEnv,
      MANUAL_QA_EVIDENCE_PATH: writeFixture(
        "manual-qa-credentialed-share-url.json",
        credentialedManualQaShareUrl(readJson(paths.manualQa))
      )
    },
    "receivedShareUrl"
  );
  runExpectedFailure(
    "release console credentialed evidence URL fixture",
    ["pnpm", "check:release-console:strict"],
    {
      ...fixtureEnv,
      RELEASE_CONSOLE_EVIDENCE_PATH: writeFixture(
        "release-console-credentialed-url.json",
        credentialedReleaseConsoleUrl(readJson(paths.consoleEvidence))
      )
    },
    "release console evidence"
  );
  runExpectedFailure(
    "store config credentialed public URL fixture",
    ["pnpm", "check:store-config:strict"],
    {
      ...fixtureEnv,
      GOOGLE_PLAY_CONFIG_PATH: writeFixture(
        "google-play-credentialed-url.json",
        credentialedGooglePlayUrl(readJson(paths.googlePlay))
      )
    },
    "public HTTPS URL"
  );
  runExpectedFailure(
    "release approval credentialed evidence URL fixture",
    ["pnpm", "check:release-approval:strict"],
    {
      ...fixtureEnv,
      RELEASE_APPROVAL_EVIDENCE_PATH: writeFixture(
        "release-approval-credentialed-url.json",
        credentialedReleaseApprovalUrl(readJson(paths.approval))
      )
    },
    "approval evidence"
  );

  const output = execFileSync("node", ["scripts/check-release.mjs", "--manual-blockers-only"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: fixtureEnv,
    stdio: "pipe"
  });

  if (!output.includes("Manual blockers\n- none") || !output.includes("Manual release gates: CLEAR")) {
    throw new Error(`Manual blocker fixture did not clear release gates.\n${output}`);
  }

  console.log("Release manual blocker fixture check");
  console.log("====================================");
  console.log("");
  console.log("Fixture result: PASS");
  console.log("Strict fixture checks: PASS");
  console.log("Credentialed URL rejection fixtures: PASS");
  console.log("Manual release gates clear when manual QA, console evidence, store fields, and final approval are passed.");
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

function runFixtureCheck(label, command, env) {
  try {
    execFileSync(command[0], command.slice(1), {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      stdio: "pipe"
    });
  } catch (error) {
    throw new Error(`${label} failed: ${summarizeCommandError(error)}`);
  }
}

function runExpectedFailure(label, command, env, expectedOutput) {
  try {
    execFileSync(command[0], command.slice(1), {
      cwd: repoRoot,
      encoding: "utf8",
      env,
      stdio: "pipe"
    });
  } catch (error) {
    const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`;
    if (!output.includes(expectedOutput)) {
      throw new Error(`${label} failed for the wrong reason: ${summarizeCommandError(error)}`);
    }
    return;
  }
  throw new Error(`${label} unexpectedly passed.`);
}

function summarizeCommandError(error) {
  const lines = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("$ ") && !line.startsWith("[ELIFECYCLE]"));
  const priority = lines.filter((line) => /\b(FAIL|blocker|blockers|failed|must|cannot|pending|unresolved)\b/i.test(line));
  return priority.at(-1) ?? lines.at(-1) ?? error?.message ?? "unknown failure";
}

function credentialedManualQaShareUrl(evidence) {
  const next = clone(evidence);
  for (const item of next.items) {
    if (item.id !== "native-share") {
      continue;
    }
    item.targetEvidence = item.targetEvidence.map((entry) => ({
      ...entry,
      receivedShareUrl: "https://release:secret@starlit-apprentice.seorilabs.com/play/?ending=scholar"
    }));
  }
  return next;
}

function credentialedReleaseConsoleUrl(evidence) {
  const next = clone(evidence);
  const item = next.items.find((candidate) => candidate.id === "google-play-signed-aab-upload") ?? next.items[0];
  item.evidence.submissionReference = "https://release:secret@play.google.com/console/u/0/developers/fixture/app/fixture/releases";
  item.evidence.attachments.consoleReferences = [
    "https://release:secret@play.google.com/console/u/0/developers/fixture/app/fixture/releases"
  ];
  return next;
}

function credentialedGooglePlayUrl(config) {
  const next = clone(config);
  next.privacyPolicyUrl = "https://release:secret@starlit-apprentice.seorilabs.com/privacy-policy.html";
  return next;
}

function credentialedReleaseApprovalUrl(evidence) {
  const next = clone(evidence);
  next.decision.attachments.consoleReferences = [
    "https://release:secret@appstoreconnect.apple.com/apps/fixture/review/submission"
  ];
  return next;
}

function passedManualQa(evidence, manifest) {
  const next = clone(evidence);
  const manualQaBuildId = manifest.manualQaBuildId;
  next.status = "passed";
  next.lastUpdated = fixtureDate;
  next.items = next.items.map((item) => {
    const passedItem = {
      ...item,
      status: "passed",
      evidence: manualPayload(`${item.id} aggregate`, `${manualQaBuildId}; fixture target-device evidence`)
    };
    passedItem.targetEvidence = item.targetEvidence.map((entry) => {
      const buildArtifact = targetBuildArtifact(entry.target, manifest);
      return {
        ...entry,
        ...manualPayload(`${item.id} ${entry.target}`, `${manualQaBuildId}; ${buildArtifact}`),
        target: entry.target,
        status: "passed",
        ...(item.id === "native-share" ? { receivedShareUrl: shareUrlFixture } : {})
      };
    });
    return passedItem;
  });
  return next;
}

function manualPayload(label, buildArtifact) {
  return {
    testedAt: `${fixtureDate}T00:00:00Z`,
    tester: "release manual blocker fixture",
    device: "fixture target device",
    osVersion: "fixture OS",
    buildArtifact,
    result: "passed",
    attachments: {
      screenshots: [screenshotFixture],
      recordings: [],
      consoleReferences: [`${label} stable fixture reference`]
    },
    notes: `${label} passed fixture evidence`
  };
}

function targetBuildArtifact(target, manifest) {
  if (target === "Google Play") {
    return manifest.artifacts.androidQaApk.path;
  }
  if (target === "App Store") {
    return "TestFlight fixture build 0.1.0 (manual blocker test)";
  }
  if (target === "AppsInToss") {
    return `${manifest.artifacts.appsInTossAit.path}; AppsInToss console QR preview fixture`;
  }
  return `${target} fixture build`;
}

function passedConsoleEvidence(evidence, manualQaBuildId) {
  const next = clone(evidence);
  next.status = "passed";
  next.lastUpdated = fixtureDate;
  next.items = next.items.map((item) => {
    const reference = consoleReference(item.id);
    return {
      ...item,
      status: "passed",
      evidence: {
        verifiedAt: `${fixtureDate}T00:00:00Z`,
        verifier: "release manual blocker fixture",
        accountOrWorkspace: `${item.target} fixture workspace`,
        buildArtifact: `${manualQaBuildId}; ${reference}`,
        submissionReference: reference,
        result: "passed",
        attachments: {
          screenshots: [screenshotFixture],
          recordings: [],
          consoleReferences: [reference]
        },
        notes: `${item.id} passed fixture evidence`
      }
    };
  });
  return next;
}

function consoleReference(itemId) {
  const references = {
    "apps-in-toss-ait-upload": "AppsInToss Developer Center upload build fixture",
    "apps-in-toss-qr-preview": "AppsInToss QR test scheme preview fixture",
    "apps-in-toss-category-exposure": "AppsInToss game category exposure console fixture",
    "apps-in-toss-game-rating": "Game Rating certificate fixture reference",
    "apps-in-toss-deployment-approval": "AppsInToss deployment approval review fixture",
    "google-play-signed-aab-upload": "Play Console signed AAB upload processing fixture",
    "google-play-content-rating": "Play Console content rating IARC questionnaire fixture",
    "google-play-korea-game-rating": "Play Console Korea game rating certificate fixture",
    "google-play-data-safety": "Play Console Data safety declaration fixture",
    "google-play-track-preview": "Play Console internal track release preview fixture",
    "app-store-signed-build-upload": "App Store Connect TestFlight signed build upload fixture",
    "app-store-age-rating": "App Store Connect age rating fixture",
    "app-store-privacy-export": "App Store Connect privacy export compliance fixture",
    "app-store-review-metadata": "App Store Connect review metadata submission fixture"
  };
  return references[itemId] ?? `${itemId} console fixture`;
}

function approvedReleaseApproval(evidence, manualQaBuildId) {
  const next = clone(evidence);
  next.status = "approved";
  next.lastUpdated = fixtureDate;
  next.decision = {
    approvedAt: `${fixtureDate}T00:00:00Z`,
    approver: "release manual blocker fixture",
    manualQaBuildId,
    targetsApproved: ["AppsInToss", "Google Play", "App Store"],
    decision: "approved",
    releaseAction: "submit-review",
    attachments: {
      screenshots: [],
      recordings: [],
      consoleReferences: ["Final release approval fixture reference for AppsInToss Play Console App Store Connect review submission"]
    },
    notes: "Fixture approval used only to prove manual blocker release-gate clearing."
  };
  return next;
}

function resolvedAppsInTossConfig(config) {
  const next = clone(config);
  next.manualEvidence = {
    consoleGameCategoryAndExposure: "AppsInToss game category and exposure fixture",
    gameRatingEvidence: "Game rating certificate fixture",
    aitBundleUpload: "AppsInToss .ait upload fixture",
    qrTossAppTest: "AppsInToss QR Toss-app test fixture",
    deploymentApproval: "AppsInToss deployment approval fixture"
  };
  return next;
}

function resolvedGooglePlayConfig(config) {
  const next = clone(config);
  next.privacyPolicyUrl = "https://starlit-apprentice.seorilabs.com/privacy-policy.html";
  next.contentDeclarations.contentRating = "IARC fixture rating";
  next.contentDeclarations.koreaGameRating = "Korea game rating fixture";
  next.manualEvidence = {
    androidAppBundle: "Play Console signed AAB upload fixture",
    playConsoleListing: "Play Console listing fixture",
    policyQuestionnaire: "Play Console policy questionnaire fixture"
  };
  return next;
}

function resolvedAppStoreConfig(config) {
  const next = clone(config);
  next.sku = "starlit-apprentice-ios-fixture";
  next.contact.firstName = "Release";
  next.contact.lastName = "Fixture";
  next.contact.phone = "+821012345678";
  next.privacyPolicyUrl = "https://starlit-apprentice.seorilabs.com/privacy-policy.html";
  next.supportUrl = "https://starlit-apprentice.seorilabs.com/support.html";
  next.marketingUrl = "https://starlit-apprentice.seorilabs.com/";
  next.reviewDeclarations.ageRating = "App Store Connect age rating fixture";
  return next;
}

function writeFixture(name, value) {
  const path = join(tmpDir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
