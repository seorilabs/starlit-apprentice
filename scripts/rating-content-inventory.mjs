import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACTIONS,
  ACTION_CATEGORY_LABELS,
  ENDINGS,
  STAT_LABELS
} from "../packages/product-core/dist/index.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const inventoryPath = "qa/rating-content-inventory.md";
const checkOnly = process.argv.includes("--check");
const failures = [];

const spec = readJson("specs/starlit-apprentice.json");
const manifest = readJson("qa/release-artifact-manifest.json");
const googlePlay = readJson("play-store/google-play.config.json");
const appStore = readJson("app-store/app-store.config.json");
const appsInToss = readJson("apps-in-toss/apps-in-toss.config.json");
const answerSnapshot = ratingAnswerSnapshot();
const inventory = renderInventory();

if (checkOnly) {
  checkInventory();
} else {
  writeFileSync(resolve(repoRoot, inventoryPath), inventory);
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkInventory() {
  if (!existsSync(resolve(repoRoot, inventoryPath))) {
    failures.push(`Missing rating content inventory: ${inventoryPath}. Run pnpm release:rating-content-inventory.`);
    return;
  }

  const current = read(inventoryPath);
  if (current !== inventory) {
    failures.push(`${inventoryPath} is stale. Run pnpm release:rating-content-inventory after updating content, store configs, or release artifacts.`);
  }
}

function renderInventory() {
  const categoryRows = Object.entries(ACTION_CATEGORY_LABELS)
    .map(([category, label]) => {
      const actions = ACTIONS.filter((action) => action.category === category);
      return `| ${label} | \`${category}\` | ${actions.length} | ${actions.map((action) => action.label).join(", ")} |`;
    })
    .join("\n");
  const scanResults = scanRiskKeywords();
  validateAnswerSnapshot();
  const riskRows = scanResults.map((entry) => {
    const matches = entry.matches.length === 0
      ? "none"
      : entry.matches.map((match) => `${match.field}: ${match.value}`).join("<br>");
    return `| ${entry.area} | ${entry.patterns.map((pattern) => `\`${pattern}\``).join(", ")} | ${entry.matches.length} | ${plain(matches)} |`;
  }).join("\n");

  return `# Rating Content Inventory

This file is generated from product-core content data, app spec, store configs, and \`qa/release-artifact-manifest.json\`.

It is not a final rating certificate. Use it as repo-local evidence when completing AppsInToss game rating, Google Play content rating/Korea game rating, and App Store age rating console flows.

## Build Identity

| Field | Value |
| --- | --- |
| App | \`${manifest.appName}\` |
| Version | \`${manifest.version}\` |
| Manifest generated | \`${manifest.generatedAt}\` |
| Manual QA build ID | \`${manifest.manualQaBuildId}\` |

## Content Scope

| Field | Value |
| --- | --- |
| Archetype | \`${spec.archetype}\` |
| Game loop | 12 months, 4 weekly actions per month |
| Schedule actions | ${ACTIONS.length} |
| Endings | ${ENDINGS.length} |
| Stats | ${Object.values(STAT_LABELS).join(", ")} |
| Storage | \`${spec.mvp?.storage}\` |
| Excluded MVP scope | ${(spec.mvp?.excluded ?? []).map((item) => `\`${item}\``).join(", ")} |

## Action Categories

| Category | ID | Count | Actions |
| --- | --- | ---: | --- |
${categoryRows}

## Rating Questionnaire Evidence

