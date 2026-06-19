import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const apkPath = "apps/starlit-apprentice/android/app/build/outputs/apk/debug/app-debug.apk";
const distRoot = resolve(repoRoot, "apps/starlit-apprentice/dist");
const androidResRoot = resolve(repoRoot, "apps/starlit-apprentice/android/app/src/main/res");
const apkPublicPrefix = "assets/public/";
const allowedApkPublicExtras = new Set(["cordova.js", "cordova_plugins.js"]);
const forbiddenApkPublicAssets = [
  "starlit-apprentice-icon-600.png",
  "starlit-apprentice-thumbnail-1932x828.png",
  "screenshots/"
];
const failures = [];
const warnings = [];
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

checkApkArtifact();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkApkArtifact() {
  if (!exists(apkPath)) {
    failures.push(`Android QA APK is missing. Run pnpm build:android:qa-apk and verify ${apkPath}.`);
    return;
  }

  const stat = statSync(resolve(repoRoot, apkPath));
  if (stat.size <= 0) {
    failures.push(`Android QA APK is empty: ${apkPath}`);
  }

  const entries = listZipEntries(apkPath);
  for (const expected of [
    "AndroidManifest.xml",
    "classes.dex",
    "assets/capacitor.config.json",
    "assets/public/index.html"
  ]) {
    if (!entries.includes(expected)) {
      failures.push(`Android QA APK is missing ${expected}.`);
    }
  }
  if (!entries.some((entry) => /^assets\/public\/assets\/.*\.js$/.test(entry))) {
    failures.push("Android QA APK is missing a bundled Vite JavaScript asset.");
  }
  if (!entries.some((entry) => /^assets\/public\/assets\/.*\.css$/.test(entry))) {
    failures.push("Android QA APK is missing a bundled Vite CSS asset.");
  }

  checkCapacitorConfig();
  checkApkLauncherIconParity(entries);
  checkApkSplashParity(entries);
  checkApkWebAssetParity(entries);
}

