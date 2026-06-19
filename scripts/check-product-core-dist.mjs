import {
  ACTIONS,
  ACTION_CATEGORY_LABELS,
  ENDINGS,
  MAX_MONTH,
  SLOTS_PER_MONTH,
  STAT_LABELS,
  advanceMonth,
  buildPublicEndingShareUrl,
  createNewRun,
  createTargetedRun,
  getActionById,
  getApprenticeProfile,
  getEndingActionRecommendations,
  getEndingProgress,
  getEndingByCode,
  getMonthlyCoachingInsights,
  getSchedulePlanStatus,
  getScheduleResourceForecast,
  isBlockedPublicUrlHost,
  isPublicHttpsUrl,
  judgeEnding,
  loadCollection,
  loadRun,
  parsePublicHttpsUrl,
  resolveNextSlot,
  selectSchedule,
  serializeCollection,
  serializeRun
} from "../packages/product-core/dist/index.js";

const DAYS_PER_WEEK = 7;

if (ENDINGS.length < 8) {
  throw new Error(`Expected at least 8 endings, got ${ENDINGS.length}.`);
}

const firstAction = ACTIONS[0];
const firstEnding = ENDINGS[0];
const endingWithRequirements = ENDINGS.find((ending) => ending.requirements?.length);
const immutableRequirement = ENDINGS.flatMap((ending) => ending.requirements ?? []).find(
  (requirement) => requirement.type === "flag-sum" || requirement.type === "average"
);
if (
  !Object.isFrozen(STAT_LABELS) ||
  !Object.isFrozen(ACTION_CATEGORY_LABELS) ||
  !Object.isFrozen(ACTIONS) ||
  !Object.isFrozen(firstAction) ||
  !Object.isFrozen(firstAction.statEffects) ||
  !Object.isFrozen(ENDINGS) ||
  !endingWithRequirements ||
  !Object.isFrozen(endingWithRequirements.requirements)
) {
  throw new Error("Built product-core package did not freeze exported content registries.");
}
if (immutableRequirement?.type === "flag-sum" && !Object.isFrozen(immutableRequirement.flags)) {
  throw new Error("Built product-core package did not freeze flag-sum requirement flags.");
}
if (immutableRequirement?.type === "average" && !Object.isFrozen(immutableRequirement.stats)) {
  throw new Error("Built product-core package did not freeze average requirement stats.");
}
expectThrows("Built product-core package allowed exported actions list mutation.", () => {
  ACTIONS.push({ ...firstAction });
});
expectThrows("Built product-core package allowed exported action mutation.", () => {
  firstAction.goldDelta = 999;
});
expectThrows("Built product-core package allowed exported action stat-effect mutation.", () => {
  firstAction.statEffects.intellect = 999;
});
if (getActionById(firstAction.id) !== firstAction || !Object.isFrozen(getActionById(firstAction.id))) {
  throw new Error("Built product-core package did not expose immutable action registry lookup results.");
}
if (getEndingByCode(firstEnding.code) !== firstEnding || !Object.isFrozen(getEndingByCode(firstEnding.code))) {
  throw new Error("Built product-core package did not expose immutable ending registry lookup results.");
}
expectThrows("Built product-core package did not reject unknown action registry lookups.", () => {
  getActionById("unknown-action");
});
expectThrows("Built product-core package did not reject unknown ending registry lookups.", () => {
  getEndingByCode("unknown-ending");
});
if (createNewRun(7).rngSeed !== 7 || createTargetedRun("scholar", 11).rngSeed !== 11) {
  throw new Error("Built product-core package did not preserve explicit new-run seeds.");
}
for (const seed of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "7"]) {
  expectThrows(`Built product-core package did not reject malformed new-run seed: ${String(seed)}`, () => {
    createNewRun(seed);
  });
}
expectThrows("Built product-core package did not reject malformed targeted-run seeds.", () => {
  createTargetedRun("scholar", 1.5);
});
const zeroPersistSeedRun = selectSchedule(createNewRun(3725587800), [
  "home-rest",
  "sleep-in",
  "home-rest",
  "sleep-in"
]);
if (resolveNextSlot(zeroPersistSeedRun).run.rngSeed !== 1) {
  throw new Error("Built product-core package allowed slot resolution to persist rngSeed=0.");
}
expectThrows("Built product-core package did not reject future run save schema versions.", () => {
  loadRun({ ...createNewRun(1), version: 2 });
});
expectThrows("Built product-core package did not reject non-numeric run save schema versions.", () => {
  loadRun({ ...createNewRun(1), version: "1" });
});
expectThrowsWithMessage("Built product-core package did not reject malformed JSON run saves with a domain error.", () => {
  loadRun("{not-json");
}, "저장 데이터를 읽을 수 없습니다.");
expectThrows("Built product-core package did not reject future save-write run schema versions.", () => {
  serializeRun({ ...createNewRun(1), version: 2 });
});
expectThrowsWithMessage("Built product-core package did not reject non-object save-write run state.", () => {
  serializeRun(null);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrowsWithMessage("Built product-core package did not reject array save-write run state.", () => {
  serializeRun([]);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrows("Built product-core package did not reject non-numeric save-write run schema versions.", () => {
  serializeRun({ ...createNewRun(1), version: "1" });
});
expectThrows("Built product-core package did not reject missing save-write run schema versions.", () => {
  serializeRun({ ...createNewRun(1), version: undefined });
});
expectThrows("Built product-core package did not reject malformed save-write run state.", () => {
  serializeRun({ ...createNewRun(1), stats: { ...createNewRun(1).stats, intellect: Number.NaN } });
});
expectThrows("Built product-core package did not reject unsafe save-write RNG seeds.", () => {
  serializeRun({ ...createNewRun(1), rngSeed: Number.MAX_SAFE_INTEGER + 1 });
});
expectThrows("Built product-core package did not reject partial save-write schedules.", () => {
  serializeRun({ ...createNewRun(1), currentSchedule: ["letters", "music", "home-rest"] });
});
expectThrows("Built product-core package did not reject unknown save-write schedule actions.", () => {
  serializeRun({ ...createNewRun(1), currentSchedule: ["letters", "music", "home-rest", "unknown-action"] });
});
expectThrows("Built product-core package did not reject unknown save-write ending codes.", () => {
  serializeRun({ ...createNewRun(1), targetEndingCode: "unknown-ending" });
});
const saveWriteSelectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
const saveWriteInProgressRun = resolveNextSlot(resolveNextSlot(saveWriteSelectedRun).run).run;
let saveWriteEventRun = saveWriteSelectedRun;
for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
  saveWriteEventRun = resolveNextSlot(saveWriteEventRun).run;
}
expectThrows("Built product-core package did not reject non-array save-write history.", () => {
  serializeRun({ ...createNewRun(1), history: "bad-history" });
});
expectThrows("Built product-core package did not reject non-object save-write flags.", () => {
  serializeRun({ ...createNewRun(1), flags: "bad-flags" });
});
expectThrows("Built product-core package did not reject unknown save-write flags.", () => {
  serializeRun({ ...createNewRun(1), flags: { "unknown:flag": 1 } });
});
expectThrows("Built product-core package did not reject oversized save-write flags.", () => {
  serializeRun({
    ...createNewRun(1),
    flags: { "condition:exhausted": MAX_MONTH * SLOTS_PER_MONTH * DAYS_PER_WEEK + 1 }
  });
});
expectThrows("Built product-core package did not reject fractional save-write flags.", () => {
  serializeRun({ ...createNewRun(1), flags: { "condition:exhausted": 1.5 } });
});
expectThrows("Built product-core package did not reject negative save-write flags.", () => {
  serializeRun({ ...createNewRun(1), flags: { "condition:exhausted": -1 } });
});
expectThrows("Built product-core package did not reject inflated action progress save-write flags.", () => {
  serializeRun({
    ...saveWriteInProgressRun,
    flags: { ...saveWriteInProgressRun.flags, "lesson:star-lore": 1 }
  });
});
expectThrows("Built product-core package did not reject inflated category progress save-write flags.", () => {
  serializeRun({
    ...saveWriteInProgressRun,
    flags: { ...saveWriteInProgressRun.flags, "category:work": 1 }
  });
});
expectThrows("Built product-core package did not reject future save-write history entries.", () => {
  serializeRun({
    ...saveWriteInProgressRun,
    history: [...saveWriteInProgressRun.history, { ...saveWriteInProgressRun.history[0], month: 12, slot: 4 }]
  });
});
expectThrows("Built product-core package did not reject unknown save-write history actions.", () => {
  serializeRun({
    ...saveWriteInProgressRun,
    history: [{ ...saveWriteInProgressRun.history[0], actionId: "unknown-action" }, saveWriteInProgressRun.history[1]]
  });
});
expectThrows("Built product-core package did not reject mismatched save-write history action labels.", () => {
  serializeRun({
    ...saveWriteInProgressRun,
    history: [{ ...saveWriteInProgressRun.history[0], actionLabel: "온천권 사용" }, saveWriteInProgressRun.history[1]]
  });
});
expectThrows("Built product-core package did not reject malformed save-write history daily outcomes.", () => {
  serializeRun({
    ...saveWriteInProgressRun,
    history: [
      {
        ...saveWriteInProgressRun.history[0],
        dailyOutcomes: [{ ...saveWriteInProgressRun.history[0].dailyOutcomes[0], day: 99 }]
      },
      saveWriteInProgressRun.history[1]
    ]
  });
});
expectThrows("Built product-core package did not reject malformed save-write history event effects.", () => {
  serializeRun({
    ...saveWriteEventRun,
    history: saveWriteEventRun.history.map((entry, index) =>
      index === SLOTS_PER_MONTH - 1
        ? {
            ...entry,
            event: {
              ...entry.event,
              effects: { ...entry.event.effects, stats: { reputation: Number.NaN } }
            }
          }
        : entry
    )
  });
});
expectThrows("Built product-core package did not reject unknown save-write collection endings.", () => {
  serializeCollection(["scholar", "unknown-ending"]);
});
if (loadCollection(["scholar", "unknown-ending", "scholar"]).join(",") !== "scholar") {
  throw new Error("Built product-core package did not sanitize stale collection ending codes at load time.");
}
if (loadCollection(serializeCollection(["scholar", "merchant", "scholar"])).join(",") !== "scholar,merchant") {
  throw new Error("Built product-core package did not round-trip versioned collection saves.");
}
expectThrows("Built product-core package did not reject unsupported collection save schema versions.", () => {
  loadCollection({ version: 2, endings: ["scholar"] });
});
expectThrowsWithMessage("Built product-core package did not reject malformed JSON collection saves with a domain error.", () => {
  loadCollection("{not-json");
}, "도감 데이터를 읽을 수 없습니다.");

if (
  !isPublicHttpsUrl("https://starlit-apprentice.seorilabs.com/play/?ending=scholar") ||
  !isPublicHttpsUrl("https://192.0.0.9/play/?ending=scholar") ||
  !isPublicHttpsUrl("https://192.0.0.10/play/?ending=scholar")
) {
  throw new Error("Built product-core package did not accept public HTTPS URL values.");
}
for (const blockedUrl of [
  "http://starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "https://release:secret@starlit-apprentice.seorilabs.com/play/?ending=scholar",
  "https://localhost/play/?ending=scholar",
  "https://100.64.0.7/play/?ending=scholar",
  "https://192.0.0.8/play/?ending=scholar",
  "https://192.0.0.170/play/?ending=scholar",
  "https://192.0.2.7/play/?ending=scholar",
  "https://[fd12:3456::1]/play/?ending=scholar",
  "https://[fe80::1]/play/?ending=scholar",
  "https://[64:ff9b:1::1]/play/?ending=scholar",
  "https://[100::1]/play/?ending=scholar",
  "https://[100:0:0:1::1]/play/?ending=scholar",
  "https://[2001:2::1]/play/?ending=scholar",
  "https://[2001:db8::1]/play/?ending=scholar",
  "https://[3fff::1]/play/?ending=scholar",
  "https://[5f00::1]/play/?ending=scholar",
  "https://example.com/play/?ending=scholar",
  "capacitor://localhost/?ending=scholar"
]) {
  if (isPublicHttpsUrl(blockedUrl) || parsePublicHttpsUrl(blockedUrl) !== null) {
    throw new Error(`Built product-core package accepted a non-public release URL: ${blockedUrl}`);
  }
  if (buildPublicEndingShareUrl("scholar", blockedUrl) !== undefined) {
    throw new Error(`Built product-core package built a share URL from a non-public base: ${blockedUrl}`);
  }
}
if (
  !isBlockedPublicUrlHost("share.example.com") ||
  !isBlockedPublicUrlHost("2001:db8::1") ||
  !isBlockedPublicUrlHost("3fff::1") ||
  !isBlockedPublicUrlHost("5f00::1") ||
  isBlockedPublicUrlHost("192.0.0.9") ||
  isBlockedPublicUrlHost("192.0.0.10")
) {
  throw new Error("Built product-core package did not handle placeholder or IANA special-purpose hosts correctly.");
}
if (
  buildPublicEndingShareUrl(
    "scholar",
    "https://starlit-apprentice.seorilabs.com/play/?utm=old#ignored"
  ) !== "https://starlit-apprentice.seorilabs.com/play/?ending=scholar"
) {
  throw new Error("Built product-core package did not canonicalize public ending share URLs.");
}
if (buildPublicEndingShareUrl("unknown-ending", "https://starlit-apprentice.seorilabs.com/play/") !== undefined) {
  throw new Error("Built product-core package built a public share URL for an unknown ending code.");
}

let run = createNewRun(1);
const blockedPlan = getSchedulePlanStatus({ ...run, gold: 0 }, ["star-lore"]);
if (blockedPlan.isValid || !blockedPlan.blockers.includes("골드 부족")) {
  throw new Error("Built product-core package did not expose schedule affordability status correctly.");
}

const malformedPlan = getSchedulePlanStatus(run, ["unknown-action"]);
if (malformedPlan.isValid || !malformedPlan.blockers.includes("알 수 없는 일정: unknown-action")) {
  throw new Error("Built product-core package did not expose schedule plan action-list blockers correctly.");
}

const nonArrayPlan = getSchedulePlanStatus(run, "home-rest");
if (nonArrayPlan.isValid || !nonArrayPlan.blockers.includes("월간 일정이 올바르지 않습니다.")) {
  throw new Error("Built product-core package did not expose non-array schedule plan action-list blockers correctly.");
}

const overfilledPlan = getSchedulePlanStatus(run, ["home-rest", "sleep-in", "home-rest", "sleep-in", "park"]);
if (overfilledPlan.isValid || !overfilledPlan.blockers.includes("월간 일정은 최대 4개까지 선택할 수 있습니다.")) {
  throw new Error("Built product-core package did not reject overfilled schedule plan status checks.");
}

const invalidResourcePlan = getSchedulePlanStatus(
  { ...run, gold: Number.NaN, energy: Number.POSITIVE_INFINITY, stress: Number.NEGATIVE_INFINITY },
  ["home-rest", "sleep-in"]
);
if (
  invalidResourcePlan.isValid ||
  !invalidResourcePlan.blockers.includes("골드 상태가 올바르지 않습니다.") ||
  !invalidResourcePlan.blockers.includes("기력 상태가 올바르지 않습니다.") ||
  !invalidResourcePlan.blockers.includes("스트레스 상태가 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose schedule plan resource finite guard correctly.");
}
expectFiniteForecast("Built product-core package did not keep non-finite resource plan forecasts finite.", invalidResourcePlan);

const outOfRangeResourcePlan = getSchedulePlanStatus({ ...run, gold: -1, energy: 101, stress: -1 }, [
  "home-rest",
  "sleep-in"
]);
if (
  outOfRangeResourcePlan.isValid ||
  !outOfRangeResourcePlan.blockers.includes("골드 상태가 올바르지 않습니다.") ||
  !outOfRangeResourcePlan.blockers.includes("기력 상태가 올바르지 않습니다.") ||
  !outOfRangeResourcePlan.blockers.includes("스트레스 상태가 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose schedule plan resource bounds guard correctly.");
}

const invalidProgressPlan = getSchedulePlanStatus(
  { ...run, month: 0, slotIndex: SLOTS_PER_MONTH + 1, stats: { ...run.stats, intellect: 101 }, rngSeed: 1.5 },
  ["home-rest"]
);
if (
  invalidProgressPlan.isValid ||
  !invalidProgressPlan.blockers.includes("진행 상태 수치가 올바르지 않습니다.") ||
  !invalidProgressPlan.blockers.includes("월간 진행 상태가 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose schedule plan run-state bounds guard correctly.");
}

const unsupportedVersionPlan = getSchedulePlanStatus({ ...run, version: 2 }, ["home-rest"]);
if (
  unsupportedVersionPlan.isValid ||
  !unsupportedVersionPlan.blockers.includes("진행 상태 버전이 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose schedule plan run-state version guard correctly.");
}
const malformedShapePlan = getSchedulePlanStatus({ ...run, flags: { "condition:exhausted": Number.NaN } }, [
  "home-rest"
]);
if (
  malformedShapePlan.isValid ||
  !malformedShapePlan.blockers.includes("진행 상태 구조가 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose schedule plan run-state shape guard correctly.");
}
expectFiniteForecast("Built product-core package did not keep malformed shape plan forecasts finite.", malformedShapePlan);

const nonObjectRunPlan = getSchedulePlanStatus(null, ["home-rest"]);
if (
  nonObjectRunPlan.isValid ||
  !nonObjectRunPlan.blockers.includes("진행 상태 구조가 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose non-object schedule plan run-state blockers correctly.");
}
expectFiniteForecast("Built product-core package did not keep non-object run plan forecasts finite.", nonObjectRunPlan);
const arrayRunPlan = getSchedulePlanStatus([], ["home-rest"]);
if (arrayRunPlan.isValid || !arrayRunPlan.blockers.includes("진행 상태 구조가 올바르지 않습니다.")) {
  throw new Error("Built product-core package did not expose array schedule plan run-state blockers correctly.");
}
expectFiniteForecast("Built product-core package did not keep array run plan forecasts finite.", arrayRunPlan);

const missingResourcePlan = getSchedulePlanStatus({ version: 1 }, ["home-rest"]);
if (
  missingResourcePlan.isValid ||
  !missingResourcePlan.blockers.includes("골드 상태가 올바르지 않습니다.") ||
  !missingResourcePlan.blockers.includes("기력 상태가 올바르지 않습니다.") ||
  !missingResourcePlan.blockers.includes("스트레스 상태가 올바르지 않습니다.")
) {
  throw new Error("Built product-core package did not expose missing resource schedule plan blockers correctly.");
}
expectFiniteForecast("Built product-core package did not keep missing resource plan forecasts finite.", missingResourcePlan);

const resourceForecast = getScheduleResourceForecast(run, ["star-lore", "home-rest"]);
if (resourceForecast.gold !== 160 || resourceForecast.energy !== 98 || resourceForecast.stress !== 0) {
  throw new Error("Built product-core package did not project schedule resources correctly.");
}
expectThrows("Built product-core package did not reject unsupported direct schedule forecast versions.", () =>
  getScheduleResourceForecast({ ...run, version: 2 }, ["home-rest"])
);
expectThrows("Built product-core package did not reject malformed direct schedule forecast shape.", () =>
  getScheduleResourceForecast({ ...run, currentSchedule: ["letters", "music"] }, ["home-rest"])
);
expectThrowsWithMessage("Built product-core package did not reject non-object direct schedule forecasts.", () => {
  getScheduleResourceForecast(null, ["home-rest"]);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrows("Built product-core package did not reject malformed direct schedule forecast state.", () =>
  getScheduleResourceForecast({ ...run, energy: 101 }, ["home-rest"])
);
expectThrows("Built product-core package did not reject unknown direct schedule forecast actions.", () =>
  getScheduleResourceForecast(run, ["unknown-action"])
);
expectThrows("Built product-core package did not reject overfilled direct schedule forecasts.", () =>
  getScheduleResourceForecast(run, ["home-rest", "sleep-in", "home-rest", "sleep-in", "park"])
);
expectThrows("Built product-core package did not reject non-array direct schedule forecasts.", () =>
  getScheduleResourceForecast(run, "home-rest")
);

expectThrows("Built product-core package did not reject out-of-range schedule selection state.", () =>
  selectSchedule({ ...run, stats: { ...run.stats, reputation: 101 } }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
);
expectThrows("Built product-core package did not reject unsupported direct schedule selection versions.", () =>
  selectSchedule({ ...run, version: 2 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
);
expectThrowsWithMessage("Built product-core package did not reject non-object direct schedule selection state.", () => {
  selectSchedule(null, ["home-rest", "sleep-in", "home-rest", "sleep-in"]);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrows("Built product-core package did not reject malformed direct schedule selection shape.", () =>
  selectSchedule({ ...run, flags: { "condition:exhausted": Number.NaN } }, [
    "home-rest",
    "sleep-in",
    "home-rest",
    "sleep-in"
  ])
);
expectThrows("Built product-core package did not reject non-array schedule selection actions.", () =>
  selectSchedule(run, "home-rest")
);

run = selectSchedule(run, ["star-lore", "star-lore", "star-lore", "home-rest"]);
expectThrowsWithMessage("Built product-core package did not reject non-object direct progression state.", () => {
  resolveNextSlot(null);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrows("Built product-core package did not reject unsupported direct progression versions.", () =>
  resolveNextSlot({ ...run, version: 2 })
);
expectThrows("Built product-core package did not reject malformed direct progression shape.", () =>
  resolveNextSlot({ ...run, flags: { "condition:exhausted": -1 } })
);
expectThrows("Built product-core package did not reject non-finite direct progression state.", () =>
  resolveNextSlot({ ...run, stats: { ...run.stats, intellect: Number.POSITIVE_INFINITY } })
);
expectThrows("Built product-core package did not reject out-of-range direct progression state.", () =>
  resolveNextSlot({ ...run, gold: -1 })
);
expectThrows("Built product-core package did not reject non-finite direct read-model state.", () =>
  getEndingProgress({ ...run, stats: { ...run.stats, intellect: Number.NaN } })
);
expectThrows("Built product-core package did not reject out-of-range direct read-model state.", () =>
  getEndingProgress({ ...run, energy: 101 })
);
expectThrows("Built product-core package did not reject unsupported direct read-model versions.", () =>
  getEndingProgress({ ...run, version: 2 })
);
expectThrows("Built product-core package did not reject malformed direct read-model shape.", () =>
  getEndingProgress({ ...run, flags: "bad-flags" })
);
expectThrowsWithMessage("Built product-core package did not reject non-object direct read-model state.", () => {
  getEndingProgress(null);
}, "진행 상태 구조가 올바르지 않습니다.");

for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
  run = resolveNextSlot(run).run;
}

run = advanceMonth(run);
const progress = getEndingProgress(run);

if (run.month !== 2 || progress.length === 0) {
  throw new Error("Built product-core package did not run the smoke loop correctly.");
}

const targetRecommendations = getEndingActionRecommendations(createNewRun(1), "scholar", 3);
if (!targetRecommendations.some((recommendation) => recommendation.action.id === "star-lore")) {
  throw new Error("Built product-core package did not expose target action recommendations correctly.");
}
if (getEndingActionRecommendations(createNewRun(1), "scholar", 0).length !== 0) {
  throw new Error("Built product-core package did not honor zero target recommendation limit.");
}
if (
  getEndingActionRecommendations(createNewRun(1), "scholar", 999).length !==
  getEndingActionRecommendations(createNewRun(1), "scholar").length
) {
  throw new Error("Built product-core package did not cap oversized target recommendation limits.");
}
expectThrows("Built product-core package did not reject negative target recommendation limits.", () =>
  getEndingActionRecommendations(createNewRun(1), "scholar", -1)
);
expectThrows("Built product-core package did not reject non-integer target recommendation limits.", () =>
  getEndingActionRecommendations(createNewRun(1), "scholar", 1.5)
);
expectThrows("Built product-core package did not reject unknown planned target recommendation actions.", () =>
  getEndingActionRecommendations(createNewRun(1), "scholar", 3, ["unknown-action"])
);
expectThrows("Built product-core package did not reject overfilled planned target recommendation prefixes.", () =>
  getEndingActionRecommendations(createNewRun(1), "scholar", 3, [
    "home-rest",
    "sleep-in",
    "home-rest",
    "sleep-in",
    "park"
  ])
);
expectThrows("Built product-core package did not reject non-array planned target recommendation prefixes.", () =>
  getEndingActionRecommendations(createNewRun(1), "scholar", 3, "home-rest")
);
expectThrowsWithMessage("Built product-core package did not guard target recommendation non-object state.", () => {
  getEndingActionRecommendations(null, "scholar");
}, "진행 상태 구조가 올바르지 않습니다.");
if (getMonthlyCoachingInsights(run, 0).length !== 0) {
  throw new Error("Built product-core package did not honor zero monthly coaching limit.");
}
if (getMonthlyCoachingInsights(run, 999).length !== getMonthlyCoachingInsights(run, 4).length) {
  throw new Error("Built product-core package did not cap oversized monthly coaching limits.");
}
expectThrows("Built product-core package did not reject non-finite monthly coaching limits.", () =>
  getMonthlyCoachingInsights(run, Number.POSITIVE_INFINITY)
);
expectThrows("Built product-core package did not guard judgeEnding read-model state.", () =>
  judgeEnding({ ...run, stress: Number.POSITIVE_INFINITY })
);
expectThrowsWithMessage("Built product-core package did not guard judgeEnding non-object state.", () => {
  judgeEnding(null);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrows("Built product-core package did not guard monthly coaching read-model state.", () =>
  getMonthlyCoachingInsights({ ...run, energy: Number.NEGATIVE_INFINITY })
);
expectThrowsWithMessage("Built product-core package did not guard monthly coaching non-object state.", () => {
  getMonthlyCoachingInsights(null);
}, "진행 상태 구조가 올바르지 않습니다.");
expectThrows("Built product-core package did not guard apprentice profile read-model state.", () =>
  getApprenticeProfile({ ...run, month: Number.NaN })
);
expectThrowsWithMessage("Built product-core package did not guard apprentice profile non-object state.", () => {
  getApprenticeProfile(null);
}, "진행 상태 구조가 올바르지 않습니다.");

console.log("Product-core dist import check passed.");

function expectThrows(message, action) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

function expectThrowsWithMessage(message, action, expectedMessage) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      return;
    }
    throw new Error(`${message} Expected message to include ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(error?.message)}.`);
  }
  throw new Error(message);
}

function expectFiniteForecast(message, status) {
  for (const value of Object.values(status.forecast ?? {})) {
    if (!Number.isFinite(value)) {
      throw new Error(message);
    }
  }
}