| Topic | Repo-local evidence | Console boundary |
| --- | --- | --- |
| Violence / combat | No combat system, damage loop, weapons, blood, or battle actions in product-core action/endings text. | Complete the official store questionnaire; do not rely on this file as the final rating. |
| Sexual content / romance | MVP excludes marriage-ending and family-romance scope; no sexual or romance copy is present in generated content corpus. | Complete the official store questionnaire. |
| Gambling / loot boxes | No paid chance mechanic, casino, betting, loot box, IAP, or payment SDK; \`gold\` is local-only progression currency. | Confirm store-specific gambling/chance questions in console. |
| Alcohol / tobacco / drugs | No alcohol, tobacco, or drug content appears in product-core action/endings text. | Confirm store-specific substance questions in console. |
| Horror / graphic content | No horror, gore, graphic injury, or jump-scare content appears in product-core action/endings text. | Confirm store-specific questionnaire wording in console. |
| User-generated content / chat | No UGC, chat, accounts, network play, or user-to-user communication in MVP scope. | Confirm interactive elements/social questions in console. |
| Data / tracking / ads | Store configs and privacy evidence state no collected/shared data, no tracking, no production ad SDK, no billing SDK. | Submit Play/App Store privacy declarations separately. |

## Repo-Local Answer Snapshot

This snapshot is generated from current repo content and config. It is intended to reduce console entry mistakes, not to replace the official AppsInToss, Google Play, or App Store rating questionnaires.

| Topic | Current repo-local posture | Source fields |
| --- | --- | --- |
${answerSnapshot.map((entry) => `| ${entry.topic} | ${entry.posture} | ${entry.sources.map((source) => `\`${source}\``).join(", ")} |`).join("\n")}

## Store Config Cross-Check

| Target | Field | Current value |
| --- | --- | --- |
| AppsInToss | appType | \`${appsInToss.appType}\` |
| AppsInToss | gameRatingEvidence | ${plain(appsInToss.manualEvidence?.gameRatingEvidence)} |
| Google Play | appType | \`${googlePlay.appType}\` |
| Google Play | contentRating | ${plain(googlePlay.contentDeclarations?.contentRating)} |
| Google Play | koreaGameRating | ${plain(googlePlay.contentDeclarations?.koreaGameRating)} |
| Google Play | ads | \`${googlePlay.contentDeclarations?.ads}\` |
| Google Play | targetAudience | \`${googlePlay.contentDeclarations?.targetAudience}\` |
| App Store | category | ${plain(formatCategory(appStore.category))} |
| App Store | ageRating | ${plain(appStore.reviewDeclarations?.ageRating)} |
| App Store | advertisingIdentifier | \`${appStore.reviewDeclarations?.advertisingIdentifier}\` |

## Risk Keyword Scan

The scanner checks product-core action text, ending text, and store listing text. Any match makes this inventory fail so the rating posture is reviewed intentionally.

| Area | Patterns | Matches | Evidence |
| --- | --- | ---: | --- |
${riskRows}

## Content Corpus

| Corpus | Count |
| --- | ---: |
| Action labels/descriptions/places | ${ACTIONS.length} |
| Ending titles/summaries/share text/hints | ${ENDINGS.length} |
| Store listing locales | ${countListingLocales()} |

## Required Manual Rating Gates

- AppsInToss game rating evidence remains a console/reviewer gate.
- Google Play content rating and Korea game rating evidence remain console/reviewer gates.
- App Store age rating remains an App Store Connect gate.
- If any official questionnaire answer conflicts with this inventory, update repo content/configs or record the console-specific reason before release.
`;
}

