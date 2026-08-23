import { ACTIONS, ENDINGS, STAT_LABELS } from "./data.js";
import { STAT_KEYS } from "./types.js";
import type {
  ActionId,
  ApprenticeExpression,
  ApprenticePose,
  ApprenticeProfile,
  DailyOutcome,
  DailyOutcomeKind,
  EndingActionRecommendation,
  EndingCode,
  EndingDefinition,
  EndingProgress,
  EndingRequirementDefinition,
  EndingRequirementProgress,
  GameEvent,
  HistoryEntry,
  MonthlyCoachingInsight,
  ResolutionResult,
  RunState,
  ScheduleAction,
  SchedulePlanStatus,
  ScheduleResourceForecast,
  StatKey,
  Stats
} from "./types.js";

export const RUN_STORAGE_KEY = "starlit-apprentice:run:v1";
export const COLLECTION_STORAGE_KEY = "starlit-apprentice:collection:v1";
const CURRENT_RUN_VERSION = 1;
const MIN_MIGRATABLE_RUN_VERSION = 0;
export const MAX_MONTH = 12;
export const SLOTS_PER_MONTH = 4;

const DAYS_PER_WEEK = 7;
const MAX_WEEKLY_FLAG_COUNT = MAX_MONTH * SLOTS_PER_MONTH;
const MAX_DAILY_FLAG_COUNT = MAX_WEEKLY_FLAG_COUNT * DAYS_PER_WEEK;
const MAX_MONTHLY_COACHING_INSIGHTS = 4;
const FALLBACK_ENDING_CODE = "quiet-life";
const CURRENT_COLLECTION_VERSION = 1;
const MIN_COLLECTION_VERSION = 1;
const DAILY_OUTCOME_KINDS = new Set<DailyOutcomeKind>(["failure", "normal", "critical"]);
const INITIAL_STATS = Object.fromEntries(
  STAT_KEYS.map((stat) => [stat, stat === "reputation" ? 0 : 10])
) as Stats;
const statKeySet = new Set<StatKey>(STAT_KEYS);

const actionById = new Map(ACTIONS.map((action) => [action.id, action]));
const endingByCode = new Map(ENDINGS.map((ending) => [ending.code, ending]));
const actionFlagSet = new Set(ACTIONS.map((action) => action.flag));
const categoryFlagSet = new Set(ACTIONS.map((action) => `category:${action.category}`));
const endingRequirementFlagSet = new Set(
  ENDINGS.flatMap((ending) =>
    (ending.requirements ?? []).flatMap((requirement) => {
      if (requirement.type === "flag") {
        return [requirement.flag];
      }
      if (requirement.type === "flag-sum") {
        return requirement.flags;
      }
      return [];
    })
  )
);
const generatedRunFlagSet = new Set([
  "condition:exhausted",
  "condition:overstressed",
  "contest:success",
  "contest:joined",
  "event:stress-warning",
  "event:outing-meet"
]);
const runFlagSet = new Set([
  ...actionFlagSet,
  ...categoryFlagSet,
  ...endingRequirementFlagSet,
  ...generatedRunFlagSet
]);

export function createNewRun(seed = Date.now()): RunState {
  assertNewRunSeed(seed);
  return {
    version: CURRENT_RUN_VERSION,
    month: 1,
    slotIndex: 0,
    gold: 200,
    stats: cloneStats(INITIAL_STATS),
    stress: 10,
    energy: 80,
    flags: {},
    history: [],
    unlockedEndings: [],
    rngSeed: normalizeSeed(seed),
    currentSchedule: []
  };
}

export function createTargetedRun(targetEndingCode: EndingCode, seed = Date.now()): RunState {
  const ending = requireEnding(targetEndingCode);
  return {
    ...createNewRun(seed),
    targetEndingCode: ending.code
  };
}

export function selectSchedule(run: RunState, actions: ActionId[]): RunState {
  assertScheduleActionList(actions);
  assertDirectRunState(run);
  if (run.endingCode) {
    throw new Error("이미 엔딩에 도달한 기록입니다.");
  }
  if (!isValidProgressionSlotIndex(run.slotIndex)) {
    throw new Error("월간 진행 상태가 올바르지 않습니다.");
  }
  if (run.currentSchedule.length > 0 || run.slotIndex > 0) {
    if (run.slotIndex >= SLOTS_PER_MONTH) {
      throw new Error("이번 달 일정은 이미 완료되었습니다.");
    }
    throw new Error("이미 선택된 월간 일정입니다.");
  }
  if (actions.length !== SLOTS_PER_MONTH) {
    throw new Error(`월간 일정은 ${SLOTS_PER_MONTH}개여야 합니다.`);
  }
  for (const actionId of actions) {
    if (!actionById.has(actionId)) {
      throw new Error(`알 수 없는 일정입니다: ${actionId}`);
    }
  }
  const planStatus = getSchedulePlanStatus(run, actions);
  if (!planStatus.isValid) {
    throw new Error(`일정을 실행할 수 없습니다: ${planStatus.blockers.join(", ")}`);
  }

  return {
    ...cloneRun(run),
    currentSchedule: [...actions],
    slotIndex: 0
  };
}

export function getScheduleResourceForecast(run: RunState, actions: ActionId[]): ScheduleResourceForecast {
  assertScheduleActionList(actions);
  assertDirectRunState(run);
  if (actions.length > SLOTS_PER_MONTH) {
    throw new Error(`월간 일정은 최대 ${SLOTS_PER_MONTH}개까지 선택할 수 있습니다.`);
  }
  return calculateScheduleResourceForecast(run, actions);
}

function calculateScheduleResourceForecast(run: unknown, actions: ActionId[]): ScheduleResourceForecast {
  const source = isObjectRecord(run) ? run : {};
  const forecast: ScheduleResourceForecast = {
    gold: toFiniteForecastValue(source.gold),
    energy: toFiniteForecastValue(source.energy),
    stress: toFiniteForecastValue(source.stress)
  };

  for (const actionId of actions) {
    const action = requireAction(actionId);
    forecast.gold += action.goldDelta;
    forecast.energy += action.energyDelta;
    forecast.stress += action.stressDelta;
  }

  return forecast;
}

export function getSchedulePlanStatus(run: RunState, actions: ActionId[]): SchedulePlanStatus {
  const actionList = Array.isArray(actions) ? actions : [];
  const knownActions = actionList.filter(isKnownActionId);
  const forecast = calculateScheduleResourceForecast(run, knownActions);
  const blockers = [...getScheduleRunStateBlockers(run), ...getScheduleResourceStateBlockers(run)];
  if (!Array.isArray(actions)) {
    blockers.push("월간 일정이 올바르지 않습니다.");
  }
  if (actionList.length > SLOTS_PER_MONTH) {
    blockers.push(`월간 일정은 최대 ${SLOTS_PER_MONTH}개까지 선택할 수 있습니다.`);
  }
  for (const actionId of actionList) {
    if (!isKnownActionId(actionId)) {
      blockers.push(`알 수 없는 일정: ${String(actionId)}`);
    }
  }
  if (!hasBlocker(blockers, "골드 상태가 올바르지 않습니다.") && !Number.isFinite(forecast.gold)) {
    blockers.push("골드 상태가 올바르지 않습니다.");
  } else if (!hasBlocker(blockers, "골드 상태가 올바르지 않습니다.") && forecast.gold < 0) {
    blockers.push("골드 부족");
  }
  if (!hasBlocker(blockers, "기력 상태가 올바르지 않습니다.") && !Number.isFinite(forecast.energy)) {
    blockers.push("기력 상태가 올바르지 않습니다.");
  } else if (!hasBlocker(blockers, "기력 상태가 올바르지 않습니다.") && forecast.energy < 0) {
    blockers.push("기력 부족");
  }
  if (!hasBlocker(blockers, "스트레스 상태가 올바르지 않습니다.") && !Number.isFinite(forecast.stress)) {
    blockers.push("스트레스 상태가 올바르지 않습니다.");
  }

  return {
    forecast,
    blockers,
    isValid: blockers.length === 0
  };
}

