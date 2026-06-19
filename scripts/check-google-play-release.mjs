import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const requireLocalArtifact = process.argv.includes("--require-local-artifact");
const jsonOutput = process.argv.includes("--json");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];

const requiredTargetSdk = 35;
const playConfigPath = process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json";
const releaseConsoleEvidencePath = process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json";
const aabPath = process.env.ANDROID_AAB_PATH ?? "apps/starlit-apprentice/android/app/build/outputs/bundle/release/app-release.aab";

const playConfig = readJson(playConfigPath);
const releaseConsoleEvidence = exists(releaseConsoleEvidencePath) ? readJson(releaseConsoleEvidencePath) : null;
const appBuildGradle = read("apps/starlit-apprentice/android/app/build.gradle");
const variablesGradle = read("apps/starlit-apprentice/android/variables.gradle");
const rootGitignore = read(".gitignore");
const androidGitignore = read("apps/starlit-apprentice/android/.gitignore");
const distRoot = resolve(repoRoot, "apps/starlit-apprentice/dist");
const androidResRoot = resolve(repoRoot, "apps/starlit-apprentice/android/app/src/main/res");
const bundlePublicPrefix = "base/assets/public/";
const allowedBundlePublicExtras = new Set(["cordova.js", "cordova_plugins.js"]);
const forbiddenBundlePublicAssets = [
  "starlit-apprentice-icon-600.png",
  "starlit-apprentice-thumbnail-1932x828.png",
  "screenshots/"
];
const androidIconTargets = [
  { dir: "mipmap-mdpi", artifactDir: "mipmap-mdpi-v4", name: "ic_launcher.png", size: 48 },
  { dir: "mipmap-mdpi", artifactDir: "mipmap-mdpi-v4", name: "ic_launcher_round.png", size: 48 },
  { dir: "mipmap-mdpi", artifactDir: "mipmap-mdpi-v4", name: "ic_launcher_foreground.png", size: 108 },
  { dir: "mipmap-hdpi", artifactDir: "mipmap-hdpi-v4", name: "ic_launcher.png", size: 72 },
  { dir: "mipmap-hdpi", artifactDir: "mipmap-hdpi-v4", name: "ic_launcher_round.png", size: 72 },
  { dir: "mipmap-hdpi", artifactDir: "mipmap-hdpi-v4", name: "ic_launcher_foreground.png", size: 162 },
  { dir: "mipmap-xhdpi", artifactDir: "mipmap-xhdpi-v4", name: "ic_launcher.png", size: 96 },
  { dir: "mipmap-xhdpi", artifactDir: "mipmap-xhdpi-v4", name: "ic_launcher_round.png", size: 96 },
  { dir: "mipmap-xhdpi", artifactDir: "mipmap-xhdpi-v4", name: "ic_launcher_foreground.png", size: 216 },
  { dir: "mipmap-xxhdpi", artifactDir: "mipmap-xxhdpi-v4", name: "ic_launcher.png", size: 144 },
  { dir: "mipmap-xxhdpi", artifactDir: "mipmap-xxhdpi-v4", name: "ic_launcher_round.png", size: 144 },
  { dir: "mipmap-xxhdpi", artifactDir: "mipmap-xxhdpi-v4", name: "ic_launcher_foreground.png", size: 324 },
  { dir: "mipmap-xxxhdpi", artifactDir: "mipmap-xxxhdpi-v4", name: "ic_launcher.png", size: 192 },
  { dir: "mipmap-xxxhdpi", artifactDir: "mipmap-xxxhdpi-v4", name: "ic_launcher_round.png", size: 192 },
  { dir: "mipmap-xxxhdpi", artifactDir: "mipmap-xxxhdpi-v4", name: "ic_launcher_foreground.png", size: 432 }
];
const androidSplashTargets = [
  { dir: "drawable", artifactDir: "drawable", width: 480, height: 320 },
  { dir: "drawable-port-mdpi", artifactDir: "drawable-port-mdpi-v4", width: 320, height: 480 },
  { dir: "drawable-port-hdpi", artifactDir: "drawable-port-hdpi-v4", width: 480, height: 800 },
  { dir: "drawable-port-xhdpi", artifactDir: "drawable-port-xhdpi-v4", width: 720, height: 1280 },
  { dir: "drawable-port-xxhdpi", artifactDir: "drawable-port-xxhdpi-v4", width: 960, height: 1600 },
  { dir: "drawable-port-xxxhdpi", artifactDir: "drawable-port-xxxhdpi-v4", width: 1280, height: 1920 },
  { dir: "drawable-land-mdpi", artifactDir: "drawable-land-mdpi-v4", width: 480, height: 320 },
  { dir: "drawable-land-hdpi", artifactDir: "drawable-land-hdpi-v4", width: 800, height: 480 },
  { dir: "drawable-land-xhdpi", artifactDir: "drawable-land-xhdpi-v4", width: 1280, height: 720 },
  { dir: "drawable-land-xxhdpi", artifactDir: "drawable-land-xxhdpi-v4", width: 1600, height: 960 },
  { dir: "drawable-land-xxxhdpi", artifactDir: "drawable-land-xxxhdpi-v4", width: 1920, height: 1280 }
];

