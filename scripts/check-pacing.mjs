import {
  ACTIONS,
  SLOTS_PER_MONTH,
  advanceMonth,
  createNewRun,
  getEndingProgress,
  getSchedulePlanStatus,
  resolveNextSlot,
  selectSchedule
} from "../packages/product-core/dist/index.js";
import { pacingPlans } from "./qa-route-plans.mjs";

const actionIds = new Set(ACTIONS.map((action) => action.id));
const failures = [];

const MONTHS_TO_CHECK = 3;
const FIRST_MONTH_MIN_STAT_GAIN = 15;
const THREE_MONTH_MIN_STAT_GAIN = 75;
const FIRST_MONTH_MIN_TOP_PROGRESS = 60;
const THREE_MONTH_MIN_TOP_PROGRESS = 70;
const MIN_ROUTE_CATEGORY_COUNT = 3;
const MIN_EVENTS_BY_THREE_MONTHS = 1;
const MONTH_ENERGY_MIN = 45;
const MONTH_STRESS_MAX = 60;
const FINAL_ENERGY_MIN = 60;
const FINAL_STRESS_MAX = 45;

checkPlans();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkPlans() {
  for (const [planId, plan] of Object.entries(pacingPlans)) {
    validatePlanShape(planId, plan.months);
    const summary = playPlan(planId, plan.months);
    if (summary) {
      checkPlanSummary(planId, plan, summary);
    }
  }
}

function validatePlanShape(planId, months) {
  if (months.length !== MONTHS_TO_CHECK) {
    failures.push(`${planId} must contain ${MONTHS_TO_CHECK} months, got ${months.length}.`);
    return;
  }

  for (const [monthIndex, actions] of months.entries()) {
    if (actions.length !== SLOTS_PER_MONTH) {
      failures.push(`${planId} month ${monthIndex + 1} must contain ${SLOTS_PER_MONTH} actions.`);
    }
    for (const actionId of actions) {
      if (!actionIds.has(actionId)) {
        failures.push(`${planId} month ${monthIndex + 1} uses unknown action: ${actionId}.`);
      }
    }
  }
}