function getScheduleRunStateBlockers(run: unknown): string[] {
  const blockers: string[] = [];
  if (!isObjectRecord(run)) {
    pushUniqueBlocker(blockers, "진행 상태 구조가 올바르지 않습니다.");
    return blockers;
  }
  const source = run as Partial<RunState>;
  if (source.version !== CURRENT_RUN_VERSION) {
    pushUniqueBlocker(blockers, "진행 상태 버전이 올바르지 않습니다.");
  }
  if (
    typeof source.month !== "number" ||
    !Number.isInteger(source.month) ||
    source.month < 1 ||
    source.month > MAX_MONTH
  ) {
    pushUniqueBlocker(blockers, "진행 상태 수치가 올바르지 않습니다.");
  }
  if (!isValidProgressionSlotIndex(source.slotIndex)) {
    pushUniqueBlocker(blockers, "월간 진행 상태가 올바르지 않습니다.");
  }
  if (
    !hasBoundedStats(source.stats) ||
    typeof source.rngSeed !== "number" ||
    !Number.isInteger(source.rngSeed) ||
    source.rngSeed < 1
  ) {
    pushUniqueBlocker(blockers, "진행 상태 수치가 올바르지 않습니다.");
  }
  if (!hasDirectRunStateShape(source)) {
    pushUniqueBlocker(blockers, "진행 상태 구조가 올바르지 않습니다.");
  }
  return blockers;
}

function getScheduleResourceStateBlockers(run: unknown): string[] {
  const blockers: string[] = [];
  if (!isObjectRecord(run)) {
    return blockers;
  }
  const source = run as Partial<RunState>;
  if (!Number.isFinite(source.gold) || (typeof source.gold === "number" && source.gold < 0)) {
    blockers.push("골드 상태가 올바르지 않습니다.");
  }
  if (!Number.isFinite(source.energy) || (typeof source.energy === "number" && (source.energy < 0 || source.energy > 100))) {
    blockers.push("기력 상태가 올바르지 않습니다.");
  }
  if (!Number.isFinite(source.stress) || (typeof source.stress === "number" && (source.stress < 0 || source.stress > 100))) {
    blockers.push("스트레스 상태가 올바르지 않습니다.");
  }
  return blockers;
}

function toFiniteForecastValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasBlocker(blockers: string[], blocker: string): boolean {
  return blockers.includes(blocker);
}

function pushUniqueBlocker(blockers: string[], blocker: string): void {
  if (!hasBlocker(blockers, blocker)) {
    blockers.push(blocker);
  }
}

export function resolveNextSlot(run: RunState): ResolutionResult {
  assertDirectRunState(run);
  if (run.endingCode) {
    throw new Error("엔딩에 도달한 기록은 더 진행할 수 없습니다.");
  }
  if (run.currentSchedule.length !== SLOTS_PER_MONTH) {
    throw new Error(`먼저 월간 일정 ${SLOTS_PER_MONTH}주를 선택해야 합니다.`);
  }
  if (!isValidProgressionSlotIndex(run.slotIndex)) {
    throw new Error("월간 진행 상태가 올바르지 않습니다.");
  }
  if (run.slotIndex === SLOTS_PER_MONTH) {
    throw new Error("이번 달 일정은 이미 완료되었습니다.");
  }

  const nextRun = cloneRun(run);
  const actionId = nextRun.currentSchedule[nextRun.slotIndex];
  const action = requireAction(actionId);
  const before = cloneStats(nextRun.stats);
  const beforeGold = nextRun.gold;
  const beforeEnergy = nextRun.energy;
  const beforeStress = nextRun.stress;
  const dailyOutcomes: DailyOutcome[] = [];

  let seed = nextRun.rngSeed;
  for (let day = 1; day <= DAYS_PER_WEEK; day += 1) {
    seed = nextSeed(seed);
    dailyOutcomes.push(resolveActionDay(nextRun, action, day, seed));
  }
  nextRun.flags[action.flag] = flagCount(nextRun.flags, action.flag) + 1;
  nextRun.flags[`category:${action.category}`] = flagCount(nextRun.flags, `category:${action.category}`) + 1;

  const note = buildActionNote(nextRun, action, dailyOutcomes);
  const event = createMonthlyEvent(nextRun, action);
  if (event) {
    applyEvent(nextRun, event);
  }

  const statChanges = diffStats(before, nextRun.stats);
  const goldDelta = nextRun.gold - beforeGold;
  const energyDelta = nextRun.energy - beforeEnergy;
  const stressDelta = nextRun.stress - beforeStress;

  const historyEntry: HistoryEntry = {
    month: nextRun.month,
    slot: nextRun.slotIndex + 1,
    actionId: action.id,
    actionLabel: action.label,
    category: action.category,
    dailyOutcomes,
    statChanges,
    goldDelta,
    energyDelta,
    stressDelta,
    note,
    event
  };

  nextRun.history.push(historyEntry);
  nextRun.slotIndex += 1;
  nextRun.rngSeed = nextSeed(seed);

  return {
    run: nextRun,
    action,
    dailyOutcomes,
    statChanges,
    goldDelta,
    energyDelta,
    stressDelta,
    note,
    event,
    monthComplete: nextRun.slotIndex >= SLOTS_PER_MONTH
  };
}

export function advanceMonth(run: RunState): RunState {
  assertDirectRunState(run);
  if (run.endingCode) {
    return cloneRun(run);
  }
  if (!isValidProgressionSlotIndex(run.slotIndex)) {
    throw new Error("월간 진행 상태가 올바르지 않습니다.");
  }
  if (run.currentSchedule.length !== SLOTS_PER_MONTH || run.slotIndex !== SLOTS_PER_MONTH) {
    throw new Error(`이번 달 일정 ${SLOTS_PER_MONTH}주를 모두 완료해야 다음 달로 넘어갈 수 있습니다.`);
  }

  const nextRun = cloneRun(run);
  if (!isKnownSchedule(nextRun.currentSchedule) || !hasCurrentMonthHistoryPrefix(nextRun)) {
    throw new Error("이번 달 진행 기록이 월간 일정과 일치하지 않습니다.");
  }

  if (nextRun.month >= MAX_MONTH) {
    const ending = judgeEnding(nextRun);
    nextRun.endingCode = ending.code;
    if (!nextRun.unlockedEndings.includes(ending.code)) {
      nextRun.unlockedEndings.push(ending.code);
    }
    return nextRun;
  }

  nextRun.month += 1;
  nextRun.slotIndex = 0;
  nextRun.currentSchedule = [];
  nextRun.energy = clamp(nextRun.energy + 8, 0, 100);
  nextRun.stress = clamp(nextRun.stress - 4, 0, 100);
  return nextRun;
}

export function judgeEnding(run: RunState): EndingDefinition {
  assertDirectRunState(run);

  const satisfiedEnding = ENDINGS.map((ending, index) => ({ ending, index }))
    .filter(
      ({ ending }) =>
        ending.code !== FALLBACK_ENDING_CODE &&
        ending.requirements?.every((requirement) => buildRequirementProgress(run, requirement).satisfied)
    )
    .sort((left, right) => {
      const priorityDiff = (right.ending.priority ?? right.index) - (left.ending.priority ?? left.index);
      return priorityDiff === 0 ? left.index - right.index : priorityDiff;
    })[0]?.ending;

  return satisfiedEnding ?? requireEnding(FALLBACK_ENDING_CODE);
}

export function getEndingProgress(run: RunState): EndingProgress[] {
  assertDirectRunState(run);

  return ENDINGS.filter((ending) => ending.code !== FALLBACK_ENDING_CODE && ending.requirements?.length)
    .map((ending) => {
      const requirements = ending.requirements?.map((requirement) => buildRequirementProgress(run, requirement)) ?? [];
      const progress = Math.round(
        (requirements.reduce((sum, requirement) => sum + requirement.progress, 0) / requirements.length) * 100
      );
      return {
        ending,
        requirements,
        progress,
        completed: requirements.every((requirement) => requirement.satisfied)
      };
    })
    .sort((a, b) => b.progress - a.progress);
}

export function getEndingActionRecommendations(
  run: RunState,
  endingCode: EndingCode,
  limit = ACTIONS.length,
  plannedActions: ActionId[] = []
): EndingActionRecommendation[] {
  assertDirectRunState(run);
  const safeLimit = normalizeReadModelLimit(limit, ACTIONS.length);
  const safePlannedActions = validatePlannedActionPrefix(plannedActions);

  const ending = requireEnding(endingCode);
  const requirements = ending.requirements ?? [];
  if (requirements.length === 0) {
    return [];
  }

  const progress = getEndingProgress(run).find((entry) => entry.ending.code === ending.code);
  if (progress?.completed) {
    return [];
  }

  const pendingRequirements = requirements.filter((_, index) => !progress?.requirements[index]?.satisfied);
  return ACTIONS.map((action, index) => ({
    action,
    index,
    ...scoreEndingAction(action, pendingRequirements)
  }))
    .filter(
      (recommendation) =>
        recommendation.score > 0 && isRecommendationSelectable(run, safePlannedActions, recommendation.action.id)
    )
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, safeLimit)
    .map(({ action, reasons, score }) => ({ action, reasons, score }));
}

