import { expect, test, type Page } from "@playwright/test";
import {
  RUN_STORAGE_KEY,
  advanceMonth,
  createNewRun,
  resolveNextSlot,
  selectSchedule,
  serializeRun
} from "../../packages/product-core/dist/index.js";
import type { ActionId, RunState } from "../../packages/product-core/dist/index.js";

type TestClockWindow = Window & {
  __advanceStarlitTime?: (elapsedMs: number) => number;
  __advanceStarlitWallTime?: (elapsedMs: number) => number;
};

const OBSERVATORY_ROUTE: ActionId[][] = [
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

function createFinalPendingRun(): RunState {
  let run = createNewRun(1);
  for (const schedule of OBSERVATORY_ROUTE.slice(0, 11)) {
    run = selectSchedule(run, schedule);
    for (let slot = 0; slot < 4; slot += 1) {
      run = resolveNextSlot(run).run;
    }
    run = advanceMonth(run);
  }

  run = selectSchedule(run, OBSERVATORY_ROUTE[11]);
  for (let slot = 0; slot < 3; slot += 1) {
    run = resolveNextSlot(run).run;
  }
  return run;
}

function createCompletedEndingRun(): RunState {
  const resolved = resolveNextSlot(createFinalPendingRun()).run;
  return advanceMonth(resolved);
}

function createMonthReadyRun(): RunState {
  let run = createNewRun(2);
  run = selectSchedule(run, ["star-lore", "letters", "home-rest", "park"]);
  for (let slot = 0; slot < 4; slot += 1) {
    run = resolveNextSlot(run).run;
  }
  return run;
}

async function loadSerializedRun(page: Page, serializedRun: string): Promise<void> {
  await page.evaluate(
    ({ key, run }) => {
      localStorage.clear();
      localStorage.setItem(key, run);
    },
    { key: RUN_STORAGE_KEY, run: serializedRun }
  );
  await page.reload();
}

async function finishActivity(page: Page): Promise<void> {
  await expect(page.getByTestId("activity-screen")).toBeVisible();
  await page.getByTestId("finish-activity").click();
  await expect(page.getByTestId("result-deltas")).toBeVisible();
  await expect(page.getByTestId("result-future-panel")).toBeVisible();
}

async function dispatchHistoryState(page: Page, starlitScreen: string): Promise<void> {
  await page.evaluate((screen) => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: { starlitScreen: screen } }));
  }, starlitScreen);
}

