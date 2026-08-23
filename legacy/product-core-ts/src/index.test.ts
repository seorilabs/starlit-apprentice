import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  ACTION_CATEGORY_LABELS,
  COLLECTION_STORAGE_KEY,
  ENDINGS,
  MAX_MONTH,
  RUN_STORAGE_KEY,
  SLOTS_PER_MONTH,
  STAT_KEYS,
  STAT_LABELS,
  advanceMonth,
  buildPublicEndingShareUrl,
  createNewRun,
  createTargetedRun,
  getActionById,
  getApprenticeProfile,
  getEndingActionRecommendations,
  getEndingByCode,
  getEndingProgress,
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
} from "./index";
import type { ActionId, EndingCode, ScheduleAction, RunState } from "./index";

describe("product-core game loop", () => {
  it("uses stable storage keys", () => {
    expect(RUN_STORAGE_KEY).toBe("starlit-apprentice:run:v1");
    expect(COLLECTION_STORAGE_KEY).toBe("starlit-apprentice:collection:v1");
  });

  it("rejects malformed new-run seeds at the creation boundary", () => {
    expect(createNewRun(7).rngSeed).toBe(7);
    expect(createTargetedRun("scholar", 11).rngSeed).toBe(11);

    for (const seed of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      "7" as unknown as number
    ]) {
      expect(() => createNewRun(seed)).toThrow(/초기 시드/);
    }
    expect(() => createTargetedRun("scholar", 1.5)).toThrow(/초기 시드/);
  });

  it("separates collection save-write rejection from load-time sanitization", () => {
    expect(loadCollection(["scholar", "unknown-ending", "scholar"])).toEqual(["scholar"]);
    expect(loadCollection({ version: 1, endings: ["scholar", "unknown-ending", "scholar"] })).toEqual(["scholar"]);
    expect(loadCollection(serializeCollection(["scholar", "merchant", "scholar"]))).toEqual(["scholar", "merchant"]);

    expect(() => loadCollection({ version: 2, endings: ["scholar"] })).toThrow(/도감/);
    expect(() => loadCollection({ endings: ["scholar"] })).toThrow(/도감/);
    expect(() => loadCollection("{not-json")).toThrow(/도감 데이터를/);
    expect(() => serializeCollection(["scholar", "unknown-ending" as EndingCode])).toThrow(/도감 기록/);
    expect(() => serializeCollection("scholar" as unknown as EndingCode[])).toThrow(/도감 기록/);
  });

  it("keeps exported content registries immutable at runtime", () => {
    const firstAction = ACTIONS[0];
    const firstEnding = ENDINGS[0];
    const endingWithRequirements = ENDINGS.find((ending) => ending.requirements?.length);
    const requirements = ENDINGS.flatMap((ending) => ending.requirements ?? []);
    const flagSumRequirement = requirements.find((requirement) => requirement.type === "flag-sum");
    const averageRequirement = requirements.find((requirement) => requirement.type === "average");

    expect(Object.isFrozen(STAT_LABELS)).toBe(true);
    expect(Object.isFrozen(ACTION_CATEGORY_LABELS)).toBe(true);
    expect(Object.isFrozen(ACTIONS)).toBe(true);
    expect(Object.isFrozen(firstAction)).toBe(true);
    expect(Object.isFrozen(firstAction.statEffects)).toBe(true);
    expect(Object.isFrozen(ENDINGS)).toBe(true);
    expect(endingWithRequirements).toBeDefined();
    expect(Object.isFrozen(endingWithRequirements?.requirements)).toBe(true);
    expect(requirements.length).toBeGreaterThan(0);
    expect(requirements.every((requirement) => Object.isFrozen(requirement))).toBe(true);

    if (flagSumRequirement?.type === "flag-sum") {
      expect(Object.isFrozen(flagSumRequirement.flags)).toBe(true);
    }
    if (averageRequirement?.type === "average") {
      expect(Object.isFrozen(averageRequirement.stats)).toBe(true);
    }

    expect(() => {
      (ACTIONS as ScheduleAction[]).push({ ...firstAction });
    }).toThrow(TypeError);
    expect(() => {
      firstAction.goldDelta = 999;
    }).toThrow(TypeError);
    expect(() => {
      firstAction.statEffects.intellect = 999;
    }).toThrow(TypeError);
    expect(getActionById(firstAction.id)).toBe(firstAction);
    expect(Object.isFrozen(getActionById(firstAction.id))).toBe(true);
    expect(getEndingByCode(firstEnding.code)).toBe(firstEnding);
    expect(Object.isFrozen(getEndingByCode(firstEnding.code))).toBe(true);
    expect(() => getActionById("unknown-action" as ActionId)).toThrow(/알 수 없는 일정/);
    expect(() => getEndingByCode("unknown-ending" as EndingCode)).toThrow(/알 수 없는 엔딩/);
  });

  it("accepts only public HTTPS URLs for release links and share origins", () => {
    expect(isPublicHttpsUrl("https://starlit-apprentice.seorilabs.com/path/?ending=scholar")).toBe(true);
    expect(isPublicHttpsUrl("https://192.0.0.9/starlit-apprentice/?ending=scholar")).toBe(true);
    expect(isPublicHttpsUrl("https://192.0.0.10/starlit-apprentice/?ending=scholar")).toBe(true);
    expect(isPublicHttpsUrl("https://[2606:4700:4700::1111]/starlit-apprentice/?ending=scholar")).toBe(true);
    expect(parsePublicHttpsUrl("https://starlit-apprentice.seorilabs.com/path/")?.pathname).toBe("/path/");
    expect(
      buildPublicEndingShareUrl(
        "scholar",
        "https://starlit-apprentice.seorilabs.com/starlit-apprentice/?utm=old#ignored",
        "https://fallback.seorilabs.com/?ending=merchant"
      )
    ).toBe("https://starlit-apprentice.seorilabs.com/starlit-apprentice/?ending=scholar");
    expect(
      buildPublicEndingShareUrl(
        "merchant",
        "확정 필요",
        "https://starlit-apprentice.seorilabs.com/play/?ending=scholar&from=preview#card"
      )
    ).toBe("https://starlit-apprentice.seorilabs.com/play/?ending=merchant");
    expect(buildPublicEndingShareUrl("unknown-ending", "https://starlit-apprentice.seorilabs.com/play/")).toBeUndefined();

    for (const value of [
      "",
      "not-a-url",
      "http://starlit-apprentice.seorilabs.com/",
      "https://release:secret@starlit-apprentice.seorilabs.com/",
      "https://localhost/starlit-apprentice/",
      "https://127.0.0.1/starlit-apprentice/",
      "https://0.0.0.0/starlit-apprentice/",
      "https://10.0.0.7/starlit-apprentice/",
      "https://100.64.0.7/starlit-apprentice/",
      "https://172.16.0.7/starlit-apprentice/",
      "https://192.168.0.7/starlit-apprentice/",
      "https://192.0.0.8/starlit-apprentice/",
      "https://192.0.0.170/starlit-apprentice/",
      "https://192.0.2.7/starlit-apprentice/",
      "https://198.18.0.7/starlit-apprentice/",
      "https://198.51.100.7/starlit-apprentice/",
      "https://203.0.113.7/starlit-apprentice/",
      "https://169.254.0.7/starlit-apprentice/",
      "https://[::]/starlit-apprentice/",
      "https://[fc00::1]/starlit-apprentice/",
      "https://[fd12:3456::1]/starlit-apprentice/",
      "https://[fe80::1]/starlit-apprentice/",
      "https://[fe90::1]/starlit-apprentice/",
      "https://[fea0::1]/starlit-apprentice/",
      "https://[febf::1]/starlit-apprentice/",
      "https://[ff00::1]/starlit-apprentice/",
      "https://[64:ff9b:1::1]/starlit-apprentice/",
      "https://[100::1]/starlit-apprentice/",
      "https://[100:0:0:1::1]/starlit-apprentice/",
      "https://[2001:2::1]/starlit-apprentice/",
      "https://[2001:db8::1]/starlit-apprentice/",
      "https://[3fff::1]/starlit-apprentice/",
      "https://[5f00::1]/starlit-apprentice/",
      "https://[::ffff:192.168.0.7]/starlit-apprentice/",
      "https://example.com/starlit-apprentice/",
      "https://share.example.com/starlit-apprentice/",
      "https://example.org/starlit-apprentice/",
      "https://example.net/starlit-apprentice/",
      "https://starlit.local/starlit-apprentice/",
      "https://starlit.test/starlit-apprentice/",
      "https://starlit.invalid/starlit-apprentice/",
      "https://starlit.example/starlit-apprentice/",
      "capacitor://localhost/?ending=scholar",
      "file:///tmp/starlit-apprentice/index.html"
    ]) {
      expect(isPublicHttpsUrl(value), value).toBe(false);
      expect(parsePublicHttpsUrl(value), value).toBeNull();
      expect(buildPublicEndingShareUrl("scholar", value), value).toBeUndefined();
    }

    expect(isBlockedPublicUrlHost("share.example.com")).toBe(true);
    expect(isBlockedPublicUrlHost("192.0.0.8")).toBe(true);
    expect(isBlockedPublicUrlHost("192.0.0.9")).toBe(false);
    expect(isBlockedPublicUrlHost("192.0.0.10")).toBe(false);
    expect(isBlockedPublicUrlHost("192.0.0.170")).toBe(true);
    expect(isBlockedPublicUrlHost("3fff::1")).toBe(true);
    expect(isBlockedPublicUrlHost("5f00::1")).toBe(true);
    expect(isBlockedPublicUrlHost("starlit-apprentice.seorilabs.com")).toBe(false);
  });

  it("has expanded stat and future variation pools", () => {
    expect(STAT_KEYS).toHaveLength(14);
    expect(ENDINGS).toHaveLength(30);
    expect(ENDINGS.filter((ending) => ending.code !== "quiet-life")).toHaveLength(29);
  });

  it("requires exactly four weekly schedule slots", () => {
    const run = createNewRun(1);
    expect(SLOTS_PER_MONTH).toBe(4);
    expect(() => selectSchedule(run, ["letters"])).toThrow(/4개/);
    expect(() => selectSchedule(run, ["letters", "music", "home-rest", "unknown" as ActionId])).toThrow(
      /알 수 없는/
    );
  });

  it("reports monthly schedule affordability from projected resources", () => {
    const poorRun: RunState = { ...createNewRun(1), gold: 0 };
    const blocked = getSchedulePlanStatus(poorRun, ["star-lore"]);

    expect(blocked.isValid).toBe(false);
    expect(blocked.forecast.gold).toBe(-40);
    expect(blocked.blockers).toEqual(["골드 부족"]);

    const funded = getSchedulePlanStatus(poorRun, ["library-help", "library-help", "star-lore"]);
    expect(funded.isValid).toBe(true);
    expect(funded.forecast.gold).toBe(30);

    expect(() => selectSchedule(poorRun, ["star-lore", "star-lore", "star-lore", "star-lore"])).toThrow(
      /골드 부족/
    );

    const forecast = getScheduleResourceForecast(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    expect(forecast).toMatchObject({ gold: 105, energy: 80, stress: 2 });
  });

  it("rejects malformed direct schedule resource forecast inputs", () => {
    const run = createNewRun(1);

    expect(() => getScheduleResourceForecast({ ...run, energy: 101 }, ["home-rest"])).toThrow(/수치/);
    expect(() => getScheduleResourceForecast({ ...run, gold: Number.NaN }, ["home-rest"])).toThrow(/수치/);
    expect(() => getScheduleResourceForecast(run, ["unknown-action" as ActionId])).toThrow(/알 수 없는/);
    expect(() =>
      getScheduleResourceForecast(run, ["home-rest", "sleep-in", "home-rest", "sleep-in", "park"])
    ).toThrow(/최대 4개/);
  });

  it("returns schedule plan blockers for malformed action lists", () => {
    const unknownActionStatus = getSchedulePlanStatus(createNewRun(1), ["unknown-action" as ActionId]);
    expect(unknownActionStatus.isValid).toBe(false);
    expect(unknownActionStatus.blockers).toEqual(["알 수 없는 일정: unknown-action"]);
    expect(unknownActionStatus.forecast).toMatchObject({ gold: 200, energy: 80, stress: 10 });

    const overfilledStatus = getSchedulePlanStatus(createNewRun(1), [
      "home-rest",
      "sleep-in",
      "home-rest",
      "sleep-in",
      "park"
    ]);
    expect(overfilledStatus.isValid).toBe(false);
    expect(overfilledStatus.blockers).toContain("월간 일정은 최대 4개까지 선택할 수 있습니다.");
  });

  it("guards non-array direct schedule action lists", () => {
    const run = createNewRun(1);
    const nonArrayActions = "home-rest" as unknown as ActionId[];
    const planStatus = getSchedulePlanStatus(run, nonArrayActions);

    expect(planStatus.isValid).toBe(false);
    expect(planStatus.blockers).toContain("월간 일정이 올바르지 않습니다.");
    expect(planStatus.forecast).toMatchObject({ gold: 200, energy: 80, stress: 10 });
    expect(() => getScheduleResourceForecast(run, nonArrayActions)).toThrow(/월간 일정/);
    expect(() => selectSchedule(run, nonArrayActions)).toThrow(/월간 일정/);
  });

  it("returns finite schedule plan fallback forecasts for malformed direct run inputs", () => {
    const nonObjectStatus = getSchedulePlanStatus(null as unknown as RunState, ["home-rest"]);
    expect(nonObjectStatus.isValid).toBe(false);
    expect(nonObjectStatus.blockers).toContain("진행 상태 구조가 올바르지 않습니다.");
    expect(Object.values(nonObjectStatus.forecast).every(Number.isFinite)).toBe(true);

    const missingResourceStatus = getSchedulePlanStatus({ version: 1 } as unknown as RunState, ["home-rest"]);
    expect(missingResourceStatus.isValid).toBe(false);
    expect(missingResourceStatus.blockers).toContain("골드 상태가 올바르지 않습니다.");
    expect(missingResourceStatus.blockers).toContain("기력 상태가 올바르지 않습니다.");
    expect(missingResourceStatus.blockers).toContain("스트레스 상태가 올바르지 않습니다.");
    expect(Object.values(missingResourceStatus.forecast).every(Number.isFinite)).toBe(true);
  });

  it("returns schedule plan blockers for non-finite resource state", () => {
    const invalidResourceRun: RunState = {
      ...createNewRun(1),
      gold: Number.NaN,
      energy: Number.POSITIVE_INFINITY,
      stress: Number.NEGATIVE_INFINITY
    };
    const status = getSchedulePlanStatus(invalidResourceRun, ["home-rest", "sleep-in"]);

    expect(status.isValid).toBe(false);
    expect(status.blockers).toEqual([
      "골드 상태가 올바르지 않습니다.",
      "기력 상태가 올바르지 않습니다.",
      "스트레스 상태가 올바르지 않습니다."
    ]);
    expect(Object.values(status.forecast).every(Number.isFinite)).toBe(true);
    expect(() => selectSchedule(invalidResourceRun, ["home-rest", "sleep-in", "home-rest", "sleep-in"])).toThrow(
      /수치/
    );
  });

  it("returns schedule plan blockers for out-of-range resource state", () => {
    const invalidResourceRun: RunState = {
      ...createNewRun(1),
      gold: -1,
      energy: 101,
      stress: -1
    };
    const status = getSchedulePlanStatus(invalidResourceRun, ["home-rest", "sleep-in"]);

    expect(status.isValid).toBe(false);
    expect(status.blockers).toEqual([
      "골드 상태가 올바르지 않습니다.",
      "기력 상태가 올바르지 않습니다.",
      "스트레스 상태가 올바르지 않습니다."
    ]);
    expect(() => selectSchedule(invalidResourceRun, ["home-rest", "sleep-in", "home-rest", "sleep-in"])).toThrow(
      /수치/
    );
  });

  it("returns schedule plan blockers for malformed non-resource run state", () => {
    const baseRun = createNewRun(1);
    const unsupportedVersionStatus = getSchedulePlanStatus(
      { ...baseRun, version: 2 as RunState["version"] },
      ["home-rest"]
    );
    const invalidMonthStatus = getSchedulePlanStatus({ ...baseRun, month: 0 }, ["home-rest"]);
    const invalidSlotStatus = getSchedulePlanStatus({ ...baseRun, slotIndex: SLOTS_PER_MONTH + 1 }, ["home-rest"]);
    const invalidStatStatus = getSchedulePlanStatus(
      {
        ...baseRun,
        stats: { ...baseRun.stats, intellect: 101 }
      },
      ["home-rest"]
    );
    const invalidSeedStatus = getSchedulePlanStatus({ ...baseRun, rngSeed: 1.5 }, ["home-rest"]);
    const invalidScheduleShapeStatus = getSchedulePlanStatus(
      { ...baseRun, currentSchedule: ["letters", "music"] },
      ["home-rest"]
    );
    const invalidFlagShapeStatus = getSchedulePlanStatus(
      { ...baseRun, flags: { "condition:exhausted": Number.NaN } },
      ["home-rest"]
    );
    const invalidHistoryShapeStatus = getSchedulePlanStatus(
      { ...baseRun, history: "bad-history" as unknown as RunState["history"] },
      ["home-rest"]
    );
    const invalidEndingShapeStatus = getSchedulePlanStatus(
      { ...baseRun, targetEndingCode: "unknown-ending" as EndingCode },
      ["home-rest"]
    );

    expect(unsupportedVersionStatus.isValid).toBe(false);
    expect(unsupportedVersionStatus.blockers).toContain("진행 상태 버전이 올바르지 않습니다.");
    expect(invalidMonthStatus.isValid).toBe(false);
    expect(invalidMonthStatus.blockers).toContain("진행 상태 수치가 올바르지 않습니다.");
    expect(invalidSlotStatus.isValid).toBe(false);
    expect(invalidSlotStatus.blockers).toContain("월간 진행 상태가 올바르지 않습니다.");
    expect(invalidStatStatus.isValid).toBe(false);
    expect(invalidStatStatus.blockers).toContain("진행 상태 수치가 올바르지 않습니다.");
    expect(invalidSeedStatus.isValid).toBe(false);
    expect(invalidSeedStatus.blockers).toContain("진행 상태 수치가 올바르지 않습니다.");
    expect(invalidScheduleShapeStatus.isValid).toBe(false);
    expect(invalidScheduleShapeStatus.blockers).toContain("진행 상태 구조가 올바르지 않습니다.");
    expect(invalidFlagShapeStatus.isValid).toBe(false);
    expect(invalidFlagShapeStatus.blockers).toContain("진행 상태 구조가 올바르지 않습니다.");
    expect(invalidHistoryShapeStatus.isValid).toBe(false);
    expect(invalidHistoryShapeStatus.blockers).toContain("진행 상태 구조가 올바르지 않습니다.");
    expect(invalidEndingShapeStatus.isValid).toBe(false);
    expect(invalidEndingShapeStatus.blockers).toContain("진행 상태 구조가 올바르지 않습니다.");
  });

  it("rejects out-of-range direct schedule selection state", () => {
    const schedule: ActionId[] = ["letters", "music", "home-rest", "park"];
    const baseRun = createNewRun(1);

    expect(() => selectSchedule({ ...baseRun, month: 0 }, schedule)).toThrow(/수치/);
    expect(() => selectSchedule({ ...baseRun, energy: 101 }, schedule)).toThrow(/수치/);
    expect(() => selectSchedule({ ...baseRun, stress: -1 }, schedule)).toThrow(/수치/);
    expect(() =>
      selectSchedule(
        {
          ...baseRun,
          stats: { ...baseRun.stats, reputation: 101 }
        },
        schedule
      )
    ).toThrow(/수치/);
    expect(() => selectSchedule({ ...baseRun, rngSeed: 1.5 }, schedule)).toThrow(/수치/);
  });

  it("rejects unsupported direct run-state versions across public game APIs", () => {
    const baseRun = createNewRun(1);
    const unsupportedRun: RunState = { ...baseRun, version: 2 as RunState["version"] };
    const selectedRun = selectSchedule(baseRun, ["letters", "music", "home-rest", "park"]);
    const unsupportedSelectedRun: RunState = { ...selectedRun, version: 2 as RunState["version"] };

    expect(() => getScheduleResourceForecast(unsupportedRun, ["home-rest"])).toThrow(/진행 상태 버전/);
    expect(() => selectSchedule(unsupportedRun, ["letters", "music", "home-rest", "park"])).toThrow(
      /진행 상태 버전/
    );
    expect(() => resolveNextSlot(unsupportedSelectedRun)).toThrow(/진행 상태 버전/);
    expect(() => advanceMonth({ ...unsupportedSelectedRun, slotIndex: SLOTS_PER_MONTH })).toThrow(/진행 상태 버전/);
    expect(() => judgeEnding(unsupportedRun)).toThrow(/진행 상태 버전/);
    expect(() => getEndingProgress(unsupportedRun)).toThrow(/진행 상태 버전/);
    expect(() => getEndingActionRecommendations(unsupportedRun, "scholar")).toThrow(/진행 상태 버전/);
    expect(() => getMonthlyCoachingInsights(unsupportedRun)).toThrow(/진행 상태 버전/);
    expect(() => getApprenticeProfile(unsupportedRun)).toThrow(/진행 상태 버전/);
  });

  it("rejects malformed direct run-state shape across public game APIs", () => {
    const baseRun = createNewRun(1);
    const selectedRun = selectSchedule(baseRun, ["letters", "music", "home-rest", "park"]);

    expect(() =>
      getScheduleResourceForecast(
        { ...baseRun, currentSchedule: ["letters", "music"] },
        ["home-rest"]
      )
    ).toThrow(/월간 일정/);
    expect(() =>
      selectSchedule(
        { ...baseRun, flags: { "condition:exhausted": Number.NaN } },
        ["letters", "music", "home-rest", "park"]
      )
    ).toThrow(/진행 플래그/);
    expect(() =>
      resolveNextSlot({ ...selectedRun, flags: { "condition:exhausted": -1 } })
    ).toThrow(/진행 플래그/);
    expect(() =>
      judgeEnding({ ...baseRun, flags: "bad-flags" as unknown as RunState["flags"] })
    ).toThrow(/진행 플래그/);
    expect(() =>
      getEndingProgress({ ...baseRun, history: "bad-history" as unknown as RunState["history"] })
    ).toThrow(/진행 기록/);
    expect(() =>
      getEndingActionRecommendations({ ...baseRun, targetEndingCode: "unknown-ending" as EndingCode }, "scholar")
    ).toThrow(/엔딩 기록/);
    expect(() =>
      getMonthlyCoachingInsights({ ...baseRun, history: [{ ...selectedRun.history[0], actionLabel: "온천권 사용" }] })
    ).toThrow(/진행 기록/);
    expect(() =>
      getApprenticeProfile({ ...baseRun, unlockedEndings: ["scholar", "unknown-ending" as EndingCode] })
    ).toThrow(/엔딩 기록/);
  });

  it("resolves a month and advances to the next one", () => {
    let run = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    let result = resolveNextSlot(run);
    expect(result.monthComplete).toBe(false);
    expect(result.dailyOutcomes).toHaveLength(7);
    expect(result.run.stats.intellect).toBeGreaterThan(10);
    expect(result.statChanges.intellect).toBe(
      result.dailyOutcomes.reduce((sum, outcome) => sum + (outcome.statChanges.intellect ?? 0), 0)
    );
    run = result.run;

    result = resolveNextSlot(run);
    run = result.run;
    result = resolveNextSlot(run);
    expect(result.monthComplete).toBe(false);
    run = result.run;
    result = resolveNextSlot(run);
    expect(result.monthComplete).toBe(true);
    run = advanceMonth(result.run);

    expect(run.month).toBe(2);
    expect(run.slotIndex).toBe(0);
    expect(run.currentSchedule).toEqual([]);
  });

  it("keeps generated rng seeds valid across slot resolution", () => {
    const seedThatWouldPersistZeroAfterOneSlot = 3725587800;
    const run = selectSchedule(createNewRun(seedThatWouldPersistZeroAfterOneSlot), [
      "home-rest",
      "sleep-in",
      "home-rest",
      "sleep-in"
    ]);

    const result = resolveNextSlot(run);
    expect(result.run.rngSeed).toBe(1);
    expect(() => serializeRun(result.run)).not.toThrow();
  });

  it("guards malformed progression state before resolving or advancing a month", () => {
    const selectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);

    expect(() => resolveNextSlot({ ...selectedRun, slotIndex: -1 })).toThrow(/진행 상태/);
    expect(() => resolveNextSlot({ ...selectedRun, slotIndex: SLOTS_PER_MONTH + 1 })).toThrow(/진행 상태/);
    expect(() => advanceMonth({ ...selectedRun, slotIndex: SLOTS_PER_MONTH + 1 })).toThrow(/진행 상태/);
    expect(() => advanceMonth({ ...selectedRun, slotIndex: SLOTS_PER_MONTH })).toThrow(/진행 기록/);
    expect(() =>
      advanceMonth({
        ...selectedRun,
        slotIndex: SLOTS_PER_MONTH,
        currentSchedule: ["letters", "music", "home-rest", "unknown" as ActionId]
      })
    ).toThrow(/월간 일정/);
  });

  it("rejects non-finite direct progression state before resolving or advancing", () => {
    const selectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);

    expect(() => resolveNextSlot({ ...selectedRun, gold: Number.NaN })).toThrow(/수치/);
    expect(() => resolveNextSlot({ ...selectedRun, energy: Number.POSITIVE_INFINITY })).toThrow(/수치/);
    expect(() =>
      resolveNextSlot({
        ...selectedRun,
        stats: { ...selectedRun.stats, intellect: Number.NEGATIVE_INFINITY }
      })
    ).toThrow(/수치/);
    expect(() => resolveNextSlot({ ...selectedRun, rngSeed: Number.NaN })).toThrow(/수치/);

    let completedRun = selectedRun;
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      completedRun = resolveNextSlot(completedRun).run;
    }

    expect(() => advanceMonth({ ...completedRun, month: Number.NaN })).toThrow(/수치/);
    expect(() => advanceMonth({ ...completedRun, stress: Number.POSITIVE_INFINITY })).toThrow(/수치/);
  });

  it("rejects non-finite direct read-model state", () => {
    const invalidStatRun: RunState = {
      ...createTargetedRun("scholar", 1),
      stats: { ...createNewRun(1).stats, intellect: Number.NaN },
      history: [
        {
          month: 1,
          slot: 1,
          actionId: "letters",
          actionLabel: "문장학",
          category: "lesson",
          statChanges: { intellect: 1 },
          goldDelta: -20,
          energyDelta: -10,
          stressDelta: 4,
          note: "테스트"
        }
      ]
    };

    expect(() => judgeEnding(invalidStatRun)).toThrow(/수치/);
    expect(() => getEndingProgress(invalidStatRun)).toThrow(/수치/);
    expect(() => getEndingActionRecommendations(invalidStatRun, "scholar")).toThrow(/수치/);
    expect(() => getMonthlyCoachingInsights(invalidStatRun)).toThrow(/수치/);
    expect(() => getApprenticeProfile(invalidStatRun)).toThrow(/수치/);
  });

  it("rejects out-of-range direct run state", () => {
    const selectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    const baseRun = createNewRun(1);

    expect(() => resolveNextSlot({ ...selectedRun, gold: -1 })).toThrow(/수치/);
    expect(() => resolveNextSlot({ ...selectedRun, energy: -1 })).toThrow(/수치/);
    expect(() => resolveNextSlot({ ...selectedRun, stress: 101 })).toThrow(/수치/);
    expect(() =>
      resolveNextSlot({
        ...selectedRun,
        stats: { ...selectedRun.stats, intellect: 101 }
      })
    ).toThrow(/수치/);
    expect(() => resolveNextSlot({ ...selectedRun, rngSeed: 1.5 })).toThrow(/수치/);

    expect(() => judgeEnding({ ...baseRun, slotIndex: SLOTS_PER_MONTH + 1 })).toThrow(/수치/);
    expect(() => getEndingProgress({ ...baseRun, energy: 101 })).toThrow(/수치/);
    expect(() => getEndingActionRecommendations({ ...baseRun, stress: -1 }, "scholar")).toThrow(/수치/);
    expect(() => getMonthlyCoachingInsights({ ...baseRun, gold: -1 })).toThrow(/수치/);
    expect(() =>
      getApprenticeProfile({
        ...baseRun,
        stats: { ...baseRun.stats, stamina: -1 }
      })
    ).toThrow(/수치/);
  });

  it("does not allow overwriting an already selected monthly schedule", () => {
    const selectedRun = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);

    expect(() =>
      selectSchedule({ ...createNewRun(1), slotIndex: -1 }, ["home-rest", "sleep-in", "home-rest", "sleep-in"])
    ).toThrow(/진행 상태/);
    expect(() =>
      selectSchedule(
        { ...createNewRun(1), slotIndex: SLOTS_PER_MONTH + 1 },
        ["home-rest", "sleep-in", "home-rest", "sleep-in"]
      )
    ).toThrow(/진행 상태/);

    expect(() => selectSchedule(selectedRun, ["home-rest", "sleep-in", "home-rest", "sleep-in"])).toThrow(
      /이미 선택된/
    );

    let completedRun = selectedRun;
    for (let week = 1; week <= SLOTS_PER_MONTH; week += 1) {
      completedRun = resolveNextSlot(completedRun).run;
    }

    expect(() => selectSchedule(completedRun, ["home-rest", "sleep-in", "home-rest", "sleep-in"])).toThrow(
      /이미 완료/
    );

    expect(() =>
      selectSchedule(
        {
          ...createNewRun(1),
          currentSchedule: ["letters", "music"],
          slotIndex: 0
        },
        ["home-rest", "sleep-in", "home-rest", "sleep-in"]
      )
    ).toThrow(/월간 일정/);
    expect(() =>
      selectSchedule(
        {
          ...createNewRun(1),
          currentSchedule: [],
          slotIndex: 1
        },
        ["home-rest", "sleep-in", "home-rest", "sleep-in"]
      )
    ).toThrow(/이미 선택된/);
  });

  it("clamps tracked values and keeps gold non-negative", () => {
    const baseRun = createNewRun(1);
    const run: RunState = {
      ...baseRun,
      gold: 0,
      energy: 1,
      stress: 99,
      stats: { ...baseRun.stats, intellect: 99 },
      currentSchedule: ["star-lore", "star-lore", "star-lore", "home-rest"],
      slotIndex: 0
    };
    const resolved = resolveNextSlot(run).run;

    expect(resolved.gold).toBe(0);
    expect(resolved.energy).toBeGreaterThanOrEqual(0);
    expect(resolved.stats.intellect).toBeLessThanOrEqual(100);
    expect(resolved.stress).toBeLessThanOrEqual(100);
  });

  it("round-trips saved run data", () => {
    const run = selectSchedule(createTargetedRun("travel-writer", 42), ["market", "plaza", "library", "park"]);
    const loaded = loadRun(serializeRun(run));

    expect(loaded.rngSeed).toBe(42);
    expect(loaded.targetEndingCode).toBe("travel-writer");
    expect(loaded.currentSchedule).toEqual(["market", "plaza", "library", "park"]);
    expect(loaded.stats.reputation).toBe(0);
  });

  it("drops stale three-slot schedules from older saves", () => {
    const loaded = loadRun({
      ...createNewRun(1),
      slotIndex: 2,
      currentSchedule: ["letters", "music", "home-rest"]
    });

    expect(loaded.slotIndex).toBe(0);
    expect(loaded.currentSchedule).toEqual([]);
  });

  it("drops not-started saved schedules that no longer satisfy core affordability", () => {
    const unaffordable = loadRun({
      ...createNewRun(1),
      gold: 0,
      slotIndex: 0,
      currentSchedule: ["star-lore", "star-lore", "star-lore", "star-lore"]
    });

    expect(unaffordable.currentSchedule).toEqual([]);
    expect(unaffordable.slotIndex).toBe(0);

    const corruptInProgress = loadRun({
      ...createNewRun(1),
      gold: 0,
      slotIndex: 2,
      currentSchedule: ["star-lore", "star-lore", "star-lore", "home-rest"]
    });
    expect(corruptInProgress.currentSchedule).toEqual([]);
    expect(corruptInProgress.slotIndex).toBe(0);

    let legitimateInProgress = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    legitimateInProgress = resolveNextSlot(legitimateInProgress).run;
    legitimateInProgress = resolveNextSlot(legitimateInProgress).run;
    const loadedLegitimateInProgress = loadRun(serializeRun(legitimateInProgress));

    expect(loadedLegitimateInProgress.currentSchedule).toEqual(["letters", "music", "home-rest", "park"]);
    expect(loadedLegitimateInProgress.slotIndex).toBe(2);

    const mismatchedHistory = loadRun({
      ...legitimateInProgress,
      history: [{ ...legitimateInProgress.history[0], actionId: "music" }]
    });
    expect(mismatchedHistory.currentSchedule).toEqual([]);
    expect(mismatchedHistory.slotIndex).toBe(0);

    const corruptCompleted = loadRun({
      ...createNewRun(1),
      slotIndex: SLOTS_PER_MONTH,
      currentSchedule: ["letters", "music", "home-rest", "park"],
      history: []
    });
    expect(corruptCompleted.currentSchedule).toEqual([]);
    expect(corruptCompleted.slotIndex).toBe(0);

    let legitimateCompleted = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      legitimateCompleted = resolveNextSlot(legitimateCompleted).run;
    }
    const loadedLegitimateCompleted = loadRun(serializeRun(legitimateCompleted));

    expect(loadedLegitimateCompleted.currentSchedule).toEqual(["letters", "music", "home-rest", "park"]);
    expect(loadedLegitimateCompleted.slotIndex).toBe(SLOTS_PER_MONTH);

    const mismatchedCompletedHistory = loadRun({
      ...legitimateCompleted,
      history: legitimateCompleted.history.map((entry, index) =>
        index === SLOTS_PER_MONTH - 1 ? { ...entry, actionId: "letters" } : entry
      )
    });
    expect(mismatchedCompletedHistory.currentSchedule).toEqual([]);
    expect(mismatchedCompletedHistory.slotIndex).toBe(0);
  });

  it("sanitizes corrupt saved values into the v1 save contract", () => {
    const loaded = loadRun({
      version: 0,
      month: 99,
      slotIndex: 99,
      gold: -100,
      stats: { intellect: 999, sensibility: -5, reputation: "bad-value" },
      stress: 500,
      energy: -10,
      flags: {
        "lesson:star-lore": 2.9,
        "category:lesson": 999,
        "condition:exhausted": 999,
        "event:stress-warning": 999,
        "condition:bad": -2,
        "event:bad": 5
      },
      history: "not-history",
      unlockedEndings: ["scholar", "unknown-ending", "scholar"],
      rngSeed: "bad-seed",
      currentSchedule: ["letters", "music", "home-rest"],
      targetEndingCode: "unknown-ending",
      endingCode: "unknown-ending"
    });

    expect(loaded.version).toBe(1);
    expect(loaded.month).toBe(1);
    expect(loaded.slotIndex).toBe(0);
    expect(loaded.currentSchedule).toEqual([]);
    expect(loaded.gold).toBe(0);
    expect(loaded.stats.intellect).toBe(100);
    expect(loaded.stats.sensibility).toBe(0);
    expect(loaded.stats.reputation).toBe(0);
    expect(loaded.stress).toBe(100);
    expect(loaded.energy).toBe(0);
    expect(loaded.flags["lesson:star-lore"]).toBe(0);
    expect(loaded.flags["category:lesson"]).toBe(0);
    expect(loaded.flags["condition:exhausted"]).toBe(MAX_MONTH * SLOTS_PER_MONTH * 7);
    expect(loaded.flags["event:stress-warning"]).toBe(MAX_MONTH * SLOTS_PER_MONTH * 7);
    expect(loaded.flags["condition:bad"]).toBeUndefined();
    expect(loaded.flags["event:bad"]).toBeUndefined();
    expect(loaded.history).toEqual([]);
    expect(loaded.unlockedEndings).toEqual([]);
    expect(loaded.rngSeed).toBe(1);
    expect(loaded.targetEndingCode).toBeUndefined();
    expect(loaded.endingCode).toBeUndefined();
  });

  it("rejects unsupported run save schema versions", () => {
    for (const version of [2, -1, 1.5, "1"]) {
      expect(() =>
        loadRun({
          ...createNewRun(1),
          version
        })
      ).toThrow(/저장 데이터를/);
    }
    expect(() => loadRun("{not-json")).toThrow(/저장 데이터를/);
  });

  it("drops saved month progress that is not backed by completed history", () => {
    const unsupportedMonth = loadRun({
      ...createNewRun(1),
      month: 3,
      history: [{ month: 2, slot: 4, actionId: "park" }]
    });
    expect(unsupportedMonth.month).toBe(1);
    expect(unsupportedMonth.slotIndex).toBe(0);
    expect(unsupportedMonth.currentSchedule).toEqual([]);
    expect(unsupportedMonth.history).toEqual([]);

    const unsupportedScheduledMonth = loadRun({
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
    expect(unsupportedScheduledMonth.month).toBe(1);
    expect(unsupportedScheduledMonth.slotIndex).toBe(0);
    expect(unsupportedScheduledMonth.currentSchedule).toEqual([]);
    expect(unsupportedScheduledMonth.history).toEqual([]);
    expect(unsupportedScheduledMonth.endingCode).toBeUndefined();
    expect(unsupportedScheduledMonth.unlockedEndings).toEqual([]);

    let completedFirstMonth = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      completedFirstMonth = resolveNextSlot(completedFirstMonth).run;
    }
    const monthTwo = advanceMonth(completedFirstMonth);
    const loadedMonthTwo = loadRun(serializeRun(monthTwo));
    expect(loadedMonthTwo.month).toBe(2);
    expect(loadedMonthTwo.slotIndex).toBe(0);
    expect(loadedMonthTwo.currentSchedule).toEqual([]);
    expect(loadedMonthTwo.history).toHaveLength(SLOTS_PER_MONTH);

    const selectedMonthTwo = selectSchedule(monthTwo, ["letters", "music", "home-rest", "park"]);
    const loadedSelectedMonthTwo = loadRun(serializeRun(selectedMonthTwo));
    expect(loadedSelectedMonthTwo.month).toBe(2);
    expect(loadedSelectedMonthTwo.currentSchedule).toEqual(["letters", "music", "home-rest", "park"]);
  });

  it("clamps saved progress flags to completed history", () => {
    const loaded = loadRun({
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

    expect(loaded.flags["lesson:star-lore"]).toBe(1);
    expect(loaded.flags["lesson:letters"]).toBe(1);
    expect(loaded.flags["category:lesson"]).toBe(2);
    expect(loaded.flags["category:work"]).toBe(0);
    expect(loaded.flags["condition:exhausted"]).toBe(MAX_MONTH * SLOTS_PER_MONTH * 7);
  });

  it("clears premature saved ending codes and canonicalizes completed endings", () => {
    const prematureEnding = loadRun({
      ...createNewRun(1),
      endingCode: "scholar",
      unlockedEndings: ["scholar", "quiet-life"]
    });
    expect(prematureEnding.endingCode).toBeUndefined();
    expect(prematureEnding.unlockedEndings).toEqual([]);

    const inProgressUnlocks = loadRun({
      ...createNewRun(1),
      unlockedEndings: ["scholar", "quiet-life"]
    });
    expect(inProgressUnlocks.unlockedEndings).toEqual([]);

    const base = createCompletedScholarRun();
    const completed = loadRun({
      ...base,
      endingCode: "quiet-life",
      unlockedEndings: ["quiet-life", "merchant"]
    });

    expect(completed.endingCode).toBe("scholar");
    expect(completed.unlockedEndings).toEqual(["scholar"]);
  });

  it("sanitizes saved history entries against the action registry", () => {
    const loaded = loadRun({
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
          statChanges: { intellect: 250, sensibility: -250, reputation: "bad-value" },
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
              stats: { reputation: 250, courage: "bad-value" },
              goldDelta: "-12000",
              energyDelta: 400,
              stressDelta: -400,
              flags: { "event:outing-meet": 999, "event:bad": "bad-value" }
            }
          }
        },
        { month: 1, slot: 9, actionId: "market" },
        { month: 99, slot: 1, actionId: "plaza" },
        { actionId: "unknown-action", month: 1, slot: 1 },
        { actionId: "park", event: { id: "", title: "깨진 이벤트", body: "깨진 이벤트", effects: {} } },
        "bad-history"
      ]
    });

    expect(loaded.history).toHaveLength(4);
    const lettersEntry = loaded.history.find((entry) => entry.actionId === "letters");
    const parkEntry = loaded.history.find((entry) => entry.actionId === "park");

    expect(lettersEntry).toMatchObject({
      month: 1,
      slot: 4,
      actionId: "letters",
      actionLabel: "문장학",
      category: "lesson",
      statChanges: { intellect: 100, sensibility: -100 },
      goldDelta: -9999,
      energyDelta: -100,
      stressDelta: 100,
      note: ""
    });
    expect(loaded.history.some((entry) => entry.actionId === "market")).toBe(false);
    expect(loaded.history.some((entry) => entry.actionId === "plaza")).toBe(false);
    expect(lettersEntry?.dailyOutcomes).toEqual([
      {
        day: 7,
        kind: "normal",
        label: "성공",
        statChanges: { intellect: 4 },
        goldDelta: 7,
        energyDelta: -2,
        stressDelta: 1,
        note: "복구된 하루 기록"
      }
    ]);
    expect(lettersEntry?.event).toEqual({
      id: "event:restored",
      title: "복구 이벤트",
      body: "저장된 이벤트 설명",
      effects: {
        stats: { reputation: 100 },
        goldDelta: -9999,
        energyDelta: 100,
        stressDelta: -100,
        flags: { "event:outing-meet": 336 }
      }
    });
    expect(parkEntry?.event).toBeUndefined();
  });

  it("drops saved history outside the current progress and duplicate slots", () => {
    let run = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    run = resolveNextSlot(run).run;
    run = resolveNextSlot(run).run;

    const loaded = loadRun({
      ...run,
      history: [
        { ...run.history[1], month: 12, slot: 4 },
        run.history[1],
        run.history[0],
        { ...run.history[0], note: "중복 슬롯" }
      ]
    });

    expect(loaded.history.map((entry) => `${entry.month}:${entry.slot}:${entry.actionId}`)).toEqual([
      "1:1:letters",
      "1:2:music"
    ]);
    expect(loaded.history[0]?.note).not.toBe("중복 슬롯");
    expect(loaded.currentSchedule).toEqual(["letters", "music", "home-rest", "park"]);
    expect(loaded.slotIndex).toBe(2);
  });

  it("preserves generated monthly events through save round-trip", () => {
    let run = selectSchedule(createNewRun(1), ["letters", "music", "home-rest", "park"]);
    for (let week = 1; week <= SLOTS_PER_MONTH; week += 1) {
      run = resolveNextSlot(run).run;
    }

    const loaded = loadRun(serializeRun(run));

    expect(loaded.history.at(-1)?.event?.id).toBe("outing:park:1");
    expect(loaded.history.at(-1)?.event?.title).toBe("작은 만남");
    expect(loaded.history.at(-1)?.event?.effects.stats?.reputation).toBe(2);
    expect(loaded.history.at(-1)?.event?.effects.flags?.["event:outing-meet"]).toBe(1);
  });

  it("rejects malformed direct run state before serialization", () => {
    const baseRun = createNewRun(1);
    const scheduledRun = selectSchedule(baseRun, ["letters", "music", "home-rest", "park"]);
    const inProgressRun = resolveNextSlot(resolveNextSlot(scheduledRun).run).run;
    let eventRun = scheduledRun;
    for (let slot = 0; slot < SLOTS_PER_MONTH; slot += 1) {
      eventRun = resolveNextSlot(eventRun).run;
    }

    expect(() => serializeRun({ ...baseRun, version: 2 as RunState["version"] })).toThrow(/저장 버전/);
    expect(() =>
      serializeRun({ ...baseRun, version: "1" as unknown as RunState["version"] })
    ).toThrow(/저장 버전/);
    expect(() =>
      serializeRun({ ...baseRun, version: undefined as unknown as RunState["version"] })
    ).toThrow(/저장 버전/);
    expect(() => serializeRun({ ...baseRun, gold: Number.NaN })).toThrow(/수치/);
    expect(() => serializeRun({ ...baseRun, energy: 101 })).toThrow(/수치/);
    expect(() =>
      serializeRun({
        ...baseRun,
        stats: { ...baseRun.stats, intellect: Number.POSITIVE_INFINITY }
      })
    ).toThrow(/수치/);
    expect(() => serializeRun({ ...baseRun, rngSeed: 0 })).toThrow(/수치/);
    expect(() => serializeRun({ ...baseRun, rngSeed: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/수치/);
    expect(() =>
      serializeRun({ ...baseRun, currentSchedule: ["letters", "music", "home-rest"] })
    ).toThrow(/월간 일정/);
    expect(() =>
      serializeRun({
        ...baseRun,
        currentSchedule: ["letters", "music", "home-rest", "unknown-action" as ActionId]
      })
    ).toThrow(/월간 일정/);
    expect(() => serializeRun({ ...baseRun, targetEndingCode: "unknown-ending" })).toThrow(/엔딩 기록/);
    expect(() => serializeRun({ ...baseRun, endingCode: "unknown-ending" })).toThrow(/엔딩 기록/);
    expect(() => serializeRun({ ...baseRun, unlockedEndings: ["scholar", "unknown-ending"] })).toThrow(/엔딩 기록/);
    expect(() =>
      serializeRun({ ...baseRun, flags: "bad-flags" as unknown as RunState["flags"] })
    ).toThrow(/진행 플래그/);
    expect(() => serializeRun({ ...baseRun, flags: { "unknown:flag": 1 } })).toThrow(/진행 플래그/);
    expect(() =>
      serializeRun({ ...baseRun, flags: { "condition:exhausted": MAX_MONTH * SLOTS_PER_MONTH * 7 + 1 } })
    ).toThrow(/진행 플래그/);
    expect(() => serializeRun({ ...baseRun, flags: { "condition:exhausted": 1.5 } })).toThrow(/진행 플래그/);
    expect(() => serializeRun({ ...baseRun, flags: { "condition:exhausted": -1 } })).toThrow(/진행 플래그/);
    expect(() =>
      serializeRun({ ...inProgressRun, flags: { ...inProgressRun.flags, "lesson:star-lore": 1 } })
    ).toThrow(/진행 플래그/);
    expect(() =>
      serializeRun({ ...inProgressRun, flags: { ...inProgressRun.flags, "category:work": 1 } })
    ).toThrow(/진행 플래그/);
    expect(() =>
      serializeRun({ ...baseRun, history: "bad-history" as unknown as RunState["history"] })
    ).toThrow(/진행 기록/);
    expect(() =>
      serializeRun({
        ...inProgressRun,
        history: [...inProgressRun.history, { ...inProgressRun.history[0], month: 12, slot: 4 }]
      })
    ).toThrow(/진행 기록/);
    expect(() =>
      serializeRun({
        ...inProgressRun,
        history: [
          { ...inProgressRun.history[0], actionId: "unknown-action" as ActionId },
          inProgressRun.history[1]
        ]
      })
    ).toThrow(/진행 기록/);
    expect(() =>
      serializeRun({
        ...inProgressRun,
        history: [{ ...inProgressRun.history[0], actionLabel: "온천권 사용" }, inProgressRun.history[1]]
      })
    ).toThrow(/진행 기록/);
    expect(() =>
      serializeRun({
        ...inProgressRun,
        history: [
          {
            ...inProgressRun.history[0],
            dailyOutcomes: [{ ...inProgressRun.history[0].dailyOutcomes![0], day: 99 }]
          },
          inProgressRun.history[1]
        ]
      })
    ).toThrow(/진행 기록/);
    expect(() =>
      serializeRun({
        ...eventRun,
        history: eventRun.history.map((entry, index) =>
          index === SLOTS_PER_MONTH - 1
            ? {
                ...entry,
                event: {
                  ...entry.event!,
                  effects: { ...entry.event!.effects, stats: { reputation: Number.NaN } }
                }
              }
            : entry
        )
      })
    ).toThrow(/진행 기록/);
  });

  it("creates a targeted run only for known endings", () => {
    const targetedRun = createTargetedRun("observatory-director", 7);

    expect(targetedRun.rngSeed).toBe(7);
    expect(targetedRun.targetEndingCode).toBe("observatory-director");
    expect(() => createTargetedRun("missing-ending", 7)).toThrow(/알 수 없는 엔딩/);
  });

  it("judges endings in the expected priority order", () => {
    const run = createNewRun(1);
    const scholarRun: RunState = {
      ...run,
      stats: { ...run.stats, intellect: 90 },
      flags: { "lesson:star-lore": 3 }
    };

    expect(judgeEnding(scholarRun).code).toBe("scholar");

    const courtRun: RunState = {
      ...run,
      stats: { ...run.stats, intellect: 65, etiquette: 60, reputation: 40 }
    };
    expect(judgeEnding(courtRun).code).toBe("court-scribe");

    const quietRun: RunState = {
      ...run,
      stats: { ...run.stats, intellect: 20, sensibility: 20, etiquette: 20, craft: 20, stamina: 20 }
    };
    expect(judgeEnding(quietRun).code).toBe("quiet-life");
  });

  it("keeps specialized endings from being shadowed by broader routes", () => {
    const base = createNewRun(1);
    const observatoryRun: RunState = {
      ...base,
      stats: { ...base.stats, intellect: 75, magic: 60 },
      flags: { "lesson:star-lore": 5 }
    };
    const travelWriterRun: RunState = {
      ...base,
      stats: { ...base.stats, sensibility: 55, intellect: 45 },
      flags: { "category:outing": 8 }
    };

    expect(judgeEnding(observatoryRun).code).toBe("observatory-director");
    expect(judgeEnding(travelWriterRun).code).toBe("travel-writer");

    const courtScholarRun: RunState = {
      ...base,
      stats: { ...base.stats, intellect: 90, etiquette: 80, reputation: 80 },
      flags: { "lesson:star-lore": 3 }
    };
    expect(judgeEnding(courtScholarRun).code).toBe("court-scribe");
  });

  it("can judge every configured ending from its own requirements fixture", () => {
    for (const ending of ENDINGS.filter((candidate) => candidate.code !== "quiet-life")) {
      expect(judgeEnding(createRunForEnding(ending)).code).toBe(ending.code);
    }
  });

  it("reports visible progress toward ending requirements", () => {
    const run: RunState = {
      ...createNewRun(1),
      stats: { ...createNewRun(1).stats, intellect: 70 },
      flags: { "lesson:star-lore": 2 }
    };
    const progress = getEndingProgress(run);
    const scholar = progress.find((entry) => entry.ending.code === "scholar");

    expect(scholar?.progress).toBe(83);
    expect(scholar?.completed).toBe(false);
    expect(scholar?.requirements).toMatchObject([
      { label: "지성", current: 70, target: 70, satisfied: true },
      { label: "별빛학", current: 2, target: 3, satisfied: false }
    ]);
  });

  it("recommends actions that move the targeted ending forward", () => {
    const scholarRecommendations = getEndingActionRecommendations(createTargetedRun("scholar", 1), "scholar", 3);
    expect(scholarRecommendations.map((recommendation) => recommendation.action.id)).toContain("star-lore");
    expect(scholarRecommendations[0]?.reasons.join(" ")).toContain("별빛학");

    const merchantRecommendations = getEndingActionRecommendations(createTargetedRun("merchant", 1), "merchant", 3);
    expect(merchantRecommendations.every((recommendation) => recommendation.score > 0)).toBe(true);
    expect(merchantRecommendations.some((recommendation) => recommendation.action.category === "work")).toBe(true);

    const completedRun = createRunForEnding(ENDINGS.find((ending) => ending.code === "scholar")!);
    expect(getEndingActionRecommendations(completedRun, "scholar")).toEqual([]);
  });

  it("filters target recommendations through schedule affordability", () => {
    const lowGoldScholar: RunState = { ...createTargetedRun("scholar", 1), gold: 0 };
    const lowGoldRecommendations = getEndingActionRecommendations(lowGoldScholar, "scholar", 3);

    expect(lowGoldRecommendations.map((recommendation) => recommendation.action.id)).not.toContain("star-lore");
    expect(
      lowGoldRecommendations.every((recommendation) =>
        getSchedulePlanStatus(lowGoldScholar, [recommendation.action.id]).isValid
      )
    ).toBe(true);

    const oneLessonBudget: RunState = { ...createTargetedRun("scholar", 1), gold: 40 };
    const recommendationsAfterPlannedLesson = getEndingActionRecommendations(oneLessonBudget, "scholar", 3, [
      "star-lore"
    ]);

    expect(recommendationsAfterPlannedLesson.map((recommendation) => recommendation.action.id)).not.toContain(
      "star-lore"
    );
    expect(
      recommendationsAfterPlannedLesson.every((recommendation) =>
        getSchedulePlanStatus(oneLessonBudget, ["star-lore", recommendation.action.id]).isValid
      )
    ).toBe(true);
  });

  it("guards target recommendation planned action prefixes", () => {
    const targetedRun = createTargetedRun("scholar", 1);

    expect(() =>
      getEndingActionRecommendations(targetedRun, "scholar", 3, ["unknown-action" as ActionId])
    ).toThrow(/알 수 없는 일정/);
    expect(() =>
      getEndingActionRecommendations(targetedRun, "scholar", 3, [
        "home-rest",
        "sleep-in",
        "home-rest",
        "sleep-in",
        "park"
      ])
    ).toThrow(/최대 4개/);
    expect(() =>
      getEndingActionRecommendations(targetedRun, "scholar", 3, "home-rest" as unknown as ActionId[])
    ).toThrow(/계획된 일정/);
  });

  it("guards read-model display limits", () => {
    const targetedRun = createTargetedRun("scholar", 1);

    expect(getEndingActionRecommendations(targetedRun, "scholar", 0)).toEqual([]);
    expect(getEndingActionRecommendations(targetedRun, "scholar", 999)).toEqual(
      getEndingActionRecommendations(targetedRun, "scholar")
    );
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => getEndingActionRecommendations(targetedRun, "scholar", limit)).toThrow(/표시 개수/);
    }

    const coachedRun: RunState = {
      ...targetedRun,
      gold: 35,
      energy: 24,
      stress: 74,
      history: [
        {
          month: 1,
          slot: 4,
          actionId: "star-lore",
          actionLabel: "별빛학",
          category: "lesson",
          statChanges: { intellect: 10 },
          goldDelta: -40,
          energyDelta: -14,
          stressDelta: 9,
          note: "월말 테스트"
        }
      ]
    };

    expect(getMonthlyCoachingInsights(coachedRun, 0)).toEqual([]);
    expect(getMonthlyCoachingInsights(coachedRun, 999)).toEqual(getMonthlyCoachingInsights(coachedRun, 4));
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => getMonthlyCoachingInsights(coachedRun, limit)).toThrow(/표시 개수/);
    }
  });

  it("has target action recommendations for every specialized ending", () => {
    for (const ending of ENDINGS.filter((candidate) => candidate.code !== "quiet-life")) {
      const recommendations = getEndingActionRecommendations(createTargetedRun(ending.code, 1), ending.code, 3);
      expect(recommendations.length, `${ending.code} should have target recommendations`).toBeGreaterThan(0);
      expect(recommendations.every((recommendation) => recommendation.reasons.length > 0)).toBe(true);
    }
  });

  it("coaches the next month from resources and target progress", () => {
    const baseRun = createTargetedRun("scholar", 1);
    const coachedRun: RunState = {
      ...baseRun,
      gold: 35,
      energy: 24,
      stress: 74,
      history: [
        {
          month: 1,
          slot: 4,
          actionId: "star-lore",
          actionLabel: "별빛학",
          category: "lesson",
          statChanges: { intellect: 10 },
          goldDelta: -40,
          energyDelta: -14,
          stressDelta: 9,
          note: "월말 테스트"
        }
      ]
    };

    const insights = getMonthlyCoachingInsights(coachedRun, 4);

    expect(insights.map((insight) => insight.id)).toEqual([
      "resource:energy",
      "resource:stress",
      "resource:gold",
      "target:scholar"
    ]);
    expect(insights[0]).toMatchObject({
      title: "기력 회복 우선",
      tone: "critical",
      actionCategory: "rest"
    });
    expect(insights[3]?.body).toContain("도서관 보조");
    expect(insights[3]?.body).not.toContain("별빛학");
  });

  it("derives apprentice growth and mood from run state", () => {
    const run = createNewRun(1);
    const earlyProfile = getApprenticeProfile(run);
    const lateProfile = getApprenticeProfile({
      ...run,
      month: 12,
      energy: 18,
      stats: { ...run.stats, stamina: 90 }
    });

    expect(earlyProfile.heightCm).toBeLessThan(lateProfile.heightCm);
    expect(earlyProfile.pose).toBe("standing");
    expect(lateProfile.growthStage).toBe("tall");
    expect(lateProfile.expression).toBe("tired");
    expect(lateProfile.pose).toBe("relaxed");
  });

  it("can complete a 12 month specialized star route", () => {
    let run = createNewRun(1);
    const route: ActionId[][] = [
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
    ];

    for (const schedule of route) {
      run = selectSchedule(run, schedule);
      for (let week = 1; week <= SLOTS_PER_MONTH; week += 1) {
        run = resolveNextSlot(run).run;
      }
      run = advanceMonth(run);
    }

    expect(run.endingCode).toBe("observatory-director");
    expect(run.unlockedEndings).toContain("observatory-director");
  });

  it("can complete a base scholar route without triggering the observatory ending", () => {
    let run = createNewRun(1);
    for (let month = 1; month <= 12; month += 1) {
      const schedule =
        month === 1
          ? ["star-lore", "star-lore", "star-lore", "home-rest"]
          : month <= 5
            ? ["letters", "library-help", "home-rest", "sleep-in"]
            : ["home-rest", "sleep-in", "home-rest", "sleep-in"];
      run = selectSchedule(run, schedule as ActionId[]);
      for (let week = 1; week <= SLOTS_PER_MONTH; week += 1) {
        run = resolveNextSlot(run).run;
      }
      run = advanceMonth(run);
    }

    expect(run.endingCode).toBe("scholar");
    expect(run.unlockedEndings).toContain("scholar");
  });
});

function createCompletedScholarRun(): RunState {
  let run = createNewRun(1);
  const months: ActionId[][] = [
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

  expect(run.endingCode).toBe("scholar");
  expect(run.history).toHaveLength(MAX_MONTH * SLOTS_PER_MONTH);
  return run;
}

function repeatMonths(count: number, actions: ActionId[]): ActionId[][] {
  return Array.from({ length: count }, () => [...actions]);
}

function createRunForEnding(ending: (typeof ENDINGS)[number]): RunState {
  const run = createNewRun(1);
  const stats = { ...run.stats };
  const flags: Record<string, number> = {};
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