export function getMonthlyCoachingInsights(run: RunState, limit = 3): MonthlyCoachingInsight[] {
  assertDirectRunState(run);
  const safeLimit = normalizeReadModelLimit(limit, MAX_MONTHLY_COACHING_INSIGHTS);

  if (run.history.length === 0 || run.endingCode) {
    return [];
  }

  const insights: MonthlyCoachingInsight[] = [];

  if (run.energy <= 30) {
    insights.push({
      id: "resource:energy",
      title: "기력 회복 우선",
      body: "다음 달은 휴식을 1~2주 넣어 실패 확률과 스트레스 누적을 먼저 낮추세요.",
      tone: "critical",
      actionCategory: "rest",
      actionIds: ["home-rest", "sleep-in", "hot-spring"]
    });
  }

  if (run.stress >= 68) {
    insights.push({
      id: "resource:stress",
      title: "스트레스 관리",
      body: "스트레스가 높으면 평판과 기력이 같이 흔들립니다. 휴식이나 가벼운 외출을 섞는 편이 안전합니다.",
      tone: run.stress >= 82 ? "critical" : "warning",
      actionCategory: "rest",
      actionIds: ["home-rest", "hot-spring", "park"]
    });
  }

  if (run.gold < 80) {
    insights.push({
      id: "resource:gold",
      title: "골드 보충",
      body: "수업 선택지가 막히지 않도록 다음 달 초반에 일정을 통해 골드를 먼저 확보하세요.",
      tone: "warning",
      actionCategory: "work",
      actionIds: ["library-help", "tea-service", "scribe-aide"]
    });
  }

  const targetInsight = run.targetEndingCode ? buildTargetCoachingInsight(run, run.targetEndingCode) : undefined;
  if (targetInsight) {
    insights.push(targetInsight);
  } else {
    const closestEnding = getEndingProgress(run).find((entry) => !entry.completed && entry.progress >= 45);
    if (closestEnding) {
      const recommendations = getEndingActionRecommendations(run, closestEnding.ending.code, 2);
      insights.push({
        id: `ending:${closestEnding.ending.code}`,
        title: `${closestEnding.ending.title} 접근 중`,
        body:
          recommendations.length > 0
            ? `현재 ${closestEnding.progress}%. ${formatActionLabels(recommendations.map((entry) => entry.action.id))} 쪽을 보강하면 특화 엔딩에 가까워집니다.`
            : `현재 ${closestEnding.progress}%. 조건을 유지하면서 자원을 안정적으로 관리하세요.`,
        tone: "positive",
        actionCategory: recommendations[0]?.action.category,
        actionIds: recommendations.map((entry) => entry.action.id)
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: "pace:stable",
      title: "균형 유지",
      body: "자원이 안정적입니다. 원하는 미래 후보의 부족 조건을 기준으로 다음 달 일정을 좁혀도 됩니다.",
      tone: "positive"
    });
  }

  return insights.slice(0, safeLimit);
}

export function getApprenticeProfile(run: RunState): ApprenticeProfile {
  assertDirectRunState(run);

  const heightCm = clamp(124 + Math.floor((run.month - 1) * 2.1) + Math.floor(run.stats.stamina / 20), 124, 152);
  const growthStage = heightCm >= 145 ? "tall" : heightCm >= 135 ? "growing" : "seedling";
  const expression = getApprenticeExpression(run);
  const pose = getApprenticePose(run);

  return {
    heightCm,
    growthStage,
    expression,
    pose,
    expressionLabel: expressionLabel(expression),
    poseLabel: poseLabel(pose)
  };
}

export function serializeRun(run: RunState): string {
  assertSerializableRunState(run);
  return JSON.stringify(run);
}

export function serializeCollection(endings: EndingCode[]): string {
  assertSerializableCollection(endings);
  return JSON.stringify({
    version: CURRENT_COLLECTION_VERSION,
    endings: uniqueEndings(endings)
  });
}

export function loadRun(raw: string | unknown): RunState {
  const parsed = parseStoredPayload(raw, "저장 데이터를 읽을 수 없습니다.");
  if (!isRunLike(parsed) || !isSupportedRunVersion(parsed.version)) {
    throw new Error("저장 데이터를 읽을 수 없습니다.");
  }

  const run = parsed as RunState;
  const currentSchedule = sanitizeSchedule(run.currentSchedule);
  const loaded: RunState = {
    version: 1,
    month: clampNumber(run.month, 1, MAX_MONTH),
    slotIndex: currentSchedule.length === 0 ? 0 : clampNumber(run.slotIndex, 0, SLOTS_PER_MONTH),
    gold: Math.max(0, Number(run.gold) || 0),
    stats: sanitizeStats(run.stats),
    stress: clampNumber(run.stress, 0, 100),
    energy: clampNumber(run.energy, 0, 100),
    flags: sanitizeFlags(run.flags),
    history: sanitizeHistory(run.history),
    unlockedEndings: sanitizeEndings(run.unlockedEndings),
    rngSeed: normalizeSeed(run.rngSeed),
    currentSchedule,
    targetEndingCode:
      run.targetEndingCode && endingByCode.has(run.targetEndingCode) ? run.targetEndingCode : undefined,
    endingCode: run.endingCode && endingByCode.has(run.endingCode) ? run.endingCode : undefined
  };

  const historyCleaned = sanitizeLoadedHistoryProgress(loaded);
  const scheduleCleaned = sanitizeLoadedScheduleAffordability(sanitizeLoadedScheduleContinuity(historyCleaned));
  const progressCleaned = sanitizeLoadedMonthProgress(sanitizeLoadedHistoryProgress(scheduleCleaned));
  const flagCleaned = sanitizeLoadedProgressFlags(sanitizeLoadedHistoryProgress(progressCleaned));
  return sanitizeLoadedEndingState(sanitizeLoadedHistoryProgress(flagCleaned));
}

export function loadCollection(raw: string | unknown): EndingCode[] {
  const parsed = parseStoredPayload(raw, "도감 데이터를 읽을 수 없습니다.");
  if (Array.isArray(parsed)) {
    return sanitizeCollection(parsed);
  }
  if (
    !isCollectionSavePayload(parsed) ||
    !isSupportedCollectionVersion(parsed.version) ||
    !Array.isArray(parsed.endings)
  ) {
    throw new Error("도감 데이터를 읽을 수 없습니다.");
  }
  return sanitizeCollection(parsed.endings);
}

export function getActionById(actionId: ActionId): ScheduleAction {
  return requireAction(actionId);
}

export function getEndingByCode(endingCode: EndingCode): EndingDefinition {
  return requireEnding(endingCode);
}

function buildTargetCoachingInsight(run: RunState, endingCode: EndingCode): MonthlyCoachingInsight | undefined {
  const ending = requireEnding(endingCode);
  const progress = getEndingProgress(run).find((entry) => entry.ending.code === ending.code);
  if (progress?.completed) {
    return {
      id: `target:${ending.code}:complete`,
      title: `${ending.title} 조건 충족`,
      body: "목표 조건은 충족했습니다. 남은 달은 자원과 스트레스를 안정적으로 유지하세요.",
      tone: "positive"
    };
  }

  const recommendations = getEndingActionRecommendations(run, ending.code, 2);
  if (recommendations.length === 0) {
    return undefined;
  }

  return {
    id: `target:${ending.code}`,
    title: `${ending.title} 보강`,
    body: `현재 ${progress?.progress ?? 0}%. 다음 달은 ${formatActionLabels(
      recommendations.map((entry) => entry.action.id)
    )} 중심으로 부족 조건을 채우세요.`,
    tone: "positive",
    actionCategory: recommendations[0]?.action.category,
    actionIds: recommendations.map((entry) => entry.action.id)
  };
}

function formatActionLabels(actionIds: ActionId[]): string {
  return actionIds.map((actionId) => requireAction(actionId).label).join(" · ");
}

function normalizeReadModelLimit(limit: number, max: number): number {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("표시 개수가 올바르지 않습니다.");
  }
  return Math.min(limit, max);
}

function validatePlannedActionPrefix(plannedActions: ActionId[]): ActionId[] {
  if (!Array.isArray(plannedActions)) {
    throw new Error("계획된 일정이 올바르지 않습니다.");
  }
  if (plannedActions.length > SLOTS_PER_MONTH) {
    throw new Error(`계획된 일정은 최대 ${SLOTS_PER_MONTH}개까지 선택할 수 있습니다.`);
  }
  for (const actionId of plannedActions) {
    if (!isKnownActionId(actionId)) {
      throw new Error(`알 수 없는 일정: ${String(actionId)}`);
    }
  }
  return [...plannedActions];
}

