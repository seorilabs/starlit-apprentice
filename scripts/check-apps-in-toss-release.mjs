import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const jsonOutput = process.argv.includes("--json");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];
const unresolvedMarkers = ["확정 필요", "TODO", "TBD", ""];

const configPath = process.env.APPS_IN_TOSS_CONFIG_PATH ?? "apps-in-toss/apps-in-toss.config.json";
const releaseConsoleEvidencePath = process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json";

const config = readJson(configPath);
const releaseConsoleEvidence = exists(releaseConsoleEvidencePath) ? readJson(releaseConsoleEvidencePath) : null;
const packageJson = readJson("package.json");
const appPackageJson = readJson("apps/starlit-apprentice/package.json");

checkIdentityAndDocs();
checkBuildOutput();
checkWebViewPolicy();
checkAssets();
checkManualGates();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exit(1);
}

function checkIdentityAndDocs() {
  requireEqual("AppsInToss appName", config.appName, "starlit-apprentice");
  requireEqual("AppsInToss appType", config.appType, "game");
  requireEqual("AppsInToss entryRoute", config.entryRoute, "/");
  requireEqual("AppsInToss featureRegistration.status", config.featureRegistration?.status, "game-optional");
  requireEqual("AppsInToss candidate feature URL", config.featureRegistration?.candidateFeature?.url, "intoss://starlit-apprentice/");

  for (const script of ["build:apps-in-toss:ait", "build:apps-in-toss:candidate", "check:apps-in-toss"]) {
    if (!packageJson.scripts?.[script]) {
      automatedFailures.push(`package.json missing script: ${script}`);
    }
  }
  for (const script of ["build:web:apps-in-toss", "build:apps-in-toss", "deploy:apps-in-toss"]) {
    if (!appPackageJson.scripts?.[script]) {
      automatedFailures.push(`apps/starlit-apprentice/package.json missing script: ${script}`);
    }
  }
  if (appPackageJson.devDependencies?.["@apps-in-toss/web-framework"] !== "2.9.1") {
    automatedFailures.push("apps/starlit-apprentice must pin @apps-in-toss/web-framework to the verified 2.9.1 release.");
  }

  for (const path of ["apps-in-toss/README.md", "docs/apps-in-toss-release.md", "apps/starlit-apprentice/granite.config.ts"]) {
    if (!exists(path)) {
      automatedFailures.push(`Missing AppsInToss release doc: ${path}`);
    }
  }
}

function checkBuildOutput() {
  const source = config.build?.source;
  if (!source || !exists(source)) {
    addManual(`AppsInToss candidate build source is missing: ${source}. Run pnpm build:apps-in-toss:candidate.`);
    return;
  }

  const files = listFiles(source);
  const totalBytes = files.reduce((sum, path) => sum + statSync(path).size, 0);
  const limit = config.build?.unpackedSizeLimitBytes ?? 100 * 1024 * 1024;
  if (totalBytes > limit) {
    automatedFailures.push(`AppsInToss unpacked candidate size exceeds ${limit} bytes: ${totalBytes}`);
  }

  const relativeFiles = files.map((path) => relative(resolve(repoRoot, source), path));
  if (!relativeFiles.includes("index.html")) {
    automatedFailures.push("AppsInToss dist must include index.html.");
  }
  if (!relativeFiles.some((path) => /^assets\/.*\.js$/.test(path))) {
    automatedFailures.push("AppsInToss dist must include a bundled JS asset.");
  }
  if (!relativeFiles.some((path) => /^assets\/.*\.css$/.test(path))) {
    automatedFailures.push("AppsInToss dist must include a bundled CSS asset.");
  }
  if (relativeFiles.some((path) => path.endsWith(".map"))) {
    automatedFailures.push("AppsInToss dist must not include sourcemaps in the release candidate.");
  }
  for (const excluded of ["screenshots/", "starlit-apprentice-icon-600.png", "starlit-apprentice-thumbnail-1932x828.png"]) {
    if (relativeFiles.some((path) => path === excluded.replace("/", "") || path.startsWith(excluded))) {
      automatedFailures.push(`AppsInToss runtime candidate must exclude registration-only asset: ${excluded}`);
    }
  }

  const archive = config.build?.candidateArchive;
  if (!archive || !exists(archive)) {
    addManual(`AppsInToss static WebView candidate archive has not been generated yet. Run pnpm build:apps-in-toss:candidate.`);
  }

  const uploadableAit = config.build?.uploadableAit;
  if (config.build?.isUploadableAit !== true || config.build?.uploadableAitStatus !== "local-ait-built-pending-console-upload") {
    automatedFailures.push("AppsInToss config must track local .ait packaging as built and pending console upload.");
  }
  if (!uploadableAit || !exists(uploadableAit)) {
    automatedFailures.push(`AppsInToss uploadable .ait artifact is missing: ${uploadableAit}. Run pnpm build:apps-in-toss:candidate.`);
  } else {
    const aitSize = statSync(resolve(repoRoot, uploadableAit)).size;
    if (aitSize <= 0) {
      automatedFailures.push(`AppsInToss uploadable .ait artifact is empty: ${uploadableAit}`);
    }
    if (aitSize > limit) {
      automatedFailures.push(`AppsInToss uploadable .ait artifact exceeds ${limit} bytes: ${aitSize}`);
    }
  }
}

