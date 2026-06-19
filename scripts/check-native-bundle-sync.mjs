import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const distRoot = resolve(repoRoot, "apps/starlit-apprentice/dist");
const failures = [];
const warnings = [];

const expectedCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self' blob:";

const nativeTargets = [
  {
    label: "Android",
    publicRoot: "apps/starlit-apprentice/android/app/src/main/assets/public",
    configPath: "apps/starlit-apprentice/android/app/src/main/assets/capacitor.config.json"
  },
  {
    label: "iOS",
    publicRoot: "apps/starlit-apprentice/ios/App/App/public",
    configPath: "apps/starlit-apprentice/ios/App/App/capacitor.config.json"
  }
];

const allowedNativeExtras = new Set(["cordova.js", "cordova_plugins.js"]);
const forbiddenRuntimeAssets = [
  "starlit-apprentice-icon-600.png",
  "starlit-apprentice-thumbnail-1932x828.png",
  "screenshots/"
];

const distFiles = checkDist();
for (const target of nativeTargets) {
  checkNativeTarget(target, distFiles);
}
checkDocs();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkDist() {
  if (!existsSync(distRoot)) {
    failures.push("Missing app dist. Run pnpm --filter @starlit-apprentice/app build.");
    return [];
  }

  const relativeFiles = listRelativeFiles(distRoot);
  requireFile("dist", relativeFiles, "index.html");
  requireSome("dist", relativeFiles, /^assets\/index-[A-Za-z0-9_-]+\.js$/);
  requireSome("dist", relativeFiles, /^assets\/index-[A-Za-z0-9_-]+\.css$/);
  checkForbiddenRuntimeAssets("dist", relativeFiles);
  return relativeFiles;
}

function checkNativeTarget(target, distFiles) {
  const publicRoot = resolve(repoRoot, target.publicRoot);
  if (!existsSync(publicRoot)) {
    failures.push(`${target.label} native public bundle is missing: ${target.publicRoot}. Run pnpm cap:sync.`);
    return;
  }

  const nativeFiles = listRelativeFiles(publicRoot);
  const nativeFileSet = new Set(nativeFiles);
  const distFileSet = new Set(distFiles);

  for (const distFile of distFiles) {
    if (!nativeFileSet.has(distFile)) {
      failures.push(`${target.label} native bundle missing dist file: ${distFile}. Run pnpm cap:sync.`);
      continue;
    }

    const distHash = hashFile(resolve(distRoot, distFile));
    const nativeHash = hashFile(resolve(publicRoot, distFile));
    if (distHash !== nativeHash) {
      failures.push(`${target.label} native bundle stale file: ${distFile}. Run pnpm cap:sync after the latest web build.`);
    }
  }

  for (const nativeFile of nativeFiles) {
    if (!distFileSet.has(nativeFile) && !allowedNativeExtras.has(nativeFile)) {
      failures.push(`${target.label} native bundle contains unexpected file: ${nativeFile}`);
    }
  }

  requireFile(`${target.label} native bundle`, nativeFiles, "index.html");
  requireSome(`${target.label} native bundle`, nativeFiles, /^assets\/index-[A-Za-z0-9_-]+\.js$/);
  requireSome(`${target.label} native bundle`, nativeFiles, /^assets\/index-[A-Za-z0-9_-]+\.css$/);
  checkForbiddenRuntimeAssets(`${target.label} native bundle`, nativeFiles);
  checkHtmlCsp(`${target.label} native index.html`, resolve(publicRoot, "index.html"));
  checkCapacitorRuntimeConfig(target);
}

function checkCapacitorRuntimeConfig(target) {
  const configPath = resolve(repoRoot, target.configPath);
  if (!existsSync(configPath)) {
    failures.push(`${target.label} generated Capacitor config is missing: ${target.configPath}. Run pnpm cap:sync.`);
    return;
  }

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    failures.push(`${target.label} generated Capacitor config is not valid JSON: ${error.message}`);
    return;
  }

  if (config.appId !== "com.seorilabs.starlitapprentice") {
    failures.push(`${target.label} generated Capacitor appId must be com.seorilabs.starlitapprentice.`);
  }
  if (config.appName !== "Star Apprentice") {
    failures.push(`${target.label} generated Capacitor appName must be Star Apprentice.`);
  }
  if (config.webDir !== "dist") {
    failures.push(`${target.label} generated Capacitor webDir must be dist.`);
  }
  if (config.server?.url) {
    failures.push(`${target.label} generated Capacitor config must not include server.url for store builds.`);
  }
}

function checkHtmlCsp(label, path) {
  if (!existsSync(path)) {
    failures.push(`${label} is missing.`);
    return;
  }

  const html = readFileSync(path, "utf8");
  const policies = [...html.matchAll(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi)].map((match) => match[0]);
  if (policies.length !== 1) {
    failures.push(`${label} must include exactly one Content-Security-Policy meta tag, got ${policies.length}.`);
    return;
  }

  const content = extractMetaContent(policies[0]);
  if (content !== expectedCsp) {
    failures.push(`${label} CSP must match the release policy.`);
  }
}

function checkForbiddenRuntimeAssets(label, files) {
  for (const file of files) {
    if (file.endsWith(".map")) {
      failures.push(`${label} must not include sourcemaps: ${file}`);
    }
    for (const forbidden of forbiddenRuntimeAssets) {
      if (file === forbidden || file.startsWith(forbidden)) {
        failures.push(`${label} must not include registration-only asset: ${file}`);
      }
    }
  }
}

function checkDocs() {
  const docPath = resolve(repoRoot, "docs/native-bundle-sync.md");
  if (!existsSync(docPath)) {
    failures.push("docs/native-bundle-sync.md is required.");
    return;
  }

  const doc = readFileSync(docPath, "utf8");
  for (const expected of [
    "pnpm check:native-bundle-sync",
    "pnpm cap:sync",
    "apps/starlit-apprentice/android/app/src/main/assets/public",
    "apps/starlit-apprentice/ios/App/App/public",
    "cordova.js",
    "server.url",
    "Content-Security-Policy"
  ]) {
    if (!doc.includes(expected)) {
      failures.push(`docs/native-bundle-sync.md must include: ${expected}`);
    }
  }
}

function requireFile(label, files, expected) {
  if (!files.includes(expected)) {
    failures.push(`${label} missing required file: ${expected}`);
  }
}

function requireSome(label, files, pattern) {
  if (!files.some((file) => pattern.test(file))) {
    failures.push(`${label} missing file matching ${pattern}.`);
  }
}

function listRelativeFiles(root) {
  return listFiles(root)
    .map((file) => normalizeRelative(relative(root, file)))
    .sort();
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        stack.push(path);
      } else {
        files.push(path);
      }
    }
  }
  return files;
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeRelative(path) {
  return path.split("\\").join("/");
}

function extractMetaContent(metaTag) {
  const match = metaTag.match(/\scontent=(["'])(.*?)\1/i);
  return match?.[2] ?? "";
}

function printReport() {
  console.log("Native bundle sync check");
  console.log("========================");
  console.log("");

  printSection("Failures", failures);
  printSection("Warnings", warnings);

  console.log(failures.length === 0 ? "Native bundle sync checks: PASS" : "Native bundle sync checks: FAIL");
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