function playPlan(planId, months) {
  let run = createNewRun(1);
  const initialStatTotal = statTotal(run);
  const monthSummaries = [];
  let totalEvents = 0;
  const categories = new Set();

  for (const [monthIndex, actions] of months.entries()) {
    const planStatus = getSchedulePlanStatus(run, actions);
    if (!planStatus.isValid) {
      failures.push(
        `${planId} month ${monthIndex + 1} is not selectable: ${actions.join(", ")}; blockers ${planStatus.blockers.join(", ")}, start gold ${run.gold}, start energy ${run.energy}, forecast gold ${planStatus.forecast.gold}, forecast energy ${planStatus.forecast.energy}`
      );
      return null;
    }
    try {
      run = selectSchedule(run, actions);
    } catch (error) {
      failures.push(`${planId} month ${monthIndex + 1} selectSchedule rejected the route: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    for (const actionId of actions) {
      categories.add(ACTIONS.find((action) => action.id === actionId)?.category);
    }

    let monthEvents = 0;
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      const result = resolveNextSlot(run);
      if (result.event) {
        monthEvents += 1;
      }
      run = result.run;
    }

    totalEvents += monthEvents;
    const topEnding = getEndingProgress(run)[0];
    monthSummaries.push({
      month: run.month,
      gold: run.gold,
      energy: run.energy,
      stress: run.stress,
      statGain: statTotal(run) - initialStatTotal,
      topEndingCode: topEnding?.ending.code ?? "none",
      topEndingProgress: topEnding?.progress ?? 0,
      events: monthEvents
    });

    run = advanceMonth(run);
  }

  const finalTopEnding = getEndingProgress(run)[0];
  return {
    run,
    initialStatTotal,
    monthSummaries,
    totalEvents,
    categoryCount: categories.size,
    finalTopEndingCode: finalTopEnding?.ending.code ?? "none",
    finalTopEndingProgress: finalTopEnding?.progress ?? 0,
    finalStatGain: statTotal(run) - initialStatTotal
  };
}

function checkPlanSummary(planId, plan, summary) {
  const firstMonth = summary.monthSummaries[0];
  const thirdMonth = summary.monthSummaries[2];

  if (summary.run.month !== 4 || summary.run.slotIndex !== 0 || summary.run.currentSchedule.length !== 0) {
    failures.push(`${planId} must finish three completed months and reset to month 4 schedule selection.`);
  }
  if (summary.run.history.length !== MONTHS_TO_CHECK * SLOTS_PER_MONTH) {
    failures.push(`${planId} must produce ${MONTHS_TO_CHECK * SLOTS_PER_MONTH} weekly history entries.`);
  }
  if (summary.categoryCount < MIN_ROUTE_CATEGORY_COUNT) {
    failures.push(`${planId} must use at least ${MIN_ROUTE_CATEGORY_COUNT} action categories in the first three months.`);
  }
  if (summary.totalEvents < MIN_EVENTS_BY_THREE_MONTHS) {
    failures.push(`${planId} must surface at least ${MIN_EVENTS_BY_THREE_MONTHS} event by month 3.`);
  }

  for (const month of summary.monthSummaries) {
    if (month.gold < 0) {
      failures.push(`${planId} month ${month.month} dropped below zero gold.`);
    }
    if (month.energy < MONTH_ENERGY_MIN) {
      failures.push(`${planId} month ${month.month} ended below energy pacing guardrail: ${month.energy}/${MONTH_ENERGY_MIN}.`);
    }
    if (month.stress > MONTH_STRESS_MAX) {
      failures.push(`${planId} month ${month.month} ended above stress pacing guardrail: ${month.stress}/${MONTH_STRESS_MAX}.`);
    }
  }

  if (firstMonth.statGain < FIRST_MONTH_MIN_STAT_GAIN) {
    failures.push(`${planId} first month stat gain too low: ${firstMonth.statGain}/${FIRST_MONTH_MIN_STAT_GAIN}.`);
  }
  if (firstMonth.topEndingProgress < FIRST_MONTH_MIN_TOP_PROGRESS) {
    failures.push(
      `${planId} first month top ending progress too low: ${firstMonth.topEndingProgress}/${FIRST_MONTH_MIN_TOP_PROGRESS}.`
    );
  }
  if (summary.finalStatGain < THREE_MONTH_MIN_STAT_GAIN) {
    failures.push(`${planId} three-month stat gain too low: ${summary.finalStatGain}/${THREE_MONTH_MIN_STAT_GAIN}.`);
  }
  if (summary.run.energy < FINAL_ENERGY_MIN) {
    failures.push(`${planId} final energy below three-month guardrail: ${summary.run.energy}/${FINAL_ENERGY_MIN}.`);
  }
  if (summary.run.stress > FINAL_STRESS_MAX) {
    failures.push(`${planId} final stress above three-month guardrail: ${summary.run.stress}/${FINAL_STRESS_MAX}.`);
  }
  if (summary.finalTopEndingCode !== plan.expectedTopEnding) {
    failures.push(`${planId} top ending after three months should be ${plan.expectedTopEnding}, got ${summary.finalTopEndingCode}.`);
  }
  if (summary.finalTopEndingProgress < THREE_MONTH_MIN_TOP_PROGRESS) {
    failures.push(
      `${planId} three-month top ending progress too low: ${summary.finalTopEndingProgress}/${THREE_MONTH_MIN_TOP_PROGRESS}.`
    );
  }

  console.log(
    `OK ${planId}: month1 +${firstMonth.statGain} stats/${firstMonth.topEndingProgress}% top, ` +
      `month3 ${summary.finalTopEndingCode} ${summary.finalTopEndingProgress}%, events ${summary.totalEvents}, ` +
      `gold ${thirdMonth.gold}, stress ${summary.run.stress}, energy ${summary.run.energy}`
  );
}

function statTotal(run) {
  return Object.values(run.stats).reduce((sum, value) => sum + value, 0);
}

function printReport() {
  console.log("");
  console.log("Early pacing check");
  console.log("==================");
  if (failures.length === 0) {
    console.log(
      `PASS: ${Object.keys(pacingPlans).length} first-three-month route(s) met early growth, resource, event, and ending-progress guardrails.`
    );
  } else {
    console.log("FAIL");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  }
}