function checkCapacitorConfig() {
  const rawConfig = readZipEntry(apkPath, "assets/capacitor.config.json");
  if (rawConfig.length === 0) {
    return;
  }

  try {
    const config = JSON.parse(rawConfig.toString("utf8"));
    if (config.appId !== "com.seorilabs.starlitapprentice") {
      failures.push(`Android QA APK capacitor appId must be com.seorilabs.starlitapprentice, got ${JSON.stringify(config.appId)}.`);
    }
    if (config.server?.url) {
      failures.push("Android QA APK capacitor config must not contain server.url.");
    }
  } catch (error) {
    failures.push(`Android QA APK capacitor config is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkApkLauncherIconParity(entries) {
  for (const staleDefaultEntry of [
    "res/drawable/ic_launcher_background.xml",
    "res/drawable-anydpi-v24/ic_launcher_foreground.xml"
  ]) {
    if (entries.includes(staleDefaultEntry)) {
      failures.push(`Android QA APK contains stale default Capacitor launcher resource: ${staleDefaultEntry}. Run pnpm build:android:qa-apk.`);
    }
  }

  for (const target of androidIconTargets) {
    const entry = `res/${target.artifactDir}/${target.name}`;
    const source = resolve(androidResRoot, target.dir, target.name);

    if (!entries.includes(entry)) {
      failures.push(`Android QA APK is missing launcher icon resource: ${entry}`);
      continue;
    }
    if (!existsSync(source)) {
      failures.push(`Android source launcher icon is missing: ${relative(repoRoot, source)}`);
      continue;
    }

    const sourceHash = checkedPngRgbHash(
      readFileSync(source),
      target.size,
      target.size,
      `Android source launcher icon is invalid: ${relative(repoRoot, source)}. Run pnpm assets:sync:android-icons.`
    );
    const apkHash = checkedPngRgbHash(
      readZipEntry(apkPath, entry),
      target.size,
      target.size,
      `Android QA APK launcher icon cannot be inspected: ${entry}. Run pnpm build:android:qa-apk.`
    );
    if (!sourceHash || !apkHash) {
      continue;
    }
    if (sourceHash !== apkHash) {
      failures.push(`Android QA APK contains stale launcher icon: ${entry}. Run pnpm build:android:qa-apk.`);
    }
  }
}

function checkApkSplashParity(entries) {
  for (const target of androidSplashTargets) {
    const entry = `res/${target.artifactDir}/splash.png`;
    const source = resolve(androidResRoot, target.dir, "splash.png");

    if (!entries.includes(entry)) {
      failures.push(`Android QA APK is missing splash resource: ${entry}`);
      continue;
    }
    if (!existsSync(source)) {
      failures.push(`Android source splash image is missing: ${relative(repoRoot, source)}`);
      continue;
    }

    const sourceHash = checkedPngRgbHash(
      readFileSync(source),
      target.width,
      target.height,
      `Android source splash image is invalid: ${relative(repoRoot, source)}. Run pnpm assets:sync:native-splash.`
    );
    const apkHash = checkedPngRgbHash(
      readZipEntry(apkPath, entry),
      target.width,
      target.height,
      `Android QA APK splash image cannot be inspected: ${entry}. Run pnpm build:android:qa-apk.`
    );
    if (!sourceHash || !apkHash) {
      continue;
    }
    if (sourceHash !== apkHash) {
      failures.push(`Android QA APK contains stale splash image: ${entry}. Run pnpm build:android:qa-apk.`);
    }
  }
}

function checkApkWebAssetParity(entries) {
  if (!existsSync(distRoot)) {
    failures.push("Android QA APK content parity needs apps/starlit-apprentice/dist. Run pnpm --filter @starlit-apprentice/app build.");
    return;
  }

  const distFiles = listRelativeFiles(distRoot);
  const distFileSet = new Set(distFiles);
  const apkPublicFiles = entries
    .filter((entry) => entry.startsWith(apkPublicPrefix) && !entry.endsWith("/"))
    .map((entry) => entry.slice(apkPublicPrefix.length))
    .sort();
  const apkPublicFileSet = new Set(apkPublicFiles);

  for (const distFile of distFiles) {
    if (!apkPublicFileSet.has(distFile)) {
      failures.push(`Android QA APK is missing current dist file: ${distFile}. Run pnpm build:android:qa-apk after the latest web build.`);
      continue;
    }

    const distHash = hashBuffer(readFileSync(resolve(distRoot, distFile)));
    const apkHash = hashBuffer(readZipEntry(apkPath, `${apkPublicPrefix}${distFile}`));
    if (distHash !== apkHash) {
      failures.push(`Android QA APK contains stale web asset: ${distFile}. Run pnpm build:android:qa-apk after the latest web build.`);
    }
  }

  for (const apkFile of apkPublicFiles) {
    if (!distFileSet.has(apkFile) && !allowedApkPublicExtras.has(apkFile)) {
      failures.push(`Android QA APK contains unexpected public web asset: ${apkFile}`);
    }
    if (apkFile.endsWith(".map")) {
      failures.push(`Android QA APK must not include sourcemaps: ${apkFile}`);
    }
    for (const forbidden of forbiddenApkPublicAssets) {
      if (apkFile === forbidden || apkFile.startsWith(forbidden)) {
        failures.push(`Android QA APK must not include registration-only asset: ${apkFile}`);
      }
    }
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
    failures.push(`Could not inspect Android QA APK entries: ${error.stderr?.toString?.().trim() || error.message}`);
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
    failures.push(`Could not read Android QA APK entry ${entry}: ${error.stderr?.toString?.().trim() || error.message}`);
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
    failures.push(`${message} (${formatError(error)})`);
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

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function printReport() {
  console.log("Android QA APK check");
  console.log("====================");
  console.log("");
  printSection("Failures", failures);
  printSection("Warnings", warnings);
  console.log(failures.length === 0 ? "Android QA APK checks: PASS" : "Android QA APK checks: FAIL");
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
