import {
  ACTIONS,
  ACTION_CATEGORY_LABELS,
  ENDINGS,
  MAX_MONTH,
  SLOTS_PER_MONTH,
  STAT_KEYS,
  STAT_LABELS,
  advanceMonth,
  buildPublicEndingShareUrl,
  createNewRun,
  createTargetedRun,
  getApprenticeProfile,
  getActionById,
  getEndingActionRecommendations,
  getEndingByCode,
  getEndingProgress,
  getMonthlyCoachingInsights,
  getSchedulePlanStatus as getCoreSchedulePlanStatus,
  resolveNextSlot,
  selectSchedule
} from "@starlit-apprentice/product-core";
import type {
  ActionCategory,
  ActionId,
  ApprenticeProfile,
  DailyOutcome,
  EndingActionRecommendation,
  EndingProgress,
  EndingCode,
  GameEvent,
  MonthlyCoachingInsight,
  ResolutionResult,
  RunState,
  ScheduleAction,
  SchedulePlanStatus,
  StatKey
} from "@starlit-apprentice/product-core";
import type { BackgroundGame, SceneMood } from "./scene";
import { clearAllStorage, clearRun, loadStorageState, saveCollection, saveRun } from "./storage";

type Screen = "title" | "room" | "schedule" | "activity" | "result" | "ending" | "collection";
type HistoryMode = "push" | "replace" | "none";
type DeltaBarView = {
  label: string;
  delta: number;
  fromDelta?: number;
  isGood: boolean;
};
type TargetActionRecommendation = EndingActionRecommendation;
type ActionAvailability = {
  selectable: boolean;
  reasons: string[];
};
type EndingGroup = {
  label: string;
  endings: EndingCode[];
};
type RunReplacementRequest =
  | { kind: "new"; historyMode: HistoryMode }
  | { kind: "targeted"; endingCode: EndingCode; historyMode: HistoryMode };
type ShareAttempt = {
  token: number;
  endingCode: EndingCode;
  startedAsSharedEnding: boolean;
};

const CATEGORIES: ActionCategory[] = ["lesson", "work", "rest", "outing"];
const ACTION_ICON_URLS = {
  letters: new URL("./assets/action-icons/letters.svg", import.meta.url).href,
  music: new URL("./assets/action-icons/music.svg", import.meta.url).href,
  manners: new URL("./assets/action-icons/manners.svg", import.meta.url).href,
  crafts: new URL("./assets/action-icons/crafts.svg", import.meta.url).href,
  "star-lore": new URL("./assets/action-icons/star-lore.svg", import.meta.url).href,
  "stamina-drill": new URL("./assets/action-icons/stamina-drill.svg", import.meta.url).href,
  "library-help": new URL("./assets/action-icons/library-help.svg", import.meta.url).href,
  "tea-service": new URL("./assets/action-icons/tea-service.svg", import.meta.url).href,
  "workshop-errand": new URL("./assets/action-icons/workshop-errand.svg", import.meta.url).href,
  "garden-care": new URL("./assets/action-icons/garden-care.svg", import.meta.url).href,
  "theater-crew": new URL("./assets/action-icons/theater-crew.svg", import.meta.url).href,
  "scribe-aide": new URL("./assets/action-icons/scribe-aide.svg", import.meta.url).href,
  "home-rest": new URL("./assets/action-icons/home-rest.svg", import.meta.url).href,
  "sleep-in": new URL("./assets/action-icons/sleep-in.svg", import.meta.url).href,
  "hot-spring": new URL("./assets/action-icons/hot-spring.svg", import.meta.url).href,
  market: new URL("./assets/action-icons/market.svg", import.meta.url).href,
  plaza: new URL("./assets/action-icons/plaza.svg", import.meta.url).href,
  library: new URL("./assets/action-icons/library.svg", import.meta.url).href,
  park: new URL("./assets/action-icons/park.svg", import.meta.url).href
} satisfies Record<ActionId, string>;

const DAY_DURATION_MS = 3000;
const ACTIVITY_DURATION_MS = DAY_DURATION_MS * 7;
const WEEK_DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const SCREEN_VALUES = new Set<Screen>(["title", "room", "schedule", "activity", "result", "ending", "collection"]);
const CATEGORY_GUIDANCE: Record<ActionCategory, string> = {
  lesson: "능력 성장",
  work: "골드 보충",
  rest: "기력 회복",
  outing: "미래 보강"
};
const STAT_BENEFITS: Record<StatKey, string> = {
  intellect: "연구자/서기관",
  sensibility: "무대/여행",
  etiquette: "궁정 루트",
  craft: "공방 루트",
  stamina: "균형 성장",
  reputation: "상인/궁정",
  focus: "교수/제본",
  charm: "외교/무대",
  courage: "수호/탐정",
  empathy: "치유/기획",
  business: "상인/창업",
  magic: "천문/주문",
  leadership: "길드/의회",
  creativity: "축제/발명"
};
const RESOURCE_LABELS = {
  gold: "골드",
  energy: "기력",
  stress: "스트레스"
};
const PUBLIC_SHARE_ORIGIN = import.meta.env.VITE_STARLIT_PUBLIC_SHARE_ORIGIN?.trim() ?? "";
const ENDING_GROUPS: EndingGroup[] = [
  {
    label: "학문/기록",
    endings: ["scholar", "court-scribe", "observatory-director", "academy-professor", "archive-detective"]
  },
  {
    label: "예술/창작",
    endings: ["artisan", "performer", "spellwright", "festival-planner", "theater-director", "inventor"]
  },
  {
    label: "일/상업",
    endings: ["merchant", "guild-master", "tea-house-owner", "bookbinder", "market-analyst", "workshop-founder"]
  },
  {
    label: "돌봄/공동체",
    endings: [
      "mentor",
      "star-priest",
      "healer",
      "garden-architect",
      "city-councilor",
      "civic-organizer",
      "etiquette-master"
    ]
  },
  {
    label: "탐험/수호",
    endings: ["wanderer", "royal-diplomat", "cartographer", "travel-writer", "guardian-guide"]
  },
  {
    label: "생활",
    endings: ["quiet-life"]
  }
];