checkIdentity();
checkGradleReleaseConfig();
checkSigningSecretHygiene();
checkBundleArtifact();
checkManualConsoleGates();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exitCode = 1;
}

function checkIdentity() {
  requireEqual("Google Play packageName", playConfig.packageName, "com.seorilabs.starlitapprentice");
  requireEqual("Google Play appType", playConfig.appType, "game");
  requireEqual("Google Play freeOrPaid", playConfig.freeOrPaid, "free");

  if (!appBuildGradle.includes('namespace "com.seorilabs.starlitapprentice"')) {
    automatedFailures.push("Android namespace must be com.seorilabs.starlitapprentice.");
  }
  if (!appBuildGradle.includes('applicationId "com.seorilabs.starlitapprentice"')) {
    automatedFailures.push("Android applicationId must be com.seorilabs.starlitapprentice.");
  }

  const versionCode = readNumberFromGradle(appBuildGradle, "versionCode");
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
    automatedFailures.push(`Android versionCode must be 1..2100000000 for Play upload, got ${versionCode}.`);
  }
  const versionName = readStringFromGradle(appBuildGradle, "versionName");
  if (!versionName) {
    automatedFailures.push("Android versionName is required.");
  }
}

function checkGradleReleaseConfig() {
  const compileSdk = readExtNumber("compileSdkVersion");
  const targetSdk = readExtNumber("targetSdkVersion");
  if (compileSdk < requiredTargetSdk) {
    automatedFailures.push(`compileSdkVersion must be >= ${requiredTargetSdk}, got ${compileSdk}.`);
  }
  if (targetSdk < requiredTargetSdk) {
    automatedFailures.push(`targetSdkVersion must be >= ${requiredTargetSdk}, got ${targetSdk}.`);
  }

  for (const expected of [
    "keystore.properties",
    "STARLIT_UPLOAD_STORE_FILE",
    "STARLIT_UPLOAD_STORE_PASSWORD",
    "STARLIT_UPLOAD_KEY_ALIAS",
    "STARLIT_UPLOAD_KEY_PASSWORD",
    "signingConfigs",
    "signingConfig signingConfigs.release"
  ]) {
    if (!appBuildGradle.includes(expected)) {
      automatedFailures.push(`Android release signing wiring is missing ${expected}.`);
    }
  }
}

function checkSigningSecretHygiene() {
  for (const expected of [
    "apps/starlit-apprentice/android/keystore.properties",
    "*.jks",
    "*.keystore",
    "play-store/*service-account*.json"
  ]) {
    if (!rootGitignore.includes(expected)) {
      automatedFailures.push(`.gitignore must ignore ${expected}.`);
    }
  }
  for (const expected of ["*.jks", "*.keystore", "keystore.properties"]) {
    if (!androidGitignore.includes(expected)) {
      automatedFailures.push(`apps/starlit-apprentice/android/.gitignore must ignore ${expected}.`);
    }
  }
}

function checkBundleArtifact() {
  if (!exists(aabPath)) {
    const message = `Android App Bundle has not been built yet. Run pnpm build:android:aab and verify ${aabPath}.`;
    if (requireLocalArtifact) {
      automatedFailures.push(message);
    } else {
      addManual(message);
    }
    return;
  }

  const info = statSync(resolve(repoRoot, aabPath));
  if (info.size <= 0) {
    automatedFailures.push(`Android App Bundle is empty: ${aabPath}`);
  }

  const entries = listZipEntries(aabPath);
  for (const expected of [
    "BundleConfig.pb",
    "base/assets/public/index.html",
    "base/manifest/AndroidManifest.xml"
  ]) {
    if (!entries.includes(expected)) {
      automatedFailures.push(`Android App Bundle is missing ${expected}.`);
    }
  }
  if (!entries.some((entry) => /^base\/assets\/public\/assets\/.*\.js$/.test(entry))) {
    automatedFailures.push("Android App Bundle is missing a bundled Vite JavaScript asset.");
  }
  if (!entries.some((entry) => /^base\/assets\/public\/assets\/.*\.css$/.test(entry))) {
    automatedFailures.push("Android App Bundle is missing a bundled Vite CSS asset.");
  }
  checkBundleLauncherIconParity(entries);
  checkBundleSplashParity(entries);
  checkBundleWebAssetParity(entries);

  const signature = getBundleSignatureStatus(entries);
  if (!signature.signed) {
    addManual(`Android App Bundle exists but is not signed with an upload key: ${aabPath}. Configure keystore.properties or STARLIT_UPLOAD_* env vars before Play upload.`);
  }
}

