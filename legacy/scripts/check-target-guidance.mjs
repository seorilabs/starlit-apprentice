import {
  ACTIONS,
  ENDINGS,
  createNewRun,
  createTargetedRun,
  getEndingActionRecommendations,
  getEndingProgress,
  getSchedulePlanStatus
} from "../product-core-ts/dist/index.js";

const actionIds = new Set(ACTIONS.map((action) => action.id));
const specializedEndings = ENDINGS.filter((ending) => ending.code !== "quiet-life");
const failures = [];

for (const ending of specializedEndings) {
  const run = createTargetedRun(ending.code, 1);
  const progress = getEndingProgress(run).find((entry) => entry.ending.code === ending.code);
  const pendingRequirements = (ending.requirements ?? []).filter((_, index) => !progress?.requirements[index]?.satisfied);
  const recommendations = getEndingActionRecommendations(run, ending.code, 3);

  if (pendingRequirements.length === 0) {
    failures.push(`${ending.code} started with no pending requirements.`);
    continue;
  }
  if (recommendations.length === 0) {
    failures.push(`${ending.code} has no target action recommendations.`);
    continue;
  }

  for (const recommendation of recommendations) {
    if (!actionIds.has(recommendation.action.id)) {
      failures.push(`${ending.code} recommended unknown action: ${recommendation.action.id}`);
    }
    if (recommendation.score <= 0) {
      failures.push(`${ending.code}/${recommendation.action.id} has non-positive score: ${recommendation.score}`);
    }
    if (recommendation.reasons.length === 0) {
      failures.push(`${ending.code}/${recommendation.action.id} has no visible reason text.`);
    }
    if (!pendingRequirements.some((requirement) => actionImprovesRequirement(recommendation.action, requirement))) {
      failures.push(`${ending.code}/${recommendation.action.id} does not improve a pending requirement.`);
    }
    if (!getSchedulePlanStatus(run, [recommendation.action.id]).isValid) {
      failures.push(`${ending.code}/${recommendation.action.id} is not immediately selectable from a new targeted run.`);
    }
  }

  const completedRun = createRunForEnding(ending);
  const completedRecommendations = getEndingActionRecommendations(completedRun, ending.code);
  if (completedRecommendations.length > 0) {
    failures.push(`${ending.code} still recommends actions after all requirements are satisfied.`);
  }
}

checkAffordabilityFiltering();
checkPlannedActionGuards();

if (failures.length > 0) {
  console.error("Target guidance check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`PASS: ${specializedEndings.length} specialized ending target guidance paths have actionable recommendations.`);

function checkAffordabilityFiltering() {
  const lowGoldScholar = {
    ...createTargetedRun("scholar", 1),
    gold: 0
  };
  const lowGoldRecommendations = getEndingActionRecommendations(lowGoldScholar, "scholar", 3);
  for (const recommendation of lowGoldRecommendations) {
    if (!getSchedulePlanStatus(lowGoldScholar, [recommendation.action.id]).isValid) {
      failures.push(`low-resource scholar recommendation is not selectable: ${recommendation.action.id}`);
    }
  }
  if (lowGoldRecommendations.some((recommendation) => recommendation.action.id === "star-lore")) {
    failures.push("low-resource scholar guidance must not recommend unaffordable star-lore.");
  }

  const oneLessonBudget = {
    ...createTargetedRun("scholar", 1),
    gold: 40
  };
  const plannedRecommendations = getEndingActionRecommendations(oneLessonBudget, "scholar", 3, ["star-lore"]);
  for (const recommendation of plannedRecommendations) {
    if (!getSchedulePlanStatus(oneLessonBudget, ["star-lore", recommendation.action.id]).isValid) {
      failures.push(`planned scholar recommendation is not selectable after star-lore: ${recommendation.action.id}`);
    }
  }
  if (plannedRecommendations.some((recommendation) => recommendation.action.id === "star-lore")) {
    failures.push("planned scholar guidance must not recommend a second unaffordable star-lore.");
  }
}

function checkPlannedActionGuards() {
  const run = createTargetedRun("scholar", 1);
  expectThrows("target recommendations must reject unknown planned actions.", () => {
    getEndingActionRecommendations(run, "scholar", 3, ["unknown-action"]);
  });
  expectThrows("target recommendations must reject overfilled planned prefixes.", () => {
    getEndingActionRecommendations(run, "scholar", 3, [
      "home-rest",
      "sleep-in",
      "home-rest",
      "sleep-in",
      "park"
    ]);
  });
  expectThrows("target recommendations must reject non-array planned prefixes.", () => {
    getEndingActionRecommendations(run, "scholar", 3, "home-rest");
  });
}

function actionImprovesRequirement(action, requirement) {
  if (requirement.type === "stat") {
    return (action.statEffects[requirement.stat] ?? 0) > 0;
  }

  if (requirement.type === "average") {
    return requirement.stats.some((stat) => (action.statEffects[stat] ?? 0) > 0);
  }

  if (requirement.type === "flag") {
    return action.flag === requirement.flag || `category:${action.category}` === requirement.flag;
  }

  if (requirement.type === "flag-sum") {
    return requirement.flags.includes(action.flag) || requirement.flags.includes(`category:${action.category}`);
  }

  const direction = requirement.direction ?? "at-least";
  const delta = resourceDelta(action, requirement.resource);
  return direction === "at-most" ? delta < 0 : delta > 0;
}

function resourceDelta(action, resource) {
  if (resource === "gold") {
    return action.goldDelta;
  }
  if (resource === "energy") {
    return action.energyDelta;
  }
  return action.stressDelta;
}

function expectThrows(message, action) {
  try {
    action();
  } catch {
    return;
  }
  failures.push(message);
}

function createRunForEnding(ending) {
  const run = createNewRun(1);
  const stats = { ...run.stats };
  const flags = {};
  let gold = run.gold;
  let energy = run.energy;
  let stress = run.stress;

  for (const requirement of ending.requirements ?? []) {
    if (requirement.type === "stat") {
      stats[requirement.stat] = requirement.target;
    } else if (requirement.type === "resource") {
      if (requirement.resource === "gold") {
        gold = requirement.target;
      } else if (requirement.resource === "energy") {
        energy = requirement.target;
      } else {
        stress = requirement.target;
      }
    } else if (requirement.type === "flag") {
      flags[requirement.flag] = requirement.target;
    } else if (requirement.type === "flag-sum") {
      flags[requirement.flags[0]] = requirement.target;
    } else {
      for (const stat of requirement.stats) {
        stats[stat] = requirement.target;
      }
    }
  }

  return {
    ...run,
    gold,
    energy,
    stress,
    stats,
    flags
  };
}
