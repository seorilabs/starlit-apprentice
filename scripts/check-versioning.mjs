import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const failures = [];
const warnings = [];

const rootPackage = readJson("package.json");
const appPackage = readJson("apps/starlit-apprentice/package.json");
const corePackage = readJson("packages/product-core/package.json");
const androidGradle = read("apps/starlit-apprentice/android/app/build.gradle");
const xcodeProject = read("apps/starlit-apprentice/ios/App/App.xcodeproj/project.pbxproj");
const versioningDoc = read("docs/release-versioning.md");

const expectedMarketingVersion = rootPackage.version;
const expectedBuildNumber = "1";

checkPackageVersions();
checkAndroidVersion();
checkIosVersion();
checkDocs();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkPackageVersions() {
  requireSemver("root package version", rootPackage.version);

  for (const [label, value] of [
    ["app package version", appPackage.version],
    ["product-core package version", corePackage.version]
  ]) {
    if (value !== expectedMarketingVersion) {
      failures.push(`${label} must match root package version ${expectedMarketingVersion}, got ${JSON.stringify(value)}`);
    }
  }
}

function checkAndroidVersion() {
  const versionCode = matchOne(androidGradle, /^\s*versionCode\s+(\d+)\s*$/m, "Android versionCode");
  const versionName = matchOne(androidGradle, /^\s*versionName\s+"([^"]+)"\s*$/m, "Android versionName");

  if (versionCode !== expectedBuildNumber) {
    failures.push(`Android versionCode must be ${expectedBuildNumber}, got ${JSON.stringify(versionCode)}`);
  }
  if (versionName !== expectedMarketingVersion) {
    failures.push(`Android versionName must be ${expectedMarketingVersion}, got ${JSON.stringify(versionName)}`);
  }
}

function checkIosVersion() {
  const marketingVersions = matchAll(xcodeProject, /^\s*MARKETING_VERSION\s+=\s+([^;]+);/gm);
  const projectVersions = matchAll(xcodeProject, /^\s*CURRENT_PROJECT_VERSION\s+=\s+([^;]+);/gm);

  if (marketingVersions.length !== 2) {
    failures.push(`iOS project must declare exactly 2 MARKETING_VERSION values, got ${marketingVersions.length}`);
  }
  if (projectVersions.length !== 2) {
    failures.push(`iOS project must declare exactly 2 CURRENT_PROJECT_VERSION values, got ${projectVersions.length}`);
  }

  for (const value of marketingVersions) {
    if (value !== expectedMarketingVersion) {
      failures.push(`iOS MARKETING_VERSION must be ${expectedMarketingVersion}, got ${JSON.stringify(value)}`);
    }
  }

  for (const value of projectVersions) {
    if (value !== expectedBuildNumber) {
      failures.push(`iOS CURRENT_PROJECT_VERSION must be ${expectedBuildNumber}, got ${JSON.stringify(value)}`);
    }
  }
}

function checkDocs() {
  for (const expected of [
    "pnpm check:versioning",
    `Marketing version | \`${expectedMarketingVersion}\``,
    `Build number | \`${expectedBuildNumber}\``,
    "Android `versionName`",
    "iOS Debug and Release `MARKETING_VERSION`",
    "Android `versionCode` and iOS Debug/Release `CURRENT_PROJECT_VERSION`"
  ]) {
    if (!versioningDoc.includes(expected)) {
      failures.push(`docs/release-versioning.md must include: ${expected}`);
    }
  }
}

function requireSemver(label, value) {
  if (!/^\d+\.\d+\.\d+$/.test(value ?? "")) {
    failures.push(`${label} must use x.y.z semver, got ${JSON.stringify(value)}`);
  }
}

function matchOne(text, pattern, label) {
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  const matches = [...text.matchAll(globalPattern)].map((match) => match[1]);
  if (matches.length !== 1) {
    failures.push(`${label} must appear exactly once, got ${matches.length}`);
    return null;
  }

  return matches[0];
}

function matchAll(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function printReport() {
  console.log("Release versioning check");
  console.log("========================");
  console.log("");

  printSection("Failures", failures);
  printSection("Warnings", warnings);

  if (failures.length === 0) {
    console.log(`Release versioning checks: PASS (${expectedMarketingVersion}+${expectedBuildNumber})`);
  } else {
    console.log("Release versioning checks: FAIL");
  }
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

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}