export class StarlitApp {
  private run: RunState | null;
  private collection: EndingCode[];
  private warning?: string;
  private screen: Screen = "title";
  private selectedActions: ActionId[] = [];
  private selectedCategory: ActionCategory = "lesson";
  private latestResult?: ResolutionResult;
  private activityResult?: ResolutionResult;
  private activityCompletedDays = 0;
  private activityTimer?: number;
  private activityInterval?: number;
  private activityToken = 0;
  private activityStartedAt?: number;
  private lastRenderedScreen?: Screen;
  private isApplyingPopState = false;
  private isResetConfirmationVisible = false;
  private pendingRunReplacement?: RunReplacementRequest;
  private sharedEndingCode?: EndingCode;
  private activeShareAttempt?: ShareAttempt;
  private shareAttemptToken = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly game: BackgroundGame
  ) {
    const stored = loadStorageState();
    this.run = stored.run;
    this.collection = stored.collection;
    this.warning = stored.warning;

    const sharedEnding = getSharedEndingCode();
    if (sharedEnding) {
      this.screen = "ending";
      this.sharedEndingCode = sharedEnding;
    }

    this.bindBrowserHistory();
    this.bindPageLifecycle();
    this.writeScreenHistory(this.screen, "replace");
    this.render();
  }

  private render(): void {
    this.setMood(this.screen);
    this.resetScrollOnScreenChange();
    const banner = this.warning
      ? `<div class="notice" data-testid="fallback-banner">${escapeHtml(this.warning)}</div>`
      : "";

    if (this.screen === "title") {
      this.root.innerHTML = `${banner}${this.renderTitle()}`;
      this.bindTitle();
      return;
    }

    if (this.screen === "collection") {
      this.root.innerHTML = `${banner}${this.renderCollection()}`;
      this.bindCollection();
      return;
    }

    if (this.screen !== "ending" && !this.run) {
      this.screen = "title";
      this.render();
      return;
    }

    const activeRun = this.run;
    if (this.screen === "room") {
      if (!activeRun) {
        this.screen = "title";
        this.render();
        return;
      }
      this.root.innerHTML = `${banner}${this.renderRoom(activeRun)}`;
      this.bindRoom();
      return;
    }

    if (this.screen === "schedule") {
      this.root.innerHTML = `${banner}${this.renderSchedule()}`;
      this.bindSchedule();
      return;
    }

    if (this.screen === "activity") {
      this.root.innerHTML = `${banner}${this.renderActivity()}`;
      this.bindActivity();
      return;
    }

    if (this.screen === "result") {
      this.root.innerHTML = `${banner}${this.renderResult()}`;
      this.bindResult();
      return;
    }

    const endingRun = this.screen === "ending" ? this.getEndingScreenRun() : this.run;
    if (!endingRun) {
      this.screen = "title";
      this.render();
      return;
    }
    this.root.innerHTML = `${banner}${this.renderEnding(endingRun)}`;
    this.bindEnding();
  }

  private renderTitle(): string {
    const hasStoredRun = Boolean(this.run);
    const hasLocalData = hasStoredRun || this.collection.length > 0;
    const continueLabel = this.run?.endingCode ? "엔딩 보기" : "이어하기";
    return `
      <section class="screen title-screen">
        <div class="title-copy">
          <p class="eyebrow">Pixel Raising Sim</p>
          <h1>별빛 견습생</h1>
          <p class="lead">한 달씩 일정을 정해 견습생의 미래를 여는 픽셀 육성 시뮬레이션.</p>
          <div class="badges" aria-label="게임 특징">
            <span>픽셀 아트</span>
            <span>월간 일정</span>
            <span>멀티 엔딩</span>
          </div>
        </div>
        <div class="command-row title-actions">
          <button class="primary" data-testid="new-run">새로 시작</button>
          <button data-testid="continue-run" ${hasStoredRun ? "" : "disabled"}>${continueLabel}</button>
          <button data-testid="open-collection">도감</button>
          <button data-testid="reset-local-data" ${hasLocalData ? "" : "disabled"}>기록 초기화</button>
        </div>
        ${this.renderStartOverConfirmation()}
        ${this.renderResetConfirmation(hasLocalData)}
      </section>
    `;
  }

  private renderStartOverConfirmation(): string {
    const request = this.pendingRunReplacement;
    if (!request || !this.hasReplaceableProgress()) {
      return "";
    }

    const targetTitle = request.kind === "targeted" ? getEndingByCode(request.endingCode).title : undefined;
    const heading = targetTitle ? `${targetTitle} 목표 시작` : "진행 교체 확인";
    const body = targetTitle
      ? `${targetTitle} 목표의 새 기록으로 바꿉니다. 해금된 도감은 유지됩니다.`
      : "현재 진행 중인 1년 기록을 새 기록으로 바꿉니다. 해금된 도감은 유지됩니다.";

    return `
      <div class="brief-panel start-over-panel" data-testid="start-over-confirmation">
        <div class="brief-head">
          <span>새 기록</span>
          <strong>${escapeHtml(heading)}</strong>
        </div>
        <p>${escapeHtml(body)}</p>
        <div class="reset-actions">
          <button data-testid="cancel-start-over">취소</button>
          <button class="danger" data-testid="confirm-start-over">시작</button>
        </div>
      </div>
    `;
  }

  private renderResetConfirmation(hasLocalData: boolean): string {
    if (!this.isResetConfirmationVisible || !hasLocalData) {
      return "";
    }

    return `
      <div class="brief-panel reset-panel" data-testid="reset-confirmation">
        <div class="brief-head">
          <span>로컬 기록</span>
          <strong>초기화 확인</strong>
        </div>
        <p>기기 안에 저장된 진행과 엔딩 도감 기록을 삭제합니다.</p>
        <div class="reset-actions">
          <button data-testid="cancel-reset-local-data">취소</button>
          <button class="danger" data-testid="confirm-reset-local-data">삭제</button>
        </div>
      </div>
    `;
  }

  private bindTitle(): void {
    this.on("new-run", () => this.requestRunReplacement({ kind: "new", historyMode: "push" }));
    this.on("continue-run", () => {
      this.isResetConfirmationVisible = false;
      this.pendingRunReplacement = undefined;
      if (!this.run) {
        return;
      }
      if (this.run.endingCode) {
        this.navigate("ending");
        return;
      }
      if (this.isMonthReadyToAdvance()) {
        this.advanceCompletedMonth("push");
        return;
      }
      if (this.run.currentSchedule.length > 0 && this.run.slotIndex < SLOTS_PER_MONTH) {
        this.writeScreenHistory("room", "push");
        this.beginActivity();
        return;
      }
      this.track("starlit_start_click", { mode: "continue" });
      this.navigate("room");
    });
    this.on("open-collection", () => {
      this.isResetConfirmationVisible = false;
      this.pendingRunReplacement = undefined;
      this.track("starlit_collection_view", { unlocked_count: this.collection.length });
      this.navigate("collection");
    });
    this.on("reset-local-data", () => {
      this.isResetConfirmationVisible = true;
      this.pendingRunReplacement = undefined;
      this.render();
    });
    this.on("cancel-reset-local-data", () => {
      this.isResetConfirmationVisible = false;
      this.render();
    });
    this.on("confirm-reset-local-data", () => {
      const resetWarning = clearAllStorage();
      this.run = null;
      this.collection = [];
      this.latestResult = undefined;
      this.activityResult = undefined;
      this.selectedActions = [];
      this.isResetConfirmationVisible = false;
      this.pendingRunReplacement = undefined;
      this.warning = resetWarning ?? "기기 안의 진행과 도감 기록을 삭제했습니다.";
      this.navigate("title", "replace");
    });
    this.bindRunReplacementConfirmation();
  }

  private renderRoom(run: RunState): string {
    const progress = Math.round(((run.month - 1) / MAX_MONTH) * 100);
    return `
      <section class="screen">
        <header class="topbar">
          <button class="ghost" data-testid="back-title" aria-label="시작 화면">←</button>
          <div>
            <p class="eyebrow">Month ${run.month} / ${MAX_MONTH}</p>
            <h2>견습생 방</h2>
          </div>
          <button class="ghost" data-testid="open-collection">도감</button>
        </header>
        ${this.renderApprenticeStage(run)}
        <div class="status-grid" data-testid="room-stats">
          <div class="meter wide">
            <span>1년 진행률</span>
            <strong>${progress}%</strong>
            <div class="bar"><i style="width:${progress}%"></i></div>
          </div>
          <div class="meter"><span>골드</span><strong>${run.gold}</strong></div>
          <div class="meter"><span>기력</span><strong>${run.energy}</strong></div>
          <div class="meter"><span>스트레스</span><strong>${run.stress}</strong></div>
        </div>
        ${this.renderFirstRunBrief(run)}
        ${this.renderMonthlyCoaching(run, "다음 달 코칭")}
        ${this.renderTargetEndingPanel(run)}
        ${this.renderCurrentMonthPlan(run)}
        ${this.renderFuturePanel(run, "미래 후보", 2)}
        <div class="stat-list">
          ${STAT_KEYS.map((stat) => this.renderStat(run, stat)).join("")}
        </div>
        <div class="log-panel">
          <h3>최근 기록</h3>
          ${this.renderRecentHistory(run)}
        </div>
        ${this.renderStartOverConfirmation()}
        <div class="command-row sticky-actions">
          <button class="primary" data-testid="open-schedule">${this.getRoomPrimaryActionLabel(run)}</button>
          <button data-testid="new-run">처음부터</button>
        </div>
      </section>
    `;
  }

  private bindRoom(): void {
    this.on("back-title", () => {
      if (this.screen !== "room") {
        return;
      }
      this.pendingRunReplacement = undefined;
      this.navigate("title");
    });
    this.on("open-schedule", () => {
      if (this.screen !== "room") {
        return;
      }
      this.pendingRunReplacement = undefined;
      if (this.isMonthReadyToAdvance()) {
        this.advanceCompletedMonth("push");
        return;
      }
      if (this.hasPendingScheduledAction()) {
        this.writeScreenHistory("room", "push");
        this.beginActivity();
        return;
      }
      this.selectedActions = [];
      this.selectedCategory = "lesson";
      this.navigate("schedule");
    });
    this.on("new-run", () => {
      if (this.screen !== "room") {
        return;
      }
      this.requestRunReplacement({ kind: "new", historyMode: "replace" });
    });
    this.on("clear-target", () => {
      if (this.screen !== "room") {
        return;
      }
      this.pendingRunReplacement = undefined;
      if (!this.run) {
        return;
      }
      this.run = { ...this.run, targetEndingCode: undefined };
      this.persistRun();
      this.render();
    });
    this.on("open-collection", () => {
      if (this.screen !== "room") {
        return;
      }
      this.pendingRunReplacement = undefined;
      this.navigate("collection");
    });
    this.bindRunReplacementConfirmation();
  }

  private renderSchedule(): string {
    const actions = ACTIONS.filter((action) => action.category === this.selectedCategory);
    const planStatus = this.getSchedulePlanStatus();
    return `
      <section class="screen schedule-screen">
        <header class="topbar">
          <button class="ghost" data-testid="back-room" aria-label="방으로">←</button>
          <div>
            <p class="eyebrow">월간 일정</p>
            <h2>4주 일정 선택</h2>
          </div>
          <strong>${this.selectedActions.length}/${SLOTS_PER_MONTH}</strong>
        </header>
        <div class="slot-row" data-testid="selected-slots">
          ${Array.from({ length: SLOTS_PER_MONTH }, (_, index) => this.renderSelectedSlot(index)).join("")}
        </div>
        ${this.renderScheduleBrief()}
        <nav class="segmented" aria-label="일정 종류">
          ${CATEGORIES.map(
            (category) => `
              <button
                data-category="${category}"
                class="${category === this.selectedCategory ? "active" : ""}"
              >${ACTION_CATEGORY_LABELS[category]}</button>
            `
          ).join("")}
        </nav>
        <div class="action-list">
          ${actions.map((action) => this.renderActionButton(action)).join("")}
        </div>
        <div class="command-row sticky-actions">
          <button data-testid="clear-schedule" ${this.selectedActions.length === 0 ? "disabled" : ""}>비우기</button>
          <button class="primary" data-testid="confirm-schedule" ${
            this.selectedActions.length === SLOTS_PER_MONTH && planStatus.isValid ? "" : "disabled"
          }>일정 실행</button>
        </div>
      </section>
    `;
  }

  private renderFirstRunBrief(run: RunState): string {
    if (run.month !== 1 || run.history.length > 0 || run.currentSchedule.length > 0) {
      return "";
    }

    return `
      <div class="brief-panel" data-testid="first-run-brief">
        <p class="eyebrow">첫 달 목표</p>
        <strong>미래 후보 조건을 보고 4주 일정을 완성</strong>
        <div class="brief-chips" aria-label="일정 역할">
          ${CATEGORIES.map((category) => `<span>${ACTION_CATEGORY_LABELS[category]} · ${CATEGORY_GUIDANCE[category]}</span>`).join("")}
        </div>
      </div>
    `;
  }

  private renderMonthlyCoaching(run: RunState, title: string): string {
    const insights = getMonthlyCoachingInsights(run, 3);
    if (insights.length === 0) {
      return "";
    }

    return `
      <div class="brief-panel coaching-panel" data-testid="monthly-coaching">
        <div class="brief-head">
          <span>${escapeHtml(title)}</span>
          <strong>${run.month >= MAX_MONTH && run.currentSchedule.length === SLOTS_PER_MONTH ? "마지막 점검" : "다음 일정 기준"}</strong>
        </div>
        <div class="coaching-list">
          ${insights.map((insight) => this.renderCoachingInsight(insight)).join("")}
        </div>
      </div>
    `;
  }

  private renderCoachingInsight(insight: MonthlyCoachingInsight): string {
    const actions = insight.actionIds?.map((actionId) => getActionById(actionId)) ?? [];
    return `
      <article class="coaching-item ${insight.tone}">
        <div>
          <strong>${escapeHtml(insight.title)}</strong>
          <p>${escapeHtml(insight.body)}</p>
        </div>
        ${
          actions.length > 0
            ? `
              <div class="coaching-actions" aria-label="추천 일정">
                ${actions.map((action) => `<span>${escapeHtml(action.label)}</span>`).join("")}
              </div>
            `
            : ""
        }
      </article>
    `;
  }

  private renderTargetEndingPanel(run: RunState): string {
    if (!run.targetEndingCode) {
      return "";
    }

    const ending = getEndingByCode(run.targetEndingCode);
    const progress = getEndingProgress(run).find((entry) => entry.ending.code === ending.code);
    const requirements = progress?.requirements ?? [];

    return `
      <div class="brief-panel target-panel" data-testid="target-ending-panel">
        <div class="brief-head">
          <span>목표 엔딩</span>
          <strong>${progress ? `${progress.progress}%` : "진행 중"}</strong>
        </div>
        <strong>${escapeHtml(ending.title)}</strong>
        ${
          requirements.length > 0
            ? `<div class="requirement-list">${requirements.map((requirement) => this.renderRequirement(requirement)).join("")}</div>`
            : `<p>${escapeHtml(ending.hint)}</p>`
        }
        <div class="target-actions">
          <button data-testid="clear-target">목표 해제</button>
        </div>
      </div>
    `;
  }

  private renderCurrentMonthPlan(run: RunState): string {
    if (run.currentSchedule.length !== SLOTS_PER_MONTH || run.endingCode) {
      return "";
    }

    const completedCount = Math.min(run.slotIndex, SLOTS_PER_MONTH);
    const statusLabel =
      completedCount >= SLOTS_PER_MONTH
        ? run.month >= MAX_MONTH
          ? "엔딩 대기"
          : "다음 달 대기"
        : `${completedCount + 1}주차 대기`;

    return `
      <div class="brief-panel month-plan-panel" data-testid="current-month-plan">
        <div class="brief-head">
          <span>이번 달 계획</span>
          <strong>${statusLabel}</strong>
        </div>
        <div class="month-plan-slots" aria-label="이번 달 4주 계획">
          ${run.currentSchedule
            .map((actionId, index) => this.renderMonthPlanSlot(actionId, index, completedCount))
            .join("")}
        </div>
      </div>
    `;
  }

  private renderMonthPlanSlot(actionId: ActionId, index: number, completedCount: number): string {
    const action = getActionById(actionId);
    const isDone = index < completedCount;
    const isCurrent = index === completedCount;
    const stateLabel = isDone ? "완료" : isCurrent ? "다음" : "대기";
    return `
      <div class="month-plan-slot ${isDone ? "done" : ""}${isCurrent ? " current" : ""}">
        <span>${index + 1}주차 · ${stateLabel}</span>
        <strong>${escapeHtml(action.shortLabel)}</strong>
      </div>
    `;
  }

  private renderScheduleBrief(): string {
    const remaining = SLOTS_PER_MONTH - this.selectedActions.length;
    const planStatus = this.getSchedulePlanStatus();
    const categoryCounts = CATEGORIES.map((category) => {
      const count = this.selectedActions.filter((actionId) => getActionById(actionId).category === category).length;
      return { category, count };
    });

    return `
      <div class="brief-panel compact" data-testid="schedule-guidance">
        <div class="brief-head">
          <span>선택 ${this.selectedActions.length}/${SLOTS_PER_MONTH}</span>
          <strong>${planStatus.isValid ? (remaining === 0 ? "일정 실행 가능" : `${remaining}주 더 선택`) : planStatus.blockers.join(" · ")}</strong>
        </div>
        <div class="brief-chips" aria-label="선택한 일정 구성">
          ${categoryCounts
            .map(
              ({ category, count }) =>
                `<span class="${count > 0 ? "active" : ""}">${ACTION_CATEGORY_LABELS[category]} ${count}</span>`
            )
            .join("")}
        </div>
        ${this.renderScheduleResourceForecast(planStatus)}
        ${this.renderScheduleTargetGuidance()}
      </div>
    `;
  }

  private renderScheduleResourceForecast(planStatus: SchedulePlanStatus): string {
    const { forecast } = planStatus;
    return `
      <div class="resource-forecast" data-testid="schedule-resource-forecast">
        <span>예상 자원</span>
        <strong class="${planStatus.isValid ? "" : "danger"}">
          ${RESOURCE_LABELS.gold} ${forecast.gold} · ${RESOURCE_LABELS.energy} ${forecast.energy} · ${RESOURCE_LABELS.stress} ${forecast.stress}
        </strong>
      </div>
    `;
  }

  private renderScheduleTargetGuidance(): string {
    if (!this.run?.targetEndingCode) {
      return "";
    }

    const ending = getEndingByCode(this.run.targetEndingCode);
    const progress = getEndingProgress(this.run).find((entry) => entry.ending.code === ending.code);
    const recommendations = this.getTargetActionRecommendations(3, this.selectedActions);
    const fallbackLabel = progress?.completed ? "조건 충족" : "자유 일정";
    return `
      <div class="schedule-target" data-testid="schedule-target-guidance">
        <span>목표</span>
        <strong>${escapeHtml(ending.title)}${progress ? ` ${progress.progress}%` : ""}</strong>
        ${
          recommendations.length > 0
            ? `
              <div class="target-recommendations" data-testid="target-recommendations">
                <span>추천 일정</span>
                <div>
                  ${recommendations
                    .map(
                      ({ action, reasons }) => `
                        <span class="target-recommendation">
                          <b>${escapeHtml(action.label)}</b>
                          <small>${escapeHtml(reasons.slice(0, 2).join(" · "))}</small>
                        </span>
                      `
                    )
                    .join("")}
                </div>
              </div>
            `
            : `<div class="target-recommendations" data-testid="target-recommendations"><span>추천 일정</span><strong>${fallbackLabel}</strong></div>`
        }
      </div>
    `;
  }

  private getTargetActionRecommendations(limit = ACTIONS.length, plannedActions: ActionId[] = []): TargetActionRecommendation[] {
    const run = this.run;
    if (!run?.targetEndingCode) {
      return [];
    }
    return getEndingActionRecommendations(run, run.targetEndingCode, limit, plannedActions);
  }

  private bindSchedule(): void {
    this.on("back-room", () => {
      if (this.screen !== "schedule") {
        return;
      }
      this.navigate("room");
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.screen !== "schedule" || !button.isConnected) {
          return;
        }
        const category = button.dataset.category;
        if (!isKnownActionCategory(category)) {
          this.warning = "알 수 없는 일정 종류입니다.";
          this.render();
          return;
        }
        this.selectedCategory = category;
        this.render();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-action-id]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.screen !== "schedule" || !button.isConnected) {
          return;
        }
        const action = getKnownAction(button.dataset.actionId);
        if (!action) {
          this.warning = "알 수 없는 일정입니다.";
          this.render();
          return;
        }
        const actionId = action.id;
        if (this.getActionAvailability(action).selectable) {
          this.selectedActions.push(actionId);
          this.render();
        }
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-slot-index]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.screen !== "schedule" || !button.isConnected) {
          return;
        }
        const slotIndex = Number(button.dataset.slotIndex);
        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= this.selectedActions.length) {
          return;
        }
        this.selectedActions.splice(slotIndex, 1);
        this.render();
      });
    });
    this.on("clear-schedule", () => {
      if (this.screen !== "schedule") {
        return;
      }
      this.selectedActions = [];
      this.render();
    });
    this.on("confirm-schedule", () => {
      if (this.screen !== "schedule") {
        return;
      }
      if (!this.run || this.selectedActions.length !== SLOTS_PER_MONTH || !this.getSchedulePlanStatus().isValid) {
        return;
      }
      try {
        this.run = selectSchedule(this.run, this.selectedActions);
        this.persistRun();
        this.track("starlit_schedule_confirmed", {
          month: this.run.month,
          slots: this.selectedActions.join(",")
        });
        this.writeScreenHistory("room", "replace");
        this.beginActivity();
      } catch (error) {
        this.warning = error instanceof Error ? error.message : "일정을 실행하지 못했습니다.";
        this.navigate("room", "replace");
      }
    });
  }

  private renderActivity(): string {
    const action = this.activityResult?.action ?? this.getPendingAction();
    if (!this.run || !action) {
      return "";
    }
    const visibleOutcomes = this.getVisibleDailyOutcomes();
    const previousOutcomes = this.getPreviousVisibleDailyOutcomes();

    return `
      <section class="screen activity-screen" data-testid="activity-screen">
        <header class="topbar">
          <div class="activity-count">${Math.min(this.run.slotIndex + 1, SLOTS_PER_MONTH)}</div>
          <div>
            <p class="eyebrow">${this.run.month}월 ${Math.min(this.run.slotIndex + 1, SLOTS_PER_MONTH)}주차</p>
            <h2>${escapeHtml(action.label)}</h2>
          </div>
          <span class="category-pill">${ACTION_CATEGORY_LABELS[action.category]}</span>
        </header>
        <div class="activity-panel">
          ${this.renderActionIcon(action, "large")}
          <div class="activity-copy">
            <span>${escapeHtml(action.place)}</span>
            <p>${escapeHtml(getActivityLine(action))}</p>
          </div>
          ${this.renderWeekDays()}
          ${this.renderDailyOutcome()}
          ${this.renderDeltaBars(this.getDailyDeltaBars(visibleOutcomes, previousOutcomes), "activity-delta-bars")}
          <div class="activity-progress" aria-hidden="true">
            <i style="width:${Math.round((visibleOutcomes.length / WEEK_DAYS.length) * 100)}%"></i>
          </div>
        </div>
        <div class="command-row sticky-actions">
          <button class="primary" data-testid="finish-activity">결과 보기</button>
        </div>
      </section>
    `;
  }

  private bindActivity(): void {
    this.on("finish-activity", () => this.finishActivity());
  }

  private renderResult(): string {
    if (!this.run) {
      return "";
    }
    if (!this.latestResult) {
      return `
        <section class="screen">
          <header class="topbar">
            <button class="ghost" data-testid="back-room" aria-label="방으로">←</button>
            <div>
              <p class="eyebrow">진행 대기</p>
              <h2>이번 달 일정</h2>
            </div>
          </header>
          <p class="lead small">선택한 일정을 이어서 진행할 수 있습니다.</p>
          <div class="command-row sticky-actions">
            <button class="primary" data-testid="next-action">다음 일정 보기</button>
          </div>
        </section>
      `;
    }

    const result = this.latestResult;
    const nextLabel = result.monthComplete
      ? this.run.month >= MAX_MONTH
        ? "엔딩 보기"
        : "다음 달"
      : "다음 일정";
    return `
      <section class="screen result-screen">
        <header class="topbar">
          <button class="ghost" data-testid="back-room" aria-label="방으로">←</button>
          <div>
            <p class="eyebrow">${this.run.month}월 ${Math.min(this.run.slotIndex, SLOTS_PER_MONTH)}주차 결과</p>
            <h2>${escapeHtml(result.action.label)}</h2>
          </div>
          <span class="category-pill">${ACTION_CATEGORY_LABELS[result.action.category]}</span>
        </header>
        <div class="place-panel">
          <div class="place-heading">
            ${this.renderActionIcon(result.action, "large")}
            <div>
              <span class="place-name">${escapeHtml(result.action.place)}</span>
              <p>${escapeHtml(result.note)}</p>
            </div>
          </div>
        </div>
        <div class="delta-grid" data-testid="result-deltas">
          ${this.renderDelta("골드", result.goldDelta)}
          ${this.renderDelta("기력", result.energyDelta)}
          ${this.renderDelta("스트레스", result.stressDelta, true)}
          ${Object.entries(result.statChanges)
            .map(([stat, delta]) => this.renderDelta(STAT_LABELS[stat as StatKey], delta ?? 0))
            .join("")}
        </div>
        ${this.renderDeltaBars(this.getResultDeltaBars(result), "result-delta-bars")}
        ${this.renderFuturePanel(result.run, "이번 주 이후", 2)}
        ${result.monthComplete ? this.renderMonthlyCoaching(result.run, "월말 코칭") : ""}
        ${
          result.event
            ? `<div class="event-panel" data-testid="event-panel">
                <p class="eyebrow">이벤트</p>
                <h3>${escapeHtml(result.event.title)}</h3>
                <p>${escapeHtml(result.event.body)}</p>
                ${this.renderEventEffects(result.event)}
              </div>`
            : ""
        }
        <div class="command-row sticky-actions">
          <button data-testid="back-room">방으로</button>
          <button class="primary" data-testid="${result.monthComplete ? "advance-month" : "next-action"}">${nextLabel}</button>
        </div>
      </section>
    `;
  }

  private renderEventEffects(event: GameEvent): string {
    const entries = [
      ...STAT_KEYS.map((stat) => ({
        label: STAT_LABELS[stat],
        delta: event.effects.stats?.[stat] ?? 0,
        reverse: false
      })),
      { label: "골드", delta: event.effects.goldDelta ?? 0, reverse: false },
      { label: "기력", delta: event.effects.energyDelta ?? 0, reverse: false },
      { label: "스트레스", delta: event.effects.stressDelta ?? 0, reverse: true }
    ].filter((entry) => entry.delta !== 0);

    if (entries.length === 0) {
      return "";
    }

    return `
      <div class="delta-grid event-effects" data-testid="event-effects">
        ${entries.map((entry) => this.renderDelta(entry.label, entry.delta, entry.reverse)).join("")}
      </div>
    `;
  }

  private bindResult(): void {
    this.on("back-room", () => {
      if (this.screen !== "result") {
        return;
      }
      this.navigate("room", "replace");
    });
    this.on("next-action", () => {
      if (this.screen !== "result") {
        return;
      }
      this.beginActivity();
    });
    this.on("advance-month", () => {
      if (this.screen !== "result") {
        return;
      }
      this.advanceCompletedMonth("replace");
    });
  }

  private renderEnding(run: RunState): string {
    const endingCode = run.endingCode ?? "quiet-life";
    const ending = getEndingByCode(endingCode);
    const isSharedEnding = Boolean(this.sharedEndingCode);
    const statList = isSharedEnding
      ? ""
      : `
        <div class="stat-list compact">
          ${STAT_KEYS.map((stat) => this.renderStat(run, stat)).join("")}
        </div>
      `;
    return `
      <section class="screen ending-screen">
        <header class="topbar">
          <button class="ghost" data-testid="back-title" aria-label="시작 화면">←</button>
          <div>
            <p class="eyebrow">Ending Card</p>
            <h2>${escapeHtml(ending.title)}</h2>
          </div>
        </header>
        <div class="ending-card" data-testid="ending-card">
          <div class="ending-crest" aria-hidden="true">★</div>
          <p>${escapeHtml(ending.summary)}</p>
          <strong>${escapeHtml(ending.shareText)}</strong>
        </div>
        ${this.renderEndingEvidence(run, endingCode, isSharedEnding)}
        ${statList}
        ${this.renderStartOverConfirmation()}
        <div class="command-row sticky-actions">
          <button data-testid="share-ending">공유</button>
          <button data-testid="open-collection">도감</button>
          <button class="primary" data-testid="new-run">재시작</button>
        </div>
      </section>
    `;
  }

  private renderEndingEvidence(run: RunState, endingCode: EndingCode, isSharedEnding = false): string {
    if (isSharedEnding) {
      return `
        <div class="brief-panel" data-testid="ending-evidence">
          <p class="eyebrow">공유된 엔딩</p>
          <strong>공유 링크로 열린 엔딩 카드입니다.</strong>
        </div>
      `;
    }

    const progress = getEndingProgress(run).find((entry) => entry.ending.code === endingCode);
    if (!progress || progress.requirements.length === 0) {
      return `
        <div class="brief-panel" data-testid="ending-evidence">
          <p class="eyebrow">도달 근거</p>
          <strong>특화 조건보다 안정적인 생활이 두드러진 1년이었습니다.</strong>
        </div>
      `;
    }

    return `
      <div class="brief-panel" data-testid="ending-evidence">
        <p class="eyebrow">도달 근거</p>
        <strong>${escapeHtml(progress.ending.title)} 조건 ${progress.progress}% 충족</strong>
        <div class="requirement-list">
          ${progress.requirements.map((requirement) => this.renderRequirement(requirement)).join("")}
        </div>
      </div>
    `;
  }

  private bindEnding(): void {
    this.on("back-title", () => {
      if (this.screen !== "ending") {
        return;
      }
      this.sharedEndingCode = undefined;
      this.navigate("title");
    });
    this.on("share-ending", async () => {
      if (this.screen !== "ending") {
        return;
      }
      const endingCode = this.sharedEndingCode ?? this.run?.endingCode;
      if (!endingCode) {
        return;
      }
      const startedAsSharedEnding = Boolean(this.sharedEndingCode);
      if (
        this.activeShareAttempt?.endingCode === endingCode &&
        this.activeShareAttempt.startedAsSharedEnding === startedAsSharedEnding
      ) {
        return;
      }
      const token = ++this.shareAttemptToken;
      this.activeShareAttempt = { token, endingCode, startedAsSharedEnding };
      const isCurrentShareTarget = () =>
        this.activeShareAttempt?.token === token &&
        this.screen === "ending" &&
        Boolean(this.sharedEndingCode) === startedAsSharedEnding &&
        (this.sharedEndingCode ?? this.run?.endingCode) === endingCode;
      let shouldRender = true;
      const ending = getEndingByCode(endingCode);
      const shareUrl = getEndingShareUrl(ending.code);
      const shareText = shareUrl ? `${ending.shareText} ${shareUrl}` : ending.shareText;
      const nav = window.navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
        canShare?: (data: ShareData) => boolean;
        clipboard?: Clipboard;
      };
      const shareData: ShareData = { title: "별빛 견습생", text: ending.shareText };
      if (shareUrl) {
        shareData.url = shareUrl;
      }
      this.track("starlit_share_click", { ending_code: ending.code });
      try {
        if (nav.share && (!nav.canShare || nav.canShare(shareData))) {
          await nav.share(shareData);
          if (!isCurrentShareTarget()) {
            return;
          }
          this.warning = undefined;
        } else {
          await copyShareText(nav, shareText);
          if (!isCurrentShareTarget()) {
            return;
          }
          this.warning = "엔딩 공유 문구를 클립보드에 복사했습니다.";
        }
      } catch (error) {
        if (!isCurrentShareTarget()) {
          return;
        }
        if (isShareAbort(error)) {
          shouldRender = false;
          return;
        }
        try {
          await copyShareText(nav, shareText);
          if (!isCurrentShareTarget()) {
            return;
          }
          this.warning = "공유 시트가 열리지 않아 엔딩 공유 문구를 클립보드에 복사했습니다.";
        } catch {
          if (!isCurrentShareTarget()) {
            return;
          }
          this.warning = "공유를 완료하지 못했습니다. 다시 시도해 주세요.";
        }
      } finally {
        const shouldUpdateCurrentTarget = isCurrentShareTarget();
        if (this.activeShareAttempt?.token === token) {
          this.activeShareAttempt = undefined;
        }
        if (shouldRender && shouldUpdateCurrentTarget) {
          this.render();
        }
      }
    });
    this.on("open-collection", () => {
      if (this.screen !== "ending") {
        return;
      }
      this.sharedEndingCode = undefined;
      this.navigate("collection");
    });
    this.on("new-run", () => {
      if (this.screen !== "ending") {
        return;
      }
      this.requestRunReplacement({ kind: "new", historyMode: "push" });
    });
    this.bindRunReplacementConfirmation();
  }

  private renderCollection(): string {
    const unlocked = new Set(this.collection);
    if (this.run?.unlockedEndings) {
      this.run.unlockedEndings.forEach((ending) => unlocked.add(ending));
    }
    return `
      <section class="screen collection-screen">
        <header class="topbar">
          <button class="ghost" data-testid="back-title" aria-label="시작 화면">←</button>
          <div>
            <p class="eyebrow">${unlocked.size}/${ENDINGS.length}</p>
            <h2>엔딩 도감</h2>
          </div>
        </header>
        ${this.renderCollectionSummary(unlocked)}
        <div class="collection-grid" data-testid="collection-grid">
          ${ENDINGS.map((ending) => {
            const isUnlocked = unlocked.has(ending.code);
            return `
              <article class="ending-tile ${isUnlocked ? "unlocked" : "locked"}">
                <span>${isUnlocked ? "해금" : "미해금"}</span>
                <h3>${escapeHtml(isUnlocked ? ending.title : "숨겨진 미래")}</h3>
                <p>${escapeHtml(isUnlocked ? ending.summary : ending.hint)}</p>
                <button data-target-ending-code="${escapeHtml(ending.code)}">${isUnlocked ? "다시 목표" : "목표로 시작"}</button>
              </article>
            `;
          }).join("")}
        </div>
        ${this.renderStartOverConfirmation()}
        <div class="command-row sticky-actions">
          <button data-testid="back-title">시작 화면</button>
          <button class="primary" data-testid="new-run">새로 시작</button>
        </div>
      </section>
    `;
  }

  private getEndingScreenRun(): RunState | null {
    if (this.sharedEndingCode) {
      return {
        ...createNewRun(1),
        endingCode: this.sharedEndingCode,
        unlockedEndings: []
      };
    }
    return this.run;
  }

  private renderCollectionSummary(unlocked: Set<EndingCode>): string {
    const unlockedCount = unlocked.size;
    const completion = Math.round((unlockedCount / ENDINGS.length) * 100);
    const nextTarget = this.getCollectionNextTarget(unlocked);

    return `
      <div class="collection-summary" data-testid="collection-summary">
        <div class="collection-progress">
          <div class="brief-head">
            <span>도감 진행</span>
            <strong>${unlockedCount}/${ENDINGS.length}</strong>
          </div>
          <div class="bar"><i style="width:${completion}%"></i></div>
        </div>
        ${nextTarget}
        <div class="collection-groups" data-testid="collection-groups" aria-label="엔딩 카테고리 진행도">
          ${ENDING_GROUPS.map((group) => {
            const groupUnlocked = group.endings.filter((ending) => unlocked.has(ending)).length;
            return `<span>${escapeHtml(group.label)} ${groupUnlocked}/${group.endings.length}</span>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  private getCollectionNextTarget(unlocked: Set<EndingCode>): string {
    const lockedProgress = this.run
      ? getEndingProgress(this.run).filter((entry) => !unlocked.has(entry.ending.code))
      : [];
    const progressTarget = lockedProgress[0];

    if (progressTarget) {
      return `
        <div class="collection-next" data-testid="collection-next-target">
          <p class="eyebrow">다음 목표</p>
          <div class="future-card-head">
            <strong>${escapeHtml(progressTarget.ending.title)}</strong>
            <span>${progressTarget.progress}%</span>
          </div>
          <div class="bar"><i style="width:${progressTarget.progress}%"></i></div>
          <div class="requirement-list">
            ${progressTarget.requirements.map((requirement) => this.renderRequirement(requirement)).join("")}
          </div>
        </div>
      `;
    }

    const firstLocked = ENDINGS.find((ending) => !unlocked.has(ending.code));
    if (!firstLocked) {
      return `
        <div class="collection-next" data-testid="collection-next-target">
          <p class="eyebrow">다음 목표</p>
          <strong>모든 미래를 해금했습니다.</strong>
        </div>
      `;
    }

    return `
      <div class="collection-next" data-testid="collection-next-target">
        <p class="eyebrow">다음 목표</p>
        <strong>${escapeHtml(firstLocked.title)}</strong>
        <p>${escapeHtml(firstLocked.hint)}</p>
      </div>
    `;
  }

  private bindCollection(): void {
    this.on("back-title", () => {
      if (this.screen !== "collection") {
        return;
      }
      this.pendingRunReplacement = undefined;
      this.navigate("title");
    });
    this.on("new-run", () => {
      if (this.screen !== "collection") {
        return;
      }
      this.requestRunReplacement({ kind: "new", historyMode: "push" });
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-target-ending-code]").forEach((button) => {
      button.addEventListener("click", () => {
        if (this.screen !== "collection" || !button.isConnected) {
          return;
        }
        const targetEndingCode = button.dataset.targetEndingCode;
        if (!isKnownEndingCode(targetEndingCode)) {
          this.warning = "알 수 없는 목표 엔딩입니다.";
          this.render();
          return;
        }
        this.requestRunReplacement({ kind: "targeted", endingCode: targetEndingCode, historyMode: "push" });
      });
    });
    this.bindRunReplacementConfirmation();
  }

  private resolveSlotAndRender(): void {
    if (!this.run) {
      return;
    }
    try {
      this.latestResult = resolveNextSlot(this.run);
      this.run = this.latestResult.run;
      this.persistRun();
      if (this.latestResult.event) {
        this.track("starlit_event_seen", {
          event_id: this.latestResult.event.id,
          month: this.run.month
        });
      }
      this.screen = "result";
      this.render();
    } catch (error) {
      this.warning = error instanceof Error ? error.message : "일정을 진행하지 못했습니다.";
      this.navigate("room", "replace");
    }
  }

  private beginActivity(): void {
    if (!this.run) {
      return;
    }
    if (!this.getPendingAction()) {
      this.resolveSlotAndRender();
      return;
    }

    try {
      this.clearActivityTimer();
      this.latestResult = undefined;
      this.activityResult = resolveNextSlot(this.run);
      this.activityCompletedDays = 0;
      this.activityStartedAt = getMonotonicNow();
      this.screen = "activity";
      this.render();

      const token = ++this.activityToken;
      this.activityInterval = window.setInterval(() => {
        if (token !== this.activityToken) {
          return;
        }
        this.syncActivityProgress();
      }, DAY_DURATION_MS);
      this.activityTimer = window.setTimeout(() => this.finishActivity(token), ACTIVITY_DURATION_MS);
    } catch (error) {
      this.warning = error instanceof Error ? error.message : "일정을 진행하지 못했습니다.";
      this.navigate("room", "replace");
    }
  }

  private finishActivity(token?: number): void {
    if (token !== undefined && token !== this.activityToken) {
      return;
    }
    if (this.screen !== "activity") {
      return;
    }
    const result = this.activityResult;
    this.clearActivityTimer();
    if (!result) {
      this.resolveSlotAndRender();
      return;
    }
    this.latestResult = result;
    this.run = result.run;
    this.persistRun();
    if (result.event) {
      this.track("starlit_event_seen", {
        event_id: result.event.id,
        month: this.run.month
      });
    }
    this.activityResult = undefined;
    this.activityCompletedDays = 0;
    this.screen = "result";
    this.render();
  }

  private syncActivityProgress(now = getMonotonicNow()): void {
    if (this.screen !== "activity" || !this.activityResult || this.activityStartedAt === undefined) {
      return;
    }

    const elapsedMs = Math.max(0, now - this.activityStartedAt);
    if (elapsedMs >= ACTIVITY_DURATION_MS) {
      this.activityCompletedDays = WEEK_DAYS.length;
      this.finishActivity();
      return;
    }

    const completedDays = Math.min(WEEK_DAYS.length - 1, Math.floor(elapsedMs / DAY_DURATION_MS));
    if (completedDays !== this.activityCompletedDays) {
      this.activityCompletedDays = completedDays;
      this.render();
    }
  }

  private clearActivityTimer(): void {
    if (this.activityTimer) {
      window.clearTimeout(this.activityTimer);
      this.activityTimer = undefined;
    }
    if (this.activityInterval) {
      window.clearInterval(this.activityInterval);
      this.activityInterval = undefined;
    }
    this.activityStartedAt = undefined;
    this.activityToken += 1;
  }

  private getPendingAction(): ScheduleAction | undefined {
    if (!this.run) {
      return undefined;
    }
    const actionId = this.run.currentSchedule[this.run.slotIndex];
    return actionId ? ACTIONS.find((action) => action.id === actionId) : undefined;
  }

  private getRoomPrimaryActionLabel(run: RunState): string {
    if (this.isMonthReadyToAdvance(run)) {
      return run.month >= MAX_MONTH ? "엔딩 보기" : "다음 달";
    }
    if (this.hasPendingScheduledAction(run)) {
      return "다음 일정";
    }
    return "이번 달 일정 정하기";
  }

  private hasPendingScheduledAction(run = this.run): run is RunState {
    return Boolean(
      run &&
        !run.endingCode &&
        run.currentSchedule.length === SLOTS_PER_MONTH &&
        run.slotIndex < SLOTS_PER_MONTH
    );
  }

  private isMonthReadyToAdvance(run = this.run): run is RunState {
    return Boolean(
      run &&
        !run.endingCode &&
        run.currentSchedule.length === SLOTS_PER_MONTH &&
        run.slotIndex >= SLOTS_PER_MONTH
    );
  }

  private hasReplaceableProgress(): boolean {
    return Boolean(
      this.run &&
        !this.run.endingCode &&
        (this.run.month > 1 ||
          this.run.history.length > 0 ||
          this.run.currentSchedule.length > 0 ||
          Boolean(this.run.targetEndingCode))
    );
  }

  private requestRunReplacement(request: RunReplacementRequest): void {
    this.isResetConfirmationVisible = false;
    if (
      request.kind === "targeted" &&
      this.run &&
      !this.run.endingCode &&
      this.run.targetEndingCode === request.endingCode
    ) {
      this.pendingRunReplacement = undefined;
      this.navigate("room", request.historyMode);
      return;
    }
    if (this.hasReplaceableProgress()) {
      this.pendingRunReplacement = request;
      this.render();
      return;
    }
    this.executeRunReplacement(request);
  }

  private bindRunReplacementConfirmation(): void {
    this.on("cancel-start-over", () => {
      this.pendingRunReplacement = undefined;
      this.render();
    });
    this.on("confirm-start-over", () => {
      if (!this.pendingRunReplacement) {
        return;
      }
      this.executeRunReplacement(this.pendingRunReplacement);
    });
  }

  private executeRunReplacement(request: RunReplacementRequest): void {
    if (request.kind === "targeted") {
      this.startTargetedRun(request.endingCode, request.historyMode);
      return;
    }
    this.startNewRun(request.historyMode);
  }

  private startNewRun(historyMode: HistoryMode): void {
    this.run = createNewRun(Date.now());
    this.latestResult = undefined;
    this.activityResult = undefined;
    this.selectedActions = [];
    this.sharedEndingCode = undefined;
    this.pendingRunReplacement = undefined;
    this.isResetConfirmationVisible = false;
    clearRun();
    this.persistRun();
    this.track("starlit_start_click", { mode: "new" });
    this.navigate("room", historyMode);
  }

  private startTargetedRun(targetEndingCode: EndingCode, historyMode: HistoryMode): void {
    this.run = createTargetedRun(targetEndingCode, Date.now());
    this.latestResult = undefined;
    this.activityResult = undefined;
    this.selectedActions = [];
    this.sharedEndingCode = undefined;
    this.pendingRunReplacement = undefined;
    this.isResetConfirmationVisible = false;
    clearRun();
    this.persistRun();
    this.track("starlit_target_ending_selected", { ending_code: targetEndingCode });
    this.navigate("room", historyMode);
  }

  private advanceCompletedMonth(historyMode: HistoryMode): void {
    const run = this.run;
    if (!this.isMonthReadyToAdvance(run)) {
      this.navigate("room", historyMode);
      return;
    }

    this.run = advanceMonth(run);
    this.persistRun();
    this.latestResult = undefined;
    if (this.run.endingCode) {
      this.collection = uniqueEndings([...this.collection, this.run.endingCode]);
      this.persistCollection();
      this.track("starlit_ending_reached", { ending_code: this.run.endingCode, year: 1 });
      this.navigate("ending", historyMode);
      return;
    }

    this.navigate("room", historyMode);
  }

  private persistRun(): void {
    if (!this.run) {
      return;
    }
    const warning = saveRun(this.run);
    if (warning) {
      this.warning = warning;
    }
  }

  private persistCollection(): void {
    const warning = saveCollection(this.collection);
    if (warning) {
      this.warning = warning;
    }
  }

  private renderActionButton(action: ScheduleAction): string {
    const targetRecommendation = this.getTargetActionRecommendations(ACTIONS.length, this.selectedActions).find(
      (recommendation) => recommendation.action.id === action.id
    );
    const availability = this.getActionAvailability(action);
    const statText = Object.entries(action.statEffects)
      .map(([stat, value]) => `${STAT_LABELS[stat as StatKey]} +${value}`)
      .join(" · ");
    return `
      <button
        class="action-button${targetRecommendation ? " recommended" : ""}${availability.selectable ? "" : " unavailable"}"
        data-action-id="${action.id}"
        data-testid="action-${action.id}"
        ${availability.selectable ? "" : "disabled"}
      >
        ${this.renderActionIcon(action)}
        <span class="action-title">${escapeHtml(action.label)}</span>
        <strong>${escapeHtml(action.place)}</strong>
        <small>${escapeHtml(statText || action.description)}</small>
        <small class="action-cost">${escapeHtml(this.renderActionResourceText(action))}</small>
        ${targetRecommendation ? `<span class="target-badge">목표 추천</span>` : ""}
        ${availability.reasons.length > 0 ? `<span class="action-unavailable">${escapeHtml(availability.reasons.join(" · "))}</span>` : ""}
      </button>
    `;
  }

  private getSchedulePlanStatus(actionIds: ActionId[] = this.selectedActions): SchedulePlanStatus {
    if (!this.run) {
      return {
        forecast: { gold: 0, energy: 0, stress: 0 },
        blockers: ["기록 없음"],
        isValid: false
      };
    }
    return getCoreSchedulePlanStatus(this.run, actionIds);
  }

  private getActionAvailability(action: ScheduleAction): ActionAvailability {
    if (!this.run) {
      return { selectable: false, reasons: ["기록 없음"] };
    }
    if (this.selectedActions.length >= SLOTS_PER_MONTH) {
      return { selectable: false, reasons: ["4주 선택 완료"] };
    }

    const status = this.getSchedulePlanStatus([...this.selectedActions, action.id]);
    return {
      selectable: status.isValid,
      reasons: status.blockers
    };
  }

  private renderActionResourceText(action: ScheduleAction): string {
    return [
      this.formatResourceDelta(RESOURCE_LABELS.gold, action.goldDelta),
      this.formatResourceDelta(RESOURCE_LABELS.energy, action.energyDelta),
      this.formatResourceDelta(RESOURCE_LABELS.stress, action.stressDelta)
    ]
      .filter(Boolean)
      .join(" · ");
  }

  private formatResourceDelta(label: string, delta: number): string {
    if (delta === 0) {
      return "";
    }
    return `${label} ${delta > 0 ? "+" : ""}${delta}`;
  }

  private renderActionIcon(action: ScheduleAction, size: "default" | "small" | "large" = "default"): string {
    return `
      <span class="action-icon-frame ${size}" aria-hidden="true">
        <img class="action-icon" src="${escapeHtml(ACTION_ICON_URLS[action.id])}" alt="">
      </span>
    `;
  }

  private renderWeekDays(): string {
    return `
      <div class="week-day-strip" data-testid="week-day-strip" aria-label="주간 진행">
        ${WEEK_DAYS.map(
          (day, index) => `
            <span class="${this.getDayClass(index)}">
              <b>${day}</b>
              <i></i>
            </span>
          `
        ).join("")}
      </div>
    `;
  }

  private renderDailyOutcome(): string {
    const outcome = this.getCurrentDailyOutcome();
    if (!outcome) {
      return "";
    }
    return `
      <div class="daily-outcome ${outcome.kind}" data-testid="daily-outcome">
        <span>${escapeHtml(WEEK_DAYS[outcome.day - 1] ?? `${outcome.day}일`)}</span>
        <strong>${escapeHtml(outcome.label)}</strong>
        <p>${escapeHtml(outcome.note)}</p>
      </div>
    `;
  }

  private renderDeltaBars(entries: DeltaBarView[], testId: string): string {
    if (entries.length === 0) {
      return "";
    }

    return `
      <div class="delta-bars" data-testid="${testId}">
        ${entries
          .map((entry) => {
            const sign = entry.delta > 0 ? "+" : "";
            const width = this.getDeltaWidth(entry.delta);
            const fromWidth =
              entry.fromDelta === undefined ? width : this.getDeltaAnimationStartWidth(entry.fromDelta, entry.delta);
            const animationClass = entry.fromDelta === undefined ? "" : " animated";
            return `
              <div
                class="delta-bar ${entry.isGood ? "good" : "bad"}${animationClass}"
                data-delta="${entry.delta}"
                data-from-delta="${entry.fromDelta ?? entry.delta}"
              >
                <span>${escapeHtml(entry.label)}</span>
                <strong>${sign}${entry.delta}</strong>
                <div><i style="--from-width:${fromWidth}%; --to-width:${width}%; width:${width}%"></i></div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  private getDailyDeltaBars(outcomes: DailyOutcome[], previousOutcomes: DailyOutcome[]): DeltaBarView[] {
    return [
      ...STAT_KEYS.map((stat) => ({
        label: STAT_LABELS[stat],
        delta: outcomes.reduce((sum, outcome) => sum + (outcome.statChanges[stat] ?? 0), 0),
        fromDelta: previousOutcomes.reduce((sum, outcome) => sum + (outcome.statChanges[stat] ?? 0), 0),
        isGood: outcomes.reduce((sum, outcome) => sum + (outcome.statChanges[stat] ?? 0), 0) >= 0
      })),
      {
        label: "골드",
        delta: outcomes.reduce((sum, outcome) => sum + outcome.goldDelta, 0),
        fromDelta: previousOutcomes.reduce((sum, outcome) => sum + outcome.goldDelta, 0),
        isGood: true
      },
      {
        label: "기력",
        delta: outcomes.reduce((sum, outcome) => sum + outcome.energyDelta, 0),
        fromDelta: previousOutcomes.reduce((sum, outcome) => sum + outcome.energyDelta, 0),
        isGood: true
      },
      {
        label: "스트레스",
        delta: outcomes.reduce((sum, outcome) => sum + outcome.stressDelta, 0),
        fromDelta: previousOutcomes.reduce((sum, outcome) => sum + outcome.stressDelta, 0),
        isGood: outcomes.reduce((sum, outcome) => sum + outcome.stressDelta, 0) <= 0
      }
    ]
      .map((entry) =>
        entry.label === "골드" || entry.label === "기력" ? { ...entry, isGood: entry.delta >= 0 } : entry
      )
      .filter((entry) => entry.delta !== 0 || entry.fromDelta !== 0);
  }

  private getDeltaWidth(delta: number): number {
    if (delta === 0) {
      return 0;
    }
    return Math.min(100, Math.max(12, Math.abs(delta) * 4));
  }

  private getDeltaAnimationStartWidth(fromDelta: number, toDelta: number): number {
    if (fromDelta === 0) {
      return 0;
    }
    if (toDelta !== 0 && Math.sign(fromDelta) !== Math.sign(toDelta)) {
      return 0;
    }
    return this.getDeltaWidth(fromDelta);
  }

  private getResultDeltaBars(result: ResolutionResult): DeltaBarView[] {
    return [
      ...STAT_KEYS.map((stat) => ({
        label: STAT_LABELS[stat],
        delta: result.statChanges[stat] ?? 0,
        isGood: (result.statChanges[stat] ?? 0) >= 0
      })),
      { label: "골드", delta: result.goldDelta, isGood: result.goldDelta >= 0 },
      { label: "기력", delta: result.energyDelta, isGood: result.energyDelta >= 0 },
      { label: "스트레스", delta: result.stressDelta, isGood: result.stressDelta <= 0 }
    ].filter((entry) => entry.delta !== 0);
  }

  private getVisibleDailyOutcomes(): DailyOutcome[] {
    const outcomes = this.activityResult?.dailyOutcomes ?? [];
    if (outcomes.length === 0) {
      return [];
    }
    const visibleCount = Math.min(outcomes.length, this.activityCompletedDays + 1);
    return outcomes.slice(0, visibleCount);
  }

  private getPreviousVisibleDailyOutcomes(): DailyOutcome[] {
    const outcomes = this.activityResult?.dailyOutcomes ?? [];
    if (outcomes.length === 0 || this.activityCompletedDays === 0) {
      return [];
    }
    const visibleCount = Math.min(outcomes.length, this.activityCompletedDays);
    return outcomes.slice(0, visibleCount);
  }

  private getCurrentDailyOutcome(): DailyOutcome | undefined {
    const outcomes = this.activityResult?.dailyOutcomes ?? [];
    if (outcomes.length === 0) {
      return undefined;
    }
    return outcomes[Math.min(this.activityCompletedDays, outcomes.length - 1)];
  }

  private getDayClass(index: number): string {
    if (index < this.activityCompletedDays) {
      return "done";
    }
    if (index === this.activityCompletedDays) {
      return "active";
    }
    return "";
  }

  private renderSelectedSlot(index: number): string {
    const actionId = this.selectedActions[index];
    const action = actionId ? ACTIONS.find((candidate) => candidate.id === actionId) : undefined;
    if (!action) {
      return `
        <div class="slot">
          <div class="slot-marker">
            <span>${index + 1}</span>
          </div>
          <strong>선택</strong>
        </div>
      `;
    }

    return `
      <button
        class="slot filled"
        data-slot-index="${index}"
        data-testid="selected-slot-${index + 1}"
        aria-label="${index + 1}주차 ${escapeHtml(action.label)} 제거"
      >
        <div class="slot-marker">
          ${this.renderActionIcon(action, "small")}
        </div>
        <strong>${escapeHtml(action.shortLabel)}</strong>
      </button>
    `;
  }

  private renderStat(run: RunState, stat: StatKey): string {
    const value = run.stats[stat];
    return `
      <div class="stat">
        <span>${STAT_LABELS[stat]}</span>
        <strong>${value}</strong>
        <small>${escapeHtml(STAT_BENEFITS[stat])}</small>
        <div class="bar"><i style="width:${value}%"></i></div>
      </div>
    `;
  }

  private renderApprenticeStage(run: RunState): string {
    const profile = getApprenticeProfile(run);
    return `
      <div class="apprentice-stage" data-testid="apprentice-stage">
        <div class="apprentice-profile" data-testid="apprentice-profile">
          <span>견습생</span>
          <strong>키 ${profile.heightCm}cm</strong>
          <div>
            <em>${escapeHtml(profile.expressionLabel)}</em>
            <em>${escapeHtml(profile.poseLabel)}</em>
            <em>${escapeHtml(this.getGrowthLabel(profile))}</em>
          </div>
        </div>
      </div>
    `;
  }

  private getGrowthLabel(profile: ApprenticeProfile): string {
    if (profile.growthStage === "tall") {
      return "훌쩍 큼";
    }
    if (profile.growthStage === "growing") {
      return "성장 중";
    }
    return "작은 키";
  }

  private renderFuturePanel(run: RunState, title: string, limit: number): string {
    const entries = getEndingProgress(run).slice(0, limit);
    if (entries.length === 0) {
      return "";
    }

    return `
      <div class="future-panel" data-testid="${title === "미래 후보" ? "future-panel" : "result-future-panel"}">
        <h3>${escapeHtml(title)}</h3>
        <div class="future-list">
          ${entries.map((entry) => this.renderFutureCard(entry)).join("")}
        </div>
      </div>
    `;
  }

  private renderFutureCard(entry: EndingProgress): string {
    return `
      <article class="future-card ${entry.completed ? "ready" : ""}">
        <div class="future-card-head">
          <strong>${escapeHtml(entry.ending.title)}</strong>
          <span>${entry.progress}%</span>
        </div>
        <div class="bar"><i style="width:${entry.progress}%"></i></div>
        <div class="requirement-list">
          ${entry.requirements.map((requirement) => this.renderRequirement(requirement)).join("")}
        </div>
      </article>
    `;
  }

  private renderRequirement(requirement: EndingProgress["requirements"][number]): string {
    const suffix = requirement.direction === "at-most" ? " 이하" : "";
    return `
      <span class="${requirement.satisfied ? "met" : ""}">
        ${escapeHtml(requirement.label)} ${requirement.current}/${requirement.target}${suffix}
      </span>
    `;
  }

  private renderDelta(label: string, delta: number, reverse = false): string {
    const positive = reverse ? delta <= 0 : delta >= 0;
    const sign = delta > 0 ? "+" : "";
    return `<div class="delta ${positive ? "good" : "bad"}"><span>${escapeHtml(label)}</span><strong>${sign}${delta}</strong></div>`;
  }

  private renderRecentHistory(run: RunState): string {
    const entries = run.history.slice(-3).reverse();
    if (entries.length === 0) {
      return "<p>아직 기록이 없습니다. 첫 달 일정을 정해 보세요.</p>";
    }
    return `<ul>${entries
      .map(
        (entry) =>
          `<li><span>${entry.month}월 ${entry.slot}주차</span><strong>${escapeHtml(entry.actionLabel)}</strong></li>`
      )
      .join("")}</ul>`;
  }

  private setMood(screen: Screen): void {
    const displayRun = screen === "ending" ? this.getEndingScreenRun() : this.run;
    this.game.setMood(
      screen as SceneMood,
      screen === "activity" ? this.getPendingAction() : undefined,
      displayRun ? getApprenticeProfile(displayRun) : undefined
    );
  }

  private navigate(screen: Screen, historyMode: HistoryMode = "push"): void {
    if (this.screen === "ending" && screen !== "ending") {
      this.clearShareAttempt();
    }
    this.screen = screen;
    this.writeScreenHistory(screen, historyMode);
    this.render();
  }

  private bindBrowserHistory(): void {
    window.addEventListener("popstate", (event) => {
      const screen = event.state && typeof event.state === "object" ? (event.state as { starlitScreen?: unknown }).starlitScreen : undefined;
      if (!isScreen(screen)) {
        return;
      }

      this.clearActivityTimer();
      this.isApplyingPopState = true;
      const sharedEnding = getSharedEndingCode();
      this.sharedEndingCode = sharedEnding ?? undefined;
      const nextScreen = this.coerceHistoryScreen(screen);
      if (nextScreen !== "ending" || !sharedEnding) {
        this.clearShareAttempt();
        this.sharedEndingCode = undefined;
      }
      this.screen = nextScreen;
      this.render();
      this.isApplyingPopState = false;
    });
  }

  private bindPageLifecycle(): void {
    window.addEventListener("pageshow", () => this.syncActivityProgress());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.syncActivityProgress();
      }
    });
  }

  private coerceHistoryScreen(screen: Screen): Screen {
    if (screen === "title" || screen === "collection") {
      return screen;
    }
    if (screen === "ending") {
      if (this.sharedEndingCode || this.run?.endingCode) {
        return "ending";
      }
      return this.run ? "room" : "title";
    }
    if (!this.run) {
      return "title";
    }
    if (this.run.endingCode) {
      return "ending";
    }
    if (screen === "schedule") {
      return this.run.currentSchedule.length === 0 && this.run.slotIndex === 0 ? "schedule" : "room";
    }
    return "room";
  }

  private writeScreenHistory(screen: Screen, mode: HistoryMode): void {
    if (mode === "none" || this.isApplyingPopState) {
      return;
    }

    try {
      const state = { starlitScreen: screen };
      const url = this.getHistoryUrl(screen);
      if (mode === "replace") {
        window.history.replaceState(state, "", url);
      } else {
        window.history.pushState(state, "", url);
      }
    } catch {
      // Embedded previews can restrict history writes; navigation still works in-app.
    }
  }

  private getHistoryUrl(screen: Screen): string {
    const url = new URL(window.location.href);
    if (screen === "ending" && this.sharedEndingCode) {
      url.search = "";
      url.hash = "";
      url.searchParams.set("ending", this.sharedEndingCode);
      return url.toString();
    }
    if (screen !== "ending" || this.run?.history.length) {
      url.searchParams.delete("ending");
    }
    return url.toString();
  }

  private resetScrollOnScreenChange(): void {
    if (this.lastRenderedScreen === this.screen) {
      return;
    }
    this.lastRenderedScreen = this.screen;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0 }));
  }

  private clearShareAttempt(): void {
    if (!this.activeShareAttempt) {
      return;
    }
    this.shareAttemptToken += 1;
    this.activeShareAttempt = undefined;
  }

  private on(testId: string, handler: () => void): void {
    this.root.querySelectorAll<HTMLButtonElement>(`[data-testid="${testId}"]`).forEach((button) => {
      button.addEventListener("click", () => {
        if (!button.isConnected) {
          return;
        }
        handler();
      });
    });
  }

  private track(eventName: string, params: Record<string, unknown>): void {
    window.dispatchEvent(new CustomEvent("starlit:analytics", { detail: { eventName, params } }));
  }
}

