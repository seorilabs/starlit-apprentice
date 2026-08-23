import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import {
  ACTIONS,
  ACTION_CATEGORY_LABELS,
  ENDINGS,
  STAT_KEYS,
  STAT_LABELS
} from "../product-core-ts/dist/index.js";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const failures = [];
const warnings = [];

const spec = readJson("legacy/specs/starlit-apprentice.json");
const statKeys = new Set(STAT_KEYS);
const actionIds = new Set(ACTIONS.map((action) => action.id));
const actionFlags = new Set(ACTIONS.map((action) => action.flag));
const categoryFlags = new Set(Object.keys(ACTION_CATEGORY_LABELS).map((category) => `category:${category}`));
const knownEndingFlags = new Set([...actionFlags, ...categoryFlags]);

checkStatLabels();
checkStaticRegistries();
checkActions();
checkActionIcons();
checkEndings();
checkPolicyCopy();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkStatLabels() {
  for (const stat of STAT_KEYS) {
    if (!isNonEmptyString(STAT_LABELS[stat])) {
      failures.push(`Missing stat label for ${stat}.`);
    }
  }
  for (const stat of Object.keys(STAT_LABELS)) {
    if (!statKeys.has(stat)) {
      failures.push(`STAT_LABELS contains unknown stat: ${stat}.`);
    }
  }
}

function checkStaticRegistries() {
  const firstAction = ACTIONS[0];
  const requirements = ENDINGS.flatMap((ending) => ending.requirements ?? []);
  const endingWithRequirements = ENDINGS.find((ending) => ending.requirements?.length);

  if (!Object.isFrozen(STAT_LABELS)) {
    failures.push("STAT_LABELS must be frozen at runtime.");
  }
  if (!Object.isFrozen(ACTION_CATEGORY_LABELS)) {
    failures.push("ACTION_CATEGORY_LABELS must be frozen at runtime.");
  }
  if (!Object.isFrozen(ACTIONS)) {
    failures.push("ACTIONS registry must be frozen at runtime.");
  }
  if (!firstAction || !Object.isFrozen(firstAction) || !Object.isFrozen(firstAction.statEffects)) {
    failures.push("ACTIONS entries and statEffects must be frozen at runtime.");
  }
  if (!Object.isFrozen(ENDINGS)) {
    failures.push("ENDINGS registry must be frozen at runtime.");
  }
  if (!endingWithRequirements || !Object.isFrozen(endingWithRequirements.requirements)) {
    failures.push("Ending requirement lists must be frozen at runtime.");
  }
  for (const requirement of requirements) {
    if (!Object.isFrozen(requirement)) {
      failures.push("Ending requirements must be frozen at runtime.");
      break;
    }
    if (requirement.type === "flag-sum" && !Object.isFrozen(requirement.flags)) {
      failures.push("flag-sum requirement flags must be frozen at runtime.");
    }
    if (requirement.type === "average" && !Object.isFrozen(requirement.stats)) {
      failures.push("average requirement stats must be frozen at runtime.");
    }
  }
}

function checkActions() {
  if (ACTIONS.length !== 19) {
    failures.push(`Expected 19 schedule actions, got ${ACTIONS.length}.`);
  }
  requireUnique("action id", ACTIONS.map((action) => action.id));
  requireUnique("action flag", ACTIONS.map((action) => action.flag));

  const categoryCounts = new Map(Object.keys(ACTION_CATEGORY_LABELS).map((category) => [category, 0]));
  for (const action of ACTIONS) {
    if (!/^[a-z][a-z0-9-]*$/.test(action.id)) {
      failures.push(`Action id must be kebab-case: ${action.id}.`);
    }
    if (!Object.hasOwn(ACTION_CATEGORY_LABELS, action.category)) {
      failures.push(`${action.id} has unknown category: ${action.category}.`);
      continue;
    }
    categoryCounts.set(action.category, (categoryCounts.get(action.category) ?? 0) + 1);
    if (action.flag !== `${action.category}:${action.id}`) {
      failures.push(`${action.id} flag must be ${action.category}:${action.id}, got ${action.flag}.`);
    }
    for (const field of ["label", "shortLabel", "place", "description"]) {
      if (!isNonEmptyString(action[field])) {
        failures.push(`${action.id}.${field} must be non-empty.`);
      }
    }
    if (stringLength(action.shortLabel) > 6) {
      warnings.push(`${action.id}.shortLabel is longer than 6 characters.`);
    }
    const effects = Object.entries(action.statEffects ?? {});
    if (effects.length === 0) {
      failures.push(`${action.id} must affect at least one stat.`);
    }
    for (const [stat, value] of effects) {
      if (!statKeys.has(stat)) {
        failures.push(`${action.id} uses unknown stat effect: ${stat}.`);
      }
      if (!Number.isInteger(value) || value < 0 || value > 12) {
        failures.push(`${action.id}.${stat} effect must be an integer between 0 and 12, got ${value}.`);
      }
    }
    for (const [field, value] of Object.entries({
      goldDelta: action.goldDelta,
      energyDelta: action.energyDelta,
      stressDelta: action.stressDelta
    })) {
      if (!Number.isInteger(value)) {
        failures.push(`${action.id}.${field} must be an integer, got ${value}.`);
      }
    }
    checkCategoryEconomy(action);
  }

  for (const [category, count] of categoryCounts) {
    if (count === 0) {
      failures.push(`Action category has no actions: ${category}.`);
    }
  }
}

