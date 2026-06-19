import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { releaseArtifactVerificationCommands } from "./release-verification-commands.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const manifestRelativePath = "qa/release-artifact-manifest.json";
const manifestPath = resolve(repoRoot, manifestRelativePath);
const checkOnly = process.argv.includes("--check");
const failures = [];
const warnings = [];

const manifest = buildManifest();

if (checkOnly) {
  checkManifest();
} else {
  writeManifest();
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function buildManifest() {
  const rootPackage = readJson("package.json");
  const appPackage = readJson("apps/starlit-apprentice/package.json");
  const baseManifest = {
    schemaVersion: 1,
    appName: "starlit-apprentice",
    packageName: rootPackage.name,
    appPackageName: appPackage.name,
    version: rootPackage.version,
    artifacts: {
      webDist: directoryArtifact("apps/starlit-apprentice/dist"),
      androidQaApk: fileArtifact("apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk"),
      androidAab: fileArtifact("apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab"),
      iosApp: directoryArtifact("apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app"),
      appsInTossCandidate: fileArtifact("apps-in-toss/build/starlit-apprentice-webview-candidate.zip"),
      appsInTossAit: fileArtifact("apps-in-toss/build/starlit-apprentice.ait")
    },
    verificationCommands: [...releaseArtifactVerificationCommands],
    manualQaEvidence: {
      sourceFile: "qa/manual-qa-evidence.json",
      buildArtifactFormat: "Include this manifest manualQaBuildId plus the tested platform artifact path or store/TestFlight/AppsInToss build reference."
    }
  };

  if (failures.length > 0) {
    return null;
  }

  return {
    ...baseManifest,
    generatedAt: new Date().toISOString(),
    manualQaBuildId: `sha256:${hashText(stableStringify(baseManifest))}`
  };
}

function writeManifest() {
  if (!manifest) {
    return;
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function checkManifest() {
  if (!existsSync(manifestPath)) {
    failures.push(`Missing release artifact manifest: ${manifestRelativePath}. Run pnpm release:artifact-manifest after building release packages.`);
    return;
  }
  if (!manifest) {
    return;
  }

  const existing = readJson(manifestRelativePath);
  if (existing.schemaVersion !== 1) {
    failures.push(`schemaVersion must be 1, got ${JSON.stringify(existing.schemaVersion)}.`);
  }
  if (existing.appName !== "starlit-apprentice") {
    failures.push(`appName must be starlit-apprentice, got ${JSON.stringify(existing.appName)}.`);
  }
  if (typeof existing.generatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(existing.generatedAt)) {
    failures.push("generatedAt must be an ISO timestamp string.");
  }
  if (existing.manualQaBuildId !== manifest.manualQaBuildId) {
    failures.push(
      `release artifact manifest is stale: ${existing.manualQaBuildId ?? "missing"} != ${manifest.manualQaBuildId}. Run pnpm release:artifact-manifest after the latest release package build.`
    );
  }

  const currentComparable = comparableManifest(manifest);
  const existingComparable = comparableManifest(existing);
  if (stableStringify(existingComparable) !== stableStringify(currentComparable)) {
    failures.push("release artifact manifest contents do not match current artifacts.");
  }

  for (const command of releaseArtifactVerificationCommands) {
    if (!existing.verificationCommands?.includes(command)) {
      failures.push(`release artifact manifest must include verification command: ${command}`);
    }
  }
}

function comparableManifest(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  const { generatedAt: _generatedAt, ...rest } = value;
  return rest;
}

function fileArtifact(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing release artifact file: ${path}`);
    return null;
  }
  const stat = statSync(absolutePath);
  if (!stat.isFile()) {
    failures.push(`Release artifact path must be a file: ${path}`);
    return null;
  }
  if (stat.size <= 0) {
    failures.push(`Release artifact file is empty: ${path}`);
  }
  return {
    kind: "file",
    path,
    sizeBytes: stat.size,
    sha256: hashFile(absolutePath)
  };
}

function directoryArtifact(path) {
  const absolutePath = resolve(repoRoot, path);
  if (!existsSync(absolutePath)) {
    failures.push(`Missing release artifact directory: ${path}`);
    return null;
  }
  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    failures.push(`Release artifact path must be a directory: ${path}`);
    return null;
  }

  const files = listFiles(absolutePath).map((file) => {
    const fileStat = statSync(file);
    return {
      path: relative(absolutePath, file).split("/").join("/"),
      sizeBytes: fileStat.size,
      sha256: hashFile(file)
    };
  });

  if (files.length === 0) {
    failures.push(`Release artifact directory is empty: ${path}`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  return {
    kind: "directory",
    path,
    fileCount: files.length,
    totalBytes,
    sha256: hashText(stableStringify(files)),
    files
  };
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current).sort()) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        stack.push(path);
      } else {
        files.push(path);
      }
    }
  }
  return files.sort();
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObject(entry)])
  );
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function printReport() {
  console.log(checkOnly ? "Release artifact manifest check" : "Release artifact manifest");
  console.log(checkOnly ? "===============================" : "=========================");
  console.log("");

  if (manifest) {
    console.log(`Manifest: ${manifestRelativePath}`);
    console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
    for (const [name, artifact] of Object.entries(manifest.artifacts)) {
      if (!artifact) {
        continue;
      }
      const size = artifact.kind === "directory" ? artifact.totalBytes : artifact.sizeBytes;
      const count = artifact.kind === "directory" ? `, ${artifact.fileCount} file(s)` : "";
      console.log(`- ${name}: ${formatBytes(size)}${count}, sha256 ${artifact.sha256}`);
    }
    console.log("");
  }

  printSection("Failures", failures);
  printSection("Warnings", warnings);
  console.log(failures.length === 0 ? "Release artifact manifest checks: PASS" : "Release artifact manifest checks: FAIL");
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
