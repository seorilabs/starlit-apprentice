import {
  ACTIONS,
  ENDINGS,
  MAX_MONTH,
  SLOTS_PER_MONTH,
  advanceMonth,
  createNewRun,
  getSchedulePlanStatus,
  resolveNextSlot,
  selectSchedule
} from "../packages/product-core/dist/index.js";

const actionIds = new Set(ACTIONS.map((action) => action.id));
const expectedEndingCodes = new Set(ENDINGS.map((ending) => ending.code));
const failures = [];
const FINAL_ENERGY_MIN = 20;
const FINAL_STRESS_MAX = 80;

const routePlans = {
  scholar: [
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ...repeat(4, ["letters", "library-help", "home-rest", "sleep-in"]),
    ...repeat(7, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  ],
  "court-scribe": [
    ...repeat(5, ["letters", "manners", "tea-service", "home-rest"]),
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["letters", "plaza", "plaza", "home-rest"]),
    ...repeat(4, ["tea-service", "plaza", "home-rest", "sleep-in"])
  ],
  artisan: [
    ...repeat(2, ["crafts", "crafts", "home-rest", "sleep-in"]),
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["crafts", "crafts", "home-rest", "sleep-in"]),
    ...repeat(7, ["workshop-errand", "home-rest", "sleep-in", "home-rest"])
  ],
  performer: [
    ...repeat(2, ["music", "music", "home-rest", "sleep-in"]),
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["music", "music", "home-rest", "sleep-in"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["music", "music", "home-rest", "sleep-in"],
    ...repeat(5, ["theater-crew", "home-rest", "sleep-in", "home-rest"])
  ],
  merchant: repeat(12, ["tea-service", "scribe-aide", "home-rest", "sleep-in"]),
  mentor: [
    ["letters", "music", "tea-service", "home-rest"],
    ["tea-service", "garden-care", "home-rest", "sleep-in"],
    ["manners", "crafts", "workshop-errand", "home-rest"],
    ["tea-service", "garden-care", "home-rest", "sleep-in"],
    ["stamina-drill", "letters", "garden-care", "home-rest"],
    ["tea-service", "garden-care", "home-rest", "sleep-in"],
    ["music", "manners", "tea-service", "home-rest"],
    ["tea-service", "garden-care", "home-rest", "sleep-in"],
    ["crafts", "stamina-drill", "workshop-errand", "home-rest"],
    ["letters", "manners", "garden-care", "home-rest"],
    ["music", "crafts", "tea-service", "home-rest"],
    ["stamina-drill", "workshop-errand", "home-rest", "sleep-in"]
  ],
  wanderer: [
    ...repeat(3, ["park", "plaza", "market", "library"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["park", "plaza", "market", "library"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["park", "plaza", "market", "library"],
    ["music", "home-rest", "sleep-in", "park"],
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["music", "home-rest", "sleep-in", "park"]),
    ["library-help", "library-help", "home-rest", "sleep-in"]
  ],
  "royal-diplomat": [
    ...repeat(6, ["tea-service", "tea-service", "plaza", "home-rest"]),
    ...repeat(4, ["manners", "plaza", "tea-service", "sleep-in"]),
    ...repeat(2, ["tea-service", "plaza", "home-rest", "sleep-in"])
  ],
  "observatory-director": [
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["library-help", "tea-service", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ["tea-service", "tea-service", "tea-service", "home-rest"],
    ["star-lore", "star-lore", "star-lore", "home-rest"]
  ],
  "star-priest": [
    ["star-lore", "star-lore", "park", "home-rest"],
    ["tea-service", "manners", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "park", "home-rest"],
    ["garden-care", "garden-care", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "park", "home-rest"],
    ["garden-care", "garden-care", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "park", "home-rest"],
    ["garden-care", "garden-care", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "park", "home-rest"],
    ["garden-care", "garden-care", "home-rest", "sleep-in"],
    ["star-lore", "star-lore", "park", "home-rest"],
    ["garden-care", "garden-care", "home-rest", "sleep-in"]
  ],
  spellwright: [
    ["star-lore", "crafts", "crafts", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["star-lore", "crafts", "crafts", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["star-lore", "crafts", "crafts", "home-rest"],
    ...repeat(6, ["library-help", "star-lore", "home-rest", "sleep-in"]),
    ["star-lore", "crafts", "home-rest", "sleep-in"]
  ],
  "guild-master": [
    ["garden-care", "garden-care", "tea-service", "market"],
    ["tea-service", "plaza", "home-rest", "sleep-in"],
    ...repeat(2, ["garden-care", "garden-care", "tea-service", "market"]),
    ["garden-care", "home-rest", "home-rest", "sleep-in"],
    ...repeat(4, ["garden-care", "tea-service", "market", "home-rest"]),
    ...repeat(3, ["garden-care", "home-rest", "sleep-in", "tea-service"])
  ],
  "tea-house-owner": [
    ...repeat(8, ["tea-service", "tea-service", "market", "home-rest"]),
    ...repeat(4, ["tea-service", "market", "home-rest", "sleep-in"])
  ],
  "festival-planner": [
    ...repeat(2, ["plaza", "plaza", "music", "home-rest"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ...repeat(2, ["plaza", "plaza", "music", "home-rest"]),
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["plaza", "plaza", "music", "home-rest"]),
    ...repeat(4, ["plaza", "music", "garden-care", "sleep-in"])
  ],
  healer: [
    ...repeat(2, ["park", "park", "music", "home-rest"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ...repeat(2, ["park", "park", "music", "home-rest"]),
    ["garden-care", "garden-care", "library-help", "home-rest"],
    ...repeat(2, ["park", "park", "music", "home-rest"]),
    ["park", "garden-care", "home-rest", "home-rest"],
    ["park", "park", "music", "home-rest"],
    ["library-help", "garden-care", "home-rest", "sleep-in"],
    ["park", "home-rest", "sleep-in", "sleep-in"]
  ],
  "garden-architect": [
    ...repeat(8, ["garden-care", "crafts", "park", "home-rest"]),
    ...repeat(4, ["garden-care", "crafts", "home-rest", "sleep-in"])
  ],
  bookbinder: [
    ...repeat(7, ["library-help", "crafts", "home-rest", "sleep-in"]),
    ...repeat(5, ["library-help", "home-rest", "sleep-in", "home-rest"])
  ],
  cartographer: [
    ...repeat(8, ["library", "library", "home-rest", "sleep-in"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["library", "library", "home-rest", "sleep-in"],
    ...repeat(2, ["library", "home-rest", "sleep-in", "park"])
  ],
  "travel-writer": [
    ["music", "letters", "park", "library"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["music", "letters", "park", "library"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["music", "letters", "home-rest", "sleep-in"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["music", "letters", "home-rest", "sleep-in"],
    ...repeat(3, ["park", "library", "home-rest", "sleep-in"]),
    ...repeat(2, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  ],
  "academy-professor": [
    ["letters", "letters", "letters", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["letters", "letters", "letters", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["letters", "letters", "letters", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["letters", "letters", "letters", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["letters", "letters", "letters", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["letters", "letters", "letters", "home-rest"]
  ],
  "city-councilor": [
    ...repeat(7, ["garden-care", "plaza", "tea-service", "home-rest"]),
    ...repeat(3, ["plaza", "plaza", "tea-service", "sleep-in"]),
    ...repeat(2, ["tea-service", "tea-service", "tea-service", "home-rest"])
  ],
  "theater-director": [
    ...repeat(8, ["theater-crew", "music", "plaza", "home-rest"]),
    ...repeat(4, ["music", "theater-crew", "home-rest", "sleep-in"])
  ],
  inventor: [
    ["crafts", "crafts", "music", "letters"],
    ...repeat(2, ["library-help", "library-help", "home-rest", "sleep-in"]),
    ["crafts", "crafts", "music", "letters"],
    ["library-help", "library-help", "library-help", "home-rest"],
    ["crafts", "crafts", "music", "letters"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["library-help", "library-help", "theater-crew", "home-rest"],
    ...repeat(4, ["crafts", "home-rest", "sleep-in", "home-rest"])
  ],
  "market-analyst": [
    ...repeat(8, ["market", "market", "library-help", "home-rest"]),
    ...repeat(4, ["market", "letters", "home-rest", "sleep-in"])
  ],
  "civic-organizer": [
    ...repeat(8, ["park", "garden-care", "plaza", "home-rest"]),
    ...repeat(4, ["park", "garden-care", "market", "sleep-in"])
  ],
  "guardian-guide": [
    ...repeat(2, ["stamina-drill", "stamina-drill", "park", "garden-care"]),
    ["library-help", "home-rest", "home-rest", "sleep-in"],
    ...repeat(2, ["stamina-drill", "stamina-drill", "park", "garden-care"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["stamina-drill", "stamina-drill", "park", "garden-care"],
    ...repeat(2, ["library-help", "stamina-drill", "home-rest", "sleep-in"]),
    ["home-rest", "stamina-drill", "home-rest", "sleep-in"],
    ...repeat(2, ["library-help", "stamina-drill", "home-rest", "sleep-in"])
  ],
  "etiquette-master": [
    ...repeat(2, ["manners", "manners", "park", "home-rest"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["manners", "manners", "park", "home-rest"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["manners", "manners", "park", "home-rest"],
    ["library-help", "library-help", "scribe-aide", "home-rest"],
    ["manners", "manners", "park", "home-rest"],
    ["manners", "park", "home-rest", "sleep-in"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ...repeat(2, ["manners", "park", "home-rest", "sleep-in"])
  ],
  "workshop-founder": [
    ["crafts", "workshop-errand", "market", "library-help"],
    ["tea-service", "tea-service", "home-rest", "sleep-in"],
    ...repeat(2, ["crafts", "workshop-errand", "market", "library-help"]),
    ["library-help", "home-rest", "home-rest", "sleep-in"],
    ["crafts", "workshop-errand", "market", "library-help"],
    ...repeat(6, ["workshop-errand", "market", "home-rest", "sleep-in"])
  ],
  "archive-detective": [
    ["letters", "letters", "stamina-drill", "crafts"],
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ...repeat(2, ["library-help", "stamina-drill", "home-rest", "sleep-in"]),
    ["library-help", "library-help", "home-rest", "sleep-in"],
    ["letters", "letters", "stamina-drill", "crafts"],
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["letters", "stamina-drill", "home-rest", "sleep-in"]),
    ["library-help", "library-help", "library-help", "home-rest"],
    ...repeat(2, ["letters", "stamina-drill", "home-rest", "sleep-in"])
  ],
  "quiet-life": repeat(12, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
};

checkCoverage();
checkRoutes();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkCoverage() {
  for (const endingCode of expectedEndingCodes) {
    if (!routePlans[endingCode]) {
      failures.push(`missing route plan for ending: ${endingCode}`);
    }
  }
  for (const endingCode of Object.keys(routePlans)) {
    if (!expectedEndingCodes.has(endingCode)) {
      failures.push(`route plan references unknown ending: ${endingCode}`);
    }
  }
}

function checkRoutes() {
  for (const [endingCode, months] of Object.entries(routePlans)) {
    if (months.length !== MAX_MONTH) {
      failures.push(`${endingCode} route must contain ${MAX_MONTH} months, got ${months.length}.`);
      continue;
    }

    for (const [monthIndex, actions] of months.entries()) {
      if (actions.length !== SLOTS_PER_MONTH) {
        failures.push(`${endingCode} month ${monthIndex + 1} must contain ${SLOTS_PER_MONTH} actions.`);
      }
      for (const actionId of actions) {
        if (!actionIds.has(actionId)) {
          failures.push(`${endingCode} month ${monthIndex + 1} uses unknown action: ${actionId}`);
        }
      }
    }

    const run = playRoute(months);
    if (run.endingCode !== endingCode) {
      failures.push(`${endingCode} route reached ${run.endingCode ?? "no-ending"} instead.`);
      continue;
    }
    if (run.energy < FINAL_ENERGY_MIN) {
      failures.push(`${endingCode} route ended below final energy guardrail: ${run.energy}/${FINAL_ENERGY_MIN}.`);
      continue;
    }
    if (run.stress > FINAL_STRESS_MAX) {
      failures.push(`${endingCode} route ended above final stress guardrail: ${run.stress}/${FINAL_STRESS_MAX}.`);
      continue;
    }
    console.log(
      `OK ${endingCode}: ${run.history.length} weeks, gold ${run.gold}, stress ${run.stress}, energy ${run.energy}`
    );
  }
}

function playRoute(months) {
  let run = createNewRun(1);
  for (const [monthIndex, actions] of months.entries()) {
    const planStatus = getSchedulePlanStatus(run, actions);
    if (!planStatus.isValid) {
      failures.push(
        `route month is not selectable under current resources: month ${monthIndex + 1}, actions ${actions.join(", ")}, blockers ${planStatus.blockers.join(", ")}, start gold ${run.gold}, start energy ${run.energy}, forecast gold ${planStatus.forecast.gold}, forecast energy ${planStatus.forecast.energy}`
      );
    }
    run = selectSchedule(run, actions);
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      run = resolveNextSlot(run).run;
    }
    run = advanceMonth(run);
  }
  return run;
}

function repeat(count, actions) {
  return Array.from({ length: count }, () => [...actions]);
}

function printReport() {
  console.log("");
  console.log("Ending reachability check");
  console.log("=========================");
  if (failures.length === 0) {
    console.log(
      `PASS: ${Object.keys(routePlans).length} ending route(s) stayed selectable, reached their expected ending, and met final resource guardrails.`
    );
  } else {
    console.log("FAIL");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  }
}