function checkWebViewPolicy() {
  const indexHtml = read("apps/starlit-apprentice/index.html");
  const distIndexHtml = exists("apps/starlit-apprentice/dist/index.html") ? read("apps/starlit-apprentice/dist/index.html") : "";
  for (const [label, text] of [
    ["source index.html", indexHtml],
    ["dist index.html", distIndexHtml]
  ]) {
    if (!text.includes("maximum-scale=1") || !text.includes("user-scalable=no") || !text.includes("viewport-fit=cover")) {
      automatedFailures.push(`${label} must disable pinch zoom and keep viewport-fit=cover for AppsInToss WebView review.`);
    }
  }

  const appFiles = [
    ...listFiles("apps/starlit-apprentice/src"),
    ...listFiles("packages/product-core/src")
  ].filter((path) => [".ts", ".tsx", ".js", ".jsx", ".html"].includes(extname(path)) && !/\.test\.[tj]sx?$/.test(path));

  const blockedPatterns = [
    /window\.open\s*\(/,
    /target=["']_blank["']/,
    /https?:\/\//,
    /<iframe\b/i,
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /sendBeacon/,
    /WebSocket/,
    /EventSource/
  ];
  for (const file of appFiles) {
    const text = readAbsolute(file);
    for (const pattern of blockedPatterns) {
      if (pattern.test(text)) {
        automatedFailures.push(`AppsInToss WebView policy scan failed: ${relative(repoRoot, file)} matches ${pattern}`);
      }
    }
  }
}

function checkAssets() {
  checkImage("AppsInToss logo", config.assets?.logo, {
    dimensions: [600, 600],
    noAlpha: true
  });
  checkImage("AppsInToss thumbnail", config.assets?.thumbnail, {
    dimensions: [1932, 828]
  });
  if (!Array.isArray(config.assets?.screenshots) || config.assets.screenshots.length < 3) {
    automatedFailures.push("AppsInToss vertical screenshots must include at least 3 images.");
    return;
  }
  for (const screenshot of config.assets.screenshots) {
    checkImage("AppsInToss vertical screenshot", screenshot, {
      dimensions: [636, 1048]
    });
  }
}

function checkManualGates() {
  const manualEvidence = config.manualEvidence ?? {};
  const requiredManualEvidence = [
    ["consoleGameCategoryAndExposure", "AppsInToss console game category and exposure fields must be confirmed."],
    ["gameRatingEvidence", "AppsInToss game rating evidence must be submitted: open-market self-rating data/store URL or Game Rating and Administration Committee certificate."],
    ["aitBundleUpload", "AppsInToss .ait console upload remains pending; upload the locally built artifact and verify the generated test scheme/QR."],
    ["qrTossAppTest", "AppsInToss QR/Toss-app test must be completed at least once before review request."],
    ["deploymentApproval", "AppsInToss deployment approval is not granted; do not submit or publish production versions."]
  ];
  for (const [field, message] of requiredManualEvidence) {
    if (unresolved(manualEvidence[field])) {
      addManual(message);
    }
  }

  const requiredConsoleItems = [
    ["apps-in-toss-ait-upload", "AppsInToss .ait upload console evidence must be passed."],
    ["apps-in-toss-qr-preview", "AppsInToss QR/Toss-app preview console evidence must be passed."],
    ["apps-in-toss-category-exposure", "AppsInToss category/exposure console evidence must be passed."],
    ["apps-in-toss-game-rating", "AppsInToss game rating console evidence must be passed."],
    ["apps-in-toss-deployment-approval", "AppsInToss deployment approval console evidence must be passed."]
  ];
  const consoleItems = Array.isArray(releaseConsoleEvidence?.items) ? releaseConsoleEvidence.items : [];
  for (const [itemId, message] of requiredConsoleItems) {
    const item = consoleItems.find((entry) => entry?.id === itemId && entry?.target === "AppsInToss");
    if (item?.status !== "passed") {
      addManual(message);
    }
  }
}

function checkImage(label, value, options) {
  if (!value || !exists(value)) {
    automatedFailures.push(`${label} is missing: ${value}`);
    return;
  }
  const info = imageInfo(value);
  if (!info) {
    automatedFailures.push(`${label} must be a readable PNG: ${value}`);
    return;
  }
  const [width, height] = options.dimensions;
  if (info.width !== width || info.height !== height) {
    automatedFailures.push(`${label} must be ${width} x ${height}, got ${info.width} x ${info.height}: ${value}`);
  }
  if (options.noAlpha && [4, 6].includes(info.colorType)) {
    automatedFailures.push(`${label} must not include alpha: ${value}`);
  }
}

function imageInfo(path) {
  const data = readBuffer(path);
  if (data.length >= 26 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      colorType: data[25]
    };
  }
  return null;
}

function addManual(message) {
  if (allowManualBlockers) {
    manualBlockers.push(message);
  } else {
    automatedFailures.push(message);
  }
}

function listFiles(root) {
  const absoluteRoot = resolve(repoRoot, root);
  if (!existsSync(absoluteRoot)) {
    return [];
  }
  const files = [];
  const stack = [absoluteRoot];
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

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    automatedFailures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function unresolved(value) {
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

function readAbsolute(path) {
  return readFileSync(path, "utf8");
}

function readBuffer(path) {
  return readFileSync(resolve(repoRoot, path));
}

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}

function printReport() {
  const report = { automatedFailures, manualBlockers, warnings };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("AppsInToss release check");
  console.log("========================");
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated AppsInToss checks: PASS" : "Automated AppsInToss checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Manual AppsInToss gates: CLEAR" : `Manual AppsInToss gates: ${manualBlockers.length} blocker(s)`);
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
