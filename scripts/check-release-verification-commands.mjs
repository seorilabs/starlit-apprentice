import {
  manualQaPreflightCommands,
  releaseApprovalPreflightCommands,
  releaseArtifactSetupCommands,
  releaseArtifactVerificationCommands,
  releaseConsolePreflightCommands,
  releaseDashboardVerificationCommands,
  renderCommandBlock,
  storeSubmissionPreflightCommands
} from "./release-verification-commands.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const rootPackage = readJson("package.json");
const packageScripts = new Set(Object.keys(rootPackage.scripts ?? {}));
const failures = [];

const commandSets = {
  manualQaPreflightCommands,
  releaseApprovalPreflightCommands,
  releaseArtifactSetupCommands,
  releaseArtifactVerificationCommands,
  releaseConsolePreflightCommands,
  releaseDashboardVerificationCommands,
  storeSubmissionPreflightCommands
};

for (const [name, commands] of Object.entries(commandSets)) {
  checkCommandSetShape(name, commands);
}

requireFrozen("releaseArtifactSetupCommands", releaseArtifactSetupCommands);
requireFrozen("releaseArtifactVerificationCommands", releaseArtifactVerificationCommands);
requireFrozen("manualQaPreflightCommands", manualQaPreflightCommands);
requireFrozen("releaseConsolePreflightCommands", releaseConsolePreflightCommands);
requireFrozen("storeSubmissionPreflightCommands", storeSubmissionPreflightCommands);
requireFrozen("releaseDashboardVerificationCommands", releaseDashboardVerificationCommands);
requireFrozen("releaseApprovalPreflightCommands", releaseApprovalPreflightCommands);

requireSequence("releaseArtifactSetupCommands", releaseArtifactSetupCommands, [
  "pnpm check:release-packages",
  "pnpm build:apps-in-toss:candidate",
  "pnpm check:package",
  "pnpm release:artifact-manifest",
  "pnpm check:release-artifact-manifest",
  "pnpm check:release-verification-commands",
  "pnpm check:release-manual-blockers",
  "pnpm check:public-url-guard"
]);
requireExact(
  "releaseArtifactVerificationCommands",
  releaseArtifactVerificationCommands,
  [...releaseArtifactSetupCommands, "pnpm check:release:automated"]
);
requireExact("manualQaPreflightCommands", manualQaPreflightCommands, [
  ...releaseArtifactSetupCommands,
  "pnpm release:manual-qa-packet",
  "pnpm check:manual-qa-packet",
  "pnpm check:manual-qa"
]);
requireExact("releaseConsolePreflightCommands", releaseConsolePreflightCommands, [
  ...releaseArtifactSetupCommands,
  "pnpm release:console-packet",
  "pnpm check:release-console-packet",
  "pnpm check:release-console"
]);
requireEndsWith("storeSubmissionPreflightCommands", storeSubmissionPreflightCommands, "pnpm check:release:automated");
requireIncludes("storeSubmissionPreflightCommands", storeSubmissionPreflightCommands, [
  ...releaseArtifactSetupCommands,
  "pnpm release:manual-qa-packet",
  "pnpm check:manual-qa-packet",
  "pnpm release:console-packet",
  "pnpm check:release-console-packet",
  "pnpm release:rating-content-inventory",
  "pnpm check:rating-content-inventory",
  "pnpm release:public-pages",
  "pnpm check:public-pages",
  "pnpm release:store-submission-packet",
  "pnpm check:store-submission-packet",
  "pnpm release:gate-dashboard",
  "pnpm check:release-gate-dashboard",
  "pnpm release:approval-packet",
  "pnpm check:release-approval-packet"
]);
requireEndsWith("releaseDashboardVerificationCommands", releaseDashboardVerificationCommands, "pnpm check:release:automated");
requireIncludes("releaseDashboardVerificationCommands", releaseDashboardVerificationCommands, [
  ...storeSubmissionPreflightCommands.slice(0, -1),
  "pnpm check:release-approval"
]);
requireEndsWith("releaseApprovalPreflightCommands", releaseApprovalPreflightCommands, "pnpm check:release:automated");
requireIncludes("releaseApprovalPreflightCommands", releaseApprovalPreflightCommands, [
  ...releaseArtifactSetupCommands,
  "pnpm check:manual-qa:strict",
  "pnpm check:release-console:strict",
  "pnpm check:store-config:strict",
  "pnpm check:release-approval"
]);

if (renderCommandBlock(releaseArtifactSetupCommands) !== releaseArtifactSetupCommands.join("\n")) {
  failures.push("renderCommandBlock must preserve command order with newline separators.");
}

checkCommandDocs();
checkQaScript();

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkCommandSetShape(name, commands) {
  if (!Array.isArray(commands)) {
    failures.push(`${name} must be an array.`);
    return;
  }

  const seen = new Set();
  for (const command of commands) {
    if (typeof command !== "string" || command.trim() !== command || command === "") {
      failures.push(`${name} contains an invalid command: ${JSON.stringify(command)}.`);
      continue;
    }
    if (seen.has(command)) {
      failures.push(`${name} contains duplicate command: ${command}.`);
    }
    seen.add(command);

    const scriptName = parsePnpmScript(command);
    if (!scriptName) {
      failures.push(`${name} contains a non-script command: ${command}.`);
      continue;
    }
    if (!packageScripts.has(scriptName)) {
      failures.push(`${name} references missing package.json script: ${scriptName}.`);
    }
  }
}

function parsePnpmScript(command) {
  const match = command.match(/^pnpm ([a-zA-Z0-9:_-]+)$/);
  return match?.[1] ?? null;
}

function requireFrozen(name, commands) {
  if (!Object.isFrozen(commands)) {
    failures.push(`${name} must be Object.freeze()'d.`);
  }
}

function requireSequence(name, actual, expected) {
  requireExact(name, actual.slice(0, expected.length), expected);
}

function requireExact(name, actual, expected) {
  if (actual.length !== expected.length || actual.some((entry, index) => entry !== expected[index])) {
    failures.push(`${name} must equal ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function requireIncludes(name, commands, expectedCommands) {
  for (const command of expectedCommands) {
    if (!commands.includes(command)) {
      failures.push(`${name} must include ${command}.`);
    }
  }
}

function requireEndsWith(name, commands, expected) {
  if (commands.at(-1) !== expected) {
    failures.push(`${name} must end with ${expected}.`);
  }
}

function checkCommandDocs() {
  for (const path of ["README.md", "AGENT.md"]) {
    const text = read(path);
    for (const scriptName of packageScripts) {
      const command = `pnpm ${scriptName}`;
      if (!text.includes(command)) {
        failures.push(`${path} must document package script command: ${command}.`);
      }
    }
  }
}

function checkQaScript() {
  const qaScript = rootPackage.scripts?.qa;
  if (typeof qaScript !== "string" || qaScript.trim() === "") {
    failures.push("package.json qa script must be defined.");
    return;
  }

  const qaCommands = qaScript.split("&&").map((command) => command.trim()).filter(Boolean);
  for (const command of releaseArtifactSetupCommands) {
    if (!qaCommands.includes(command)) {
      failures.push(`package.json qa script must include shared release setup command: ${command}.`);
    }
  }
  if (qaCommands.at(-1) !== "pnpm check:release:automated") {
    failures.push("package.json qa script must end with pnpm check:release:automated.");
  }
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log("Release verification command inventory check");
  console.log("============================================");
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Release verification command inventory: PASS" : "Release verification command inventory: FAIL");
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
