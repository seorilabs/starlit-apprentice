import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  isBlockedPublicUrlHost as isBlockedPublicUrlHostValue,
  isPublicHttpsUrl
} from "../packages/product-core/dist/index.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];
const unresolvedMarkers = ["확정 필요", "TODO", "TBD"];
const screenshotMaxBytes = 8 * 1024 * 1024;
const listingCopyRules = {
  "ko-KR": {
    required: ["14가지 능력", "골드", "기력", "스트레스"],
    stale: ["지식, 감성, 체력, 성실, 명성, 스트레스"]
  },
  "en-US": {
    required: ["14 growth stats", "gold", "energy", "stress"],
    stale: ["knowledge, sensitivity, stamina, diligence, fame, and stress"]
  }
};

const specPath = process.env.SPEC_PATH ?? "specs/starlit-apprentice.json";
const googlePlayConfigPath = process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json";
const appStoreConfigPath = process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json";

const spec = readJson(specPath);
const playConfig = readJson(googlePlayConfigPath);
const appStoreConfig = readJson(appStoreConfigPath);

checkPlayConfig();
checkAppStoreConfig();
checkNativeTargets();
checkDocs();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exit(1);
}

function checkPlayConfig() {
  requireEqual("Google Play packageName", playConfig.packageName, "com.seorilabs.starlitapprentice");
  requireEqual("Google Play defaultLanguage", playConfig.defaultLanguage, "ko-KR");
  requireEqual("Google Play appType", playConfig.appType, "game");
  requireEqual("Google Play freeOrPaid", playConfig.freeOrPaid, "free");

  requireManualValue("Google Play contactEmail", playConfig.contactEmail);
  requireManualValue("Google Play privacyPolicyUrl", playConfig.privacyPolicyUrl);
  validateEmailIfResolved("Google Play contactEmail", playConfig.contactEmail);
  validatePublicHttpsUrlIfResolved("Google Play privacyPolicyUrl", playConfig.privacyPolicyUrl);
  validatePublicHttpsUrlIfResolved("Google Play contactWebsite", playConfig.contactWebsite);

  checkLocalizedText("Google Play appName", playConfig.storeListing?.appName, 30);
  checkLocalizedText("Google Play shortDescription", playConfig.storeListing?.shortDescription, 80);
  checkLocalizedText("Google Play fullDescription", playConfig.storeListing?.fullDescription, 4000);
  checkListingCopyConsistency("Google Play fullDescription", playConfig.storeListing?.fullDescription);

  checkImage("Google Play icon", playConfig.assets?.playIcon, {
    dimensions: [512, 512],
    pngColorType: 6,
    maxBytes: 1024 * 1024
  });
  checkImage("Google Play feature graphic", playConfig.assets?.featureGraphic, {
    dimensions: [1024, 500],
    noAlpha: true
  });
  checkScreenshotSet("Google Play phone screenshots", playConfig.assets?.phoneScreenshots, {
    dimensions: [1080, 1920],
    minimum: 4,
    ratio: "9:16",
    maxBytes: screenshotMaxBytes
  });
  checkScreenshotSet("Google Play 7-inch tablet screenshots", playConfig.assets?.sevenInchTabletScreenshots, {
    dimensions: [1440, 2560],
    minimum: 4,
    ratio: "9:16",
    maxBytes: screenshotMaxBytes
  });
  checkScreenshotSet("Google Play 10-inch tablet screenshots", playConfig.assets?.tenInchTabletScreenshots, {
    dimensions: [1800, 3200],
    minimum: 4,
    ratio: "9:16",
    maxBytes: screenshotMaxBytes
  });

  requireManualValue("Google Play Data safety", playConfig.contentDeclarations?.dataSafety);
  requireManualValue("Google Play content rating", playConfig.contentDeclarations?.contentRating);
  requireManualValue("Google Play Korea game rating", playConfig.contentDeclarations?.koreaGameRating);
  requireEqual("Google Play targetAudience", playConfig.contentDeclarations?.targetAudience, "general-audience-not-children");
  requireEqual("Google Play ads declaration", playConfig.contentDeclarations?.ads, "no");
  requireEqual("Google Play Korea distribution", playConfig.contentDeclarations?.koreaDistribution, "yes");
  requireManualValue("Google Play AAB upload evidence", playConfig.manualEvidence?.androidAppBundle);
  requireManualValue("Google Play Console listing evidence", playConfig.manualEvidence?.playConsoleListing);
  requireManualValue("Google Play policy questionnaire evidence", playConfig.manualEvidence?.policyQuestionnaire);
}

