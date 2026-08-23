import {
  ENDINGS,
  MAX_MONTH,
  SLOTS_PER_MONTH,
  advanceMonth,
  createNewRun,
  createTargetedRun,
  loadCollection,
  loadRun,
  getApprenticeProfile,
  getEndingActionRecommendations,
  getSchedulePlanStatus,
  getScheduleResourceForecast,
  getEndingProgress,
  getMonthlyCoachingInsights,
  judgeEnding,
  resolveNextSlot,
  selectSchedule,
  serializeCollection,
  serializeRun
} from "../product-core-ts/dist/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
const failures = [];
const DAYS_PER_WEEK = 7;

checkNewRunCreationContract();
checkRoundTrip();
checkSaveWriteContract();
checkScheduleSelectionContract();
checkProgressionApiContract();
checkLegacyAndCorruptRunSanitization();
checkMalformedRunRejection();
checkEndingSanitization();
checkCollectionStorageContract();
checkLocalDataResetContract();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkRoundTrip() {
  const run = selectSchedule(createTargetedRun("travel-writer", 42), ["market", "plaza", "library", "park"]);
  const loaded = loadRun(serializeRun(run));
  expectEqual("round-trip version", loaded.version, 1);
  expectEqual("round-trip seed", loaded.rngSeed, 42);
  expectEqual("round-trip target ending", loaded.targetEndingCode, "travel-writer");
  expectEqual("round-trip schedule length", loaded.currentSchedule.length, SLOTS_PER_MONTH);
  expectEqual("round-trip first action", loaded.currentSchedule[0], "market");
}

function checkNewRunCreationContract() {
  const seededRun = createNewRun(7);
  expectEqual("new run seed", seededRun.rngSeed, 7);
  expectEqual("targeted new run seed", createTargetedRun("scholar", 11).rngSeed, 11);

  for (const seed of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "7"]) {
    expectThrows(`createNewRun rejects malformed seed ${String(seed)}`, () => createNewRun(seed));
  }
  expectThrows("createTargetedRun rejects malformed seeds", () => createTargetedRun("scholar", 1.5));

  const seedThatWouldPersistZeroAfterOneSlot = 3725587800;
  const selectedRun = selectSchedule(createNewRun(seedThatWouldPersistZeroAfterOneSlot), [
    "home-rest",
    "sleep-in",
    "home-rest",
    "sleep-in"
  ]);
  const resolved = resolveNextSlot(selectedRun).run;
  expectEqual("resolved rng seed never persists zero", resolved.rngSeed, 1);
  serializeRun(resolved);
}

function checkSaveWriteContract() {
  const run = createNewRun(1);
  const selectedRun = selectSchedule(run, ["letters", "music", "home-rest", "park"]);
  const inProgressRun = resolveNextSlot(resolveNextSlot(selectedRun).run).run;
  let eventRun = selectedRun;
  for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
    eventRun = resolveNextSlot(eventRun).run;
  }

  expectThrowsWithMessage("serializeRun rejects non-object direct run state", () => serializeRun(null), "진행 상태 구조가 올바르지 않습니다.");
  expectThrowsWithMessage("serializeRun rejects array direct run state", () => serializeRun([]), "진행 상태 구조가 올바르지 않습니다.");
  expectThrows("serializeRun rejects future save schema versions", () => serializeRun({ ...run, version: 2 }));
  expectThrows("serializeRun rejects non-numeric save schema versions", () => serializeRun({ ...run, version: "1" }));
  expectThrows("serializeRun rejects missing save schema versions", () => serializeRun({ ...run, version: undefined }));
  expectThrows("serializeRun rejects non-finite gold state", () => serializeRun({ ...run, gold: Number.NaN }));
  expectThrows("serializeRun rejects out-of-range energy state", () => serializeRun({ ...run, energy: 101 }));
  expectThrows("serializeRun rejects out-of-range stat state", () =>
    serializeRun({ ...run, stats: { ...run.stats, intellect: Number.POSITIVE_INFINITY } })
  );
  expectThrows("serializeRun rejects non-positive RNG seed", () => serializeRun({ ...run, rngSeed: 0 }));
  expectThrows("serializeRun rejects unsafe RNG seed", () =>
    serializeRun({ ...run, rngSeed: Number.MAX_SAFE_INTEGER + 1 })
  );
  expectThrows("serializeRun rejects partial schedules", () =>
    serializeRun({ ...run, currentSchedule: ["letters", "music", "home-rest"] })
  );
  expectThrows("serializeRun rejects unknown scheduled actions", () =>
    serializeRun({ ...run, currentSchedule: ["letters", "music", "home-rest", "unknown-action"] })
  );
  expectThrows("serializeRun rejects unknown target endings", () =>
    serializeRun({ ...run, targetEndingCode: "unknown-ending" })
  );
  expectThrows("serializeRun rejects unknown endingCode", () => serializeRun({ ...run, endingCode: "unknown-ending" }));
  expectThrows("serializeRun rejects unknown unlocked endings", () =>
    serializeRun({ ...run, unlockedEndings: ["scholar", "unknown-ending"] })
  );
  expectThrows("serializeRun rejects non-object flags", () => serializeRun({ ...run, flags: "bad-flags" }));
  expectThrows("serializeRun rejects unknown direct flags", () => serializeRun({ ...run, flags: { "unknown:flag": 1 } }));
  expectThrows("serializeRun rejects oversized direct flags", () =>
    serializeRun({ ...run, flags: { "condition:exhausted": MAX_MONTH * SLOTS_PER_MONTH * DAYS_PER_WEEK + 1 } })
  );
  expectThrows("serializeRun rejects fractional direct flags", () =>
    serializeRun({ ...run, flags: { "condition:exhausted": 1.5 } })
  );
  expectThrows("serializeRun rejects negative direct flags", () =>
    serializeRun({ ...run, flags: { "condition:exhausted": -1 } })
  );
  expectThrows("serializeRun rejects action progress flags beyond completed history", () =>
    serializeRun({ ...inProgressRun, flags: { ...inProgressRun.flags, "lesson:star-lore": 1 } })
  );
  expectThrows("serializeRun rejects category progress flags beyond completed history", () =>
    serializeRun({ ...inProgressRun, flags: { ...inProgressRun.flags, "category:work": 1 } })
  );
  expectThrows("serializeRun rejects non-array history", () => serializeRun({ ...run, history: "bad-history" }));
  expectThrows("serializeRun rejects future direct history entries", () =>
    serializeRun({
      ...inProgressRun,
      history: [...inProgressRun.history, { ...inProgressRun.history[0], month: 12, slot: 4 }]
    })
  );
  expectThrows("serializeRun rejects unknown history actions", () =>
    serializeRun({
      ...inProgressRun,
      history: [{ ...inProgressRun.history[0], actionId: "unknown-action" }, inProgressRun.history[1]]
    })
  );
  expectThrows("serializeRun rejects mismatched history action labels", () =>
    serializeRun({
      ...inProgressRun,
      history: [{ ...inProgressRun.history[0], actionLabel: "온천권 사용" }, inProgressRun.history[1]]
    })
  );
  expectThrows("serializeRun rejects malformed direct history daily outcomes", () =>
    serializeRun({
      ...inProgressRun,
      history: [
        {
          ...inProgressRun.history[0],
          dailyOutcomes: [{ ...inProgressRun.history[0].dailyOutcomes[0], day: 99 }]
        },
        inProgressRun.history[1]
      ]
    })
  );
  expectThrows("serializeRun rejects malformed direct history event effects", () =>
    serializeRun({
      ...eventRun,
      history: eventRun.history.map((entry, index) =>
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
    })
  );
}

