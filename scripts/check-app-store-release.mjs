import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const requireLocalArtifact = process.argv.includes("--require-local-artifact");
const jsonOutput = process.argv.includes("--json");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];

const appStoreConfigPath = process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json";
const releaseConsoleEvidencePath = process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json";
const releaseAppPath = resolve(
  repoRoot,
  process.env.IOS_APP_PATH ?? "apps/starlit-apprentice/ios/DerivedData/AppRelease/Build/Products/Release-iphoneos/App.app"
);

const appStoreConfig = readJson(appStoreConfigPath);
const releaseConsoleEvidence = exists(releaseConsoleEvidencePath) ? readJson(releaseConsoleEvidencePath) : null;
const pbxproj = read("apps/starlit-apprentice/ios/App/App.xcodeproj/project.pbxproj");
const infoPlist = read("apps/starlit-apprentice/ios/App/App/Info.plist");
const appIconContents = readJson("apps/starlit-apprentice/ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json");
const splashContents = readJson("apps/starlit-apprentice/ios/App/App/Assets.xcassets/Splash.imageset/Contents.json");
const distRoot = resolve(repoRoot, "apps/starlit-apprentice/dist");
const allowedReleasePublicExtras = new Set(["cordova.js", "cordova_plugins.js"]);
const forbiddenReleasePublicAssets = [
  "starlit-apprentice-icon-600.png",
  "starlit-apprentice-thumbnail-1932x828.png",
  "screenshots/"
];
const expectedCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self' blob:";
const privacyManifest = exists("apps/starlit-apprentice/ios/App/App/PrivacyInfo.xcprivacy")
  ? read("apps/starlit-apprentice/ios/App/App/PrivacyInfo.xcprivacy")
  : "";

checkXcodeProject();
checkAppIconSet();
checkSplashSet();
checkPrivacyAndExportEvidence();
checkLocalReleaseBuildArtifact();
checkManualConsoleGates();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exit(1);
}