function checkBundleLauncherIconParity(entries) {
  for (const staleDefaultEntry of [
    "base/res/drawable/ic_launcher_background.xml",
    "base/res/drawable-anydpi-v24/ic_launcher_foreground.xml"
  ]) {
    if (entries.includes(staleDefaultEntry)) {
      automatedFailures.push(`Android App Bundle contains stale default Capacitor launcher resource: ${staleDefaultEntry}. Run pnpm build:android:aab.`);
    }
  }

  for (const target of androidIconTargets) {
    const entry = `base/res/${target.artifactDir}/${target.name}`;
    const source = resolve(androidResRoot, target.dir, target.name);

    if (!entries.includes(entry)) {
      automatedFailures.push(`Android App Bundle is missing launcher icon resource: ${entry}.`);
      continue;
    }
    if (!existsSync(source)) {
      automatedFailures.push(`Android source launcher icon is missing: ${relative(repoRoot, source)}.`);
      continue;
    }

    const sourceHash = checkedPngRgbHash(
      readFileSync(source),
      target.size,
      target.size,
      `Android source launcher icon is invalid: ${relative(repoRoot, source)}. Run pnpm assets:sync:android-icons.`
    );
    const bundleHash = checkedPngRgbHash(
      readZipEntry(aabPath, entry),
      target.size,
      target.size,
      `Android App Bundle launcher icon cannot be inspected: ${entry}. Run pnpm build:android:aab.`
    );
    if (!sourceHash || !bundleHash) {
      continue;
    }
    if (sourceHash !== bundleHash) {
      automatedFailures.push(`Android App Bundle contains stale launcher icon: ${entry}. Run pnpm build:android:aab.`);
    }
  }
}

function checkBundleSplashParity(entries) {
  for (const target of androidSplashTargets) {
    const entry = `base/res/${target.artifactDir}/splash.png`;
    const source = resolve(androidResRoot, target.dir, "splash.png");

    if (!entries.includes(entry)) {
      automatedFailures.push(`Android App Bundle is missing splash resource: ${entry}.`);
      continue;
    }
    if (!existsSync(source)) {
      automatedFailures.push(`Android source splash image is missing: ${relative(repoRoot, source)}.`);
      continue;
    }

    const sourceHash = checkedPngRgbHash(
      readFileSync(source),
      target.width,
      target.height,
      `Android source splash image is invalid: ${relative(repoRoot, source)}. Run pnpm assets:sync:native-splash.`
    );
    const bundleHash = checkedPngRgbHash(
      readZipEntry(aabPath, entry),
      target.width,
      target.height,
      `Android App Bundle splash image cannot be inspected: ${entry}. Run pnpm build:android:aab.`
    );
    if (!sourceHash || !bundleHash) {
      continue;
    }
    if (sourceHash !== bundleHash) {
      automatedFailures.push(`Android App Bundle contains stale splash image: ${entry}. Run pnpm build:android:aab.`);
    }
  }
}