function scanRiskKeywords() {
  const corpus = contentCorpus();
  const groups = [
    {
      area: "Violence / combat",
      patterns: ["전투", "던전", "폭력", "공격", "무기", "혈액", "유혈", "잔혹", "battle", "weapon", "blood", "gore", "violence"],
      regex: /전투|던전|폭력|공격|무기|혈액|유혈|잔혹|battle|weapon|blood|gore|violence/i
    },
    {
      area: "Sexual / romance",
      patterns: ["성적", "노출", "연애", "로맨스", "결혼", "키스", "sexual", "nudity", "romance", "marriage"],
      regex: /성적|노출|연애|로맨스|결혼|키스|sexual|nudity|romance|marriage/i
    },
    {
      area: "Gambling / chance monetization",
      patterns: ["도박", "카지노", "베팅", "슬롯", "확률형", "뽑기", "loot box", "casino", "betting", "gambling"],
      regex: /도박|카지노|베팅|슬롯|확률형|뽑기|loot box|casino|betting|gambling/i
    },
    {
      area: "Substances",
      patterns: ["주류", "음주", "담배", "마약", "alcohol", "tobacco", "drug"],
      regex: /주류|음주|담배|마약|alcohol|tobacco|drug/i
    },
    {
      area: "Horror / fear",
      patterns: ["공포", "귀신", "괴물", "horror", "ghost", "monster"],
      regex: /공포|귀신|괴물|horror|ghost|monster/i
    }
  ];

  return groups.map((group) => {
    const matches = corpus.filter((entry) => group.regex.test(entry.value));
    if (matches.length > 0) {
      failures.push(`Rating content inventory found ${group.area} keyword(s): ${matches.map((match) => `${match.field}=${JSON.stringify(match.value)}`).join(", ")}`);
    }
    return { ...group, matches };
  });
}

function ratingAnswerSnapshot() {
  const excluded = new Set(spec.mvp?.excluded ?? []);
  return [
    {
      topic: "Combat, violence, weapons, blood, gore",
      posture: "Not present in current product-core content; answer as absent unless console wording requires a narrower interpretation.",
      sources: ["Risk Keyword Scan: Violence / combat", "spec.mvp.excluded"]
    },
    {
      topic: "Sexual content, nudity, romance, marriage reward",
      posture: "Not present; MVP explicitly excludes marriage-ending and family-romance scope.",
      sources: ["Risk Keyword Scan: Sexual / romance", "planning excluded scope"]
    },
    {
      topic: "Gambling, loot boxes, paid chance mechanics",
      posture: excluded.has("payment")
        ? "Not present; no payment/IAP path and no paid chance mechanic. `gold` is local progression currency only."
        : "Review required; payment is not excluded in the current spec.",
      sources: ["spec.mvp.excluded", "googlePlay.contentDeclarations.ads"]
    },
    {
      topic: "Ads, tracking, advertising identifier",
      posture: googlePlay.contentDeclarations?.ads === "no" && appStore.reviewDeclarations?.advertisingIdentifier === "no"
        ? "No production ads, tracking, or IDFA use in the MVP config."
        : "Review required; ad/tracking declarations are not consistently disabled.",
      sources: ["googlePlay.contentDeclarations.ads", "appStore.reviewDeclarations.advertisingIdentifier", "spec.mvp.excluded"]
    },
    {
      topic: "Data collection, sharing, account deletion",
      posture: googlePlay.contentDeclarations?.dataSafety?.dataCollected === "none" &&
        googlePlay.contentDeclarations?.dataSafety?.dataShared === "none" &&
        appStore.reviewDeclarations?.privacyNutritionLabels?.appPrivacyLabel === "Data Not Collected"
        ? "No user data collected/shared; no account system; local progress only."
        : "Review required; privacy declarations are not consistently no-data.",
      sources: ["googlePlay.contentDeclarations.dataSafety", "appStore.reviewDeclarations.privacyNutritionLabels", "spec.mvp.storage"]
    },
    {
      topic: "UGC, chat, multiplayer, user-to-user communication",
      posture: excluded.has("server-save")
        ? "Not present; no account, server save, network play, chat, or UGC system in MVP scope."
        : "Review required; server-side scope is not explicitly excluded.",
      sources: ["spec.mvp.excluded", "spec.mvp.storage"]
    },
    {
      topic: "Substances, horror, graphic injury",
      posture: "Not present in current content corpus.",
      sources: ["Risk Keyword Scan: Substances", "Risk Keyword Scan: Horror / fear"]
    },
    {
      topic: "Korea game rating evidence",
      posture: googlePlay.contentDeclarations?.koreaDistribution === "yes"
        ? "Manual gate remains open; use this inventory as content evidence, then record Play Console or rating-authority evidence."
        : "Review required; Korea distribution is not enabled in config.",
      sources: ["googlePlay.contentDeclarations.koreaDistribution", "googlePlay.contentDeclarations.koreaGameRating", "appsInToss.manualEvidence.gameRatingEvidence"]
    }
  ];
}