function checkXcodeProject() {
  requireEqual("App Store bundleId", appStoreConfig.bundleId, "com.seorilabs.starlitapprentice");
  requireEqual("App Store platform", appStoreConfig.platform, "ios");
  requireEqual("App Store pricing", appStoreConfig.pricing, "free");

  if (!pbxproj.includes("PRODUCT_BUNDLE_IDENTIFIER = com.seorilabs.starlitapprentice;")) {
    automatedFailures.push("Xcode PRODUCT_BUNDLE_IDENTIFIER must be com.seorilabs.starlitapprentice.");
  }
  if (!pbxproj.includes('TARGETED_DEVICE_FAMILY = "1,2";')) {
    automatedFailures.push('Xcode TARGETED_DEVICE_FAMILY must remain "1,2" while app-store config includes iPad.');
  }
  if (!Array.isArray(appStoreConfig.deviceFamilies) || !appStoreConfig.deviceFamilies.includes("iphone") || !appStoreConfig.deviceFamilies.includes("ipad")) {
    automatedFailures.push("app-store config must include both iphone and ipad for the current Xcode target.");
  }
  if (!pbxproj.includes("ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;")) {
    automatedFailures.push("Xcode target must use AppIcon asset catalog.");
  }
  if (!pbxproj.includes("PrivacyInfo.xcprivacy in Resources")) {
    automatedFailures.push("PrivacyInfo.xcprivacy must be included in the App target resources.");
  }

  try {
    const output = execFileSync("xcodebuild", ["-list", "-project", "apps/starlit-apprentice/ios/App/App.xcodeproj"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    if (!output.includes("Schemes:") || !output.includes("App")) {
      automatedFailures.push("Xcode project must expose App scheme.");
    }
  } catch (error) {
    automatedFailures.push(`xcodebuild -list failed: ${error.stderr?.toString?.().trim() || error.message}`);
  }
}

function checkAppIconSet() {
  const requiredSlots = [
    ["iphone", "20x20", "2x", 40],
    ["iphone", "20x20", "3x", 60],
    ["iphone", "29x29", "2x", 58],
    ["iphone", "29x29", "3x", 87],
    ["iphone", "40x40", "2x", 80],
    ["iphone", "40x40", "3x", 120],
    ["iphone", "60x60", "2x", 120],
    ["iphone", "60x60", "3x", 180],
    ["ipad", "20x20", "1x", 20],
    ["ipad", "20x20", "2x", 40],
    ["ipad", "29x29", "1x", 29],
    ["ipad", "29x29", "2x", 58],
    ["ipad", "40x40", "1x", 40],
    ["ipad", "40x40", "2x", 80],
    ["ipad", "76x76", "1x", 76],
    ["ipad", "76x76", "2x", 152],
    ["ipad", "83.5x83.5", "2x", 167],
    ["ios-marketing", "1024x1024", "1x", 1024]
  ];

  if (!Array.isArray(appIconContents.images)) {
    automatedFailures.push("AppIcon Contents.json must contain images array.");
    return;
  }

  for (const [idiom, size, scale, pixels] of requiredSlots) {
    const entry = appIconContents.images.find((image) => image.idiom === idiom && image.size === size && image.scale === scale);
    if (!entry?.filename) {
      automatedFailures.push(`AppIcon slot is missing: ${idiom} ${size} ${scale}`);
      continue;
    }
    const path = `apps/starlit-apprentice/ios/App/App/Assets.xcassets/AppIcon.appiconset/${entry.filename}`;
    const info = imageInfo(path);
    if (!info) {
      automatedFailures.push(`AppIcon file is missing or unreadable: ${path}`);
      continue;
    }
    if (info.width !== pixels || info.height !== pixels) {
      automatedFailures.push(`AppIcon ${entry.filename} must be ${pixels} x ${pixels}, got ${info.width} x ${info.height}.`);
    }
    if (info.kind === "png" && [4, 6].includes(info.colorType)) {
      automatedFailures.push(`AppIcon ${entry.filename} must not include alpha.`);
    }
  }
}

function checkSplashSet() {
  if (!Array.isArray(splashContents.images)) {
    automatedFailures.push("Splash.imageset Contents.json must contain images array.");
    return;
  }

  const requiredScales = ["1x", "2x", "3x"];
  for (const scale of requiredScales) {
    const entry = splashContents.images.find((image) => image.idiom === "universal" && image.scale === scale);
    if (!entry?.filename) {
      automatedFailures.push(`Splash.imageset slot is missing: universal ${scale}`);
      continue;
    }

    const path = `apps/starlit-apprentice/ios/App/App/Assets.xcassets/Splash.imageset/${entry.filename}`;
    const info = imageInfo(path);
    if (!info) {
      automatedFailures.push(`Splash image file is missing or unreadable: ${path}`);
      continue;
    }
    if (info.width !== 2732 || info.height !== 2732) {
      automatedFailures.push(`Splash image ${entry.filename} must be 2732 x 2732, got ${info.width} x ${info.height}.`);
    }
    if (info.kind === "png" && [4, 6].includes(info.colorType)) {
      automatedFailures.push(`Splash image ${entry.filename} must not include alpha.`);
    }
  }
}

function checkPrivacyAndExportEvidence() {
  if (!privacyManifest) {
    automatedFailures.push("PrivacyInfo.xcprivacy is required for App Store privacy evidence.");
  }
  for (const expected of [
    "NSPrivacyTracking",
    "<false/>",
    "NSPrivacyCollectedDataTypes",
    "NSPrivacyTrackingDomains",
    "NSPrivacyAccessedAPITypes"
  ]) {
    if (!privacyManifest.includes(expected)) {
      automatedFailures.push(`PrivacyInfo.xcprivacy must include ${expected}.`);
    }
  }

  if (!plistHasBooleanKey(infoPlist, "ITSAppUsesNonExemptEncryption", false)) {
    automatedFailures.push("Info.plist must include ITSAppUsesNonExemptEncryption=false for the current standard/no custom crypto boundary.");
  }
  if (!plistHasBooleanKey(infoPlist, "UIRequiresFullScreen", true)) {
    automatedFailures.push("Info.plist must include UIRequiresFullScreen=true for the current portrait-only iPad target.");
  }

  const privacyLabels = appStoreConfig.reviewDeclarations?.privacyNutritionLabels;
  requireEqual("App Store privacy label status", privacyLabels?.status, "repo-evidence-prepared");
  requireEqual("App Store privacy label", privacyLabels?.appPrivacyLabel, "Data Not Collected");
  requireEqual("App Store tracking", privacyLabels?.tracking, "no");

  const exportCompliance = appStoreConfig.reviewDeclarations?.exportCompliance;
  if (!exportCompliance || typeof exportCompliance !== "object" || Array.isArray(exportCompliance)) {
    automatedFailures.push("App Store exportCompliance must be a repo-evidence object.");
    return;
  }
  requireEqual("App Store exportCompliance.status", exportCompliance.status, "repo-evidence-prepared");
  requireEqual("App Store exportCompliance.usesNonExemptEncryption", exportCompliance.usesNonExemptEncryption, false);
  requireEqual("App Store exportCompliance.infoPlistKey", exportCompliance.infoPlistKey, "ITSAppUsesNonExemptEncryption=false");
}

function checkLocalReleaseBuildArtifact() {
  if (!existsSync(releaseAppPath)) {
    const message = "iOS unsigned Release .app has not been built yet. Run pnpm build:ios:release before App Store package handoff.";
    if (requireLocalArtifact) {
      automatedFailures.push(message);
    } else {
      addManual(message);
    }
    return;
  }

  const requiredBundleFiles = [
    "Info.plist",
    "PrivacyInfo.xcprivacy",
    "Assets.car",
    "Base.lproj/LaunchScreen.storyboardc/Info.plist",
    "capacitor.config.json",
    "public/index.html"
  ];
  for (const file of requiredBundleFiles) {
    if (!existsSync(resolve(releaseAppPath, file))) {
      automatedFailures.push(`iOS Release .app is missing ${file}. Run pnpm build:ios:release after the latest sync.`);
    }
  }

  checkReleaseCapacitorConfig();
  checkReleaseSplashAssetCatalog();
  checkReleasePublicAssetParity();
  checkReleaseCodeSignature();
}

function checkReleaseSplashAssetCatalog() {
  const assetsCarPath = resolve(releaseAppPath, "Assets.car");
  if (!existsSync(assetsCarPath)) {
    return;
  }

  try {
    const output = execFileSync("assetutil", ["--info", assetsCarPath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024
    });
    const assets = JSON.parse(output);
    const splashAssets = assets.filter((asset) => asset.Name === "Splash");
    if (splashAssets.length < 3) {
      automatedFailures.push(`iOS Release .app Assets.car must include 3 Splash renditions, got ${splashAssets.length}.`);
      return;
    }
    for (const scale of [1, 2, 3]) {
      const asset = splashAssets.find((item) => item.Scale === scale);
      if (!asset) {
        automatedFailures.push(`iOS Release .app Assets.car is missing Splash scale ${scale}.`);
        continue;
      }
      if (asset.PixelWidth !== 2732 || asset.PixelHeight !== 2732) {
        automatedFailures.push(`iOS Release .app Splash scale ${scale} must be 2732 x 2732, got ${asset.PixelWidth} x ${asset.PixelHeight}.`);
      }
      if (asset.Opaque !== true) {
        automatedFailures.push(`iOS Release .app Splash scale ${scale} must be opaque.`);
      }
    }
  } catch (error) {
    automatedFailures.push(`Could not inspect iOS Release .app Assets.car: ${error.stderr?.toString?.().trim() || error.message}`);
  }
}

function checkReleaseCapacitorConfig() {
  const configPath = resolve(releaseAppPath, "capacitor.config.json");
  if (!existsSync(configPath)) {
    return;
  }

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, "utf8"));
  } catch (error) {
    automatedFailures.push(`iOS Release .app capacitor.config.json is not valid JSON: ${error.message}`);
    return;
  }

  if (config.appId !== "com.seorilabs.starlitapprentice") {
    automatedFailures.push("iOS Release .app capacitor appId must be com.seorilabs.starlitapprentice.");
  }
  if (config.appName !== "Star Apprentice") {
    automatedFailures.push("iOS Release .app capacitor appName must be Star Apprentice.");
  }
  if (config.webDir !== "dist") {
    automatedFailures.push("iOS Release .app capacitor webDir must be dist.");
  }
  if (config.server?.url) {
    automatedFailures.push("iOS Release .app capacitor config must not include server.url for App Store builds.");
  }
}

