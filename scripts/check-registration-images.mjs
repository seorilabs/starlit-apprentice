import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const args = parseArgs(process.argv.slice(2));
const specPath = args.spec ? resolve(args.spec) : undefined;

if (!specPath) {
  fail("usage: node scripts/check-registration-images.mjs --spec specs/starlit-apprentice.json");
}

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const appSlug = spec.app?.slug ?? "starlit-apprentice";
const appDir = resolve(repoRoot, "apps", appSlug);
const assets = spec.assets ?? {};

const targets = [
  makeTarget("logo", assets.logo, 600, 600),
  makeTarget("thumbnail", assets.thumbnail, 1932, 828),
  ...((assets.screenshots ?? []).map((screenshot, index) =>
    makeTarget(`screenshot ${index + 1}`, screenshot, 636, 1048)
  ))
];

if (!Array.isArray(assets.screenshots) || assets.screenshots.length < 3) {
  fail("assets.screenshots must include at least 3 vertical screenshots.");
}

const errors = [];
for (const target of targets) {
  try {
    const info = readPngInfo(target.path);
    if (info.width !== target.width || info.height !== target.height) {
      errors.push(
        `${target.label}: expected ${target.width}x${target.height}, found ${info.width}x${info.height}: ${target.path}`
      );
    }
    if (info.hasAlpha) {
      errors.push(`${target.label}: alpha channel is not allowed: ${target.path}`);
    }
  } catch (error) {
    errors.push(`${target.label}: ${error instanceof Error ? error.message : String(error)}: ${target.path}`);
  }
}
checkResultScreenshotCaptureContract(errors);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`FAIL ${error}`);
  }
  process.exit(1);
}

for (const target of targets) {
  console.log(`OK ${target.label}: ${target.path}`);
}
console.log("OK result screenshot capture contract: monthly coaching state without sticky action overlap");

function checkResultScreenshotCaptureContract(errors) {
  const registrationGenerator = readRepoFile("scripts/generate-registration-images.mjs");
  const storeGenerator = readRepoFile("scripts/generate-market-store-assets.mjs");
  const releaseAssets = readRepoFile("docs/release-assets.md");

  requireSnippet(
    errors,
    "scripts/generate-registration-images.mjs",
    registrationGenerator,
    "await completeMonth(page)",
    "AppsInToss result screenshot must complete all four weekly activities before capture"
  );
  requireSnippet(
    errors,
    "scripts/generate-registration-images.mjs",
    registrationGenerator,
    "monthly-coaching",
    "AppsInToss result screenshot must target the monthly coaching panel"
  );
  requireSnippet(
    errors,
    "scripts/generate-registration-images.mjs",
    registrationGenerator,
    ".sticky-actions { display: none !important; }",
    "AppsInToss result screenshot must hide the sticky action bar before capture"
  );
  requireSnippet(
    errors,
    "scripts/generate-market-store-assets.mjs",
    storeGenerator,
    "for (let slot = 0; slot < 4; slot += 1)",
    "Store result screenshots must complete all four weekly activities before capture"
  );
  requireSnippet(
    errors,
    "scripts/generate-market-store-assets.mjs",
    storeGenerator,
    "monthly-coaching",
    "Store result screenshots must target the monthly coaching panel"
  );
  requireSnippet(
    errors,
    "scripts/generate-market-store-assets.mjs",
    storeGenerator,
    ".sticky-actions { display: none !important; }",
    "Store result screenshots must hide the sticky action bar before capture"
  );
  requireSnippet(
    errors,
    "docs/release-assets.md",
    releaseAssets,
    "Result-state screenshots are captured after a full month",
    "release-assets documentation must describe full-month result screenshot capture"
  );
  requireSnippet(
    errors,
    "docs/release-assets.md",
    releaseAssets,
    "sticky action bar",
    "release-assets documentation must describe hiding the sticky action bar for screenshots"
  );
}

function requireSnippet(errors, path, content, snippet, message) {
  if (!content.includes(snippet)) {
    errors.push(`${path}: ${message}`);
  }
}

function makeTarget(label, asset, width, height) {
  if (!asset?.path) {
    fail(`assets.${label}.path is missing.`);
  }
  return {
    label,
    path: resolve(appDir, asset.path),
    width,
    height
  };
}

function readRepoFile(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readPngInfo(path) {
  const data = readFileSync(path);
  if (!data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("not a PNG file");
  }

  let offset = PNG_SIGNATURE.length;
  let width;
  let height;
  let colorType;
  let hasTrns = false;

  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const chunkType = data.subarray(offset + 4, offset + 8).toString("ascii");
    const start = offset + 8;
    const end = start + length;

    if (end + 4 > data.length) {
      throw new Error("truncated PNG chunk");
    }

    if (chunkType === "IHDR") {
      width = data.readUInt32BE(start);
      height = data.readUInt32BE(start + 4);
      colorType = data[start + 9];
    } else if (chunkType === "tRNS") {
      hasTrns = true;
    } else if (chunkType === "IEND") {
      break;
    }

    offset = end + 4;
  }

  if (width === undefined || height === undefined || colorType === undefined) {
    throw new Error("missing IHDR chunk");
  }

  return {
    width,
    height,
    hasAlpha: colorType === 4 || colorType === 6 || hasTrns
  };
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    if (rawArgs[index] === "--spec") {
      parsed.spec = rawArgs[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}