function validateAnswerSnapshot() {
  const excluded = new Set(spec.mvp?.excluded ?? []);
  for (const requiredExcluded of ["payment", "production-ads", "server-save", "login"]) {
    if (!excluded.has(requiredExcluded)) {
      failures.push(`Rating answer snapshot expects spec.mvp.excluded to include ${requiredExcluded}.`);
    }
  }
  if (googlePlay.contentDeclarations?.ads !== "no") {
    failures.push("Rating answer snapshot expects Google Play ads declaration to be no.");
  }
  if (appStore.reviewDeclarations?.advertisingIdentifier !== "no") {
    failures.push("Rating answer snapshot expects App Store advertisingIdentifier to be no.");
  }
  if (googlePlay.contentDeclarations?.dataSafety?.dataCollected !== "none" || googlePlay.contentDeclarations?.dataSafety?.dataShared !== "none") {
    failures.push("Rating answer snapshot expects Google Play Data safety to remain no collected/shared data.");
  }
  if (appStore.reviewDeclarations?.privacyNutritionLabels?.appPrivacyLabel !== "Data Not Collected") {
    failures.push("Rating answer snapshot expects App Store privacy label posture to be Data Not Collected.");
  }
}

function contentCorpus() {
  return [
    ...ACTIONS.flatMap((action) => [
      field(`action.${action.id}.label`, action.label),
      field(`action.${action.id}.shortLabel`, action.shortLabel),
      field(`action.${action.id}.place`, action.place),
      field(`action.${action.id}.description`, action.description)
    ]),
    ...ENDINGS.flatMap((ending) => [
      field(`ending.${ending.code}.title`, ending.title),
      field(`ending.${ending.code}.summary`, ending.summary),
      field(`ending.${ending.code}.shareText`, ending.shareText),
      field(`ending.${ending.code}.hint`, ending.hint)
    ]),
    ...localizedFields("googlePlay.storeListing.appName", googlePlay.storeListing?.appName),
    ...localizedFields("googlePlay.storeListing.shortDescription", googlePlay.storeListing?.shortDescription),
    ...localizedFields("googlePlay.storeListing.fullDescription", googlePlay.storeListing?.fullDescription),
    ...localizedFields("appStore.storeListing.appName", appStore.storeListing?.appName),
    ...localizedFields("appStore.storeListing.subtitle", appStore.storeListing?.subtitle),
    ...localizedFields("appStore.storeListing.description", appStore.storeListing?.description),
    ...localizedFields("appStore.storeListing.keywords", appStore.storeListing?.keywords)
  ];
}

function field(fieldName, value) {
  return { field: fieldName, value: String(value ?? "") };
}

function localizedFields(prefix, values) {
  return Object.entries(values ?? {}).map(([locale, value]) => field(`${prefix}.${locale}`, value));
}

function countListingLocales() {
  const locales = new Set([
    ...Object.keys(googlePlay.storeListing?.appName ?? {}),
    ...Object.keys(appStore.storeListing?.appName ?? {})
  ]);
  return locales.size;
}

function formatCategory(category) {
  if (!category || typeof category !== "object") {
    return "";
  }
  return [category.primary, category.primarySubcategory, category.secondarySubcategory].filter(Boolean).join(" / ");
}

function plain(value) {
  return String(value ?? "").replace(/\n/g, "<br>");
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function printReport() {
  console.log(checkOnly ? "Rating content inventory check" : "Rating content inventory");
  console.log(checkOnly ? "==============================" : "========================");
  console.log("");
  console.log(`Inventory: ${inventoryPath}`);
  console.log(`Manual QA build ID: ${manifest.manualQaBuildId}`);
  console.log("");
  printSection("Failures", failures);
  console.log(failures.length === 0 ? "Rating content inventory checks: PASS" : "Rating content inventory checks: FAIL");
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