function checkAppStoreConfig() {
  requireEqual("App Store bundleId", appStoreConfig.bundleId, "com.seorilabs.starlitapprentice");
  requireEqual("App Store primaryLocale", appStoreConfig.primaryLocale, "ko-KR");
  requireEqual("App Store platform", appStoreConfig.platform, "ios");
  requireEqual("App Store pricing", appStoreConfig.pricing, "free");
  requireEqual("App Store primary category", appStoreConfig.category?.primary, "Games");

  if (!Array.isArray(appStoreConfig.deviceFamilies) || !appStoreConfig.deviceFamilies.includes("iphone")) {
    automatedFailures.push("App Store deviceFamilies must include iphone.");
  }

  requireManualValue("App Store SKU", appStoreConfig.sku);
  requireManualValue("App Store contact", appStoreConfig.contact);
  requireManualValue("App Store privacyPolicyUrl", appStoreConfig.privacyPolicyUrl);
  requireManualValue("App Store supportUrl", appStoreConfig.supportUrl);
  validatePublicHttpsUrlIfResolved("App Store privacyPolicyUrl", appStoreConfig.privacyPolicyUrl);
  validatePublicHttpsUrlIfResolved("App Store supportUrl", appStoreConfig.supportUrl);
  validatePublicHttpsUrlIfResolved("App Store marketingUrl", appStoreConfig.marketingUrl);
  validateEmailIfResolved("App Store contact.email", appStoreConfig.contact?.email);

  checkLocalizedText("App Store appName", appStoreConfig.storeListing?.appName, 30);
  checkLocalizedText("App Store subtitle", appStoreConfig.storeListing?.subtitle, 30);
  checkLocalizedText("App Store promotionalText", appStoreConfig.storeListing?.promotionalText, 170);
  checkLocalizedText("App Store description", appStoreConfig.storeListing?.description, 4000);
  checkListingCopyConsistency("App Store description", appStoreConfig.storeListing?.description);
  checkLocalizedText("App Store keywords", appStoreConfig.storeListing?.keywords, 100);
  checkLocalizedText("App Store whatsNew", appStoreConfig.storeListing?.whatsNew, 4000);

  checkImage("App Store icon", appStoreConfig.assets?.appIcon, {
    dimensions: [1024, 1024],
    noAlpha: true
  });
  checkScreenshotSet("App Store iPhone 6.9 screenshots", appStoreConfig.assets?.iphone69Screenshots, {
    dimensions: [1290, 2796],
    minimum: 4,
    maxBytes: screenshotMaxBytes
  });

  if (appStoreConfig.deviceFamilies?.includes("ipad")) {
    checkScreenshotSet("App Store iPad 13 screenshots", appStoreConfig.assets?.ipad13Screenshots, {
      dimensions: [2048, 2732],
      minimum: 4,
      maxBytes: screenshotMaxBytes
    });
  }

  requireManualValue("App Store age rating", appStoreConfig.reviewDeclarations?.ageRating);
  requireManualValue("App Store privacy nutrition labels", appStoreConfig.reviewDeclarations?.privacyNutritionLabels);
  requireManualValue("App Store export compliance", appStoreConfig.reviewDeclarations?.exportCompliance);
  requireEqual("App Store content rights", appStoreConfig.reviewDeclarations?.contentRights, "owns-or-has-rights");
  requireEqual("App Store advertisingIdentifier", appStoreConfig.reviewDeclarations?.advertisingIdentifier, "no");
}

function checkNativeTargets() {
  const pbxproj = read("apps/starlit-apprentice/ios/App/App.xcodeproj/project.pbxproj");
  if (pbxproj.includes('TARGETED_DEVICE_FAMILY = "1,2"') && !appStoreConfig.deviceFamilies?.includes("ipad")) {
    automatedFailures.push("App Store config must include ipad because the Xcode target currently supports iPhone and iPad.");
  }
}

function checkDocs() {
  for (const path of [
    "docs/google-play-store-listing.md",
    "docs/app-store-registration.md",
    "play-store/README.md",
    "app-store/README.md"
  ]) {
    if (!exists(path)) {
      automatedFailures.push(`missing store registration doc: ${path}`);
    }
  }

  const releaseAssets = read("docs/release-assets.md");
  for (const expected of ["512 x 512", "1024 x 500", "1080 x 1920", "1290 x 2796", "2048 x 2732"]) {
    if (!releaseAssets.includes(expected)) {
      automatedFailures.push(`docs/release-assets.md must include ${expected} market asset requirement.`);
    }
  }

  checkSupportContactDocs();
}