function getSharedEndingCode(): EndingCode | null {
  const code = new URLSearchParams(window.location.search).get("ending");
  if (ENDINGS.some((ending) => ending.code === code)) {
    return code as EndingCode;
  }
  return null;
}

function getEndingShareUrl(endingCode: EndingCode): string | undefined {
  return buildPublicEndingShareUrl(endingCode, PUBLIC_SHARE_ORIGIN, window.location.href);
}

function isScreen(value: unknown): value is Screen {
  return typeof value === "string" && SCREEN_VALUES.has(value as Screen);
}

function isKnownActionCategory(value: unknown): value is ActionCategory {
  return typeof value === "string" && CATEGORIES.includes(value as ActionCategory);
}

function getKnownAction(value: unknown): ScheduleAction | undefined {
  return typeof value === "string" ? ACTIONS.find((action) => action.id === value) : undefined;
}

function isKnownEndingCode(value: unknown): value is EndingCode {
  return typeof value === "string" && ENDINGS.some((ending) => ending.code === value);
}

async function copyShareText(nav: Navigator & { clipboard?: Clipboard }, shareText: string): Promise<void> {
  if (!nav.clipboard) {
    throw new Error("Clipboard API is unavailable.");
  }
  await nav.clipboard.writeText(shareText);
}

function getMonotonicNow(): number {
  const now = window.performance?.now?.();
  return Number.isFinite(now) ? now : Date.now();
}

function isShareAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function uniqueEndings(endings: EndingCode[]): EndingCode[] {
  return [...new Set(endings)];
}

function escapeHtml(input: string | number): string {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getActivityLine(action: ScheduleAction): string {
  const lines: Record<ActionCategory, string> = {
    lesson: "수업에 집중하며 한 주를 보냅니다.",
    work: "맡은 일을 해내며 한 주의 경험을 쌓습니다.",
    rest: "몸과 마음을 쉬게 하며 한 주 동안 기력을 회복합니다.",
    outing: "도시를 둘러보며 한 주의 자극을 얻습니다."
  };
  return lines[action.category];
}
