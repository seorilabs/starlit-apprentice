import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBlockedPublicUrlHost } from "./public-url-guard.mjs";
import { renderCommandBlock, storeSubmissionPreflightCommands } from "./release-verification-commands.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const packetPath = process.env.STORE_SUBMISSION_PACKET_PATH ?? "qa/store-submission-packet.md";
const checkOnly = process.argv.includes("--check");
const failures = [];

const manifest = readJson(process.env.RELEASE_ARTIFACT_MANIFEST_PATH ?? "qa/release-artifact-manifest.json");
const manualQa = readJson(process.env.MANUAL_QA_EVIDENCE_PATH ?? "qa/manual-qa-evidence.json");
const consoleEvidence = readJson(process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json");
const releaseApproval = readJson(process.env.RELEASE_APPROVAL_EVIDENCE_PATH ?? "qa/release-approval-evidence.json");
const appsInToss = readJson(process.env.APPS_IN_TOSS_CONFIG_PATH ?? "apps-in-toss/apps-in-toss.config.json");
const googlePlay = readJson(process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json");
const appStore = readJson(process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json");
const packet = renderPacket();

if (checkOnly) {
  checkPacket();
} else {
  writeFileSync(resolve(repoRoot, packetPath), packet);
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkPacket() {
  if (!existsSync(resolve(repoRoot, packetPath))) {
    failures.push(`Missing store submission packet: ${packetPath}. Run pnpm release:store-submission-packet.`);
    return;
  }

  const current = read(packetPath);
  if (current !== packet) {
    failures.push(`${packetPath} is stale. Run pnpm release:store-submission-packet after updating store configs or release artifacts.`);
  }
}

function renderPacket() {
  const gateStatus = releaseGateStatus();

  return `# Store Submission Packet

This file is generated from store config files, release evidence files, and \`qa/release-artifact-manifest.json\`.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |

## Preflight Commands

\`\`\`bash
${renderCommandBlock(storeSubmissionPreflightCommands)}
\`\`\`

## Handoff Packets

| Packet | Purpose |
| --- | --- |
| \`qa/manual-qa-packet.md\` | Target-device QA runbook and evidence snippets |
| \`qa/release-console-packet.md\` | Console upload/review runbook and evidence snippets |
| \`qa/rating-content-inventory.md\` | Rating questionnaire content inventory and risk keyword scan |
| \`qa/public-release-pages.md\` | Hostable privacy/support/marketing page handoff and URL mapping |
| \`qa/store-submission-packet.md\` | Copy/paste metadata, asset paths, and unresolved console fields |
| \`qa/release-gate-dashboard.md\` | Release decision, dependency order, and open gate summary |
| \`qa/release-approval-packet.md\` | Final explicit release approval handoff and stop rules |

## Release Gate Status

| Field | Value |
| --- | --- |
| Submission decision | \`${gateStatus.decision}\` |
| Manual QA open targets | ${gateStatus.manualTargetOpen.length} |
| Console evidence open items | ${gateStatus.consoleOpen.length} |
| Store unresolved fields | ${gateStatus.unresolvedFields.length} |
| Store invalid public URL fields | ${gateStatus.invalidPublicUrlFields.length} |
| Final approval status | \`${releaseApproval.status}\` |

${renderSubmissionStopRules(gateStatus)}

## Public Release Pages

| Page | Local file | Store field |
| --- | --- | --- |
| Marketing page | \`public-pages/index.html\` | App Store \`marketingUrl\` |
| Privacy policy | \`public-pages/privacy-policy.html\` | Google Play/App Store \`privacyPolicyUrl\` |
| Support page | \`public-pages/support.html\` | App Store \`supportUrl\` |

Run \`pnpm release:public-pages\` before hosting these files. Do not paste placeholder URLs into store consoles; final URLs still require a confirmed public HTTPS domain.

## Public URL Rules

- Store public URLs must use \`https://\`.
- Do not use username/password credentials, localhost, non-public/reserved IPv4, IPv6 local/documentation/multicast ranges, \`.local\`, \`.test\`, \`.invalid\`, or placeholder domains such as \`example.com\`.
- Google Play \`privacyPolicyUrl\` and optional \`contactWebsite\` must point to public HTTPS URLs when resolved.
- App Store \`privacyPolicyUrl\`, \`supportUrl\`, and \`marketingUrl\` must point to public HTTPS URLs when resolved.

${renderAppsInToss()}

${renderGooglePlay()}

${renderAppStore()}

## Unresolved Fields

${renderUnresolvedFields()}

## Invalid Public URL Fields

${renderInvalidPublicUrlFields()}
`;
}

function renderAppsInToss() {
  const feature = appsInToss.featureRegistration?.candidateFeature ?? {};
  const assets = appsInToss.assets ?? {};
  const build = appsInToss.build ?? {};

  return `## AppsInToss

### Identity

| Field | Value |
| --- | --- |
| appName | \`${appsInToss.appName}\` |
| appType | \`${appsInToss.appType}\` |
| entryRoute | \`${appsInToss.entryRoute}\` |
| feature status | \`${appsInToss.featureRegistration?.status}\` |
| candidate feature ko | ${plain(feature.ko)} |
| candidate feature en | ${plain(feature.en)} |
| candidate feature URL | \`${feature.url}\` |

### Build Artifacts

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Static WebView ZIP | \`${build.candidateArchive}\` | \`${manifest.artifacts.appsInTossCandidate.sha256}\` |
| Uploadable .ait | \`${build.uploadableAit}\` | \`${manifest.artifacts.appsInTossAit.sha256}\` |

### Registration Assets

${assetList([
  ["Logo 600 x 600", assets.logo],
  ["Thumbnail 1932 x 828", assets.thumbnail],
  ...((assets.screenshots ?? []).map((path, index) => [`Screenshot ${index + 1} 636 x 1048`, path]))
])}

### Manual Console Fields

${keyValueObject(appsInToss.manualEvidence)}
`;
}

function renderGooglePlay() {
  const listing = googlePlay.storeListing ?? {};
  const assets = googlePlay.assets ?? {};

  return `## Google Play

### Identity

| Field | Value |
| --- | --- |
| packageName | \`${googlePlay.packageName}\` |
| defaultLanguage | \`${googlePlay.defaultLanguage}\` |
| appType | \`${googlePlay.appType}\` |
| freeOrPaid | \`${googlePlay.freeOrPaid}\` |
| contactEmail | ${plain(googlePlay.contactEmail)} |
| privacyPolicyUrl | ${plain(googlePlay.privacyPolicyUrl)} |

### Store Listing

${localizedFields([
  ["App name", listing.appName],
  ["Short description", listing.shortDescription],
  ["Full description", listing.fullDescription]
])}

### Assets

${assetList([
  ["Play icon 512 x 512", assets.playIcon],
  ["Feature graphic 1024 x 500", assets.featureGraphic],
  ...((assets.phoneScreenshots ?? []).map((path, index) => [`Phone screenshot ${index + 1}`, path])),
  ...((assets.sevenInchTabletScreenshots ?? []).map((path, index) => [`7-inch tablet screenshot ${index + 1}`, path])),
  ...((assets.tenInchTabletScreenshots ?? []).map((path, index) => [`10-inch tablet screenshot ${index + 1}`, path]))
])}

### Local Artifact

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Android QA APK | \`${manifest.artifacts.androidQaApk.path}\` | \`${manifest.artifacts.androidQaApk.sha256}\` |
| Android AAB | \`${manifest.artifacts.androidAab.path}\` | \`${manifest.artifacts.androidAab.sha256}\` |

### Content Declarations

${keyValueObject(googlePlay.contentDeclarations)}

### Manual Evidence Fields

${keyValueObject(googlePlay.manualEvidence)}
`;
}

function renderAppStore() {
  const listing = appStore.storeListing ?? {};
  const assets = appStore.assets ?? {};

  return `## App Store

### Identity

| Field | Value |
| --- | --- |
| bundleId | \`${appStore.bundleId}\` |
| sku | ${plain(appStore.sku)} |
| primaryLocale | \`${appStore.primaryLocale}\` |
| platform | \`${appStore.platform}\` |
| pricing | \`${appStore.pricing}\` |
| deviceFamilies | ${plain((appStore.deviceFamilies ?? []).join(", "))} |
| category | ${plain(formatCategory(appStore.category))} |
| privacyPolicyUrl | ${plain(appStore.privacyPolicyUrl)} |
| supportUrl | ${plain(appStore.supportUrl)} |
| marketingUrl | ${plain(appStore.marketingUrl)} |

### Contact

${keyValueObject(appStore.contact)}

### Store Listing

${localizedFields([
  ["App name", listing.appName],
  ["Subtitle", listing.subtitle],
  ["Promotional text", listing.promotionalText],
  ["Description", listing.description],
  ["Keywords", listing.keywords],
  ["What's new", listing.whatsNew]
])}

### Assets

${assetList([
  ["App Store icon 1024 x 1024", assets.appIcon],
  ...((assets.iphone69Screenshots ?? []).map((path, index) => [`iPhone 6.9 screenshot ${index + 1}`, path])),
  ...((assets.ipad13Screenshots ?? []).map((path, index) => [`iPad 13 screenshot ${index + 1}`, path]))
])}

### Local Artifact

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| iOS unsigned .app | \`${manifest.artifacts.iosApp.path}\` | \`${manifest.artifacts.iosApp.sha256}\` |

### Review Declarations

${keyValueObject(appStore.reviewDeclarations)}

### Review Notes

${keyValueObject(appStore.reviewNotes)}
`;
}

function renderUnresolvedFields() {
  const unresolved = unresolvedStoreFields();
  if (unresolved.length === 0) {
    return "- none";
  }
  return unresolved.map((item) => `- ${item}`).join("\n");
}

function releaseGateStatus() {
  const manualTargetOpen = targetEvidenceEntries(manualQa.items).filter((entry) => entry.status !== "passed");
  const consoleOpen = openItems(consoleEvidence.items);
  const unresolvedFields = unresolvedStoreFields();
  const invalidPublicUrlFields = invalidStorePublicUrlFields();
  const approvalOpen = releaseApproval.status === "approved" ? [] : [releaseApproval.status];
  const decision = manualTargetOpen.length === 0 && consoleOpen.length === 0 && unresolvedFields.length === 0 && invalidPublicUrlFields.length === 0 && approvalOpen.length === 0
    ? "submittable"
    : "not-submittable";
  return { decision, manualTargetOpen, consoleOpen, unresolvedFields, invalidPublicUrlFields, approvalOpen };
}

function renderSubmissionStopRules({ decision, manualTargetOpen, consoleOpen, unresolvedFields, invalidPublicUrlFields, approvalOpen }) {
  if (decision === "submittable") {
    return "All automated submission gates are clear. Confirm target console state before paste/submit.";
  }

  const rules = ["Do not paste, submit, request review, publish, or start rollout from this packet while the submission decision is `not-submittable`."];
  if (unresolvedFields.length > 0) {
    rules.push("Store metadata still has unresolved fields; resolve the fields listed below before copying store values.");
  }
  if (invalidPublicUrlFields.length > 0) {
    rules.push("Store public URL fields contain non-HTTPS, username/password credentials, localhost, non-public/reserved IP, IPv6 local/documentation/multicast, or placeholder hosts; replace them with confirmed public HTTPS URLs before copying store values.");
  }
  if (manualTargetOpen.length > 0) {
    rules.push("Target-device manual QA evidence is incomplete; complete every open target before review submission.");
  }
  if (consoleOpen.length > 0) {
    rules.push("Console upload/review evidence is incomplete; complete signed upload, QR/test, rating, privacy, preview, and metadata gates in the real consoles.");
  }
  if (approvalOpen.length > 0) {
    rules.push("Final release approval is not recorded for the current `manualQaBuildId`.");
  }
  return `Stop rules:\n\n${rules.map((rule) => `- ${rule}`).join("\n")}`;
}

function openItems(items) {
  return (items ?? []).filter((item) => item?.status !== "passed");
}

function targetEvidenceEntries(items) {
  return (items ?? []).flatMap((item) => {
    if (Array.isArray(item?.targetEvidence)) {
      return item.targetEvidence.map((entry) => ({
        ...entry,
        itemId: item.id,
        title: item.title
      }));
    }
    if (item?.status === "passed") {
      return [];
    }
    return [{
      itemId: item?.id ?? "unknown",
      title: item?.title ?? "Missing target evidence",
      target: "missing-target-evidence",
      status: item?.status ?? "pending"
    }];
  });
}

function unresolvedStoreFields() {
  return [
    ...findUnresolved("AppsInToss", appsInToss),
    ...findUnresolved("Google Play", googlePlay),
    ...findUnresolved("App Store", appStore)
  ];
}

function invalidStorePublicUrlFields() {
  return [
    ["Google Play", "privacyPolicyUrl", googlePlay.privacyPolicyUrl],
    ["Google Play", "contactWebsite", googlePlay.contactWebsite],
    ["App Store", "privacyPolicyUrl", appStore.privacyPolicyUrl],
    ["App Store", "supportUrl", appStore.supportUrl],
    ["App Store", "marketingUrl", appStore.marketingUrl]
  ].flatMap(([target, field, value]) => {
    const reason = invalidPublicUrlReason(value);
    return reason ? [`${target}: \`${field}\` = ${value} (${reason})`] : [];
  });
}

function renderInvalidPublicUrlFields() {
  const invalid = invalidStorePublicUrlFields();
  if (invalid.length === 0) {
    return "- none";
  }
  return invalid.map((item) => `- ${item}`).join("\n");
}

function localizedFields(rows) {
  return rows.map(([label, values]) => {
    const entries = Object.entries(values ?? {});
    return `#### ${label}

${entries.map(([locale, value]) => `- \`${locale}\`: ${blockValue(value)}`).join("\n")}`;
  }).join("\n\n");
}

function assetList(rows) {
  return `| Asset | Path |
| --- | --- |
${rows.map(([label, path]) => `| ${label} | \`${path}\` |`).join("\n")}`;
}

function keyValueObject(value, prefix = "") {
  const rows = flattenObject(value, prefix);
  if (rows.length === 0) {
    return "- none";
  }
  return `| Field | Value |
| --- | --- |
${rows.map(([key, entry]) => `| \`${key}\` | ${plain(formatValue(entry))} |`).join("\n")}`;
}

function flattenObject(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [[prefix, value]] : [];
  }
  const rows = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      rows.push(...flattenObject(entry, nextPrefix));
    } else {
      rows.push([nextPrefix, entry]);
    }
  }
  return rows;
}

function findUnresolved(target, value, prefix = "") {
  if (typeof value === "string") {
    return value.includes("확정 필요") ? [`${target}: \`${prefix}\` = ${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findUnresolved(target, entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return findUnresolved(target, entry, nextPrefix);
    });
  }
  return [];
}

function invalidPublicUrlReason(value) {
  if (value === undefined || String(value ?? "").includes("확정 필요")) {
    return null;
  }
  try {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || !url.hostname) {
      return "must use https";
    }
    if (isBlockedPublicUrlHost(url.hostname)) {
      return "blocked localhost/non-public-or-reserved/placeholder host";
    }
    return null;
  } catch {
    return "must be a valid URL";
  }
}

function formatCategory(category) {
  if (!category || typeof category !== "object") {
    return "";
  }
  return [category.primary, category.primarySubcategory, category.secondarySubcategory].filter(Boolean).join(" / ");
}

function blockValue(value) {
  return String(value ?? "").replace(/\n/g, "<br>");
}

function plain(value) {
  return String(value ?? "").replace(/\n/g, "<br>");
}

function formatValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log(checkOnly ? "Store submission packet check" : "Store submission packet");
  console.log(checkOnly ? "=============================" : "=======================");
  console.log("");
  console.log(`Packet: ${packetPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Store submission packet checks: PASS" : "Store submission packet checks: FAIL");
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