function checkSupportContactDocs() {
  if (!unresolved(playConfig.contactEmail)) {
    requireDocIncludes("docs/google-play-store-listing.md", playConfig.contactEmail, "resolved Google Play contact email");
    requireDocIncludes("play-store/README.md", playConfig.contactEmail, "resolved Google Play contact email");
    requireDocIncludes("docs/release-assets.md", playConfig.contactEmail, "resolved Google Play contact email");
    rejectDocPhrase(
      "docs/google-play-store-listing.md",
      "Contact email and privacy policy URL must be confirmed",
      "Google Play contactEmail is already resolved; docs must not list it as an unresolved launch blocker."
    );
    rejectDocPhrase(
      "play-store/README.md",
      "Confirm contact email and privacy policy URL",
      "Google Play contactEmail is already resolved; README must not list it as an unresolved launch blocker."
    );
    rejectDocPhrase(
      "docs/release-assets.md",
      "Google Play contact email and privacy policy URL remain unresolved",
      "Google Play contactEmail is already resolved; release assets notes must not list it as unresolved."
    );
  }

  if (!unresolved(appStoreConfig.contact?.email)) {
    for (const path of ["docs/app-store-registration.md", "docs/app-store-release.md", "app-store/README.md"]) {
      requireDocIncludes(path, appStoreConfig.contact.email, "resolved App Store support/review email");
    }
  }
}

function requireDocIncludes(path, value, label) {
  if (!read(path).includes(value)) {
    automatedFailures.push(`${path} must include ${label}: ${value}`);
  }
}

function rejectDocPhrase(path, phrase, message) {
  if (read(path).includes(phrase)) {
    automatedFailures.push(`${path}: ${message}`);
  }
}

function checkLocalizedText(label, values, limit) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    automatedFailures.push(`${label} must be a locale object.`);
    return;
  }
  for (const locale of ["ko-KR", "en-US"]) {
    const value = values[locale];
    if (unresolved(value)) {
      automatedFailures.push(`${label}.${locale} is required.`);
      continue;
    }
    if (value.length > limit) {
      automatedFailures.push(`${label}.${locale} exceeds ${limit} characters: ${value.length}`);
    }
  }
}

function checkListingCopyConsistency(label, values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return;
  }
  for (const [locale, rules] of Object.entries(listingCopyRules)) {
    const value = values[locale];
    if (typeof value !== "string" || unresolved(value)) {
      continue;
    }
    const searchable = locale === "en-US" ? value.toLowerCase() : value;
    for (const stale of rules.stale) {
      if (searchable.includes(stale)) {
        automatedFailures.push(`${label}.${locale} contains stale stat/resource copy: ${stale}`);
      }
    }
    const missing = rules.required.filter((required) => !searchable.includes(required));
    if (missing.length > 0) {
      automatedFailures.push(`${label}.${locale} must describe the current 14-stat/resource model; missing: ${missing.join(", ")}`);
    }
  }
}

function checkScreenshotSet(label, values, options) {
  if (!Array.isArray(values)) {
    automatedFailures.push(`${label} must be an array.`);
    return;
  }
  if (values.length < options.minimum) {
    automatedFailures.push(`${label} needs at least ${options.minimum} screenshots.`);
  }
  if (values.length > 8) {
    automatedFailures.push(`${label} must not exceed 8 screenshots.`);
  }
  const seenPaths = new Set();
  const seenHashes = new Map();
  for (const value of values) {
    const info = checkImage(label, value, {
      dimensions: options.dimensions,
      noAlpha: true,
      maxBytes: options.maxBytes
    });
    if (typeof value === "string" && !unresolved(value)) {
      if (seenPaths.has(value)) {
        automatedFailures.push(`${label} must not repeat screenshot path: ${value}`);
      } else {
        seenPaths.add(value);
        if (info) {
          const hash = fileHash(resolve(repoRoot, value));
          const previous = seenHashes.get(hash);
          if (previous) {
            automatedFailures.push(`${label} must not contain byte-identical screenshots: ${previous} and ${value}`);
          } else {
            seenHashes.set(hash, value);
          }
        }
      }
    }
    if (info && options.ratio === "9:16" && info.width * 16 !== info.height * 9) {
      automatedFailures.push(`${label} must use a 9:16 portrait ratio: ${value} (${info.width} x ${info.height})`);
    }
  }
}