function isRecommendationSelectable(run: RunState, plannedActions: ActionId[], actionId: ActionId): boolean {
  if (plannedActions.length >= SLOTS_PER_MONTH) {
    return false;
  }
  return getSchedulePlanStatus(run, [...plannedActions, actionId]).isValid;
}

function getApprenticeExpression(run: RunState): ApprenticeExpression {
  if (run.energy <= 24) {
    return "tired";
  }
  if (run.stress >= 72) {
    return "worried";
  }
  if (run.stats.reputation >= 55 || getEndingProgress(run).some((entry) => entry.completed)) {
    return "proud";
  }
  if (run.stats.focus >= 50 || run.stats.intellect >= 60 || run.stats.magic >= 55) {
    return "focused";
  }
  if (run.energy >= 72 && run.stress <= 32) {
    return "bright";
  }
  return "calm";
}

function getApprenticePose(run: RunState): ApprenticePose {
  if (run.energy <= 24 || run.stress >= 78) {
    return "relaxed";
  }
  if (run.stats.leadership >= 55 || run.stats.reputation >= 50) {
    return "confident";
  }

  const latest = run.history.at(-1);
  if (!latest) {
    return "standing";
  }
  if (latest.category === "lesson") {
    return "reading";
  }
  if (latest.category === "work") {
    return "working";
  }
  if (latest.category === "rest") {
    return "relaxed";
  }
  return "waving";
}

function expressionLabel(expression: ApprenticeExpression): string {
  const labels: Record<ApprenticeExpression, string> = {
    calm: "차분",
    bright: "밝음",
    focused: "집중",
    proud: "의기양양",
    tired: "피곤",
    worried: "걱정"
  };
  return labels[expression];
}

function poseLabel(pose: ApprenticePose): string {
  const labels: Record<ApprenticePose, string> = {
    standing: "기본",
    reading: "읽기",
    working: "작업",
    relaxed: "휴식",
    waving: "인사",
    confident: "자신감"
  };
  return labels[pose];
}

function resolveActionDay(run: RunState, action: ScheduleAction, day: number, seed: number): DailyOutcome {
  const before = cloneStats(run.stats);
  const beforeGold = run.gold;
  const beforeEnergy = run.energy;
  const beforeStress = run.stress;
  const kind = pickDailyOutcomeKind(run, action, seed);
  const deltas = buildDailyDeltas(action, day, kind);

  applyDailyDeltas(run, deltas);

  return {
    day,
    kind,
    label: dailyOutcomeLabel(kind),
    statChanges: diffStats(before, run.stats),
    goldDelta: run.gold - beforeGold,
    energyDelta: run.energy - beforeEnergy,
    stressDelta: run.stress - beforeStress,
    note: buildDailyNote(action, kind)
  };
}

function applyDailyDeltas(
  run: RunState,
  deltas: {
    stats: Partial<Stats>;
    goldDelta: number;
    energyDelta: number;
    stressDelta: number;
  }
): void {
  for (const stat of STAT_KEYS) {
    const delta = deltas.stats[stat] ?? 0;
    run.stats[stat] = clamp(run.stats[stat] + delta, 0, 100);
  }
  run.gold = Math.max(0, run.gold + deltas.goldDelta);
  run.energy = clamp(run.energy + deltas.energyDelta, 0, 100);
  run.stress = clamp(run.stress + deltas.stressDelta, 0, 100);

  if (run.energy <= 0) {
    run.stress = clamp(run.stress + 5, 0, 100);
    run.flags["condition:exhausted"] = flagCount(run.flags, "condition:exhausted") + 1;
  }
  if (run.stress >= 85) {
    run.energy = clamp(run.energy - 5, 0, 100);
    run.stats.reputation = clamp(run.stats.reputation - 2, 0, 100);
    run.flags["condition:overstressed"] = flagCount(run.flags, "condition:overstressed") + 1;
  }
}

function buildDailyDeltas(
  action: ScheduleAction,
  day: number,
  kind: DailyOutcomeKind
): {
  stats: Partial<Stats>;
  goldDelta: number;
  energyDelta: number;
  stressDelta: number;
} {
  const stats: Partial<Stats> = {};
  for (const stat of STAT_KEYS) {
    const baseDelta = distributeDelta(action.statEffects[stat] ?? 0, day);
    const adjusted = adjustDailyStatDelta(baseDelta, kind);
    if (adjusted !== 0) {
      stats[stat] = adjusted;
    }
  }

  return {
    stats,
    goldDelta: adjustDailyResourceDelta(distributeDelta(action.goldDelta, day), kind, "gold", action.category),
    energyDelta: adjustDailyResourceDelta(distributeDelta(action.energyDelta, day), kind, "energy", action.category),
    stressDelta: adjustDailyResourceDelta(distributeDelta(action.stressDelta, day), kind, "stress", action.category)
  };
}

function pickDailyOutcomeKind(run: RunState, action: ScheduleAction, seed: number): DailyOutcomeKind {
  const roll = seedToUnit(seed);
  const pressure = clampFloat((run.stress - run.energy * 0.45) / 100, -0.25, 0.55);
  const aptitude = getActionAptitude(run, action);
  const categoryFailMod = action.category === "rest" ? -0.05 : action.category === "work" ? 0.04 : 0;
  const failChance = clampFloat(0.1 + pressure * 0.28 + categoryFailMod - aptitude * 0.08, 0.03, 0.34);
  const criticalChance = clampFloat(0.08 + run.energy / 420 - run.stress / 500 + aptitude * 0.08, 0.04, 0.28);

  if (roll < failChance) {
    return "failure";
  }
  if (roll > 1 - criticalChance) {
    return "critical";
  }
  return "normal";
}

function getActionAptitude(run: RunState, action: ScheduleAction): number {
  const relatedStats = STAT_KEYS.filter((stat) => stat !== "reputation" && (action.statEffects[stat] ?? 0) > 0);
  if (relatedStats.length === 0) {
    return 0;
  }
  const average = relatedStats.reduce((sum, stat) => sum + run.stats[stat], 0) / relatedStats.length;
  return clampFloat(average / 100, 0, 1);
}

function adjustDailyStatDelta(delta: number, kind: DailyOutcomeKind): number {
  if (delta <= 0) {
    return delta;
  }
  if (kind === "failure") {
    return scaleDelta(delta, 0.25, true);
  }
  if (kind === "critical") {
    return scaleDelta(delta, 2);
  }
  return delta;
}

function adjustDailyResourceDelta(
  delta: number,
  kind: DailyOutcomeKind,
  resource: "gold" | "energy" | "stress",
  category: ScheduleAction["category"]
): number {
  if (delta === 0) {
    return 0;
  }

  if (kind === "failure") {
    if (resource === "gold" && delta > 0) {
      return scaleDelta(delta, 0.45, true);
    }
    if (resource === "energy" && delta > 0) {
      return scaleDelta(delta, 0.5, true);
    }
    if (resource === "stress" && delta < 0) {
      return scaleDelta(delta, 0.5, true);
    }
    if (resource === "stress" && delta > 0) {
      return delta + 1;
    }
    return delta;
  }

  if (kind === "critical") {
    if (delta > 0 && (resource === "gold" || resource === "energy")) {
      return scaleDelta(delta, 1.75);
    }
    if (resource === "stress" && delta < 0) {
      return scaleDelta(delta, category === "rest" ? 1.8 : 1.35);
    }
    if (resource === "stress" && delta > 0) {
      return scaleDelta(delta, 0.5, true);
    }
    return delta;
  }

  return delta;
}

function distributeDelta(delta: number, day: number): number {
  if (delta === 0) {
    return 0;
  }
  const sign = delta > 0 ? 1 : -1;
  const absolute = Math.abs(delta);
  const base = Math.floor(absolute / DAYS_PER_WEEK);
  const remainder = absolute % DAYS_PER_WEEK;
  return sign * (base + (day <= remainder ? 1 : 0));
}

function scaleDelta(delta: number, factor: number, allowZero = false): number {
  if (delta === 0) {
    return 0;
  }
  const scaled = Math.round(Math.abs(delta) * factor);
  if (scaled === 0 && allowZero) {
    return 0;
  }
  return (delta > 0 ? 1 : -1) * Math.max(1, scaled);
}

function seedToUnit(seed: number): number {
  return seed / 0xffffffff;
}

function dailyOutcomeLabel(kind: DailyOutcomeKind): string {
  if (kind === "critical") {
    return "대성공";
  }
  if (kind === "failure") {
    return "실패";
  }
  return "성공";
}