function checkReleasePublicAssetParity() {
  if (!existsSync(distRoot)) {
    automatedFailures.push("iOS Release .app content parity needs apps/starlit-apprentice/dist. Run pnpm --filter @starlit-apprentice/app build.");
    return;
  }

  const publicRoot = resolve(releaseAppPath, "public");
  if (!existsSync(publicRoot)) {
    automatedFailures.push("iOS Release .app public bundle is missing.");
    return;
  }

  const distFiles = listRelativeFiles(distRoot);
  const releaseFiles = listRelativeFiles(publicRoot);
  const distFileSet = new Set(distFiles);
  const releaseFileSet = new Set(releaseFiles);

  for (const distFile of distFiles) {
    if (!releaseFileSet.has(distFile)) {
      automatedFailures.push(`iOS Release .app is missing current dist file: ${distFile}. Run pnpm build:ios:release after the latest web build.`);
      continue;
    }

    const distHash = hashFile(resolve(distRoot, distFile));
    const releaseHash = hashFile(resolve(publicRoot, distFile));
    if (distHash !== releaseHash) {
      automatedFailures.push(`iOS Release .app contains stale web asset: ${distFile}. Run pnpm build:ios:release after the latest web build.`);
    }
  }

  for (const releaseFile of releaseFiles) {
    if (!distFileSet.has(releaseFile) && !allowedReleasePublicExtras.has(releaseFile)) {
      automatedFailures.push(`iOS Release .app contains unexpected public web asset: ${releaseFile}`);
    }
    if (releaseFile.endsWith(".map")) {
      automatedFailures.push(`iOS Release .app must not include sourcemaps: ${releaseFile}`);
    }
    for (const forbidden of forbiddenReleasePublicAssets) {
      if (releaseFile === forbidden || releaseFile.startsWith(forbidden)) {
        automatedFailures.push(`iOS Release .app must not include registration-only asset: ${releaseFile}`);
      }
    }
  }

  checkReleaseHtmlCsp(resolve(publicRoot, "index.html"));
}