async function dispatchDuplicateCommand(page: Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Missing command button: ${id}`);
    }
    button.click();
    button.click();
  }, testId);
}

async function installControllableClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    let wallNow = 1_000_000;
    let monotonicNow = 10_000;
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => wallNow
    });
    Object.defineProperty(window.performance, "now", {
      configurable: true,
      value: () => monotonicNow
    });
    (window as TestClockWindow).__advanceStarlitTime = (elapsedMs: number) => {
      wallNow += elapsedMs;
      monotonicNow += elapsedMs;
      return monotonicNow;
    };
    (window as TestClockWindow).__advanceStarlitWallTime = (elapsedMs: number) => {
      wallNow += elapsedMs;
      return wallNow;
    };
  });
}

async function advanceClockAndResume(page: Page, elapsedMs: number): Promise<void> {
  await page.evaluate((ms) => {
    const advance = (window as TestClockWindow).__advanceStarlitTime;
    if (!advance) {
      throw new Error("Missing controllable clock.");
    }
    advance(ms);
    window.dispatchEvent(new Event("pageshow"));
  }, elapsedMs);
}

async function advanceClockAndVisibilityResume(page: Page, elapsedMs: number): Promise<void> {
  await page.evaluate((ms) => {
    const advance = (window as TestClockWindow).__advanceStarlitTime;
    if (!advance) {
      throw new Error("Missing controllable clock.");
    }
    advance(ms);
    document.dispatchEvent(new Event("visibilitychange"));
  }, elapsedMs);
}

async function advanceWallClockAndResume(page: Page, elapsedMs: number): Promise<void> {
  await page.evaluate((ms) => {
    const advance = (window as TestClockWindow).__advanceStarlitWallTime;
    if (!advance) {
      throw new Error("Missing controllable wall clock.");
    }
    advance(ms);
    window.dispatchEvent(new Event("pageshow"));
  }, elapsedMs);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
});

test("guides the first monthly schedule and updates readiness", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await expect(page.getByTestId("first-run-brief")).toContainText("첫 달 목표");
  await expect(page.getByTestId("first-run-brief")).toContainText("4주 일정");

  await page.getByTestId("open-schedule").click();
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 0/4");
  await expect(page.getByTestId("schedule-guidance")).toContainText("4주 더 선택");
  await expect(page.getByTestId("confirm-schedule")).toBeDisabled();

  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await expect(page.getByTestId("selected-slot-2")).toContainText("문장");
  await page.getByTestId("selected-slot-2").click();
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 1/4");
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();

  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 4/4");
  await expect(page.getByTestId("schedule-guidance")).toContainText("일정 실행 가능");
  await expect(page.getByTestId("confirm-schedule")).toBeEnabled();
});

test("starts a targeted run from the ending collection", async ({ page }) => {
  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();

  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");
  await expect(page.getByTestId("target-ending-panel")).toContainText("지성");
  await expect(page.getByText("광고 SDK")).toHaveCount(0);
  await page.getByTestId("open-schedule").click();
  await expect(page.getByTestId("schedule-target-guidance")).toContainText("별빛 연구자");
  await expect(page.getByTestId("target-recommendations")).toContainText("별빛학");
  await expect(page.getByTestId("action-star-lore")).toContainText("목표 추천");
  await page.getByTestId("back-room").click();
  await page.getByTestId("clear-target").click();
  await expect(page.getByTestId("target-ending-panel")).toHaveCount(0);
});

test("rejects unknown DOM dataset values without breaking the run", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.locator("[data-category='lesson']").evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.dataset.category = "unknown-category";
    button.textContent = "깨진 분류";
  });
  await page.locator("[data-category='unknown-category']").click();
  await expect(page.getByTestId("fallback-banner")).toContainText("알 수 없는 일정 종류");
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 0/4");

  await page.getByTestId("action-star-lore").evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.dataset.actionId = "unknown-action";
    button.textContent = "깨진 일정";
  });
  await page.locator("[data-action-id='unknown-action']").click();
  await expect(page.getByTestId("fallback-banner")).toContainText("알 수 없는 일정입니다.");
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 0/4");

  await page.evaluate(() => localStorage.clear());
  await page.goto("/");
  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.dataset.targetEndingCode = "unknown-ending";
    button.textContent = "깨진 목표";
  });
  await page.locator("[data-target-ending-code='unknown-ending']").click();
  await expect(page.getByTestId("fallback-banner")).toContainText("알 수 없는 목표 엔딩");
  await expect(page.getByTestId("target-ending-panel")).toHaveCount(0);

  await page.locator("[data-target-ending-code='scholar']").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");
  expect(pageErrors).toEqual([]);
});

test("ignores duplicate command events without advancing extra schedule slots", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();

  await dispatchDuplicateCommand(page, "confirm-schedule");
  await expect(page.getByTestId("activity-screen")).toContainText("별빛학");

  await dispatchDuplicateCommand(page, "finish-activity");
  await expect(page.getByTestId("result-deltas")).toBeVisible();
  await page.getByTestId("back-room").last().click();
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");
  await expect(page.getByTestId("current-month-plan")).not.toContainText("3주차 · 다음");
  expect(pageErrors).toEqual([]);
});

test("ignores stale schedule action clicks while allowing intentional repeats", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();

  await dispatchDuplicateCommand(page, "action-star-lore");
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 1/4");
  await expect(page.getByTestId("selected-slot-1")).toContainText("별빛");

  await page.getByTestId("action-star-lore").click();
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 2/4");
  await expect(page.getByTestId("selected-slot-2")).toContainText("별빛");
  expect(pageErrors).toEqual([]);
});

test("ignores duplicate final result advance commands while opening the ending", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await loadSerializedRun(page, serializeRun(createFinalPendingRun()));
  await expect(page.getByTestId("continue-run")).toContainText("이어하기");
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("activity-screen")).toContainText("집에서 쉬기");
  await page.getByTestId("finish-activity").click();
  await expect(page.getByTestId("result-deltas")).toBeVisible();
  await expect(page.getByTestId("advance-month")).toContainText("엔딩 보기");

  await dispatchDuplicateCommand(page, "advance-month");
  await expect(page.getByTestId("ending-card")).toContainText("천문대장");
  await expect(page.getByTestId("ending-evidence")).toContainText("도달 근거");
  await expect(page.getByTestId("apprentice-profile")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("ignores duplicate room month-advance commands without opening the schedule", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await loadSerializedRun(page, serializeRun(createMonthReadyRun()));
  await dispatchHistoryState(page, "room");
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();
  await expect(page.getByTestId("open-schedule")).toContainText("다음 달");

  await dispatchDuplicateCommand(page, "open-schedule");

  await expect(page.getByTestId("apprentice-profile")).toBeVisible();
  await expect(page.getByText("Month 2 / 12")).toBeVisible();
  await expect(page.getByTestId("open-schedule")).toContainText("이번 달 일정 정하기");
  await expect(page.getByTestId("selected-slots")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("confirms before replacing active progress", async ({ page }) => {
  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");

  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='merchant']").click();
  await expect(page.getByTestId("start-over-confirmation")).toContainText("도시 상인");
  await page.getByTestId("cancel-start-over").click();
  await expect(page.getByTestId("start-over-confirmation")).toHaveCount(0);

  await page.getByTestId("back-title").first().click();
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");

  await page.getByTestId("new-run").click();
  await expect(page.getByTestId("start-over-confirmation")).toContainText("진행 교체");
  await page.getByTestId("cancel-start-over").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");

  await page.getByTestId("new-run").click();
  await page.getByTestId("confirm-start-over").click();
  await expect(page.getByTestId("first-run-brief")).toContainText("첫 달 목표");
  await expect(page.getByTestId("target-ending-panel")).toHaveCount(0);
});

test("reselects the active collection target without replacing progress", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();
  await finishActivity(page);
  await page.getByTestId("back-room").last().click();
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");

  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();

  await expect(page.getByTestId("start-over-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");
  expect(pageErrors).toEqual([]);
});

test("shows monthly coaching after a completed month", async ({ page }) => {
  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();

  await finishActivity(page);
  for (let remainingAction = 0; remainingAction < 3; remainingAction += 1) {
    await page.getByTestId("next-action").click();
    await finishActivity(page);
  }

  await expect(page.getByTestId("monthly-coaching")).toContainText("월말 코칭");
  await expect(page.getByTestId("monthly-coaching")).toContainText("별빛 연구자 보강");
  await expect(page.getByTestId("monthly-coaching")).toContainText("별빛학");
  await page.getByTestId("advance-month").click();
  await expect(page.getByTestId("monthly-coaching")).toContainText("다음 달 코칭");
  await expect(page.getByTestId("monthly-coaching")).toContainText("별빛 연구자 보강");
});

test("disables schedule choices that would overdraw resources", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await page.evaluate(() => {
    const key = "starlit-apprentice:run:v1";
    const run = JSON.parse(localStorage.getItem(key) ?? "{}");
    run.gold = 0;
    localStorage.setItem(key, JSON.stringify(run));
  });
  await page.reload();
  await page.getByTestId("continue-run").click();

  await page.getByTestId("open-schedule").click();
  await expect(page.getByTestId("schedule-resource-forecast")).toContainText("골드 0");
  await expect(page.getByTestId("action-star-lore")).toBeDisabled();
  await expect(page.getByTestId("action-star-lore")).toContainText("골드 부족");

  await page.getByRole("button", { name: "일", exact: true }).click();
  await page.getByTestId("action-library-help").click();
  await page.getByTestId("action-library-help").click();
  await expect(page.getByTestId("schedule-resource-forecast")).toContainText("골드 70");

  await page.getByRole("button", { name: "수업", exact: true }).click();
  await expect(page.getByTestId("action-star-lore")).toBeEnabled();
});

test("supports browser back through stable app screens", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await page.getByTestId("open-schedule").click();
  await expect(page.getByTestId("schedule-guidance")).toContainText("선택 0/4");
  await page.goBack();
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await page.getByTestId("open-collection").click();
  await expect(page.getByTestId("collection-grid")).toBeVisible();
  await expect(page.getByTestId("collection-summary")).toContainText("도감 진행");
  await expect(page.getByTestId("collection-next-target")).toContainText("다음 목표");
  await expect(page.getByTestId("collection-groups")).toContainText("학문/기록");
  await page.goBack();
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();
  await finishActivity(page);
  await page.goBack();
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();
  await expect(page.getByTestId("current-month-plan")).toContainText("이번 달 계획");
  await expect(page.getByTestId("current-month-plan")).toContainText("1주차 · 완료");
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");
  await expect(page.getByTestId("open-schedule")).toContainText("다음 일정");
  await page.getByTestId("open-schedule").click();
  await expect(page.getByTestId("activity-screen")).toContainText("문장학");
});

test("coerces stale browser history states to the current run phase", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await dispatchHistoryState(page, "ending");
  await expect(page.getByTestId("ending-card")).toHaveCount(0);
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await dispatchHistoryState(page, "activity");
  await expect(page.getByTestId("activity-screen")).toHaveCount(0);
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await dispatchHistoryState(page, "result");
  await expect(page.getByTestId("result-deltas")).toHaveCount(0);
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();

  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();
  await page.getByTestId("finish-activity").click();
  await page.getByTestId("back-room").last().click();
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");

  await dispatchHistoryState(page, "schedule");
  await expect(page.getByTestId("selected-slots")).toHaveCount(0);
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");
});

test("plays through 12 months and reaches a specialized star ending", async ({ page }) => {
  test.setTimeout(90_000);

  await page.getByTestId("new-run").click();
  await expect(page.getByTestId("future-panel")).toContainText("미래 후보");
  await expect(page.getByTestId("apprentice-profile")).toContainText("키");
  await expect(page.getByTestId("apprentice-stage")).toBeVisible();
  await expect(page.locator(".stat-list").first()).toContainText("연구자/서기관");

  for (let month = 1; month <= 12; month += 1) {
    await page.getByTestId("open-schedule").click();
    await page.getByTestId("action-star-lore").click();
    await page.getByRole("button", { name: "일", exact: true }).click();
    await page.getByTestId("action-tea-service").click();
    await page.getByRole("button", { name: "휴식" }).click();
    await page.getByTestId("action-home-rest").click();
    await page.getByTestId("action-sleep-in").click();
    await page.getByTestId("confirm-schedule").click();
    await finishActivity(page);
    await page.getByTestId("next-action").click();
    await finishActivity(page);
    await page.getByTestId("next-action").click();
    await finishActivity(page);
    await page.getByTestId("next-action").click();
    await finishActivity(page);
    if ([3, 6, 9, 12].includes(month)) {
      await expect(page.getByTestId("event-panel")).toContainText("이벤트");
      await expect(page.getByTestId("event-effects")).toContainText("평판");
    }
    await page.getByTestId("advance-month").click();
  }

  await expect(page.getByTestId("ending-card")).toContainText("천문대장");
  await expect(page.getByTestId("ending-evidence")).toContainText("도달 근거");
  await expect(page.getByTestId("ending-evidence")).toContainText("별빛학");
  await expect(page.locator(".ending-screen .stat-list")).toContainText("연구자/서기관");
  await page.reload();
  await expect(page.getByTestId("continue-run")).toContainText("엔딩 보기");
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("ending-card")).toContainText("천문대장");
  await expect(page.getByTestId("ending-evidence")).toContainText("별빛학");
  await page.getByTestId("open-collection").click();
  await expect(page.getByTestId("collection-summary")).toContainText("1/30");
  await expect(page.getByTestId("collection-next-target")).toContainText("다음 목표");
  await expect(page.getByTestId("collection-groups")).toContainText("학문/기록 1/5");
  await expect(page.getByTestId("collection-grid")).toContainText("천문대장");
});

test("persists an in-progress run across reloads", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-letters").click();
  await page.getByTestId("action-music").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByTestId("confirm-schedule").click();
  await page.reload();

  await page.getByTestId("continue-run").click();
  await finishActivity(page);
});

test("shows an activity animation before revealing the result", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-music").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByTestId("confirm-schedule").click();

  await expect(page.getByTestId("activity-screen")).toContainText("별빛학");
  await expect(page.getByTestId("week-day-strip")).toContainText("일");
  await expect(page.getByTestId("activity-delta-bars")).toContainText("지성");
  await expect(page.getByTestId("activity-delta-bars").locator(".delta-bar.animated").first()).toHaveAttribute(
    "data-from-delta",
    "0"
  );
  await expect(page.getByTestId("daily-outcome")).toBeVisible();
  await page.waitForTimeout(3_200);
  await expect(page.getByTestId("daily-outcome")).toBeVisible();
  await expect(
    page.getByTestId("activity-delta-bars").locator(".delta-bar.animated:not([data-from-delta='0'])").first()
  ).toBeVisible();
  await page.getByTestId("finish-activity").click();
  await expect(page.getByTestId("result-delta-bars")).toBeVisible();
  await page.getByTestId("back-room").last().click();
  await expect(page.getByTestId("apprentice-profile")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("finishes activity from elapsed time after WebView resume", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await installControllableClock(page);
  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();

  await expect(page.getByTestId("activity-screen")).toContainText("별빛학");
  await expect(page.getByTestId("daily-outcome")).toBeVisible();
  await advanceClockAndResume(page, 21_000);
  await expect(page.getByTestId("result-deltas")).toBeVisible();
  await expect(page.getByTestId("result-future-panel")).toBeVisible();
  await page.getByTestId("back-room").last().click();
  await expect(page.getByTestId("current-month-plan")).toContainText("1주차 · 완료");
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");
  expect(pageErrors).toEqual([]);
});

test("finishes activity from elapsed time after WebView visibility resume", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await installControllableClock(page);
  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();

  await expect(page.getByTestId("activity-screen")).toContainText("별빛학");
  await expect(page.getByTestId("daily-outcome")).toBeVisible();
  await advanceClockAndVisibilityResume(page, 21_000);
  await expect(page.getByTestId("result-deltas")).toBeVisible();
  await expect(page.getByTestId("result-future-panel")).toBeVisible();
  await page.getByTestId("back-room").last().click();
  await expect(page.getByTestId("current-month-plan")).toContainText("1주차 · 완료");
  await expect(page.getByTestId("current-month-plan")).toContainText("2주차 · 다음");
  expect(pageErrors).toEqual([]);
});

test("keeps activity progress on monotonic time when wall clock jumps", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await installControllableClock(page);
  await page.getByTestId("new-run").click();
  await page.getByTestId("open-schedule").click();
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();

  await expect(page.getByTestId("activity-screen")).toContainText("별빛학");
  await advanceWallClockAndResume(page, 120_000);
  await expect(page.getByTestId("activity-screen")).toContainText("별빛학");
  await expect(page.getByTestId("result-deltas")).toHaveCount(0);
  await advanceClockAndResume(page, 21_000);
  await expect(page.getByTestId("result-deltas")).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("opens a shared ending query without layout failure", async ({ page }) => {
  await page.goto("/?ending=scholar");
  await expect(page.getByTestId("ending-card")).toContainText("별빛 연구자");
  await expect(page.getByTestId("ending-evidence")).toContainText("공유된 엔딩");
  await expect(page.locator(".ending-screen .stat-list")).toHaveCount(0);
  await page.getByTestId("share-ending").click();
  await expect(page.getByTestId("ending-card")).toBeVisible();
  await page.getByTestId("new-run").click();
  await expect(page).not.toHaveURL(/ending=scholar/);
  await page.reload();
  await expect(page.getByTestId("ending-card")).toHaveCount(0);
  await expect(page.getByTestId("continue-run")).toBeEnabled();
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("first-run-brief")).toContainText("첫 달 목표");
});

test("ignores duplicate native share commands while a share sheet is in flight", async ({ page }) => {
  await page.goto("/?ending=scholar");
  await page.evaluate(() => {
    let resolveShare: (() => void) | undefined;
    (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount = 0;
    (window as unknown as { __releaseStarlitShare: () => void }).__releaseStarlitShare = () => resolveShare?.();
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const state = window as unknown as { __starlitSharedData: ShareData; __starlitShareCallCount: number };
        state.__starlitSharedData = data;
        state.__starlitShareCallCount += 1;
        await new Promise<void>((resolve) => {
          resolveShare = resolve;
        });
      }
    });
  });

  await dispatchDuplicateCommand(page, "share-ending");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount)).toBe(1);
  await page.evaluate(() => (window as unknown as { __releaseStarlitShare: () => void }).__releaseStarlitShare());
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount)).toBe(1);
  await expect(page.getByTestId("fallback-banner")).toHaveCount(0);
});

test("suppresses stale native share completion after leaving the ending screen", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?ending=scholar");
  await page.evaluate(() => {
    let rejectShare: ((error: DOMException) => void) | undefined;
    (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount = 0;
    (window as unknown as { __starlitShareSettled: boolean }).__starlitShareSettled = false;
    (window as unknown as { __rejectStarlitShare: () => void }).__rejectStarlitShare = () =>
      rejectShare?.(new DOMException("Native share unavailable after navigation.", "NotAllowedError"));
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        const state = window as unknown as {
          __starlitSharedData: ShareData;
          __starlitShareCallCount: number;
          __starlitShareSettled: boolean;
        };
        state.__starlitSharedData = data;
        state.__starlitShareCallCount += 1;
        try {
          await new Promise<void>((_, reject) => {
            rejectShare = reject;
          });
        } finally {
          state.__starlitShareSettled = true;
        }
      }
    });
  });

  await page.getByTestId("share-ending").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount)).toBe(1);
  await page.getByTestId("back-title").click();
  await expect(page.getByTestId("ending-card")).toHaveCount(0);
  await expect(page.getByTestId("fallback-banner")).toHaveCount(0);

  await page.evaluate(() => (window as unknown as { __rejectStarlitShare: () => void }).__rejectStarlitShare());
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starlitShareSettled: boolean }).__starlitShareSettled)).toBe(true);
  await expect(page.getByTestId("ending-card")).toHaveCount(0);
  await expect(page.getByTestId("fallback-banner")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("allows a new native share after leaving an unresolved share attempt", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?ending=scholar");
  await page.evaluate(() => {
    const resolvers: Array<() => void> = [];
    const state = window as unknown as {
      __starlitShareCallCount: number;
      __starlitSharePayloads: ShareData[];
      __releaseAllStarlitShares: () => void;
    };
    state.__starlitShareCallCount = 0;
    state.__starlitSharePayloads = [];
    state.__releaseAllStarlitShares = () => {
      while (resolvers.length > 0) {
        resolvers.shift()?.();
      }
    };
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        state.__starlitSharePayloads.push(data);
        state.__starlitShareCallCount += 1;
        await new Promise<void>((resolve) => {
          resolvers.push(resolve);
        });
      }
    });
  });

  await page.getByTestId("share-ending").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount)).toBe(1);
  await page.getByTestId("back-title").click();
  await expect(page.getByTestId("ending-card")).toHaveCount(0);

  await page.evaluate(() => {
    window.history.pushState({ starlitScreen: "ending" }, "", "/?ending=merchant");
    window.dispatchEvent(new PopStateEvent("popstate", { state: { starlitScreen: "ending" } }));
  });
  await expect(page.getByTestId("ending-card")).toContainText("도시 상인");

  await page.getByTestId("share-ending").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __starlitShareCallCount: number }).__starlitShareCallCount)).toBe(2);
  const payloads = await page.evaluate(() => (window as unknown as { __starlitSharePayloads: ShareData[] }).__starlitSharePayloads);
  expect(payloads.at(-1)?.text).toContain("도시 상인");
  await page.evaluate(() => (window as unknown as { __releaseAllStarlitShares: () => void }).__releaseAllStarlitShares());
  await expect(page.getByTestId("fallback-banner")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("canonicalizes noncanonical shared ending queries", async ({ page }) => {
  await page.goto("/?ending=scholar&from=preview&ending=merchant#card");
  await expect(page.getByTestId("ending-card")).toContainText("별빛 연구자");
  await expect(page.getByTestId("ending-evidence")).toContainText("공유된 엔딩");
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe("?ending=scholar");
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("");
  await expect(page).not.toHaveURL(/from=preview|ending=merchant|#card/);

  await page.getByTestId("back-title").first().click();
  await expect(page).not.toHaveURL(/ending=/);
});

test("cleans invalid shared ending query without touching local progress", async ({ page }) => {
  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");

  await page.goto("/?ending=unknown-ending");
  await expect(page).not.toHaveURL(/ending=unknown-ending/);
  await expect(page.getByTestId("ending-card")).toHaveCount(0);
  await expect(page.getByTestId("fallback-banner")).toHaveCount(0);
  await expect(page.getByTestId("continue-run")).toBeEnabled();
  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("0/30");
  await expect(page.getByTestId("collection-summary")).toContainText("0/30");
  await page.getByTestId("back-title").first().click();
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");
});

test("does not let a shared ending query unlock the collection", async ({ page }) => {
  await page.goto("/?ending=scholar");
  await expect(page.getByTestId("ending-card")).toContainText("별빛 연구자");
  await page.getByTestId("open-collection").click();

  await expect(page.locator(".topbar")).toContainText("0/30");
  await expect(page.getByTestId("collection-summary")).toContainText("0/30");
  await expect(page.getByTestId("collection-grid")).not.toContainText("별빛 연구자");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("starlit-apprentice:collection:v1")))
    .toBeNull();
});

test("keeps local progress available after viewing a shared ending", async ({ page }) => {
  await page.getByTestId("open-collection").click();
  await page.locator("[data-target-ending-code='scholar']").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");

  await page.goto("/?ending=merchant");
  await expect(page.getByTestId("ending-card")).toContainText("도시 상인");
  await expect(page.getByTestId("ending-evidence")).toContainText("공유된 엔딩");
  await page.getByTestId("new-run").click();
  await expect(page.getByTestId("start-over-confirmation")).toContainText("진행 교체");
  await page.getByTestId("cancel-start-over").click();
  await expect(page.getByTestId("start-over-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("ending-card")).toContainText("도시 상인");

  await page.getByTestId("back-title").first().click();
  await expect(page).not.toHaveURL(/ending=merchant/);
  await expect(page.getByTestId("continue-run")).toContainText("이어하기");
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛 연구자");
});

test("clears shared ending state after browser history leaves the shared card", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await loadSerializedRun(page, serializeRun(createCompletedEndingRun()));
  await page.goto("/?ending=scholar");
  await expect(page.getByTestId("ending-card")).toContainText("별빛 연구자");
  await expect(page.getByTestId("ending-evidence")).toContainText("공유된 엔딩");

  await dispatchHistoryState(page, "title");
  await expect(page.getByTestId("ending-card")).toHaveCount(0);
  await expect(page.getByTestId("continue-run")).toContainText("엔딩 보기");
  await page.getByTestId("continue-run").click();

  await expect(page.getByTestId("ending-card")).toContainText("천문대장");
  await expect(page.getByTestId("ending-evidence")).toContainText("도달 근거");
  await expect(page.getByTestId("ending-evidence")).not.toContainText("공유된 엔딩");
  await expect(page.locator(".ending-screen .stat-list")).toBeVisible();
  await expect(page).not.toHaveURL(/ending=scholar/);
  expect(pageErrors).toEqual([]);
});

test("ignores stale collection entries from older saves", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("starlit-apprentice:collection:v1", JSON.stringify(["scholar", "unknown-ending", "scholar"]));
  });
  await page.reload();

  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("1/30");
  await expect(page.getByTestId("collection-summary")).toContainText("1/30");
  await expect(page.getByTestId("collection-next-target")).toContainText("다음 목표");
  await expect(page.getByTestId("collection-groups")).toContainText("학문/기록 1/5");
  await expect(page.getByTestId("collection-grid")).toContainText("별빛 연구자");
  await expect(page.getByTestId("collection-grid")).not.toContainText("unknown-ending");
});

test("does not let run-local unlocked endings inflate the collection", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "starlit-apprentice:run:v1",
      JSON.stringify({
        version: 1,
        month: 1,
        slotIndex: 0,
        gold: 200,
        stats: {},
        stress: 10,
        energy: 80,
        flags: {},
        history: [],
        unlockedEndings: ["scholar", "quiet-life"],
        rngSeed: 1,
        currentSchedule: []
      })
    );
  });
  await page.reload();

  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("0/30");
  await expect(page.getByTestId("collection-summary")).toContainText("0/30");
  await expect(page.getByTestId("collection-grid")).not.toContainText("별빛 연구자");
});

test("does not resume unsupported saved month progress", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "starlit-apprentice:run:v1",
      JSON.stringify({
        version: 1,
        month: 12,
        slotIndex: 0,
        gold: 200,
        stats: {},
        stress: 10,
        energy: 80,
        flags: {},
        history: [],
        unlockedEndings: [],
        rngSeed: 1,
        currentSchedule: []
      })
    );
  });
  await page.reload();

  await expect(page.getByTestId("continue-run")).toContainText("이어하기");
  await page.getByTestId("continue-run").click();
  await expect(page.locator(".topbar")).toContainText("Month 1 / 12");
  await expect(page.getByTestId("first-run-brief")).toContainText("첫 달 목표");
});

test("does not resume unsupported saved scheduled month progress", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "starlit-apprentice:run:v1",
      JSON.stringify({
        version: 1,
        month: 12,
        slotIndex: 2,
        gold: 200,
        stats: {},
        stress: 10,
        energy: 80,
        flags: {},
        history: [
          { month: 12, slot: 1, actionId: "letters" },
          { month: 12, slot: 2, actionId: "music" }
        ],
        unlockedEndings: [],
        rngSeed: 1,
        currentSchedule: ["letters", "music", "home-rest", "park"]
      })
    );
  });
  await page.reload();

  await expect(page.getByTestId("continue-run")).toContainText("이어하기");
  await page.getByTestId("continue-run").click();
  await expect(page.locator(".topbar")).toContainText("Month 1 / 12");
  await expect(page.getByTestId("first-run-brief")).toContainText("첫 달 목표");
  await expect(page.getByTestId("activity-screen")).toHaveCount(0);
});

test("does not let inflated saved progress flags satisfy ending requirements", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "starlit-apprentice:run:v1",
      JSON.stringify({
        version: 1,
        month: 1,
        slotIndex: 0,
        gold: 200,
        stats: { intellect: 90 },
        stress: 10,
        energy: 80,
        flags: {
          "lesson:star-lore": 9,
          "category:lesson": 9
        },
        history: [],
        unlockedEndings: [],
        rngSeed: 1,
        currentSchedule: [],
        targetEndingCode: "scholar"
      })
    );
  });
  await page.reload();

  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("target-ending-panel")).toContainText("별빛학 0/3");
  await expect(page.getByTestId("target-ending-panel")).not.toContainText("별빛학 3/3");
});

test("keeps a valid collection when run storage is corrupt", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem("starlit-apprentice:run:v1", "{broken-json");
    localStorage.setItem("starlit-apprentice:collection:v1", JSON.stringify(["scholar", "unknown-ending", "scholar"]));
  });
  await page.reload();

  await expect(page.getByTestId("fallback-banner")).toContainText("저장 데이터를");
  await expect(page.getByTestId("continue-run")).toBeDisabled();
  await expect(page.getByTestId("reset-local-data")).toBeEnabled();
  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("1/30");
  await expect(page.getByTestId("collection-summary")).toContainText("1/30");
  await expect(page.getByTestId("collection-grid")).toContainText("별빛 연구자");
  await expect(page.getByTestId("collection-grid")).not.toContainText("unknown-ending");
});

test("keeps a valid run when collection storage is corrupt", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await page.evaluate(() => {
    localStorage.setItem("starlit-apprentice:collection:v1", "{broken-json");
  });
  await page.reload();

  await expect(page.getByTestId("fallback-banner")).toContainText("저장 데이터를");
  await expect(page.getByTestId("continue-run")).toBeEnabled();
  await expect(page.getByTestId("reset-local-data")).toBeEnabled();
  await page.getByTestId("continue-run").click();
  await expect(page.getByTestId("first-run-brief")).toContainText("첫 달 목표");
});

test("loads versioned collection storage and rejects unsupported collection schemas", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "starlit-apprentice:collection:v1",
      JSON.stringify({ version: 1, endings: ["scholar", "unknown-ending", "scholar"] })
    );
  });
  await page.reload();

  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("1/30");
  await expect(page.getByTestId("collection-summary")).toContainText("1/30");
  await expect(page.getByTestId("collection-grid")).toContainText("별빛 연구자");
  await expect(page.getByTestId("collection-grid")).not.toContainText("unknown-ending");

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      "starlit-apprentice:run:v1",
      JSON.stringify({
        version: 1,
        month: 1,
        slotIndex: 0,
        gold: 200,
        stats: { intellect: 10 },
        stress: 10,
        energy: 80,
        flags: {},
        history: [],
        unlockedEndings: [],
        rngSeed: 1,
        currentSchedule: []
      })
    );
    localStorage.setItem("starlit-apprentice:collection:v1", JSON.stringify({ version: 2, endings: ["scholar"] }));
  });
  await page.reload();

  await expect(page.getByTestId("fallback-banner")).toContainText("저장 데이터를");
  await expect(page.getByTestId("continue-run")).toBeEnabled();
  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("0/30");
  await expect(page.getByTestId("collection-summary")).toContainText("0/30");
  await expect(page.getByTestId("collection-grid")).not.toContainText("별빛 연구자");
});

test("clears local run and collection data after confirmation", async ({ page }) => {
  await page.getByTestId("new-run").click();
  await page.evaluate(() => {
    localStorage.setItem("starlit-apprentice:collection:v1", JSON.stringify(["scholar"]));
  });
  await page.reload();

  await expect(page.getByTestId("continue-run")).toBeEnabled();
  await expect(page.getByTestId("reset-local-data")).toBeEnabled();
  await page.getByTestId("reset-local-data").click();
  await expect(page.getByTestId("reset-confirmation")).toContainText("초기화 확인");
  await page.getByTestId("cancel-reset-local-data").click();
  await expect(page.getByTestId("reset-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("continue-run")).toBeEnabled();

  await page.getByTestId("reset-local-data").click();
  await page.getByTestId("confirm-reset-local-data").click();
  await expect(page.getByTestId("fallback-banner")).toContainText("삭제했습니다");
  await expect(page.getByTestId("continue-run")).toBeDisabled();
  await expect(page.getByTestId("reset-local-data")).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        run: localStorage.getItem("starlit-apprentice:run:v1"),
        collection: localStorage.getItem("starlit-apprentice:collection:v1")
      }))
    )
    .toEqual({ run: null, collection: null });

  await page.getByTestId("open-collection").click();
  await expect(page.locator(".topbar")).toContainText("0/30");
});