function buildDailyNote(action: ScheduleAction, kind: DailyOutcomeKind): string {
  if (kind === "critical") {
    return `${action.label}에서 눈에 띄는 성과를 냈다.`;
  }
  if (kind === "failure") {
    return `${action.label}이 뜻대로 풀리지 않았다.`;
  }
  return `${action.place}에서 차근차근 시간을 보냈다.`;
}

function createMonthlyEvent(run: RunState, action: ScheduleAction): GameEvent | undefined {
  if (run.slotIndex !== SLOTS_PER_MONTH - 1) {
    return undefined;
  }

  if ([3, 6, 9, 12].includes(run.month)) {
    const bestStat = bestNonReputationStat(run.stats);
    const success = run.stats[bestStat] + run.stats.reputation + run.energy - run.stress >= 85;
    const eventTitleByMonth: Record<number, string> = {
      3: "봄 예법회",
      6: "여름 음악회",
      9: "가을 공예전",
      12: "겨울 별빛제"
    };
    return {
      id: `contest:${run.month}`,
      title: eventTitleByMonth[run.month] ?? "계절 대회",
      body: success
        ? "견습생은 이번 계절의 무대에서 안정적으로 실력을 보여 주었다."
        : "무대는 낯설었지만 다음 목표를 분명히 배웠다.",
      effects: success
        ? { stats: { reputation: 8 }, goldDelta: 20, stressDelta: 4, flags: { "contest:success": 1 } }
        : { stats: { reputation: 3 }, stressDelta: 6, flags: { "contest:joined": 1 } }
    };
  }

  if (run.stress >= 80) {
    return {
      id: `condition:stress:${run.month}`,
      title: "무리한 한 달",
      body: "쌓인 피로 때문에 다음 달은 휴식도 고려해야 한다.",
      effects: { energyDelta: -8, flags: { "event:stress-warning": 1 } }
    };
  }

  if (action.category === "outing") {
    return {
      id: `outing:${action.id}:${run.month}`,
      title: "작은 만남",
      body: `${action.place}에서 견습생을 알아보는 사람이 생겼다.`,
      effects: { stats: { reputation: 2 }, flags: { "event:outing-meet": 1 } }
    };
  }

  return undefined;
}

function applyEvent(run: RunState, event: GameEvent): void {
  if (event.effects.stats) {
    for (const stat of STAT_KEYS) {
      const delta = event.effects.stats[stat] ?? 0;
      run.stats[stat] = clamp(run.stats[stat] + delta, 0, 100);
    }
  }
  run.gold = Math.max(0, run.gold + (event.effects.goldDelta ?? 0));
  run.energy = clamp(run.energy + (event.effects.energyDelta ?? 0), 0, 100);
  run.stress = clamp(run.stress + (event.effects.stressDelta ?? 0), 0, 100);
  if (event.effects.flags) {
    for (const [flag, delta] of Object.entries(event.effects.flags)) {
      run.flags[flag] = flagCount(run.flags, flag) + delta;
    }
  }
}

function buildRequirementProgress(run: RunState, requirement: EndingRequirementDefinition): EndingRequirementProgress {
  const direction = requirement.direction ?? "at-least";
  if (requirement.type === "stat") {
    return requirementProgress(
      requirement.label ?? STAT_LABELS[requirement.stat],
      run.stats[requirement.stat],
      requirement.target,
      direction
    );
  }
  if (requirement.type === "resource") {
    return requirementProgress(
      requirement.label ?? resourceLabel(requirement.resource),
      getResourceValue(run, requirement.resource),
      requirement.target,
      direction
    );
  }
  if (requirement.type === "flag") {
    return requirementProgress(requirement.label, flagCount(run.flags, requirement.flag), requirement.target, direction);
  }
  if (requirement.type === "flag-sum") {
    const current = requirement.flags.reduce((sum, flag) => sum + flagCount(run.flags, flag), 0);
    return requirementProgress(requirement.label, current, requirement.target, direction);
  }
  const current = Math.round(
    requirement.stats.reduce((sum, stat) => sum + run.stats[stat], 0) / requirement.stats.length
  );
  return requirementProgress(requirement.label, current, requirement.target, direction);
}

function scoreEndingAction(
  action: ScheduleAction,
  requirements: EndingRequirementDefinition[]
): Pick<EndingActionRecommendation, "reasons" | "score"> {
  const reasons: string[] = [];
  let score = 0;

  for (const requirement of requirements) {
    if (requirement.type === "stat") {
      const delta = action.statEffects[requirement.stat] ?? 0;
      if (delta > 0) {
        reasons.push(`${requirement.label ?? STAT_LABELS[requirement.stat]} +${delta}`);
        score += delta;
      }
      continue;
    }

    if (requirement.type === "average") {
      const delta = requirement.stats.reduce((sum, stat) => sum + (action.statEffects[stat] ?? 0), 0);
      if (delta > 0) {
        reasons.push(`${requirement.label} +${delta}`);
        score += delta;
      }
      continue;
    }

    if (requirement.type === "flag") {
      if (action.flag === requirement.flag) {
        reasons.push(requirement.label);
        score += 18;
        continue;
      }
      if (`category:${action.category}` === requirement.flag) {
        reasons.push(requirement.label);
        score += 12;
      }
      continue;
    }

    if (requirement.type === "flag-sum") {
      if (requirement.flags.includes(action.flag) || requirement.flags.includes(`category:${action.category}`)) {
        reasons.push(requirement.label);
        score += 18;
      }
      continue;
    }

    if (requirement.resource === "gold" && action.goldDelta > 0) {
      reasons.push(`${requirement.label ?? "골드"} +${action.goldDelta}`);
      score += Math.ceil(action.goldDelta / 4);
    }
    if (requirement.resource === "energy" && action.energyDelta > 0) {
      reasons.push(`${requirement.label ?? "기력"} +${action.energyDelta}`);
      score += Math.ceil(action.energyDelta / 4);
    }
    if (requirement.resource === "stress") {
      const wantsLowerStress = (requirement.direction ?? "at-least") === "at-most";
      if (wantsLowerStress && action.stressDelta < 0) {
        reasons.push(`${requirement.label ?? "스트레스"} ${action.stressDelta}`);
        score += Math.ceil(Math.abs(action.stressDelta) / 3);
      }
      if (!wantsLowerStress && action.stressDelta > 0) {
        reasons.push(`${requirement.label ?? "스트레스"} +${action.stressDelta}`);
        score += Math.ceil(action.stressDelta / 4);
      }
    }
  }

  return {
    reasons: [...new Set(reasons)],
    score
  };
}

function requirementProgress(
  label: string,
  current: number,
  target: number,
  direction: "at-least" | "at-most"
): EndingRequirementProgress {
  if (direction === "at-most") {
    return {
      label,
      current,
      target,
      direction,
      satisfied: current <= target,
      progress: current <= target ? 1 : clampFloat(target / Math.max(current, 1), 0, 1)
    };
  }

  return {
    label,
    current,
    target,
    direction,
    satisfied: current >= target,
    progress: clampFloat(current / target, 0, 1)
  };
}

function resourceLabel(resource: "gold" | "energy" | "stress"): string {
  if (resource === "gold") {
    return "골드";
  }
  if (resource === "energy") {
    return "기력";
  }
  return "스트레스";
}

function getResourceValue(run: RunState, resource: "gold" | "energy" | "stress"): number {
  if (resource === "gold") {
    return run.gold;
  }
  if (resource === "energy") {
    return run.energy;
  }
  return run.stress;
}

function buildActionNote(run: RunState, action: ScheduleAction, dailyOutcomes: DailyOutcome[]): string {
  const criticalCount = dailyOutcomes.filter((outcome) => outcome.kind === "critical").length;
  const failureCount = dailyOutcomes.filter((outcome) => outcome.kind === "failure").length;
  if (criticalCount >= 2) {
    return `${action.label}에서 빛나는 순간이 여러 번 찾아왔다.`;
  }
  if (failureCount >= 3) {
    return `${action.label}은 쉽지 않은 한 주였지만 경험은 남았다.`;
  }
  if (run.stress >= 85) {
    return `${action.label}을 마쳤지만 피로가 눈에 띄게 쌓였다.`;
  }
  if (run.energy <= 10) {
    return `${action.label}을 버텨냈다. 다음 선택에는 휴식이 필요해 보인다.`;
  }
  if (action.category === "rest") {
    return "조용한 시간이 다음 선택을 위한 여유를 만들었다.";
  }
  if (action.category === "outing") {
    return "도시의 작은 풍경이 견습생의 시야를 넓혔다.";
  }
  return `${action.place}에서 보낸 시간이 조금씩 미래를 바꾸고 있다.`;
}