function checkBundleWebAssetParity(entries) {
  if (!existsSync(distRoot)) {
    automatedFailures.push("Android App Bundle content parity needs apps/starlit-apprentice/dist. Run pnpm --filter @starlit-apprentice/app build.");
    return;
  }

  const distFiles = listRelativeFiles(distRoot);
  const distFileSet = new Set(distFiles);
  const bundlePublicFiles = entries
    .filter((entry) => entry.startsWith(bundlePublicPrefix) && !entry.endsWith("/"))
    .map((entry) => entry.slice(bundlePublicPrefix.length))
    .sort();
  const bundlePublicFileSet = new Set(bundlePublicFiles);

  for (const distFile of distFiles) {
    if (!bundlePublicFileSet.has(distFile)) {
      automatedFailures.push(`Android App Bundle is missing current dist file: ${distFile}. Run pnpm build:android:aab after the latest web build.`);
      continue;
    }

    const distHash = hashBuffer(readFileSync(resolve(distRoot, distFile)));
    const bundleHash = hashBuffer(readZipEntry(aabPath, `${bundlePublicPrefix}${distFile}`));
    if (distHash !== bundleHash) {
      automatedFailures.push(`Android App Bundle contains stale web asset: ${distFile}. Run pnpm build:android:aab after the latest web build.`);
    }
  }

  for (const bundleFile of bundlePublicFiles) {
    if (!distFileSet.has(bundleFile) && !allowedBundlePublicExtras.has(bundleFile)) {
      automatedFailures.push(`Android App Bundle contains unexpected public web asset: ${bundleFile}`);
    }
    if (bundleFile.endsWith(".map")) {
      automatedFailures.push(`Android App Bundle must not include sourcemaps: ${bundleFile}`);
    }
    for (const forbidden of forbiddenBundlePublicAssets) {
      if (bundleFile === forbidden || bundleFile.startsWith(forbidden)) {
        automatedFailures.push(`Android App Bundle must not include registration-only asset: ${bundleFile}`);
      }
    }
  }
}

function checkManualConsoleGates() {
  if (unresolved(playConfig.contactEmail)) {
    addManual("Google Play contact email is still unresolved.");
  }
  if (unresolved(playConfig.privacyPolicyUrl)) {
    addManual("Google Play privacy policy URL is still unresolved.");
  }
  if (unresolved(playConfig.contentDeclarations?.contentRating)) {
    addManual("Google Play content rating is still unresolved.");
  }
  if (unresolved(playConfig.contentDeclarations?.koreaGameRating)) {
    addManual("Google Play Korea game rating evidence is still unresolved.");
  }
  if (unresolved(playConfig.manualEvidence?.androidAppBundle)) {
    addManual("Google Play signed AAB upload evidence is still unresolved.");
  }
  if (unresolved(playConfig.manualEvidence?.playConsoleListing)) {
    addManual("Google Play Console listing/preview evidence is still unresolved.");
  }
  if (unresolved(playConfig.manualEvidence?.policyQuestionnaire)) {
    addManual("Google Play policy questionnaire evidence is still unresolved.");
  }

  const dataSafetyStatus = playConfig.contentDeclarations?.dataSafety?.consoleStatus;
  if (dataSafetyStatus === "pending-play-console-submission") {
    addManual("Google Play Data safety evidence is prepared in repo but still needs Play Console submission.");
  } else if (unresolved(dataSafetyStatus)) {
    addManual("Google Play Data safety console submission evidence is still unresolved.");
  }

  const requiredConsoleItems = [
    ["google-play-signed-aab-upload", "Google Play signed AAB upload console evidence must be passed."],
    ["google-play-content-rating", "Google Play content rating console evidence must be passed."],
    ["google-play-korea-game-rating", "Google Play Korea game rating console evidence must be passed."],
    ["google-play-data-safety", "Google Play Data safety console evidence must be passed."],
    ["google-play-track-preview", "Google Play track/preview console evidence must be passed."]
  ];
  const consoleItems = Array.isArray(releaseConsoleEvidence?.items) ? releaseConsoleEvidence.items : [];
  for (const [itemId, message] of requiredConsoleItems) {
    const item = consoleItems.find((entry) => entry?.id === itemId && entry?.target === "Google Play");
    if (item?.status !== "passed") {
      addManual(message);
    }
  }

  if (hasOpenGooglePlayConsoleGate()) {
    addManual("Google Play Console app creation, Play App Signing enrollment/upload-key choice, AAB upload, track choice, and console preview remain account-bound manual gates.");
    addManual("If this is a new personal developer account, closed testing may require at least 12 opted-in testers for 14 continuous days before production access.");
  }
}