function checkCategoryEconomy(action) {
  if (action.category === "lesson" && action.goldDelta >= 0) {
    failures.push(`${action.id} lesson action must cost gold.`);
  }
  if (action.category === "work" && action.goldDelta <= 0) {
    failures.push(`${action.id} work action must earn gold.`);
  }
  if (action.category === "rest" && (action.energyDelta <= 0 || action.stressDelta >= 0)) {
    failures.push(`${action.id} rest action must recover energy and reduce stress.`);
  }
  if (action.category === "outing" && action.stressDelta > 0) {
    failures.push(`${action.id} outing action must not increase stress in the MVP economy.`);
  }
}

function checkActionIcons() {
  const iconDir = resolve(repoRoot, "legacy/web-app/src/assets/action-icons");
  const iconFiles = readdirSync(iconDir).filter((file) => extname(file) === ".svg");
  const iconIds = new Set(iconFiles.map((file) => basename(file, ".svg")));

  for (const action of ACTIONS) {
    const iconPath = resolve(iconDir, `${action.id}.svg`);
    if (!existsSync(iconPath)) {
      failures.push(`Missing action icon: ${action.id}.svg`);
      continue;
    }
    const text = readFileSync(iconPath, "utf8");
    if (!text.includes("<svg") || statSync(iconPath).size < 120) {
      failures.push(`Action icon is not a usable SVG: ${action.id}.svg`);
    }
  }
  for (const iconId of iconIds) {
    if (!actionIds.has(iconId)) {
      failures.push(`Orphan action icon without ACTIONS entry: ${iconId}.svg`);
    }
  }
}

function checkEndings() {
  if (ENDINGS.length !== spec.mvp?.endingCount) {
    failures.push(`Expected ${spec.mvp?.endingCount} endings from spec, got ${ENDINGS.length}.`);
  }
  requireUnique("ending code", ENDINGS.map((ending) => ending.code));
  requireUnique("ending title", ENDINGS.map((ending) => ending.title));

  const fallback = ENDINGS.find((ending) => ending.code === "quiet-life");
  if (!fallback) {
    failures.push("Missing fallback ending: quiet-life.");
  } else if (fallback.requirements?.length) {
    failures.push("Fallback ending quiet-life must not have explicit requirements.");
  }

  for (const ending of ENDINGS) {
    if (!/^[a-z][a-z0-9-]*$/.test(ending.code)) {
      failures.push(`Ending code must be kebab-case: ${ending.code}.`);
    }
    for (const field of ["title", "summary", "shareText", "hint"]) {
      if (!isNonEmptyString(ending[field])) {
        failures.push(`${ending.code}.${field} must be non-empty.`);
      }
    }
    if (stringLength(ending.title) > 16) {
      warnings.push(`${ending.code}.title is longer than 16 characters.`);
    }
    if (ending.code !== "quiet-life" && (!Array.isArray(ending.requirements) || ending.requirements.length === 0)) {
      failures.push(`${ending.code} must include at least one requirement.`);
    }
    for (const requirement of ending.requirements ?? []) {
      checkEndingRequirement(ending.code, requirement);
    }
  }
}