function diffStats(before: Stats, after: Stats): Partial<Stats> {
  const diff: Partial<Stats> = {};
  for (const stat of STAT_KEYS) {
    const delta = after[stat] - before[stat];
    if (delta !== 0) {
      diff[stat] = delta;
    }
  }
  return diff;
}

function cloneRun(run: RunState): RunState {
  return {
    ...run,
    stats: cloneStats(run.stats),
    flags: { ...run.flags },
    history: run.history.map((entry) => ({
      ...entry,
      dailyOutcomes: entry.dailyOutcomes?.map((outcome) => ({
        ...outcome,
        statChanges: { ...outcome.statChanges }
      })),
      statChanges: { ...entry.statChanges },
      event: entry.event ? cloneGameEvent(entry.event) : undefined
    })),
    unlockedEndings: [...run.unlockedEndings],
    currentSchedule: [...run.currentSchedule]
  };
}

function cloneStats(stats: Stats): Stats {
  return { ...stats };
}

function cloneGameEvent(event: GameEvent): GameEvent {
  return {
    ...event,
    effects: {
      ...event.effects,
      stats: event.effects.stats ? { ...event.effects.stats } : undefined,
      flags: event.effects.flags ? { ...event.effects.flags } : undefined
    }
  };
}

function requireAction(actionId: ActionId | undefined): ScheduleAction {
  if (!actionId) {
    throw new Error("일정이 비어 있습니다.");
  }
  const action = actionById.get(actionId);
  if (!action) {
    throw new Error(`알 수 없는 일정입니다: ${actionId}`);
  }
  return action;
}

function requireEnding(endingCode: EndingCode): EndingDefinition {
  const ending = endingByCode.get(endingCode);
  if (!ending) {
    throw new Error(`알 수 없는 엔딩입니다: ${endingCode}`);
  }
  return ending;
}

function isKnownActionId(actionId: unknown): actionId is ActionId {
  return typeof actionId === "string" && actionById.has(actionId as ActionId);
}

function isKnownEndingCode(endingCode: unknown): endingCode is EndingCode {
  return typeof endingCode === "string" && endingByCode.has(endingCode);
}

function assertSerializableCollection(endings: EndingCode[]): void {
  if (!Array.isArray(endings) || !endings.every(isKnownEndingCode)) {
    throw new Error("도감 기록이 올바르지 않습니다.");
  }
}

function sanitizeCollection(endings: unknown[]): EndingCode[] {
  return uniqueEndings(endings.filter(isKnownEndingCode));
}

function uniqueEndings(endings: EndingCode[]): EndingCode[] {
  return [...new Set(endings)];
}

interface CollectionSavePayload {
  version: number;
  endings: unknown;
}

function isCollectionSavePayload(input: unknown): input is CollectionSavePayload {
  return typeof input === "object" && input !== null && "version" in input && "endings" in input;
}

function isSupportedCollectionVersion(version: unknown): boolean {
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= MIN_COLLECTION_VERSION &&
    version <= CURRENT_COLLECTION_VERSION
  );
}

function assertScheduleActionList(actions: unknown): asserts actions is ActionId[] {
  if (!Array.isArray(actions)) {
    throw new Error("월간 일정이 올바르지 않습니다.");
  }
}

function sanitizeStats(input: unknown): Stats {
  const source = typeof input === "object" && input !== null ? (input as Partial<Stats>) : {};
  return Object.fromEntries(
    STAT_KEYS.map((stat) => [stat, clampNumber(source[stat], 0, 100, INITIAL_STATS[stat])])
  ) as Stats;
}

function sanitizeFlags(input: unknown): Record<string, number> {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).flatMap(([key, value]): [string, number][] => {
      if (!isKnownRunFlag(key)) {
        return [];
      }
      const numericValue = Math.floor(Number(value) || 0);
      return [[key, clampNumber(numericValue, 0, getMaxFlagCount(key), 0)]];
    })
  );
}

function getMaxFlagCount(flag: string): number {
  if (!isKnownRunFlag(flag)) {
    return 0;
  }
  if (actionFlagSet.has(flag) || categoryFlagSet.has(flag) || endingRequirementFlagSet.has(flag)) {
    return MAX_WEEKLY_FLAG_COUNT;
  }
  return MAX_DAILY_FLAG_COUNT;
}

function sanitizeHistory(input: unknown): HistoryEntry[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((entry): HistoryEntry[] => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }

    const source = entry as Record<string, unknown>;
    const actionId = source.actionId;
    if (typeof actionId !== "string" || !actionById.has(actionId as ActionId)) {
      return [];
    }

    const action = requireAction(actionId as ActionId);
    const month = Number(source.month);
    const slot = Number(source.slot);
    if (!isValidHistoryPosition(month, slot)) {
      return [];
    }

    const dailyOutcomes = sanitizeDailyOutcomes(source.dailyOutcomes);
    return [
      {
        month,
        slot,
        actionId: action.id,
        actionLabel: action.label,
        category: action.category,
        dailyOutcomes,
        statChanges: sanitizeStatDeltas(source.statChanges),
        goldDelta: clampNumber(source.goldDelta, -9999, 9999, 0),
        energyDelta: clampNumber(source.energyDelta, -100, 100, 0),
        stressDelta: clampNumber(source.stressDelta, -100, 100, 0),
        note: typeof source.note === "string" ? source.note : "",
        event: sanitizeGameEvent(source.event)
      }
    ];
  });
}

function isValidHistoryPosition(month: number, slot: number): boolean {
  return (
    Number.isInteger(month) &&
    month >= 1 &&
    month <= MAX_MONTH &&
    Number.isInteger(slot) &&
    slot >= 1 &&
    slot <= SLOTS_PER_MONTH
  );
}

function sanitizeGameEvent(input: unknown): GameEvent | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const source = input as Record<string, unknown>;
  if (!isNonEmptyString(source.id) || !isNonEmptyString(source.title) || !isNonEmptyString(source.body)) {
    return undefined;
  }

  return {
    id: source.id,
    title: source.title,
    body: source.body,
    effects: sanitizeGameEventEffects(source.effects)
  };
}

function sanitizeGameEventEffects(input: unknown): GameEvent["effects"] {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const source = input as Record<string, unknown>;
  return {
    stats: sanitizeStatDeltas(source.stats),
    goldDelta: clampNumber(source.goldDelta, -9999, 9999, 0),
    energyDelta: clampNumber(source.energyDelta, -100, 100, 0),
    stressDelta: clampNumber(source.stressDelta, -100, 100, 0),
    flags: sanitizeEventFlagDeltas(source.flags)
  };
}