function checkReleaseHtmlCsp(indexPath) {
  if (!existsSync(indexPath)) {
    return;
  }

  const html = readFileSync(indexPath, "utf8");
  const policies = [...html.matchAll(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi)].map((match) => match[0]);
  if (policies.length !== 1) {
    automatedFailures.push(`iOS Release .app index.html must include exactly one Content-Security-Policy meta tag, got ${policies.length}.`);
    return;
  }

  const content = extractMetaContent(policies[0]);
  if (content !== expectedCsp) {
    automatedFailures.push("iOS Release .app index.html CSP must match the release policy.");
  }
}

function checkManualConsoleGates() {
  if (unresolved(appStoreConfig.sku)) {
    addManual("App Store SKU is still unresolved.");
  }
  if (unresolved(appStoreConfig.contact)) {
    addManual("App Store review contact is still unresolved.");
  }
  if (unresolved(appStoreConfig.privacyPolicyUrl)) {
    addManual("App Store privacy policy URL is still unresolved.");
  }
  if (unresolved(appStoreConfig.supportUrl)) {
    addManual("App Store support URL is still unresolved.");
  }
  if (unresolved(appStoreConfig.reviewDeclarations?.ageRating)) {
    addManual("App Store age rating is still unresolved.");
  }
  if (appStoreConfig.reviewDeclarations?.privacyNutritionLabels?.consoleStatus === "pending-app-store-connect-submission") {
    addManual("App Store privacy label evidence is prepared in repo but still needs App Store Connect submission.");
  } else if (unresolved(appStoreConfig.reviewDeclarations?.privacyNutritionLabels?.consoleStatus)) {
    addManual("App Store privacy label console submission evidence is still unresolved.");
  }
  if (appStoreConfig.reviewDeclarations?.exportCompliance?.consoleStatus === "pending-app-store-connect-confirmation") {
    addManual("App Store export compliance evidence is prepared in repo but still needs App Store Connect confirmation.");
  } else if (unresolved(appStoreConfig.reviewDeclarations?.exportCompliance?.consoleStatus)) {
    addManual("App Store export compliance console evidence is still unresolved.");
  }

  const requiredConsoleItems = [
    ["app-store-signed-build-upload", "App Store signed build upload console evidence must be passed."],
    ["app-store-age-rating", "App Store age rating console evidence must be passed."],
    ["app-store-privacy-export", "App Store privacy/export compliance console evidence must be passed."],
    ["app-store-review-metadata", "App Store review metadata/submission console evidence must be passed."]
  ];
  const consoleItems = Array.isArray(releaseConsoleEvidence?.items) ? releaseConsoleEvidence.items : [];
  for (const [itemId, message] of requiredConsoleItems) {
    const item = consoleItems.find((entry) => entry?.id === itemId && entry?.target === "App Store");
    if (item?.status !== "passed") {
      addManual(message);
    }
  }

  if (hasOpenAppStoreConsoleGate()) {
    addManual("Xcode archive/upload still requires Apple Distribution signing, Team ID, App Store provisioning, App Store Connect app record, uploaded build processing, build selection, and final review submission.");
  }
}