function checkScheduleSelectionContract() {
  const selectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
  const unsupportedVersionStatus = getSchedulePlanStatus({ ...createNewRun(1), version: 2 }, ["home-rest"]);
  if (
    unsupportedVersionStatus.isValid ||
    !unsupportedVersionStatus.blockers.includes("진행 상태 버전이 올바르지 않습니다.")
  ) {
    failures.push("schedule plan status must block unsupported direct run-state versions.");
  }
  expectFiniteForecast("schedule plan finite forecast fallback for unsupported versions", unsupportedVersionStatus);
  expectThrows("schedule resource forecast rejects unsupported direct run-state versions", () =>
    getScheduleResourceForecast({ ...createNewRun(1), version: 2 }, ["home-rest"])
  );
  const malformedShapeStatus = getSchedulePlanStatus({ ...createNewRun(1), flags: { "condition:exhausted": Number.NaN } }, [
    "home-rest"
  ]);
  if (
    malformedShapeStatus.isValid ||
    !malformedShapeStatus.blockers.includes("진행 상태 구조가 올바르지 않습니다.")
  ) {
    failures.push("schedule plan status must block malformed direct run-state shape.");
  }
  expectFiniteForecast("schedule plan finite forecast fallback for malformed shapes", malformedShapeStatus);
  const nonObjectRunStatus = getSchedulePlanStatus(null, ["home-rest"]);
  if (
    nonObjectRunStatus.isValid ||
    !nonObjectRunStatus.blockers.includes("진행 상태 구조가 올바르지 않습니다.")
  ) {
    failures.push("schedule plan status must block non-object direct run-state inputs.");
  }
  expectFiniteForecast("schedule plan finite forecast fallback for non-object run state", nonObjectRunStatus);
  const arrayRunStatus = getSchedulePlanStatus([], ["home-rest"]);
  if (arrayRunStatus.isValid || !arrayRunStatus.blockers.includes("진행 상태 구조가 올바르지 않습니다.")) {
    failures.push("schedule plan status must block array direct run-state inputs.");
  }
  expectFiniteForecast("schedule plan finite forecast fallback for array run state", arrayRunStatus);
  const missingResourceStatus = getSchedulePlanStatus({ version: 1 }, ["home-rest"]);
  if (
    missingResourceStatus.isValid ||
    !missingResourceStatus.blockers.includes("골드 상태가 올바르지 않습니다.") ||
    !missingResourceStatus.blockers.includes("기력 상태가 올바르지 않습니다.") ||
    !missingResourceStatus.blockers.includes("스트레스 상태가 올바르지 않습니다.")
  ) {
    failures.push("schedule plan status must block missing direct resource fields.");
  }
  expectFiniteForecast("schedule plan finite forecast fallback for missing resource fields", missingResourceStatus);
  expectThrows("schedule resource forecast rejects malformed direct run-state shape", () =>
    getScheduleResourceForecast({ ...createNewRun(1), currentSchedule: ["letters", "music"] }, ["home-rest"])
  );
  expectThrowsWithMessage(
    "schedule resource forecast rejects non-object direct run state",
    () => getScheduleResourceForecast(null, ["home-rest"]),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrows("schedule selection rejects unsupported direct run-state versions", () =>
    selectSchedule({ ...createNewRun(1), version: 2 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );
  expectThrowsWithMessage(
    "schedule selection rejects non-object direct run state",
    () => selectSchedule(null, ["home-rest", "sleep-in", "home-rest", "sleep-in"]),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrows("schedule selection rejects malformed direct run-state shape", () =>
    selectSchedule(
      { ...createNewRun(1), flags: { "condition:exhausted": Number.NaN } },
      ["home-rest", "sleep-in", "home-rest", "sleep-in"]
    )
  );
  expectThrows("schedule selection rejects negative slot progress", () =>
    selectSchedule({ ...createNewRun(1), slotIndex: -1 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );
  expectThrows("schedule selection rejects overflow slot progress", () =>
    selectSchedule(
      { ...createNewRun(1), slotIndex: SLOTS_PER_MONTH + 1 },
      ["home-rest", "sleep-in", "home-rest", "sleep-in"]
    )
  );
  expectThrows("schedule selection rejects non-finite gold state", () =>
    selectSchedule({ ...createNewRun(1), gold: Number.NaN }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );
  expectThrows("schedule selection rejects overflow energy state", () =>
    selectSchedule({ ...createNewRun(1), energy: 101 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );
  expectThrows("schedule selection rejects negative stress state", () =>
    selectSchedule({ ...createNewRun(1), stress: -1 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );
  expectThrows("schedule selection rejects out-of-range stat state", () =>
    selectSchedule(
      {
        ...createNewRun(1),
        stats: { ...createNewRun(1).stats, reputation: 101 }
      },
      ["home-rest", "sleep-in", "home-rest", "sleep-in"]
    )
  );
  expectThrows("schedule selection rejects fractional rng state", () =>
    selectSchedule({ ...createNewRun(1), rngSeed: 1.5 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );
  expectThrows("selected monthly schedule cannot be overwritten", () =>
    selectSchedule(selectedRun, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );

  let completedRun = selectedRun;
  for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
    completedRun = resolveNextSlot(completedRun).run;
  }
  expectThrows("completed monthly schedule cannot be overwritten", () =>
    selectSchedule(completedRun, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  );

  expectThrows("partial monthly schedule cannot be overwritten", () =>
    selectSchedule(
      {
        ...createNewRun(1),
        currentSchedule: ["letters", "music"],
        slotIndex: 0
      },
      ["home-rest", "sleep-in", "home-rest", "sleep-in"]
    )
  );
  expectThrows("orphan schedule slot progress cannot accept a new schedule", () =>
    selectSchedule(
      {
        ...createNewRun(1),
        currentSchedule: [],
        slotIndex: 1
      },
      ["home-rest", "sleep-in", "home-rest", "sleep-in"]
    )
  );
}

function checkProgressionApiContract() {
  const selectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);

  expectThrowsWithMessage(
    "resolveNextSlot rejects non-object direct run state",
    () => resolveNextSlot(null),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrows("resolveNextSlot rejects unsupported direct run-state versions", () =>
    resolveNextSlot({ ...selectedRun, version: 2 })
  );
  expectThrows("resolveNextSlot rejects malformed direct run-state shape", () =>
    resolveNextSlot({ ...selectedRun, flags: { "condition:exhausted": -1 } })
  );
  expectThrows("resolveNextSlot rejects negative slot progress", () =>
    resolveNextSlot({ ...selectedRun, slotIndex: -1 })
  );
  expectThrows("resolveNextSlot rejects overflow slot progress", () =>
    resolveNextSlot({ ...selectedRun, slotIndex: SLOTS_PER_MONTH + 1 })
  );
  expectThrows("advanceMonth rejects overflow slot progress", () =>
    advanceMonth({ ...selectedRun, slotIndex: SLOTS_PER_MONTH + 1 })
  );
  expectThrowsWithMessage(
    "advanceMonth rejects non-object direct run state",
    () => advanceMonth(null),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrows("advanceMonth rejects completed slot without matching history", () =>
    advanceMonth({ ...selectedRun, slotIndex: SLOTS_PER_MONTH })
  );
  expectThrows("advanceMonth rejects completed slot with malformed schedule", () =>
    advanceMonth({
      ...selectedRun,
      slotIndex: SLOTS_PER_MONTH,
      currentSchedule: ["letters", "music", "home-rest", "unknown"]
    })
  );
  expectThrows("resolveNextSlot rejects non-finite gold progress state", () =>
    resolveNextSlot({ ...selectedRun, gold: Number.NaN })
  );
  expectThrows("resolveNextSlot rejects non-finite energy progress state", () =>
    resolveNextSlot({ ...selectedRun, energy: Number.POSITIVE_INFINITY })
  );
  expectThrows("resolveNextSlot rejects non-finite stat progress state", () =>
    resolveNextSlot({
      ...selectedRun,
      stats: { ...selectedRun.stats, intellect: Number.NEGATIVE_INFINITY }
    })
  );
  expectThrows("resolveNextSlot rejects non-finite rng progress state", () =>
    resolveNextSlot({ ...selectedRun, rngSeed: Number.NaN })
  );
  expectThrows("resolveNextSlot rejects negative gold progress state", () => resolveNextSlot({ ...selectedRun, gold: -1 }));
  expectThrows("resolveNextSlot rejects overflow energy progress state", () =>
    resolveNextSlot({ ...selectedRun, energy: 101 })
  );
  expectThrows("resolveNextSlot rejects overflow stress progress state", () =>
    resolveNextSlot({ ...selectedRun, stress: 101 })
  );
  expectThrows("resolveNextSlot rejects out-of-range stat progress state", () =>
    resolveNextSlot({
      ...selectedRun,
      stats: { ...selectedRun.stats, intellect: 101 }
    })
  );
  expectThrows("resolveNextSlot rejects fractional rng progress state", () =>
    resolveNextSlot({ ...selectedRun, rngSeed: 1.5 })
  );

  let completedRun = selectedRun;
  for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
    completedRun = resolveNextSlot(completedRun).run;
  }
  expectThrows("advanceMonth rejects unsupported direct run-state versions", () =>
    advanceMonth({ ...completedRun, version: 2 })
  );
  expectThrowsWithMessage(
    "read models reject non-object direct run state",
    () => getEndingProgress(null),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrowsWithMessage(
    "judgeEnding rejects non-object direct run state",
    () => judgeEnding(null),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrowsWithMessage(
    "target recommendations reject non-object direct run state",
    () => getEndingActionRecommendations(null, "scholar"),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrowsWithMessage(
    "apprentice profile rejects non-object direct run state",
    () => getApprenticeProfile(null),
    "진행 상태 구조가 올바르지 않습니다."
  );
  expectThrows("read models reject malformed direct run-state shape", () =>
    getEndingProgress({ ...createNewRun(1), flags: "bad-flags" })
  );
  expectThrows("coaching rejects malformed direct run-state history shape", () =>
    getMonthlyCoachingInsights({ ...createNewRun(1), history: "bad-history" })
  );
  expectThrows("advanceMonth rejects non-finite month progress state", () =>
    advanceMonth({ ...completedRun, month: Number.NaN })
  );
  expectThrows("advanceMonth rejects non-finite stress progress state", () =>
    advanceMonth({ ...completedRun, stress: Number.POSITIVE_INFINITY })
  );
}

function checkLegacyAndCorruptRunSanitization() {
  const loaded = loadRun({
    version: 0,
    month: 99,
    slotIndex: 99,
    gold: -120,
    stats: {
      intellect: 999,
      sensibility: -5,
      reputation: "not-a-number"
    },
    stress: 500,
    energy: -30,
    flags: {
      "lesson:star-lore": 2.9,
      "category:lesson": 999,
      "condition:exhausted": 999,
      "event:stress-warning": 999,
      "condition:bad": -12,
      "event:bad": "not-a-number"
    },
    history: "old-save-history",
    unlockedEndings: ["scholar", "unknown-ending", "scholar"],
    rngSeed: "not-a-seed",
    targetEndingCode: "unknown-ending",
    currentSchedule: ["letters", "music", "home-rest"]
  });

  expectEqual("loaded version is migrated to v1", loaded.version, 1);
  expectEqual("unsupported saved month progress resets to first month", loaded.month, 1);
  expectEqual("invalid legacy three-slot schedule is dropped", loaded.currentSchedule.length, 0);
  expectEqual("slot index resets when schedule is dropped", loaded.slotIndex, 0);
  expectEqual("gold clamps non-negative", loaded.gold, 0);
  expectEqual("stat high clamp", loaded.stats.intellect, 100);
  expectEqual("stat low clamp", loaded.stats.sensibility, 0);
  expectEqual("invalid reputation falls back to initial", loaded.stats.reputation, 0);
  expectEqual("stress clamps", loaded.stress, 100);
  expectEqual("energy clamps", loaded.energy, 0);
  expectEqual("action progress flag is capped by completed history", loaded.flags["lesson:star-lore"], 0);
  expectEqual("category progress flag is capped by completed history", loaded.flags["category:lesson"], 0);
  expectEqual(
    "daily condition flag caps at plausible day count",
    loaded.flags["condition:exhausted"],
    MAX_MONTH * SLOTS_PER_MONTH * DAYS_PER_WEEK
  );
  expectEqual(
    "daily event flag caps at plausible day count",
    loaded.flags["event:stress-warning"],
    MAX_MONTH * SLOTS_PER_MONTH * DAYS_PER_WEEK
  );
  expectEqual("unknown negative flag is dropped", loaded.flags["condition:bad"], undefined);
  expectEqual("unknown invalid flag is dropped", loaded.flags["event:bad"], undefined);
  expectEqual("invalid history is dropped", loaded.history.length, 0);
  expectEqual("in-progress run unlocked endings are cleared", loaded.unlockedEndings.length, 0);
  expectEqual("invalid seed falls back to one", loaded.rngSeed, 1);
  expectEqual("unknown target ending is cleared", loaded.targetEndingCode, undefined);

  const unsupportedMonthLoaded = loadRun({
    ...createNewRun(1),
    month: 3,
    history: [{ month: 2, slot: 4, actionId: "park" }]
  });
  expectEqual("sparse saved month progress resets to first month", unsupportedMonthLoaded.month, 1);
  expectEqual("sparse saved month progress clears future history", unsupportedMonthLoaded.history.length, 0);

  const unsupportedScheduledMonthLoaded = loadRun({
    ...createNewRun(1),
    month: 3,
    slotIndex: 2,
    currentSchedule: ["letters", "music", "home-rest", "park"],
    history: [
      { month: 3, slot: 1, actionId: "letters" },
      { month: 3, slot: 2, actionId: "music" }
    ],
    endingCode: "scholar",
    unlockedEndings: ["scholar"]
  });
  expectEqual("saved schedule without prior month progress resets to first month", unsupportedScheduledMonthLoaded.month, 1);
  expectEqual("saved schedule without prior month progress is dropped", unsupportedScheduledMonthLoaded.currentSchedule.length, 0);
  expectEqual("saved schedule without prior month progress clears future history", unsupportedScheduledMonthLoaded.history.length, 0);
  expectEqual("saved schedule without prior month progress clears ending", unsupportedScheduledMonthLoaded.endingCode, undefined);
  expectEqual("saved schedule without prior month progress clears unlocks", unsupportedScheduledMonthLoaded.unlockedEndings.length, 0);

  let completedFirstMonth = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
  for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
    completedFirstMonth = resolveNextSlot(completedFirstMonth).run;
  }
  const monthTwo = advanceMonth(completedFirstMonth);
  const loadedMonthTwo = loadRun(serializeRun(monthTwo));
  expectEqual("completed first month save can resume at month two", loadedMonthTwo.month, 2);
  expectEqual("completed first month save keeps history", loadedMonthTwo.history.length, SLOTS_PER_MONTH);

  const selectedMonthTwo = selectSchedule(monthTwo, ["letters", "music", "home-rest", "park"]);
  const loadedSelectedMonthTwo = loadRun(serializeRun(selectedMonthTwo));
  expectEqual("month two selected schedule keeps supported month", loadedSelectedMonthTwo.month, 2);
  expectEqual("month two selected schedule is preserved", loadedSelectedMonthTwo.currentSchedule.length, SLOTS_PER_MONTH);

  const progressFlagsLoaded = loadRun({
    ...createNewRun(1),
    slotIndex: 2,
    currentSchedule: ["star-lore", "letters", "home-rest", "park"],
    history: [
      { month: 1, slot: 1, actionId: "star-lore" },
      { month: 1, slot: 2, actionId: "letters" }
    ],
    flags: {
      "lesson:star-lore": 9,
      "lesson:letters": 1,
      "category:lesson": 99,
      "category:work": 9,
      "condition:exhausted": 999
    }
  });
  expectEqual("saved action progress flag uses completed history count", progressFlagsLoaded.flags["lesson:star-lore"], 1);
  expectEqual("saved matching action progress flag is preserved", progressFlagsLoaded.flags["lesson:letters"], 1);
  expectEqual("saved category progress flag uses completed history count", progressFlagsLoaded.flags["category:lesson"], 2);
  expectEqual("saved unrelated category progress flag is cleared", progressFlagsLoaded.flags["category:work"], 0);
  expectEqual(
    "daily condition flag keeps plausible cap",
    progressFlagsLoaded.flags["condition:exhausted"],
    MAX_MONTH * SLOTS_PER_MONTH * DAYS_PER_WEEK
  );

  const unaffordableScheduleLoaded = loadRun({
    ...createNewRun(1),
    gold: 0,
    slotIndex: 0,
    currentSchedule: ["star-lore", "star-lore", "star-lore", "star-lore"]
  });
  expectEqual("not-started unaffordable schedule is dropped", unaffordableScheduleLoaded.currentSchedule.length, 0);
  expectEqual("not-started unaffordable schedule resets slot", unaffordableScheduleLoaded.slotIndex, 0);

  const corruptInProgressScheduleLoaded = loadRun({
    ...createNewRun(1),
    gold: 0,
    slotIndex: 2,
    currentSchedule: ["star-lore", "star-lore", "star-lore", "home-rest"]
  });
  expectEqual("in-progress schedule without matching history is dropped", corruptInProgressScheduleLoaded.currentSchedule.length, 0);
  expectEqual("in-progress schedule without matching history resets slot", corruptInProgressScheduleLoaded.slotIndex, 0);

  let legitimateInProgressSchedule = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
  legitimateInProgressSchedule = resolveNextSlot(legitimateInProgressSchedule).run;
  legitimateInProgressSchedule = resolveNextSlot(legitimateInProgressSchedule).run;
  const legitimateInProgressScheduleLoaded = loadRun(serializeRun(legitimateInProgressSchedule));
  expectEqual("in-progress saved schedule with matching history is preserved", legitimateInProgressScheduleLoaded.currentSchedule.length, SLOTS_PER_MONTH);
  expectEqual("in-progress saved schedule with matching history preserves slot", legitimateInProgressScheduleLoaded.slotIndex, 2);

  const mismatchedHistoryScheduleLoaded = loadRun({
    ...legitimateInProgressSchedule,
    history: [{ ...legitimateInProgressSchedule.history[0], actionId: "music" }]
  });
  expectEqual("in-progress schedule with mismatched history is dropped", mismatchedHistoryScheduleLoaded.currentSchedule.length, 0);
  expectEqual("in-progress schedule with mismatched history resets slot", mismatchedHistoryScheduleLoaded.slotIndex, 0);

  const corruptCompletedScheduleLoaded = loadRun({
    ...createNewRun(1),
    slotIndex: SLOTS_PER_MONTH,
    currentSchedule: ["letters", "music", "home-rest", "park"],
    history: []
  });
  expectEqual("completed schedule without matching history is dropped", corruptCompletedScheduleLoaded.currentSchedule.length, 0);
  expectEqual("completed schedule without matching history resets slot", corruptCompletedScheduleLoaded.slotIndex, 0);

  let legitimateCompletedSchedule = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
  for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
    legitimateCompletedSchedule = resolveNextSlot(legitimateCompletedSchedule).run;
  }
  const legitimateCompletedScheduleLoaded = loadRun(serializeRun(legitimateCompletedSchedule));
  expectEqual("completed saved schedule with matching history is preserved", legitimateCompletedScheduleLoaded.currentSchedule.length, SLOTS_PER_MONTH);
  expectEqual("completed saved schedule with matching history preserves slot", legitimateCompletedScheduleLoaded.slotIndex, SLOTS_PER_MONTH);

  const mismatchedCompletedHistoryScheduleLoaded = loadRun({
    ...legitimateCompletedSchedule,
    history: legitimateCompletedSchedule.history.map((entry, index) =>
      index === SLOTS_PER_MONTH - 1 ? { ...entry, actionId: "letters" } : entry
    )
  });
  expectEqual("completed schedule with mismatched history is dropped", mismatchedCompletedHistoryScheduleLoaded.currentSchedule.length, 0);
  expectEqual("completed schedule with mismatched history resets slot", mismatchedCompletedHistoryScheduleLoaded.slotIndex, 0);

  const historyLoaded = loadRun({
    ...createNewRun(1),
    month: 1,
    slotIndex: SLOTS_PER_MONTH,
    currentSchedule: ["park", "music", "home-rest", "letters"],
    history: [
      { month: 1, slot: 1, actionId: "park" },
      { month: 1, slot: 2, actionId: "music" },
      { month: 1, slot: 3, actionId: "home-rest" },
      {
        month: 1,
        slot: 4,
        actionId: "letters",
        actionLabel: "온천권 사용",
        category: "work",
        statChanges: {
          intellect: 250,
          sensibility: -250,
          reputation: "not-a-number"
        },
        goldDelta: "-12000",
        energyDelta: -400,
        stressDelta: 400,
        note: 123,
        dailyOutcomes: [
          {
            day: 99,
            kind: "missing-kind",
            label: "대성공",
            statChanges: { intellect: 4 },
            goldDelta: 7,
            energyDelta: -2,
            stressDelta: 1,
            note: "복구된 하루 기록"
          },
          "bad-outcome"
        ],
        event: {
          id: "event:restored",
          title: "복구 이벤트",
          body: "저장된 이벤트 설명",
          effects: {
            stats: {
              reputation: 250,
              courage: "not-a-number"
            },
            goldDelta: "-12000",
            energyDelta: 400,
            stressDelta: -400,
            flags: {
              "event:outing-meet": 999,
              "event:bad": "not-a-number"
            }
          }
        }
      },
      { month: 1, slot: 99, actionId: "market" },
      { month: 99, slot: 1, actionId: "plaza" },
      { actionId: "unknown-action", month: 1, slot: 1 },
      { actionId: "park", event: { id: "", title: "깨진 이벤트", body: "깨진 이벤트", effects: {} } },
      "bad-history"
    ]
  });

  expectEqual("history keeps registry-backed entries needed for completed schedule continuity", historyLoaded.history.length, 4);
  const lettersHistoryEntry = historyLoaded.history.find((entry) => entry.actionId === "letters");
  const parkHistoryEntry = historyLoaded.history.find((entry) => entry.actionId === "park");
  const invalidSlotHistoryEntry = historyLoaded.history.find((entry) => entry.actionId === "market");
  const invalidMonthHistoryEntry = historyLoaded.history.find((entry) => entry.actionId === "plaza");
  expectEqual("history month is preserved", lettersHistoryEntry?.month, 1);
  expectEqual("history slot is preserved when valid", lettersHistoryEntry?.slot, 4);
  expectEqual("history invalid slot entry is dropped", invalidSlotHistoryEntry, undefined);
  expectEqual("history invalid month entry is dropped", invalidMonthHistoryEntry, undefined);
  expectEqual("history action label recovers from registry", lettersHistoryEntry?.actionLabel, "문장학");
  expectEqual("history category recovers from registry", lettersHistoryEntry?.category, "lesson");
  expectEqual("history stat delta high clamp", lettersHistoryEntry?.statChanges.intellect, 100);
  expectEqual("history stat delta low clamp", lettersHistoryEntry?.statChanges.sensibility, -100);
  expectEqual("invalid history stat delta drops", lettersHistoryEntry?.statChanges.reputation, undefined);
  expectEqual("history gold delta clamps", lettersHistoryEntry?.goldDelta, -9999);
  expectEqual("history energy delta clamps", lettersHistoryEntry?.energyDelta, -100);
  expectEqual("history stress delta clamps", lettersHistoryEntry?.stressDelta, 100);
  expectEqual("history non-string note resets", lettersHistoryEntry?.note, "");
  expectEqual("history daily outcomes sanitize length", lettersHistoryEntry?.dailyOutcomes?.length, 1);
  expectEqual("history daily outcome day clamps", lettersHistoryEntry?.dailyOutcomes?.[0]?.day, 7);
  expectEqual("history daily outcome kind resets", lettersHistoryEntry?.dailyOutcomes?.[0]?.kind, "normal");
  expectEqual("history daily outcome label resets", lettersHistoryEntry?.dailyOutcomes?.[0]?.label, "성공");
  expectEqual("history event id is preserved", lettersHistoryEntry?.event?.id, "event:restored");
  expectEqual("history event title is preserved", lettersHistoryEntry?.event?.title, "복구 이벤트");
  expectEqual("history event body is preserved", lettersHistoryEntry?.event?.body, "저장된 이벤트 설명");
  expectEqual("history event stat delta clamps", lettersHistoryEntry?.event?.effects.stats?.reputation, 100);
  expectEqual("invalid history event stat delta drops", lettersHistoryEntry?.event?.effects.stats?.courage, undefined);
  expectEqual("history event gold delta clamps", lettersHistoryEntry?.event?.effects.goldDelta, -9999);
  expectEqual("history event energy delta clamps", lettersHistoryEntry?.event?.effects.energyDelta, 100);
  expectEqual("history event stress delta clamps", lettersHistoryEntry?.event?.effects.stressDelta, -100);
  expectEqual(
    "history event flag delta caps",
    lettersHistoryEntry?.event?.effects.flags?.["event:outing-meet"],
    MAX_MONTH * SLOTS_PER_MONTH * DAYS_PER_WEEK
  );
  expectEqual("invalid history event flag delta drops", lettersHistoryEntry?.event?.effects.flags?.["event:bad"], undefined);
  expectEqual("malformed history event is dropped", parkHistoryEntry?.event, undefined);

  let inProgressHistoryRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
  inProgressHistoryRun = resolveNextSlot(inProgressHistoryRun).run;
  inProgressHistoryRun = resolveNextSlot(inProgressHistoryRun).run;
  const progressHistoryLoaded = loadRun({
    ...inProgressHistoryRun,
    history: [
      { ...inProgressHistoryRun.history[1], month: 12, slot: 4 },
      inProgressHistoryRun.history[1],
      inProgressHistoryRun.history[0],
      { ...inProgressHistoryRun.history[0], note: "중복 슬롯" }
    ]
  });
  expectEqual("future and duplicate saved history cleanup count", progressHistoryLoaded.history.length, 2);
  expectEqual("saved history cleanup first slot", `${progressHistoryLoaded.history[0]?.month}:${progressHistoryLoaded.history[0]?.slot}`, "1:1");
  expectEqual("saved history cleanup second slot", `${progressHistoryLoaded.history[1]?.month}:${progressHistoryLoaded.history[1]?.slot}`, "1:2");
  expectEqual("saved history cleanup keeps active schedule", progressHistoryLoaded.currentSchedule.length, SLOTS_PER_MONTH);
  expectEqual("saved history cleanup keeps active slot", progressHistoryLoaded.slotIndex, 2);

  let eventRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
  for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
    eventRun = resolveNextSlot(eventRun).run;
  }
  const eventRoundTrip = loadRun(serializeRun(eventRun));
  expectEqual("generated monthly event survives save round-trip", eventRoundTrip.history.at(-1)?.event?.id, "outing:park:1");
  expectEqual("generated monthly event effect survives save round-trip", eventRoundTrip.history.at(-1)?.event?.effects.stats?.reputation, 2);
}

function checkMalformedRunRejection() {
  for (const [label, value] of [
    ["null run save", null],
    ["array run save", []],
    ["missing-version run save", { month: 8, gold: 999 }],
    ["future-version run save", { ...createNewRun(1), version: 2 }],
    ["string-version run save", { ...createNewRun(1), version: "1" }],
    ["fractional-version run save", { ...createNewRun(1), version: 1.5 }],
    ["negative-version run save", { ...createNewRun(1), version: -1 }],
    ["malformed JSON run save", "{not-json"]
  ]) {
    expectThrows(`${label} is rejected at product-core boundary`, () => loadRun(value));
  }
  expectThrowsWithMessage(
    "malformed JSON run save is rejected with product-core domain error",
    () => loadRun("{not-json"),
    "저장 데이터를 읽을 수 없습니다."
  );
}

function checkEndingSanitization() {
  const knownCodes = new Set(ENDINGS.map((ending) => ending.code));
  if (!knownCodes.has("quiet-life") || !knownCodes.has("scholar")) {
    failures.push("ending code registry is missing expected base endings.");
  }

  const loaded = loadRun({
    ...createNewRun(1),
    endingCode: "unknown-ending",
    unlockedEndings: ["quiet-life", "unknown-ending"]
  });
  expectEqual("unknown endingCode is cleared", loaded.endingCode, undefined);
  expectEqual("in-progress run unlocked endings are cleared after load", loaded.unlockedEndings.length, 0);

  const prematureEndingLoaded = loadRun({
    ...createNewRun(1),
    endingCode: "scholar",
    unlockedEndings: ["scholar", "quiet-life"]
  });
  expectEqual("premature saved endingCode is cleared", prematureEndingLoaded.endingCode, undefined);
  expectEqual("premature saved ending unlocks are cleared", prematureEndingLoaded.unlockedEndings.length, 0);

  const baseRun = createCompletedScholarRun();
  const completedLoaded = loadRun({
    ...baseRun,
    endingCode: "quiet-life",
    unlockedEndings: ["quiet-life", "merchant"]
  });
  expectEqual("completed saved endingCode is canonicalized", completedLoaded.endingCode, "scholar");
  expectEqual("completed run unlocked endings are scoped to canonical ending", completedLoaded.unlockedEndings.join(","), "scholar");
}

function checkLocalDataResetContract() {
  const storageSource = read("legacy/web-app/src/storage.ts");
  const appSource = read("legacy/web-app/src/app.ts");
  const saveContract = read("legacy/docs/save-contract.md");
  const privacyEvidence = read("legacy/docs/privacy-and-data-safety.md");
  const runtimeQa = read("legacy/docs/runtime-qa.md");

  for (const expected of [
    "export function clearAllStorage",
    "clearStorageKey(RUN_STORAGE_KEY, \"\")",
    "clearStorageKey(COLLECTION_STORAGE_KEY, serializeCollection([]))",
    "localStorage.removeItem(key)",
    "localStorage.setItem(key, fallbackValue)"
  ]) {
    if (!storageSource.includes(expected)) {
      failures.push(`storage.ts must include local data reset contract: ${expected}`);
    }
  }

  for (const expected of ["data-testid=\"reset-local-data\"", "data-testid=\"confirm-reset-local-data\"", "clearAllStorage()"]) {
    if (!appSource.includes(expected)) {
      failures.push(`app.ts must include local data reset UI/handler: ${expected}`);
    }
  }

  for (const [path, text] of [
    ["legacy/docs/save-contract.md", saveContract],
    ["legacy/docs/privacy-and-data-safety.md", privacyEvidence],
    ["legacy/docs/runtime-qa.md", runtimeQa]
  ]) {
    if (!text.includes("local data reset") && !text.includes("로컬 기록")) {
      failures.push(`${path} must document local data reset coverage.`);
    }
  }
}

function checkCollectionStorageContract() {
  const storageSource = read("legacy/web-app/src/storage.ts");
  const coreSource = read("legacy/product-core-ts/src/game.ts");
  const saveContract = read("legacy/docs/save-contract.md");
  const runtimeQa = read("legacy/docs/runtime-qa.md");

  expectEqual("legacy collection array sanitizes stale endings", loadCollection(["scholar", "unknown-ending", "scholar"]).join(","), "scholar");
  expectEqual(
    "versioned collection payload sanitizes stale endings",
    loadCollection({ version: 1, endings: ["scholar", "unknown-ending", "scholar"] }).join(","),
    "scholar"
  );
  expectEqual(
    "serializeCollection writes versioned deduplicated collection payload",
    serializeCollection(["scholar", "merchant", "scholar"]),
    JSON.stringify({ version: 1, endings: ["scholar", "merchant"] })
  );
  expectThrows("unsupported collection save schema is rejected", () => loadCollection({ version: 2, endings: ["scholar"] }));
  expectThrows("missing collection save schema version is rejected", () => loadCollection({ endings: ["scholar"] }));
  expectThrowsWithMessage(
    "malformed JSON collection save is rejected with product-core domain error",
    () => loadCollection("{not-json"),
    "도감 데이터를 읽을 수 없습니다."
  );
  expectThrows("serializeCollection rejects unknown ending codes", () =>
    serializeCollection(["scholar", "unknown-ending"])
  );
  expectThrows("serializeCollection rejects non-array direct calls", () => serializeCollection("scholar"));

  for (const expected of [
    "loadCollection(collectionRaw)",
    "serializeCollection(endings)"
  ]) {
    if (!storageSource.includes(expected)) {
      failures.push(`storage.ts must delegate collection storage contract to product-core: ${expected}`);
    }
  }

  for (const expected of [
    "CURRENT_COLLECTION_VERSION",
    "version: CURRENT_COLLECTION_VERSION",
    "assertSerializableCollection(endings)",
    "isSupportedCollectionVersion(parsed.version)",
    "parseStoredPayload(raw, \"도감 데이터를 읽을 수 없습니다.\")",
    "도감 데이터를 읽을 수 없습니다."
  ]) {
    if (!coreSource.includes(expected)) {
      failures.push(`product-core must include collection save schema and save-write guard: ${expected}`);
    }
  }

  for (const [path, text] of [
    ["legacy/docs/save-contract.md", saveContract],
    ["legacy/docs/runtime-qa.md", runtimeQa]
  ]) {
    if (!text.includes("collection save schema version guard") || !text.includes("versioned collection save")) {
      failures.push(`${path} must document collection save schema version guard coverage.`);
    }
  }
  if (!saveContract.includes("serializeCollection save-write registry guard")) {
    failures.push("legacy/docs/save-contract.md must document serializeCollection save-write registry guard coverage.");
  }
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function expectThrows(label, action) {
  try {
    action();
  } catch {
    return;
  }
  failures.push(`${label}: expected an error, but none was thrown`);
}

function expectThrowsWithMessage(label, action, expectedMessage) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) {
      return;
    }
    failures.push(`${label}: expected error message to include ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(error?.message)}`);
    return;
  }
  failures.push(`${label}: expected an error, but none was thrown`);
}

function expectFiniteForecast(label, status) {
  for (const [resource, value] of Object.entries(status.forecast ?? {})) {
    if (!Number.isFinite(value)) {
      failures.push(`${label}: ${resource} forecast must be finite, got ${JSON.stringify(value)}`);
    }
  }
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function createCompletedScholarRun() {
  let run = createNewRun(1);
  const months = [
    ["star-lore", "star-lore", "star-lore", "home-rest"],
    ...repeatMonths(4, ["letters", "library-help", "home-rest", "sleep-in"]),
    ...repeatMonths(7, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
  ];

  for (const actions of months) {
    run = selectSchedule(run, actions);
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      run = resolveNextSlot(run).run;
    }
    run = advanceMonth(run);
  }

  expectEqual("completed scholar route reaches scholar", run.endingCode, "scholar");
  expectEqual("completed scholar route keeps full history", run.history.length, MAX_MONTH * SLOTS_PER_MONTH);
  return run;
}

function repeatMonths(count, actions) {
  return Array.from({ length: count }, () => [...actions]);
}

function printReport() {
  console.log("Save contract check");
  console.log("===================");
  console.log("");
  if (failures.length === 0) {
    console.log("Failures");
    console.log("- none");
    console.log("");
    console.log("Save contract checks: PASS");
    return;
  }

  console.log("Failures");
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
  console.log("");
  console.log("Save contract checks: FAIL");
}