function sanitizeEventFlagDeltas(input: unknown): Record<string, number> | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }

  const entries = Object.entries(input as Record<string, unknown>).flatMap(([flag, value]): [string, number][] => {
    if (!isKnownRunFlag(flag)) {
      return [];
    }
    const delta = clampNumber(value, -MAX_DAILY_FLAG_COUNT, MAX_DAILY_FLAG_COUNT, 0);
    return delta === 0 ? [] : [[flag, delta]];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeDailyOutcomes(input: unknown): DailyOutcome[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const outcomes = input.flatMap((outcome): DailyOutcome[] => {
    if (typeof outcome !== "object" || outcome === null) {
      return [];
    }

    const source = outcome as Record<string, unknown>;
    const kind = DAILY_OUTCOME_KINDS.has(source.kind as DailyOutcomeKind)
      ? (source.kind as DailyOutcomeKind)
      : "normal";
    return [
      {
        day: clampNumber(source.day, 1, DAYS_PER_WEEK),
        kind,
        label: dailyOutcomeLabel(kind),
        statChanges: sanitizeStatDeltas(source.statChanges),
        goldDelta: clampNumber(source.goldDelta, -9999, 9999, 0),
        energyDelta: clampNumber(source.energyDelta, -100, 100, 0),
        stressDelta: clampNumber(source.stressDelta, -100, 100, 0),
        note: typeof source.note === "string" ? source.note : ""
      }
    ];
  });

  return outcomes.length > 0 ? outcomes : undefined;
}

function sanitizeStatDeltas(input: unknown): Partial<Stats> {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const source = input as Partial<Record<StatKey, unknown>>;
  const entries = STAT_KEYS.flatMap((stat): [StatKey, number][] => {
    const value = clampNumber(source[stat], -100, 100, 0);
    return value === 0 ? [] : [[stat, value]];
  });
  return Object.fromEntries(entries) as Partial<Stats>;
}

function sanitizeSchedule(input: unknown): ActionId[] {
  if (!Array.isArray(input)) {
    return [];
  }
  const schedule = input.filter((actionId): actionId is ActionId => actionById.has(actionId));
  return schedule.length === 0 || schedule.length === SLOTS_PER_MONTH ? schedule : [];
}

function isKnownSchedule(schedule: ActionId[]): boolean {
  return schedule.length === SLOTS_PER_MONTH && schedule.every((actionId) => actionById.has(actionId));
}

function isSerializableSchedule(schedule: unknown): schedule is ActionId[] {
  return (
    Array.isArray(schedule) &&
    (schedule.length === 0 || schedule.length === SLOTS_PER_MONTH) &&
    schedule.every(isKnownActionId)
  );
}

function isValidProgressionSlotIndex(slotIndex: unknown): slotIndex is number {
  return typeof slotIndex === "number" && Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex <= SLOTS_PER_MONTH;
}

function assertSerializableRunState(run: unknown): asserts run is RunState {
  if (!isObjectRecord(run)) {
    throw new Error("진행 상태 구조가 올바르지 않습니다.");
  }
  if (run.version !== CURRENT_RUN_VERSION) {
    throw new Error("저장 버전이 올바르지 않습니다.");
  }
  assertDirectRunState(run);
  assertSerializableHistory(run);
  assertSerializableFlags(run);
}

function assertSerializableFlags(run: RunState): void {
  if (typeof run.flags !== "object" || run.flags === null || Array.isArray(run.flags)) {
    throw new Error("진행 플래그가 올바르지 않습니다.");
  }

  const historyProgressFlagCounts = getHistoryProgressFlagCounts(run.history);
  for (const [flag, value] of Object.entries(run.flags)) {
    if (
      !isNonEmptyString(flag) ||
      !isKnownRunFlag(flag) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > getMaxFlagCount(flag) ||
      ((actionFlagSet.has(flag) || categoryFlagSet.has(flag)) && value > (historyProgressFlagCounts[flag] ?? 0))
    ) {
      throw new Error("진행 플래그가 올바르지 않습니다.");
    }
  }
}

function assertSerializableHistory(run: RunState): void {
  if (!Array.isArray(run.history)) {
    throw new Error("진행 기록이 올바르지 않습니다.");
  }

  const expectedCompletedSlots = getRequiredCompletedHistorySlotCount(run);
  if (run.history.length !== expectedCompletedSlots) {
    throw new Error("진행 기록이 올바르지 않습니다.");
  }

  for (let index = 0; index < run.history.length; index += 1) {
    const entry = run.history[index];
    if (!isSerializableHistoryEntry(entry) || historySlotIndex(entry) !== index + 1) {
      throw new Error("진행 기록이 올바르지 않습니다.");
    }
  }

  if (run.currentSchedule.length === SLOTS_PER_MONTH && run.slotIndex > 0 && !hasCurrentMonthHistoryPrefix(run)) {
    throw new Error("진행 기록이 올바르지 않습니다.");
  }
}

function isSerializableHistoryEntry(entry: unknown): entry is HistoryEntry {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }

  const source = entry as HistoryEntry;
  if (!isValidHistoryPosition(source.month, source.slot) || !isKnownActionId(source.actionId)) {
    return false;
  }

  const action = requireAction(source.actionId);
  return (
    source.actionLabel === action.label &&
    source.category === action.category &&
    isSerializableStatDeltas(source.statChanges) &&
    isFiniteNumberInRange(source.goldDelta, -9999, 9999) &&
    isFiniteNumberInRange(source.energyDelta, -100, 100) &&
    isFiniteNumberInRange(source.stressDelta, -100, 100) &&
    typeof source.note === "string" &&
    (source.dailyOutcomes === undefined || isSerializableDailyOutcomes(source.dailyOutcomes)) &&
    (source.event === undefined || isSerializableGameEvent(source.event))
  );
}

function isSerializableDailyOutcomes(outcomes: unknown): outcomes is DailyOutcome[] {
  return Array.isArray(outcomes) && outcomes.every(isSerializableDailyOutcome);
}

function isSerializableDailyOutcome(outcome: unknown): outcome is DailyOutcome {
  if (typeof outcome !== "object" || outcome === null) {
    return false;
  }

  const source = outcome as DailyOutcome;
  return (
    Number.isInteger(source.day) &&
    source.day >= 1 &&
    source.day <= DAYS_PER_WEEK &&
    DAILY_OUTCOME_KINDS.has(source.kind) &&
    source.label === dailyOutcomeLabel(source.kind) &&
    isSerializableStatDeltas(source.statChanges) &&
    isFiniteNumberInRange(source.goldDelta, -9999, 9999) &&
    isFiniteNumberInRange(source.energyDelta, -100, 100) &&
    isFiniteNumberInRange(source.stressDelta, -100, 100) &&
    typeof source.note === "string"
  );
}

function isSerializableGameEvent(event: unknown): event is GameEvent {
  if (typeof event !== "object" || event === null) {
    return false;
  }

  const source = event as GameEvent;
  return (
    isNonEmptyString(source.id) &&
    isNonEmptyString(source.title) &&
    isNonEmptyString(source.body) &&
    isSerializableGameEventEffects(source.effects)
  );
}

function isSerializableGameEventEffects(effects: unknown): effects is GameEvent["effects"] {
  if (typeof effects !== "object" || effects === null || Array.isArray(effects)) {
    return false;
  }

  const source = effects as GameEvent["effects"];
  const allowedKeys = new Set(["stats", "goldDelta", "energyDelta", "stressDelta", "flags"]);
  if (!Object.keys(source).every((key) => allowedKeys.has(key))) {
    return false;
  }

  return (
    (source.stats === undefined || isSerializableStatDeltas(source.stats)) &&
    (source.goldDelta === undefined || isFiniteNumberInRange(source.goldDelta, -9999, 9999)) &&
    (source.energyDelta === undefined || isFiniteNumberInRange(source.energyDelta, -100, 100)) &&
    (source.stressDelta === undefined || isFiniteNumberInRange(source.stressDelta, -100, 100)) &&
    (source.flags === undefined || isSerializableEventFlagDeltas(source.flags))
  );
}

function isSerializableEventFlagDeltas(flags: unknown): flags is Record<string, number> {
  if (typeof flags !== "object" || flags === null || Array.isArray(flags)) {
    return false;
  }
  return Object.entries(flags).every(
    ([flag, value]) =>
      isKnownRunFlag(flag) &&
      Number.isInteger(value) &&
      value >= -MAX_DAILY_FLAG_COUNT &&
      value <= MAX_DAILY_FLAG_COUNT
  );
}

function isSerializableStatDeltas(input: unknown): input is Partial<Stats> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  return Object.entries(input).every(
    ([stat, value]) => statKeySet.has(stat as StatKey) && isFiniteNumberInRange(value, -100, 100)
  );
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function assertDirectRunState(run: unknown): asserts run is RunState {
  if (!isObjectRecord(run)) {
    throw new Error("진행 상태 구조가 올바르지 않습니다.");
  }
  const source = run as unknown as RunState;
  assertFiniteRunState(source);
  assertDirectRunStateShape(source);
}

function assertDirectRunStateShape(run: RunState): void {
  if (!isSerializableSchedule(run.currentSchedule)) {
    throw new Error("월간 일정이 올바르지 않습니다.");
  }
  if (!hasDirectHistoryShape(run.history)) {
    throw new Error("진행 기록이 올바르지 않습니다.");
  }
  if (!hasDirectFlagShape(run.flags)) {
    throw new Error("진행 플래그가 올바르지 않습니다.");
  }
  if (!hasDirectEndingShape(run)) {
    throw new Error("엔딩 기록이 올바르지 않습니다.");
  }
}

function hasDirectRunStateShape(run: Partial<RunState>): boolean {
  return (
    isSerializableSchedule(run.currentSchedule) &&
    hasDirectHistoryShape(run.history) &&
    hasDirectFlagShape(run.flags) &&
    hasDirectEndingShape(run)
  );
}

function hasDirectHistoryShape(history: unknown): history is HistoryEntry[] {
  return Array.isArray(history) && history.every(isSerializableHistoryEntry);
}

function hasDirectFlagShape(flags: unknown): flags is Record<string, number> {
  if (typeof flags !== "object" || flags === null || Array.isArray(flags)) {
    return false;
  }
  return Object.entries(flags).every(
    ([flag, value]) =>
      isKnownRunFlag(flag) && Number.isInteger(value) && value >= 0 && value <= getMaxFlagCount(flag)
  );
}

function isKnownRunFlag(flag: unknown): flag is string {
  return typeof flag === "string" && runFlagSet.has(flag);
}

function hasDirectEndingShape(run: Partial<RunState>): boolean {
  return (
    Array.isArray(run.unlockedEndings) &&
    run.unlockedEndings.every(isKnownEndingCode) &&
    (run.targetEndingCode === undefined || isKnownEndingCode(run.targetEndingCode)) &&
    (run.endingCode === undefined || isKnownEndingCode(run.endingCode))
  );
}

function assertFiniteRunState(run: RunState): void {
  assertCurrentRunVersion(run);
  if (
    !Number.isInteger(run.month) ||
    run.month < 1 ||
    run.month > MAX_MONTH ||
    !isValidProgressionSlotIndex(run.slotIndex) ||
    !Number.isFinite(run.gold) ||
    run.gold < 0 ||
    !Number.isFinite(run.energy) ||
    run.energy < 0 ||
    run.energy > 100 ||
    !Number.isFinite(run.stress) ||
    run.stress < 0 ||
    run.stress > 100 ||
    !hasBoundedStats(run.stats) ||
    !isValidSeed(run.rngSeed)
  ) {
    throw new Error("진행 상태 수치가 올바르지 않습니다.");
  }
}

function assertCurrentRunVersion(run: RunState): void {
  if (run.version !== CURRENT_RUN_VERSION) {
    throw new Error("진행 상태 버전이 올바르지 않습니다.");
  }
}

function hasBoundedStats(stats: unknown): stats is Stats {
  const source = stats as Partial<Record<StatKey, unknown>>;
  return (
    typeof stats === "object" &&
    stats !== null &&
    STAT_KEYS.every(
      (stat) =>
        typeof source[stat] === "number" &&
        Number.isFinite(source[stat]) &&
        source[stat] >= 0 &&
        source[stat] <= 100
    )
  );
}

function sanitizeLoadedScheduleAffordability(run: RunState): RunState {
  if (run.currentSchedule.length !== SLOTS_PER_MONTH || run.slotIndex !== 0) {
    return run;
  }
  if (getSchedulePlanStatus(run, run.currentSchedule).isValid) {
    return run;
  }
  return {
    ...run,
    currentSchedule: [],
    slotIndex: 0
  };
}

function sanitizeLoadedScheduleContinuity(run: RunState): RunState {
  if (run.currentSchedule.length !== SLOTS_PER_MONTH || run.slotIndex <= 0) {
    return run;
  }
  if (hasCurrentMonthHistoryPrefix(run)) {
    return run;
  }
  return {
    ...run,
    currentSchedule: [],
    slotIndex: 0
  };
}

function hasCurrentMonthHistoryPrefix(run: RunState): boolean {
  for (let slot = 1; slot <= run.slotIndex; slot += 1) {
    const entry = run.history.find((candidate) => candidate.month === run.month && candidate.slot === slot);
    if (!entry || entry.actionId !== run.currentSchedule[slot - 1]) {
      return false;
    }
  }
  return true;
}

function sanitizeLoadedHistoryProgress(run: RunState): RunState {
  const maxCompletedSlot = getMaxCompletedHistorySlot(run);
  const seenSlots = new Set<string>();
  const history = [...run.history]
    .sort((left, right) => historySlotIndex(left) - historySlotIndex(right))
    .flatMap((entry): HistoryEntry[] => {
      const index = historySlotIndex(entry);
      const key = `${entry.month}:${entry.slot}`;
      if (index < 1 || index > maxCompletedSlot || seenSlots.has(key)) {
        return [];
      }
      seenSlots.add(key);
      return [entry];
    });

  return {
    ...run,
    history
  };
}

function sanitizeLoadedMonthProgress(run: RunState): RunState {
  const completedSlots = getContiguousCompletedHistorySlotCount(run.history);
  if (completedSlots >= getRequiredCompletedHistorySlotCount(run)) {
    return run;
  }

  const maxSupportedMonth = Math.min(MAX_MONTH, Math.floor(completedSlots / SLOTS_PER_MONTH) + 1);
  return {
    ...run,
    month: maxSupportedMonth,
    slotIndex: 0,
    currentSchedule: [],
    endingCode: undefined
  };
}

function sanitizeLoadedProgressFlags(run: RunState): RunState {
  const maxProgressFlags = getHistoryProgressFlagCounts(run.history);
  const flags = Object.fromEntries(
    Object.entries(run.flags).map(([flag, count]) => [
      flag,
      actionFlagSet.has(flag) || categoryFlagSet.has(flag) ? Math.min(count, maxProgressFlags[flag] ?? 0) : count
    ])
  );

  return {
    ...run,
    flags
  };
}

function getHistoryProgressFlagCounts(history: HistoryEntry[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of history) {
    const action = requireAction(entry.actionId);
    counts[action.flag] = (counts[action.flag] ?? 0) + 1;
    const categoryFlag = `category:${action.category}`;
    counts[categoryFlag] = (counts[categoryFlag] ?? 0) + 1;
  }
  return counts;
}

function getRequiredCompletedHistorySlotCount(run: RunState): number {
  const completedPreviousMonths = (run.month - 1) * SLOTS_PER_MONTH;
  if (run.currentSchedule.length === SLOTS_PER_MONTH) {
    return completedPreviousMonths + Math.min(run.slotIndex, SLOTS_PER_MONTH);
  }
  return completedPreviousMonths;
}

function getMaxCompletedHistorySlot(run: RunState): number {
  const completedPreviousMonths = (run.month - 1) * SLOTS_PER_MONTH;
  if (run.currentSchedule.length === SLOTS_PER_MONTH) {
    return completedPreviousMonths + Math.min(run.slotIndex, SLOTS_PER_MONTH);
  }
  return completedPreviousMonths;
}

function getContiguousCompletedHistorySlotCount(history: HistoryEntry[]): number {
  const completedSlots = new Set(history.map((entry) => historySlotIndex(entry)));
  let nextSlot = 1;
  while (completedSlots.has(nextSlot)) {
    nextSlot += 1;
  }
  return nextSlot - 1;
}

function historySlotIndex(entry: Pick<HistoryEntry, "month" | "slot">): number {
  return (entry.month - 1) * SLOTS_PER_MONTH + entry.slot;
}

function sanitizeLoadedEndingState(run: RunState): RunState {
  if (!run.endingCode) {
    return {
      ...run,
      unlockedEndings: []
    };
  }

  if (!isCompletedFinalMonthRun(run)) {
    return {
      ...run,
      endingCode: undefined,
      unlockedEndings: []
    };
  }

  const endingCode = judgeEnding(run).code;
  return {
    ...run,
    endingCode,
    unlockedEndings: [endingCode]
  };
}

function isCompletedFinalMonthRun(run: RunState): boolean {
  return run.month >= MAX_MONTH && run.currentSchedule.length === SLOTS_PER_MONTH && run.slotIndex >= SLOTS_PER_MONTH;
}

function sanitizeEndings(input: unknown): EndingCode[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return [...new Set(input.filter((endingCode): endingCode is EndingCode => endingByCode.has(endingCode)))];
}

function isRunLike(input: unknown): input is Partial<RunState> {
  return typeof input === "object" && input !== null && "version" in input;
}

function isObjectRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isSupportedRunVersion(version: unknown): boolean {
  return (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version >= MIN_MIGRATABLE_RUN_VERSION &&
    version <= CURRENT_RUN_VERSION
  );
}

function parseStoredPayload(raw: string | unknown, errorMessage: string): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(errorMessage);
  }
}

function bestNonReputationStat(stats: Stats): Exclude<StatKey, "reputation"> {
  const statKeys = STAT_KEYS.filter((stat): stat is Exclude<StatKey, "reputation"> => stat !== "reputation");
  return statKeys.reduce((best, stat) => (stats[stat] > stats[best] ? stat : best), "intellect");
}

function flagCount(flags: Record<string, number>, flag: string): number {
  return flags[flag] ?? 0;
}

function clampNumber(value: unknown, min: number, max: number, fallback = min): number {
  return clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeSeed(seed: unknown): number {
  const numericSeed = Math.floor(Number(seed));
  return isValidSeed(numericSeed) ? numericSeed : 1;
}

function assertNewRunSeed(seed: unknown): asserts seed is number {
  if (typeof seed !== "number" || !isValidSeed(seed)) {
    throw new Error("초기 시드가 올바르지 않습니다.");
  }
}

function isValidSeed(seed: unknown): seed is number {
  return typeof seed === "number" && Number.isSafeInteger(seed) && seed > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nextSeed(seed: number): number {
  const next = (seed * 1664525 + 1013904223) >>> 0;
  return next > 0 ? next : 1;
}