function checkImage(label, value, options) {
  if (unresolved(value)) {
    automatedFailures.push(`${label} path is required.`);
    return null;
  }
  const path = resolve(repoRoot, value);
  if (!existsSync(path)) {
    automatedFailures.push(`${label} file is missing: ${value}`);
    return null;
  }
  const info = imageInfo(path);
  if (!info) {
    automatedFailures.push(`${label} must be a readable PNG/JPEG file: ${value}`);
    return null;
  }
  const [expectedWidth, expectedHeight] = options.dimensions;
  if (info.width !== expectedWidth || info.height !== expectedHeight) {
    automatedFailures.push(`${label} must be ${expectedWidth} x ${expectedHeight}: ${value} is ${info.width} x ${info.height}`);
  }
  if (options.maxBytes && info.bytes > options.maxBytes) {
    automatedFailures.push(`${label} must be <= ${options.maxBytes} bytes: ${value} is ${info.bytes} bytes`);
  }
  if (options.pngColorType !== undefined) {
    if (info.kind !== "png" || info.colorType !== options.pngColorType) {
      automatedFailures.push(`${label} must be PNG color type ${options.pngColorType}: ${value} is ${info.kind}${info.kind === "png" ? ` color type ${info.colorType}` : ""}`);
    }
  }
  if (options.noAlpha && info.kind === "png" && [4, 6].includes(info.colorType)) {
    automatedFailures.push(`${label} must not include PNG alpha: ${value}`);
  }
  return info;
}

function imageInfo(path) {
  const data = readFileSync(path);
  if (data.length >= 26 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      kind: "png",
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      bitDepth: data[24],
      colorType: data[25],
      bytes: data.length
    };
  }
  const jpeg = jpegInfo(data);
  if (jpeg) {
    return { ...jpeg, bytes: data.length };
  }
  return null;
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function jpegInfo(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }
  let index = 2;
  while (index + 9 < data.length) {
    if (data[index] !== 0xff) {
      index += 1;
      continue;
    }
    const marker = data[index + 1];
    index += 2;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (index + 2 > data.length) {
      return null;
    }
    const segmentLength = data.readUInt16BE(index);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (index + 7 > data.length) {
        return null;
      }
      return {
        kind: "jpeg",
        width: data.readUInt16BE(index + 5),
        height: data.readUInt16BE(index + 3)
      };
    }
    index += segmentLength;
  }
  return null;
}

function requireManualValue(label, value) {
  if (unresolved(value)) {
    const message = `${label} is unresolved.`;
    if (allowManualBlockers) {
      manualBlockers.push(message);
    } else {
      automatedFailures.push(message);
    }
  }
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    automatedFailures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function validatePublicHttpsUrlIfResolved(label, value) {
  if (unresolved(value) || value === undefined) {
    return;
  }
  try {
    const parsed = new URL(value);
    if (!isPublicHttpsUrl(parsed)) {
      automatedFailures.push(`${label} must be a public HTTPS URL: ${value}`);
      return;
    }
    if (isBlockedPublicUrlHostValue(parsed.hostname)) {
      automatedFailures.push(`${label} must not use localhost, non-public/reserved IP, IPv6 local/documentation/multicast, or placeholder host: ${value}`);
    }
  } catch {
    automatedFailures.push(`${label} must be a public HTTPS URL: ${value}`);
  }
}

function validateEmailIfResolved(label, value) {
  if (unresolved(value) || value === undefined) {
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    automatedFailures.push(`${label} must be an email address: ${value}`);
  }
}

function unresolved(value) {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" || unresolvedMarkers.some((marker) => trimmed.includes(marker));
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.some((item) => unresolved(item));
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0 || Object.values(value).some((item) => unresolved(item));
  }
  return false;
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
  console.log("Market store config check");
  console.log("=========================");
  console.log("");
  console.log(`App: ${spec.app?.displayName ?? "unknown"} / ${spec.app?.englishDisplayName ?? "unknown"}`);
  console.log("");
  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);
  console.log(automatedFailures.length === 0 ? "Automated store checks: PASS" : "Automated store checks: FAIL");
  console.log(manualBlockers.length === 0 ? "Manual store gates: CLEAR" : `Manual store gates: ${manualBlockers.length} blocker(s)`);
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
