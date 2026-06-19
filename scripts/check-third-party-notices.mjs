import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const appRoot = resolve(repoRoot, "apps/starlit-apprentice");
const appRequire = createRequire(resolve(appRoot, "package.json"));
const failures = [];
const warnings = [];

const shippedPackages = [
  {
    name: "@capacitor/core",
    sourceField: "dependencies",
    usage: "Capacitor runtime bridge used by the bundled-web native shell."
  },
  {
    name: "@capacitor/android",
    sourceField: "devDependencies",
    usage: "Android Capacitor native shell used for Google Play packaging."
  },
  {
    name: "@capacitor/ios",
    sourceField: "devDependencies",
    usage: "iOS Capacitor native shell used for App Store packaging."
  }
];
const appsInTossSdkPackage = {
  name: "@apps-in-toss/web-framework",
  sourceField: "devDependencies",
  usage: "AppsInToss WebView SDK/CLI used to generate the submitted .ait bundle."
};

const shippedNames = new Set(shippedPackages.map((entry) => entry.name));
const internalProductionPackages = new Set(["@starlit-apprentice/product-core"]);
const appPackage = readJson("apps/starlit-apprentice/package.json");
const noticeDoc = read("docs/third-party-notices.md");

checkAppDependencyCoverage();
checkNoticeDocument();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkAppDependencyCoverage() {
  for (const [name] of Object.entries(appPackage.dependencies ?? {})) {
    if (!shippedNames.has(name) && !internalProductionPackages.has(name)) {
      failures.push(`Production dependency is missing third-party notice coverage: ${name}`);
    }
  }

  for (const entry of shippedPackages) {
    const packageSet = appPackage[entry.sourceField] ?? {};
    if (!Object.hasOwn(packageSet, entry.name)) {
      failures.push(`${entry.name} must remain listed in app ${entry.sourceField}`);
    }
  }

  const appsInTossPackageSet = appPackage[appsInTossSdkPackage.sourceField] ?? {};
  if (!Object.hasOwn(appsInTossPackageSet, appsInTossSdkPackage.name)) {
    failures.push(`${appsInTossSdkPackage.name} must remain listed in app ${appsInTossSdkPackage.sourceField} while .ait packaging is enabled.`);
  }
}

function checkNoticeDocument() {
  requireDocText("pnpm check:third-party-notices");
  requireDocText("@starlit-apprentice/product-core");
  requireDocText("does not bundle a third-party game engine");
  requireDocText("No production ad SDK, analytics SDK, billing SDK, Firebase SDK, or tracking SDK");
  requireDocText("new production dependency is added without explicit notice coverage");

  for (const entry of shippedPackages) {
    const metadata = readInstalledPackage(entry.name);
    if (metadata.license !== "MIT") {
      failures.push(`${entry.name} must use MIT license metadata, got ${JSON.stringify(metadata.license)}`);
    }

    if (!metadata.homepage) {
      failures.push(`${entry.name} package metadata must include homepage`);
    }

    const licenseFile = findLicenseFile(metadata.dir);
    if (!licenseFile) {
      failures.push(`${entry.name} package must include a license file in node_modules`);
    }

    requireDocText(`| \`${metadata.name}\` | \`${metadata.version}\` | ${metadata.license} | ${entry.usage} | ${metadata.homepage} |`);
  }

  const sdkMetadata = readInstalledPackage(appsInTossSdkPackage.name);
  if (!findLicenseFile(sdkMetadata.dir)) {
    failures.push(`${appsInTossSdkPackage.name} package must include a license file in node_modules`);
  }
  requireDocText("AppsInToss SDK Runtime");
  requireDocText("`@apps-in-toss/web-framework`");
  requireDocText(`\`${sdkMetadata.version}\``);
  requireDocText("license metadata is absent");
  requireDocText("GPL-3.0");
  requireDocText(appsInTossSdkPackage.usage);
}

function readInstalledPackage(packageName) {
  try {
    const packagePath = appRequire.resolve(`${packageName}/package.json`);
    const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
    return {
      name: metadata.name,
      version: metadata.version,
      license: metadata.license,
      homepage: metadata.homepage,
      dir: dirname(packagePath)
    };
  } catch (error) {
    failures.push(`Unable to resolve installed package metadata for ${packageName}: ${error.message}`);
    return {
      name: packageName,
      version: "unresolved",
      license: "unresolved",
      homepage: "",
      dir: ""
    };
  }
}

function findLicenseFile(packageDir) {
  if (!packageDir) {
    return null;
  }

  for (const candidate of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENSE-MIT", "LICENCE"]) {
    const path = resolve(packageDir, candidate);
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

function requireDocText(text) {
  if (!noticeDoc.includes(text)) {
    failures.push(`docs/third-party-notices.md must include: ${text}`);
  }
}

function printReport() {
  console.log("Third-party notices check");
  console.log("=========================");
  console.log("");

  printSection("Failures", failures);
  printSection("Warnings", warnings);

  if (failures.length === 0) {
    console.log("Third-party notices checks: PASS");
  } else {
    console.log("Third-party notices checks: FAIL");
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
