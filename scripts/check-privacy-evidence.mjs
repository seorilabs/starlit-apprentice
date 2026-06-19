import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const failures = [];
const warnings = [];

const appPackage = readJson("apps/starlit-apprentice/package.json");
const playConfig = readJson("play-store/google-play.config.json");
const appStoreConfig = readJson("app-store/app-store.config.json");

checkDependencies();
checkSourceApis();
checkNativePrivacySurface();
checkStoreDeclarations();
checkEvidenceDoc();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkDependencies() {
  const deps = {
    ...(appPackage.dependencies ?? {}),
    ...(appPackage.devDependencies ?? {})
  };
  const disallowedDependency = /firebase|admob|ads?|analytics|crashlytics|sentry|segment|amplitude|mixpanel|revenuecat|purchase|billing|iap|tracking|appsflyer|adjust|facebook|meta/i;

  for (const packageName of Object.keys(deps)) {
    if (disallowedDependency.test(packageName)) {
      failures.push(`Privacy-sensitive production SDK dependency is not allowed in the MVP boundary: ${packageName}`);
    }
  }
}

function checkSourceApis() {
  const scannedFiles = [
    ...listSourceFiles("apps/starlit-apprentice/src"),
    ...listSourceFiles("packages/product-core/src")
  ];
  const blockedApis = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bsendBeacon\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /\bRTCPeerConnection\b/,
    /\bgetUserMedia\b/,
    /\bgeolocation\b/,
    /\bNotification\b/,
    /\bpermissions\b/
  ];

  for (const file of scannedFiles) {
    const text = read(file);
    for (const pattern of blockedApis) {
      if (pattern.test(text)) {
        failures.push(`Privacy/network API is not allowed in MVP app source: ${relative(repoRoot, file)} matches ${pattern}`);
      }
    }
  }
}

function checkNativePrivacySurface() {
  const capacitorConfig = read("apps/starlit-apprentice/capacitor.config.ts");
  if (/server\s*:\s*\{[\s\S]*url\s*:/m.test(capacitorConfig)) {
    failures.push("Capacitor config must not configure server.url for the local-only store build.");
  }
  if (!capacitorConfig.includes('webDir: "dist"')) {
    failures.push('Capacitor config must use webDir: "dist".');
  }

  const androidManifest = read("apps/starlit-apprentice/android/app/src/main/AndroidManifest.xml");
  const permissions = [...androidManifest.matchAll(/<uses-permission\b[^>]*android:name="([^"]+)"/g)].map((match) => match[1]);
  const allowedPermissions = new Set(["android.permission.INTERNET"]);
  for (const permission of permissions) {
    if (!allowedPermissions.has(permission)) {
      failures.push(`Unexpected Android permission for local-only MVP: ${permission}`);
    }
  }
  if (permissions.includes("android.permission.INTERNET")) {
    warnings.push("Android INTERNET permission is present from the Capacitor WebView shell; this is allowed only because server.url and app network APIs are absent.");
  }

  const iosInfo = read("apps/starlit-apprentice/ios/App/App/Info.plist");
  for (const key of [
    "NSCameraUsageDescription",
    "NSLocationWhenInUseUsageDescription",
    "NSLocationAlwaysAndWhenInUseUsageDescription",
    "NSMicrophoneUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSContactsUsageDescription",
    "NSSpeechRecognitionUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSUserTrackingUsageDescription"
  ]) {
    if (iosInfo.includes(key)) {
      failures.push(`Unexpected iOS privacy usage description for local-only MVP: ${key}`);
    }
  }
}

function checkStoreDeclarations() {
  const dataSafety = playConfig.contentDeclarations?.dataSafety;
  requireObject("Google Play dataSafety", dataSafety);
  requireEqual("Google Play dataSafety.status", dataSafety?.status, "repo-evidence-prepared");
  requireEqual("Google Play dataSafety.dataCollected", dataSafety?.dataCollected, "none");
  requireEqual("Google Play dataSafety.dataShared", dataSafety?.dataShared, "none");
  requireEqual("Google Play dataSafety.privacyPolicyRequired", dataSafety?.privacyPolicyRequired, true);
  requireEqual("Google Play dataSafety.evidence", dataSafety?.evidence, "docs/privacy-and-data-safety.md");
  requireEvidencePath("Google Play dataSafety.evidence", dataSafety?.evidence);

  const privacyLabels = appStoreConfig.reviewDeclarations?.privacyNutritionLabels;
  requireObject("App Store privacyNutritionLabels", privacyLabels);
  requireEqual("App Store privacyNutritionLabels.status", privacyLabels?.status, "repo-evidence-prepared");
  requireEqual("App Store privacyNutritionLabels.appPrivacyLabel", privacyLabels?.appPrivacyLabel, "Data Not Collected");
  requireEqual("App Store privacyNutritionLabels.dataCollected", privacyLabels?.dataCollected, "none");
  requireEqual("App Store privacyNutritionLabels.tracking", privacyLabels?.tracking, "no");
  requireEqual("App Store privacyNutritionLabels.thirdPartyPartnerCollection", privacyLabels?.thirdPartyPartnerCollection, "none");
  requireEqual("App Store privacyNutritionLabels.evidence", privacyLabels?.evidence, "docs/privacy-and-data-safety.md");
  requireEvidencePath("App Store privacyNutritionLabels.evidence", privacyLabels?.evidence);
  requireEqual("App Store advertisingIdentifier", appStoreConfig.reviewDeclarations?.advertisingIdentifier, "no");
}

function checkEvidenceDoc() {
  const path = "docs/privacy-and-data-safety.md";
  if (!exists(path)) {
    failures.push(`Missing privacy evidence document: ${path}`);
    return;
  }

  const doc = read(path);
  for (const expected of [
    "No user data collected or shared",
    "local progress and ending collection",
    "Google Play Data Safety Candidate",
    "privacy policy URL remains a manual console gate",
    "App Store App Privacy Candidate",
    "Data Not Collected",
    "pnpm check:privacy",
    "https://support.google.com/googleplay/android-developer/answer/10787469?hl=en",
    "https://developer.apple.com/app-store/app-privacy-details/"
  ]) {
    if (!doc.includes(expected)) {
      failures.push(`docs/privacy-and-data-safety.md must include: ${expected}`);
    }
  }
}

function listSourceFiles(root) {
  const absoluteRoot = resolve(repoRoot, root);
  if (!existsSync(absoluteRoot)) {
    failures.push(`Missing source directory: ${root}`);
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
        continue;
      }
      if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(path))) {
        files.push(path);
      }
    }
  }
  return files;
}

function requireObject(label, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(`${label} must be an object.`);
  }
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function requireEvidencePath(label, path) {
  if (typeof path !== "string" || path.trim() === "") {
    failures.push(`${label} must be a path.`);
    return;
  }
  if (!exists(path)) {
    failures.push(`${label} file is missing: ${path}`);
  }
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

function printReport() {
  console.log("Privacy/data safety evidence check");
  console.log("==================================");
  console.log("");
  printSection("Failures", failures);
  printSection("Warnings", warnings);
  console.log(failures.length === 0 ? "Privacy/data safety evidence: PASS" : "Privacy/data safety evidence: FAIL");
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