function checkReleaseCodeSignature() {
  if (!existsSync(releaseAppPath)) {
    return;
  }
  const signaturePath = resolve(releaseAppPath, "_CodeSignature/CodeResources");
  if (!existsSync(signaturePath)) {
    addManual("iOS Release .app exists but does not include code signature metadata. Use an Apple Distribution signed archive/upload before App Store submission.");
  }
}

function hasOpenAppStoreConsoleGate() {
  if (
    unresolved(appStoreConfig.sku) ||
    unresolved(appStoreConfig.contact) ||
    unresolved(appStoreConfig.privacyPolicyUrl) ||
    unresolved(appStoreConfig.supportUrl) ||
    unresolved(appStoreConfig.reviewDeclarations?.ageRating) ||
    appStoreConfig.reviewDeclarations?.privacyNutritionLabels?.consoleStatus === "pending-app-store-connect-submission" ||
    unresolved(appStoreConfig.reviewDeclarations?.privacyNutritionLabels?.consoleStatus) ||
    appStoreConfig.reviewDeclarations?.exportCompliance?.consoleStatus === "pending-app-store-connect-confirmation" ||
    unresolved(appStoreConfig.reviewDeclarations?.exportCompliance?.consoleStatus)
  ) {
    return true;
  }
  const consoleItems = Array.isArray(releaseConsoleEvidence?.items) ? releaseConsoleEvidence.items : [];
  return [
    "app-store-signed-build-upload",
    "app-store-age-rating",
    "app-store-privacy-export",
    "app-store-review-metadata"
  ].some((itemId) => {
    const item = consoleItems.find((entry) => entry?.id === itemId && entry?.target === "App Store");
    return item?.status !== "passed";
  });
}

function addManual(message) {
  if (allowManualBlockers) {
    manualBlockers.push(message);
  } else {
    automatedFailures.push(message);
  }
}

function imageInfo(path) {
  if (!exists(path)) {
    return null;
  }
  const data = readBuffer(path);
  if (data.length >= 26 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      kind: "png",
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      colorType: data[25]
    };
  }
  return null;
}

function listRelativeFiles(root) {
  return listFiles(root)
    .map((file) => relative(root, file).split("\\").join("/"))
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

function extractMetaContent(metaTag) {
  const match = metaTag.match(/\scontent=(["'])(.*?)\1/i);
  return match?.[2] ?? "";
}

function unresolved(value) {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || ["확정 필요", "TODO", "TBD"].some((marker) => trimmed.includes(marker));
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.some((item) => unresolved(item));
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0 || Object.values(value).some((item) => unresolved(item));
  }
  return false;
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    automatedFailures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function plistHasBooleanKey(text, key, expected) {
  const pattern = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<${expected ? "true" : "false"}/>`); 
  return pattern.test(text);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readBuffer(path) {
  return readFileSync(resolve(repoRoot, path));
}

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}

function printReport() {
  const report = {
    automatedFailures,
    manualBlockers,
    warnings
  };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("App Store release check");
  console.log("=======================");
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated App Store checks: PASS" : "Automated App Store checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Manual App Store gates: CLEAR" : `Manual App Store gates: ${manualBlockers.length} blocker(s)`);
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