function hasOpenGooglePlayConsoleGate() {
  if (
    unresolved(playConfig.contactEmail) ||
    unresolved(playConfig.privacyPolicyUrl) ||
    unresolved(playConfig.contentDeclarations?.contentRating) ||
    unresolved(playConfig.contentDeclarations?.koreaGameRating) ||
    unresolved(playConfig.manualEvidence?.androidAppBundle) ||
    unresolved(playConfig.manualEvidence?.playConsoleListing) ||
    unresolved(playConfig.manualEvidence?.policyQuestionnaire)
  ) {
    return true;
  }
  if (playConfig.contentDeclarations?.dataSafety?.consoleStatus === "pending-play-console-submission" || unresolved(playConfig.contentDeclarations?.dataSafety?.consoleStatus)) {
    return true;
  }
  const consoleItems = Array.isArray(releaseConsoleEvidence?.items) ? releaseConsoleEvidence.items : [];
  return [
    "google-play-signed-aab-upload",
    "google-play-content-rating",
    "google-play-korea-game-rating",
    "google-play-data-safety",
    "google-play-track-preview"
  ].some((itemId) => {
    const item = consoleItems.find((entry) => entry?.id === itemId && entry?.target === "Google Play");
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

function listZipEntries(path) {
  try {
    return execFileSync("unzip", ["-Z1", resolve(repoRoot, path)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024
    }).trim().split("\n").filter(Boolean);
  } catch (error) {
    automatedFailures.push(`Could not inspect Android App Bundle entries: ${error.stderr?.toString?.().trim() || error.message}`);
    return [];
  }
}

function readZipEntry(path, entry) {
  try {
    return execFileSync("unzip", ["-p", resolve(repoRoot, path), entry], {
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 20 * 1024 * 1024
    });
  } catch (error) {
    automatedFailures.push(`Could not read Android App Bundle entry ${entry}: ${error.stderr?.toString?.().trim() || error.message}`);
    return Buffer.from([]);
  }
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

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function checkedPngRgbHash(buffer, expectedWidth, expectedHeight, message) {
  try {
    return pngRgbHash(buffer, expectedWidth, expectedHeight);
  } catch (error) {
    automatedFailures.push(`${message} (${formatError(error)})`);
    return "";
  }
}

function pngRgbHash(buffer, expectedWidth, expectedHeight = expectedWidth) {
  const { width, height, rgba } = readPngRgba(buffer);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`expected ${expectedWidth}x${expectedHeight} PNG, got ${width}x${height}`);
  }

  const rgb = Buffer.alloc(width * height * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4, targetIndex += 3) {
    rgb[targetIndex] = rgba[sourceIndex];
    rgb[targetIndex + 1] = rgba[sourceIndex + 1];
    rgb[targetIndex + 2] = rgba[sourceIndex + 2];
  }
  return hashBuffer(rgb);
}

function readPngRgba(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error("not a PNG");
  }

  let width;
  let height;
  let bitDepth;
  let colorType;
  const idatChunks = [];
  let offset = signature.length;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) {
      throw new Error("truncated PNG chunk");
    }

    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
      const interlace = buffer[start + 12];
      if (interlace !== 0) {
        throw new Error("interlaced PNG is not supported");
      }
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }

    offset = end + 4;
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG format: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  let readOffset = 0;
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const row = Buffer.from(inflated.subarray(readOffset, readOffset + rowBytes));
    readOffset += rowBytes;
    unfilterRow(row, previous, bytesPerPixel, filter);

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      rgba[target] = row[source];
      rgba[target + 1] = row[source + 1];
      rgba[target + 2] = row[source + 2];
      rgba[target + 3] = colorType === 6 ? row[source + 3] : 255;
    }
    previous = row;
  }

  return { width, height, rgba };
}

function unfilterRow(row, previous, bytesPerPixel, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    if (filter === 1) {
      row[index] = (row[index] + left) & 0xff;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[index] = (row[index] + paeth(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`unsupported PNG filter: ${filter}`);
    }
  }
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  return pb <= pc ? up : upLeft;
}

function getBundleSignatureStatus(entries) {
  const hasManifest = entries.includes("META-INF/MANIFEST.MF");
  const hasSignatureFile = entries.some((entry) => /^META-INF\/[^/]+\.SF$/i.test(entry));
  const hasSignatureBlock = entries.some((entry) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(entry));
  return {
    signed: hasManifest && hasSignatureFile && hasSignatureBlock,
    output: hasManifest && hasSignatureFile && hasSignatureBlock
      ? "AAB contains JAR signature metadata."
      : "AAB is missing JAR signature metadata."
  };
}

function readExtNumber(name) {
  const match = variablesGradle.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
  return match ? Number(match[1]) : NaN;
}

function readNumberFromGradle(text, name) {
  const match = text.match(new RegExp(`${name}\\s+(\\d+)`));
  return match ? Number(match[1]) : NaN;
}

function readStringFromGradle(text, name) {
  const match = text.match(new RegExp(`${name}\\s+"([^"]+)"`));
  return match?.[1] ?? "";
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

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    automatedFailures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
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
  const report = {
    automatedFailures,
    manualBlockers,
    warnings
  };
  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Google Play release check");
  console.log("=========================");
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated Google Play checks: PASS" : "Automated Google Play checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Manual Google Play gates: CLEAR" : `Manual Google Play gates: ${manualBlockers.length} blocker(s)`);
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