function checkEndingRequirement(endingCode, requirement) {
  if (!Number.isInteger(requirement.target) || requirement.target <= 0) {
    failures.push(`${endingCode} requirement target must be a positive integer.`);
  }
  if (requirement.type === "stat") {
    checkRequirementDirection(endingCode, requirement, ["at-least"]);
    if (!statKeys.has(requirement.stat)) {
      failures.push(`${endingCode} uses unknown stat requirement: ${requirement.stat}.`);
    }
    if (requirement.target > 100) {
      failures.push(`${endingCode}.${requirement.stat} target exceeds stat cap: ${requirement.target}.`);
    }
    return;
  }
  if (requirement.type === "average") {
    checkRequirementDirection(endingCode, requirement, ["at-least"]);
    if (!Array.isArray(requirement.stats) || requirement.stats.length === 0) {
      failures.push(`${endingCode} average requirement must include stats.`);
    }
    for (const stat of requirement.stats ?? []) {
      if (!statKeys.has(stat)) {
        failures.push(`${endingCode} average requirement uses unknown stat: ${stat}.`);
      }
    }
    if (requirement.target > 100) {
      failures.push(`${endingCode} average target exceeds stat cap: ${requirement.target}.`);
    }
    return;
  }
  if (requirement.type === "resource") {
    checkRequirementDirection(endingCode, requirement, ["at-least", "at-most"]);
    if (!["gold", "energy", "stress"].includes(requirement.resource)) {
      failures.push(`${endingCode} uses unknown resource requirement: ${requirement.resource}.`);
    }
    if (["energy", "stress"].includes(requirement.resource) && requirement.target > 100) {
      failures.push(`${endingCode}.${requirement.resource} target exceeds resource cap: ${requirement.target}.`);
    }
    return;
  }
  if (requirement.type === "flag") {
    checkRequirementDirection(endingCode, requirement, ["at-least"]);
    if (!knownEndingFlags.has(requirement.flag)) {
      failures.push(`${endingCode} uses unknown flag requirement: ${requirement.flag}.`);
    }
    if (!isNonEmptyString(requirement.label)) {
      failures.push(`${endingCode} flag requirement must include a label.`);
    }
    return;
  }
  if (requirement.type === "flag-sum") {
    checkRequirementDirection(endingCode, requirement, ["at-least"]);
    if (!Array.isArray(requirement.flags) || requirement.flags.length === 0) {
      failures.push(`${endingCode} flag-sum requirement must include flags.`);
    }
    for (const flag of requirement.flags ?? []) {
      if (!knownEndingFlags.has(flag)) {
        failures.push(`${endingCode} uses unknown flag-sum flag: ${flag}.`);
      }
    }
    if (!isNonEmptyString(requirement.label)) {
      failures.push(`${endingCode} flag-sum requirement must include a label.`);
    }
    return;
  }
  failures.push(`${endingCode} uses unknown requirement type: ${requirement.type}.`);
}

function checkRequirementDirection(endingCode, requirement, allowedDirections) {
  if (requirement.direction === undefined || allowedDirections.includes(requirement.direction)) {
    return;
  }
  failures.push(`${endingCode}.${requirement.type} requirement has unsupported direction: ${String(requirement.direction)}.`);
}

function checkPolicyCopy() {
  const forbiddenCopyPatterns = [
    /프린세스\s*메이커/i,
    /무사수행/,
    /던전/,
    /전투/,
    /결혼\s*엔딩/,
    /가족\s*로맨스/
  ];
  const texts = [
    ...ACTIONS.flatMap((action) => [action.label, action.shortLabel, action.place, action.description]),
    ...ENDINGS.flatMap((ending) => [ending.title, ending.summary, ending.shareText, ending.hint])
  ];
  for (const text of texts) {
    for (const pattern of forbiddenCopyPatterns) {
      if (pattern.test(text)) {
        failures.push(`Game content contains forbidden scoped copy ${pattern}: ${JSON.stringify(text)}.`);
      }
    }
  }
}

function requireUnique(label, values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      failures.push(`Duplicate ${label}: ${value}.`);
    }
    seen.add(value);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stringLength(value) {
  return [...String(value)].length;
}

function printReport() {
  console.log("Content integrity check");
  console.log("=======================");
  console.log("");
  printSection("Failures", failures);
  printSection("Warnings", warnings);
  console.log(failures.length === 0 ? "Content integrity checks: PASS" : "Content integrity checks: FAIL");
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
