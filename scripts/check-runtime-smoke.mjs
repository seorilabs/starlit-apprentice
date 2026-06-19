import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import {
  COLLECTION_STORAGE_KEY,
  MAX_MONTH,
  RUN_STORAGE_KEY,
  advanceMonth,
  createNewRun,
  isBlockedPublicUrlHost,
  resolveNextSlot,
  selectSchedule,
  serializeCollection,
  serializeRun
} from "../packages/product-core/dist/index.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const outputDir = resolve(repoRoot, "qa/runtime-smoke");
const port = Number(process.env.STARLIT_RUNTIME_SMOKE_PORT ?? (await findAvailablePort()));
const baseUrl = `http://127.0.0.1:${port}`;
const emptyCollection = serializeCollection([]);
const savedEndingRun = serializeRun(createSpecializedEndingRun());
const endingReadyRun = serializeRun(createEndingReadyRun());
const finalPendingRun = serializeRun(createFinalPendingRun());
const monthReadyRun = serializeRun(createMonthReadyRun());
const prematureEndingRun = rawRun({
  ...createNewRun(3),
  endingCode: "scholar",
  unlockedEndings: ["scholar"]
});
const staleRunUnlocks = rawRun({
  ...createNewRun(11),
  unlockedEndings: ["scholar", "quiet-life"]
});
const unsupportedSavedMonthRun = rawRun({
  ...createNewRun(12),
  month: MAX_MONTH,
  history: [],
  currentSchedule: []
});
const unsupportedSavedScheduledMonthRun = rawRun({
  ...createNewRun(12),
  month: MAX_MONTH,
  slotIndex: 2,
  currentSchedule: ["letters", "music", "home-rest", "park"],
  history: [
    { month: MAX_MONTH, slot: 1, actionId: "letters" },
    { month: MAX_MONTH, slot: 2, actionId: "music" }
  ]
});
const inflatedProgressFlagsRun = rawRun({
  ...createNewRun(13),
  stats: { ...createNewRun(13).stats, intellect: 90 },
  flags: { "lesson:star-lore": 9, "category:lesson": 9 },
  targetEndingCode: "scholar"
});
const failures = [];

mkdirSync(outputDir, { recursive: true });

const server = spawn(
  "pnpm",
  [
    "--dir",
    "apps/starlit-apprentice",
    "exec",
    "vite",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort"
  ],
  {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  }
);
server.stdout.on("data", (chunk) => process.stdout.write(`[runtime-smoke-server] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[runtime-smoke-server] ${chunk}`));

try {
  await waitForServer(baseUrl);
  const browser = await chromium.launch();
  try {
    await runSmoke(browser, {
      label: "mobile-390",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runStorageUnavailableSmoke(browser, {
      label: "mobile-390",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runStorageWriteFailureSmoke(browser, {
      label: "mobile-390",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runStorageRemoveFailureSmoke(browser, {
      label: "mobile-390",
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runSmoke(browser, {
      label: "mobile-360",
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runStorageUnavailableSmoke(browser, {
      label: "mobile-360",
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runStorageWriteFailureSmoke(browser, {
      label: "mobile-360",
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runStorageRemoveFailureSmoke(browser, {
      label: "mobile-360",
      viewport: { width: 360, height: 740 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true
    });
    await runSmoke(browser, {
      label: "desktop-1280",
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    });
    await runStorageUnavailableSmoke(browser, {
      label: "desktop-1280",
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    });
    await runStorageWriteFailureSmoke(browser, {
      label: "desktop-1280",
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    });
    await runStorageRemoveFailureSmoke(browser, {
      label: "desktop-1280",
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false
    });
  } finally {
    await browser.close();
  }
} finally {
  server.kill("SIGTERM");
}

printReport();

if (failures.length > 0) {
  process.exit(1);
}

async function runSmoke(browser, options) {
  const runtimeErrors = [];
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
  });
  const page = await context.newPage();
  const analyticsEvents = [];
  await page.exposeFunction("__starlitCaptureAnalytics", (detail) => {
    analyticsEvents.push(detail);
  });
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__starlitClipboardText = text;
        }
      }
    });
    window.addEventListener("starlit:analytics", (event) => {
      window.__starlitCaptureAnalytics?.(event.detail);
    });
  });

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const text = message.text();
      if (!isIgnoredConsoleMessage(text)) {
        runtimeErrors.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (!isIgnoredNetworkFailure(request.url(), failure?.errorText ?? "")) {
      runtimeErrors.push(`requestfailed: ${request.url()} ${failure?.errorText ?? ""}`.trim());
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='new-run']", `${options.label} title new-run`);
    await expectVisible(page, "[data-testid='open-collection']", `${options.label} title collection`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} clean title continue`);
    await expectNoHorizontalOverflow(page, `${options.label} title`);
    await expectCanvasNonBlank(page, `${options.label} title canvas`);
    await expectDynamicViewportResize(page, options.viewport, `${options.label} dynamic viewport resize guard`);
    await expectCanvasVisibilityRenderLoopPause(page, `${options.label} canvas visibilitychange render-loop pause`);
    await captureViewport(page, `${options.label}-title.png`, `${options.label} title screenshot`, "[data-testid='new-run']");

    await page.getByTestId("new-run").click();
    await page.evaluate((key) => {
      const run = JSON.parse(localStorage.getItem(key) ?? "{}");
      run.gold = 0;
      localStorage.setItem(key, JSON.stringify(run));
    }, RUN_STORAGE_KEY);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("continue-run").click();
    await page.getByTestId("open-schedule").click();
    await expectText(page, "[data-testid='schedule-resource-forecast']", "골드 0", `${options.label} low-resource schedule forecast`);
    await expectText(page, "[data-testid='action-star-lore']", "골드 부족", `${options.label} low-resource blocked action copy`);
    await expectDisabled(page, "[data-testid='action-star-lore']", `${options.label} low-resource blocked action`);
    await expectNoHorizontalOverflow(page, `${options.label} low-resource schedule`);
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await page.getByTestId("open-collection").click();
    await expectVisible(page, "[data-testid='collection-summary']", `${options.label} initial collection summary`);
    await expectText(page, "[data-testid='collection-summary']", "도감 진행", `${options.label} initial collection progress`);
    await expectText(page, "[data-testid='collection-next-target']", "다음 목표", `${options.label} initial collection next target`);
    await expectText(page, "[data-testid='collection-groups']", "학문/기록", `${options.label} initial collection groups`);
    await expectReadableTextPanel(page, "[data-testid='collection-summary']", `${options.label} collection summary readability`);
    await expectNoHorizontalOverflow(page, `${options.label} collection`);
    await captureViewport(
      page,
      `${options.label}-collection.png`,
      `${options.label} collection screenshot`,
      "[data-testid='collection-summary']"
    );
    await corruptDatasetValue(page, "[data-target-ending-code='scholar']", "targetEndingCode", "unknown-ending", "깨진 목표");
    await page.locator("[data-target-ending-code='unknown-ending']").click();
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} unknown target ending guard banner`);
    await expectText(page, "[data-testid='fallback-banner']", "알 수 없는 목표 엔딩", `${options.label} unknown target ending guard copy`);
    await expectNoVisible(page, "[data-testid='target-ending-panel']", `${options.label} unknown target ending keeps run inactive`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("open-collection").click();
    await page.locator("[data-target-ending-code='scholar']").click();
    await expectVisible(page, "[data-testid='apprentice-stage']", `${options.label} room apprentice stage`);
    await expectText(page, "[data-testid='first-run-brief']", "4주 일정", `${options.label} first-run brief`);
    await expectText(page, "[data-testid='target-ending-panel']", "별빛 연구자", `${options.label} target ending panel`);
    await expectText(page, "[data-testid='target-ending-panel']", "지성", `${options.label} target requirement`);
    await expectVisible(page, "[data-testid='future-panel']", `${options.label} room future panel`);
    await expectNoVisible(page, "text=광고 SDK", `${options.label} room ad placeholder copy`);
    await expectNoVisible(page, ".ad-slot", `${options.label} room ad placeholder slot`);
    await expectNoHorizontalOverflow(page, `${options.label} room`);
    await expectCanvasNonBlank(page, `${options.label} room canvas`);
    await captureViewport(page, `${options.label}-room.png`, `${options.label} room screenshot`, "[data-testid='apprentice-profile']");
    await page.getByTestId("open-collection").click();
    await page.locator("[data-target-ending-code='scholar']").click();
    await expectNoVisible(page, "[data-testid='start-over-confirmation']", `${options.label} active target reselection guard`);
    await expectText(page, "[data-testid='target-ending-panel']", "별빛 연구자", `${options.label} active target reselection keeps target`);
    await page.getByTestId("new-run").click();
    await expectVisible(page, "[data-testid='start-over-confirmation']", `${options.label} start-over confirmation`);
    await expectText(page, "[data-testid='start-over-confirmation']", "진행 교체", `${options.label} start-over confirmation heading`);
    await expectNoHorizontalOverflow(page, `${options.label} start-over confirmation`);
    await page.getByTestId("cancel-start-over").click();
    await expectText(page, "[data-testid='target-ending-panel']", "별빛 연구자", `${options.label} start-over cancel keeps target`);
    await dispatchHistoryState(page, "ending");
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} stale ending history state`);
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} stale ending history returns room`);
    await dispatchHistoryState(page, "activity");
    await expectNoVisible(page, "[data-testid='activity-screen']", `${options.label} stale activity history state`);
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} stale activity history returns room`);
    await dispatchHistoryState(page, "result");
    await expectNoVisible(page, "[data-testid='result-deltas']", `${options.label} stale result history state`);
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} stale result history returns room`);

    await page.getByTestId("open-schedule").click();
    await expectVisible(page, "[data-testid='selected-slots']", `${options.label} schedule slots`);
    await expectText(page, "[data-testid='schedule-guidance']", "선택 0/4", `${options.label} empty schedule guidance`);
    await expectText(page, "[data-testid='schedule-target-guidance']", "별빛 연구자", `${options.label} schedule target guidance`);
    await expectText(page, "[data-testid='target-recommendations']", "별빛학", `${options.label} target action recommendations`);
    await expectText(page, "[data-testid='action-star-lore']", "목표 추천", `${options.label} recommended target action`);
    await expectNoHorizontalOverflow(page, `${options.label} schedule`);
    await dispatchDuplicateCommand(page, "action-star-lore");
    await expectText(page, "[data-testid='schedule-guidance']", "선택 1/4", `${options.label} schedule action stale click guard`);
    await expectText(page, "[data-testid='selected-slot-1']", "별빛", `${options.label} stale action click selects once`);
    await page.getByTestId("action-star-lore").click();
    await expectText(page, "[data-testid='schedule-guidance']", "선택 2/4", `${options.label} intentional repeated action selection`);
    await expectText(page, "[data-testid='selected-slot-2']", "별빛", `${options.label} intentional repeated action slot`);
    await page.getByTestId("clear-schedule").click();
    await expectText(page, "[data-testid='schedule-guidance']", "선택 0/4", `${options.label} schedule reset after stale action guard`);
    await captureViewport(
      page,
      `${options.label}-schedule.png`,
      `${options.label} schedule screenshot`,
      "[data-testid='selected-slots']"
    );
    await corruptDatasetValue(page, "[data-category='lesson']", "category", "unknown-category", "깨진 분류");
    await page.locator("[data-category='unknown-category']").click();
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} unknown category guard banner`);
    await expectText(page, "[data-testid='fallback-banner']", "알 수 없는 일정 종류", `${options.label} unknown category guard copy`);
    await expectText(page, "[data-testid='schedule-guidance']", "선택 0/4", `${options.label} unknown category keeps schedule empty`);
    await corruptDatasetValue(page, "[data-testid='action-star-lore']", "actionId", "unknown-action", "깨진 일정");
    await page.locator("[data-action-id='unknown-action']").click();
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} unknown action guard banner`);
    await expectText(page, "[data-testid='fallback-banner']", "알 수 없는 일정입니다.", `${options.label} unknown action guard copy`);
    await expectText(page, "[data-testid='schedule-guidance']", "선택 0/4", `${options.label} unknown action keeps schedule empty`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("continue-run").click();
    await page.getByTestId("open-schedule").click();
    await expectVisible(page, "[data-testid='selected-slots']", `${options.label} schedule slots after unknown dataset guard`);
    await page.goBack();
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} browser back to room`);
    await page.getByTestId("open-schedule").click();
    await expectVisible(page, "[data-testid='selected-slots']", `${options.label} schedule slots after browser back`);
    await page.getByTestId("action-star-lore").click();
    await page.getByTestId("action-letters").click();
    await expectText(page, "[data-testid='selected-slot-2']", "문장", `${options.label} removable selected slot`);
    await page.getByTestId("selected-slot-2").click();
    await expectText(page, "[data-testid='schedule-guidance']", "선택 1/4", `${options.label} selected slot removal guidance`);
    await page.getByTestId("action-letters").click();
    await page.getByRole("button", { name: "휴식" }).click();
    await page.getByTestId("action-home-rest").click();
    await page.getByRole("button", { name: "외출" }).click();
    await page.getByTestId("action-park").click();
    await expectText(page, "[data-testid='schedule-guidance']", "일정 실행 가능", `${options.label} complete schedule guidance`);
    await installControllableClock(page);
    await dispatchDuplicateCommand(page, "confirm-schedule");

    await expectVisible(page, "[data-testid='activity-screen']", `${options.label} activity screen`);
    await expectVisible(page, "[data-testid='daily-outcome']", `${options.label} daily outcome`);
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} activity reload resume continue label`);
    await installControllableClock(page);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='activity-screen']", `${options.label} activity reload resume guard`);
    await expectText(page, "[data-testid='activity-screen']", "별빛학", `${options.label} activity reload resumes same action`);
    await expectNoVisible(page, "[data-testid='result-deltas']", `${options.label} activity reload does not replay resolved result`);
    await expectNoHorizontalOverflow(page, `${options.label} activity`);
    await expectCanvasNonBlank(page, `${options.label} activity canvas`);
    await advanceWallClockAndResume(page, 120_000);
    await expectVisible(page, "[data-testid='activity-screen']", `${options.label} activity monotonic wall-clock jump guard`);
    await expectNoVisible(page, "[data-testid='result-deltas']", `${options.label} wall-clock jump should not finish activity`);
    await advanceClockAndResume(page, 21_000);
    await expectVisible(page, "[data-testid='result-deltas']", `${options.label} result deltas`);
    await expectVisible(page, "[data-testid='result-future-panel']", `${options.label} result future panel`);
    await expectNoHorizontalOverflow(page, `${options.label} result`);
    await expectCanvasNonBlank(page, `${options.label} result canvas`);
    await captureViewport(
      page,
      `${options.label}-result.png`,
      `${options.label} result screenshot`,
      "[data-testid='result-deltas']"
    );
    await page.getByTestId("back-room").first().click();
    await expectVisible(page, "[data-testid='current-month-plan']", `${options.label} current month plan`);
    await expectText(page, "[data-testid='current-month-plan']", "2주차 대기", `${options.label} current plan status`);
    await expectText(page, "[data-testid='current-month-plan']", "1주차 · 완료", `${options.label} current plan completed slot`);
    await expectText(page, "[data-testid='current-month-plan']", "2주차 · 다음", `${options.label} current plan next slot`);
    await expectText(page, "[data-testid='open-schedule']", "다음 일정", `${options.label} in-progress room CTA`);
    await expectReadableTextPanel(page, "[data-testid='current-month-plan']", `${options.label} current month plan readability`);
    await page.getByTestId("open-schedule").click();
    await expectVisible(page, "[data-testid='activity-screen']", `${options.label} resumed current schedule activity`);
    await expectText(page, "[data-testid='activity-screen']", "문장학", `${options.label} resumed next scheduled action`);
    await dispatchDuplicateCommand(page, "finish-activity");
    await expectVisible(page, "[data-testid='result-deltas']", `${options.label} resumed current schedule result`);

    await page.getByTestId("next-action").click();
    await expectVisible(page, "[data-testid='activity-screen']", `${options.label} follow-up activity visibility resume`);
    await advanceClockAndVisibilityResume(page, 21_000);
    await expectVisible(page, "[data-testid='result-deltas']", `${options.label} activity visibilitychange resume guard`);

    for (let remainingAction = 0; remainingAction < 1; remainingAction += 1) {
      await page.getByTestId("next-action").click();
      await expectVisible(page, "[data-testid='activity-screen']", `${options.label} follow-up activity ${remainingAction + 1}`);
      await page.getByTestId("finish-activity").click();
      await expectVisible(page, "[data-testid='result-deltas']", `${options.label} follow-up result ${remainingAction + 1}`);
    }
    await expectVisible(page, "[data-testid='event-panel']", `${options.label} monthly event panel`);
    await expectText(page, "[data-testid='event-effects']", "평판", `${options.label} monthly event effects`);
    await expectVisible(page, "[data-testid='monthly-coaching']", `${options.label} monthly coaching panel`);
    await expectText(page, "[data-testid='monthly-coaching']", "월말 코칭", `${options.label} monthly coaching title`);
    await expectText(page, "[data-testid='monthly-coaching']", "별빛 연구자 보강", `${options.label} monthly target coaching`);
    await expectText(page, "[data-testid='monthly-coaching']", "별빛학", `${options.label} monthly coaching action`);
    await expectNoHorizontalOverflow(page, `${options.label} monthly event result`);
    await page.getByTestId("event-panel").scrollIntoViewIfNeeded();
    await expectReadableTextPanel(page, "[data-testid='event-panel']", `${options.label} event panel readability`);
    await page.getByTestId("monthly-coaching").scrollIntoViewIfNeeded();
    await expectReadableTextPanel(page, "[data-testid='monthly-coaching']", `${options.label} monthly coaching readability`);
    await captureViewport(
      page,
      `${options.label}-event.png`,
      `${options.label} event screenshot`,
      "[data-testid='event-panel']",
      { resetToTop: false }
    );

    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} month-complete reload continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} month-complete reload room`);
    await expectText(page, "body", "Month 2 / 12", `${options.label} month-complete reload advanced month`);
    await expectText(page, "[data-testid='open-schedule']", "이번 달 일정 정하기", `${options.label} month-complete reload schedule CTA`);
    await expectText(page, "[data-testid='monthly-coaching']", "다음 달 코칭", `${options.label} month-complete reload coaching`);
    await expectNoHorizontalOverflow(page, `${options.label} month-complete reload room`);

    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: monthReadyRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await dispatchHistoryState(page, "room");
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} room month-ready state`);
    await expectText(page, "[data-testid='open-schedule']", "다음 달", `${options.label} room month-ready CTA`);
    await dispatchDuplicateCommand(page, "open-schedule");
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} duplicate room month advance keeps room`);
    await expectText(page, "body", "Month 2 / 12", `${options.label} duplicate room month advance advanced once`);
    await expectText(page, "[data-testid='open-schedule']", "이번 달 일정 정하기", `${options.label} duplicate room month advance schedule CTA`);
    await expectNoVisible(page, "[data-testid='selected-slots']", `${options.label} duplicate room command stale event guard`);

    await page.goto(`${baseUrl}/?ending=scholar&from=preview&ending=merchant#card`, { waitUntil: "networkidle" });
    const canonicalSharedUrl = new URL(page.url());
    if (canonicalSharedUrl.search !== "?ending=scholar" || canonicalSharedUrl.hash !== "") {
      failures.push(`${options.label} shared ending URL was not canonicalized: ${page.url()}`);
    }
    await expectVisible(page, "[data-testid='ending-card']", `${options.label} noncanonical shared ending card`);
    await expectText(page, "[data-testid='ending-evidence']", "공유된 엔딩", `${options.label} noncanonical shared ending evidence`);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='ending-card']", `${options.label} shared ending card`);
    await expectText(page, "[data-testid='ending-evidence']", "공유된 엔딩", `${options.label} shared ending evidence`);
    await expectNoVisible(page, ".ending-screen .stat-list", `${options.label} shared ending synthetic stat list`);
    await expectNoHorizontalOverflow(page, `${options.label} shared ending`);
    await expectReadableTextPanel(page, "[data-testid='ending-card']", `${options.label} shared ending card readability`);
    await expectReadableTextPanel(page, "[data-testid='ending-evidence']", `${options.label} shared ending evidence readability`);
    await expectCanvasNonBlank(page, `${options.label} ending canvas`);
    await captureViewport(page, `${options.label}-ending.png`, `${options.label} ending screenshot`, "[data-testid='ending-card']");
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "0/30", `${options.label} shared ending collection isolation count`);
    await expectText(page, "[data-testid='collection-summary']", "0/30", `${options.label} shared ending collection isolation summary`);
    const sharedCollectionText = await page.getByTestId("collection-grid").textContent();
    if (sharedCollectionText?.includes("별빛 연구자")) {
      failures.push(`${options.label} shared ending URL leaked into unlocked collection.`);
    }
    const sharedCollectionStorage = await page.evaluate((collectionKey) => localStorage.getItem(collectionKey), COLLECTION_STORAGE_KEY);
    if (sharedCollectionStorage !== null) {
      failures.push(`${options.label} shared ending URL wrote collection storage: ${sharedCollectionStorage}`);
    }
    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await page.getByTestId("back-title").first().click();
    const sharedBackUrl = new URL(page.url());
    if (sharedBackUrl.searchParams.has("ending")) {
      failures.push(`${options.label} shared ending back-title did not clear ending query: ${page.url()}`);
    }
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} shared ending preserves local continue`);
    await page.getByTestId("continue-run").click();
    await expectText(page, "body", "Month 2 / 12", `${options.label} shared ending preserves local run`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: savedEndingRun }
    );
    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await expectText(page, "[data-testid='ending-card']", "별빛 연구자", `${options.label} shared ending before popstate cleanup`);
    await expectText(page, "[data-testid='ending-evidence']", "공유된 엔딩", `${options.label} shared ending evidence before popstate cleanup`);
    await dispatchHistoryState(page, "title");
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} shared ending popstate leaves card`);
    await expectText(page, "[data-testid='continue-run']", "엔딩 보기", `${options.label} shared ending popstate local ending continue`);
    await page.getByTestId("continue-run").click();
    await expectText(page, "[data-testid='ending-card']", "천문대장", `${options.label} shared ending popstate local ending card`);
    await expectText(page, "[data-testid='ending-evidence']", "도달 근거", `${options.label} shared ending popstate local ending evidence`);
    await expectNoText(page, "[data-testid='ending-evidence']", "공유된 엔딩", `${options.label} shared ending popstate cleared evidence`);
    await expectVisible(page, ".ending-screen .stat-list", `${options.label} shared ending popstate local stat list`);
    const sharedPopstateContinueUrl = new URL(page.url());
    if (sharedPopstateContinueUrl.searchParams.has("ending")) {
      failures.push(`${options.label} shared ending popstate continue did not clear ending query: ${page.url()}`);
    }

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: monthReadyRun }
    );
    await page.goto(`${baseUrl}/?ending=unknown-ending`, { waitUntil: "networkidle" });
    const invalidSharedUrl = new URL(page.url());
    if (invalidSharedUrl.searchParams.has("ending")) {
      failures.push(`${options.label} invalid shared ending query was not cleaned: ${page.url()}`);
    }
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} invalid shared ending does not render card`);
    await expectNoVisible(page, "[data-testid='fallback-banner']", `${options.label} invalid shared ending does not show fallback`);
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} invalid shared ending preserves local continue`);
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "0/30", `${options.label} invalid shared ending keeps collection count`);
    await expectText(page, "[data-testid='collection-summary']", "0/30", `${options.label} invalid shared ending keeps collection summary`);
    await page.getByTestId("back-title").first().click();
    await page.getByTestId("continue-run").click();
    await expectText(page, "body", "Month 2 / 12", `${options.label} invalid shared ending preserves local run`);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await page.getByTestId("share-ending").click();
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} share fallback banner`);
    await expectText(page, "[data-testid='fallback-banner']", "클립보드", `${options.label} share fallback copy`);
    const clipboardText = await page.evaluate(() => window.__starlitClipboardText ?? "");
    assertShareCopyText(clipboardText, `${options.label} clipboard share fallback`);
    await page.getByTestId("new-run").click();
    await expectVisible(page, "[data-testid='start-over-confirmation']", `${options.label} shared ending restart confirmation`);
    await page.getByTestId("confirm-start-over").click();
    const sharedRestartUrl = new URL(page.url());
    if (sharedRestartUrl.searchParams.has("ending")) {
      failures.push(`${options.label} shared ending restart did not clear ending query: ${page.url()}`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} shared ending restart reload should not reopen ending`);
    await expectVisible(page, "[data-testid='continue-run']", `${options.label} shared ending restart reload continue`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='first-run-brief']", `${options.label} shared ending restart continued room`);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await installNativeShareMock(page, "success");
    await page.getByTestId("share-ending").click();
    await expectNoVisible(page, "[data-testid='fallback-banner']", `${options.label} native share success banner`);
    const nativeSharePayload = await page.evaluate(() => window.__starlitSharedData ?? null);
    assertSharePayload(nativeSharePayload, `${options.label} native share payload`);
    const nativeShareClipboardText = await page.evaluate(() => window.__starlitClipboardText ?? "");
    if (nativeShareClipboardText !== "") {
      failures.push(`${options.label} native share success should not write clipboard fallback.`);
    }

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await installDelayedNativeShareMock(page);
    await dispatchDuplicateCommand(page, "share-ending");
    await page.waitForFunction(() => window.__starlitShareCallCount === 1);
    const duplicateSharePayload = await page.evaluate(() => window.__starlitSharedData ?? null);
    assertSharePayload(duplicateSharePayload, `${options.label} duplicate native share payload`);
    await page.evaluate(() => window.__releaseStarlitShare?.());
    await page.waitForFunction(() => window.__starlitShareSettled === true);
    const duplicateShareCallCount = await page.evaluate(() => window.__starlitShareCallCount ?? 0);
    if (duplicateShareCallCount !== 1) {
      failures.push(`${options.label} duplicate native share should call navigator.share once, got ${duplicateShareCallCount}.`);
    }
    await expectNoVisible(page, "[data-testid='fallback-banner']", `${options.label} duplicate native share success banner`);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await installDelayedNativeShareMock(page, "reject");
    await page.getByTestId("share-ending").click();
    await page.waitForFunction(() => window.__starlitShareCallCount === 1);
    await page.getByTestId("back-title").click();
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} stale native share leaves ending screen`);
    await expectNoVisible(page, "[data-testid='fallback-banner']", `${options.label} stale native share pre-settle banner`);
    await page.evaluate(() => window.__releaseStarlitShare?.());
    await page.waitForFunction(() => window.__starlitShareSettled === true);
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} stale native share completion ending screen`);
    await expectNoVisible(page, "[data-testid='fallback-banner']", `${options.label} stale native share completion banner`);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await installBlockingNativeShareMock(page);
    await page.getByTestId("share-ending").click();
    await page.waitForFunction(() => window.__starlitShareCallCount === 1);
    await page.getByTestId("back-title").click();
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} stale in-flight share leaves ending screen`);
    await pushSharedEndingHistoryState(page, "merchant");
    await expectText(page, "[data-testid='ending-card']", "도시 상인", `${options.label} stale in-flight share retarget card`);
    await page.getByTestId("share-ending").click();
    await page.waitForFunction(() => window.__starlitShareCallCount === 2);
    const retargetSharePayloads = await page.evaluate(() => window.__starlitSharePayloads ?? []);
    const latestRetargetSharePayload = retargetSharePayloads.at(-1);
    if (!latestRetargetSharePayload?.text?.includes("도시 상인")) {
      failures.push(`${options.label} stale in-flight share retarget payload mismatch: ${JSON.stringify(latestRetargetSharePayload)}`);
    }
    await page.evaluate(() => window.__releaseAllStarlitShares?.());
    await expectNoVisible(page, "[data-testid='fallback-banner']", `${options.label} stale in-flight share retarget banner`);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await installNativeShareMock(page, "reject");
    await page.getByTestId("share-ending").click();
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} native share rejected fallback banner`);
    await expectText(page, "[data-testid='fallback-banner']", "클립보드", `${options.label} native share rejected fallback copy`);
    const rejectedSharePayload = await page.evaluate(() => window.__starlitSharedData ?? null);
    assertSharePayload(rejectedSharePayload, `${options.label} rejected native share payload`);
    const rejectedClipboardText = await page.evaluate(() => window.__starlitClipboardText ?? "");
    assertShareCopyText(rejectedClipboardText, `${options.label} native share rejected fallback`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: endingReadyRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} ending-ready continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='ending-card']", `${options.label} ending-ready final card`);
    await expectText(page, "[data-testid='ending-evidence']", "도달 근거", `${options.label} ending-ready evidence`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: finalPendingRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} final-pending continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='activity-screen']", `${options.label} final-pending activity`);
    await expectText(page, "[data-testid='activity-screen']", "집에서 쉬기", `${options.label} final-pending final action`);
    await page.getByTestId("finish-activity").click();
    await expectVisible(page, "[data-testid='result-deltas']", `${options.label} final-pending result`);
    await expectText(page, "[data-testid='advance-month']", "엔딩 보기", `${options.label} final result ending CTA`);
    await dispatchDuplicateCommand(page, "advance-month");
    await expectVisible(page, "[data-testid='ending-card']", `${options.label} duplicate final advance ending card`);
    await expectText(page, "[data-testid='ending-evidence']", "도달 근거", `${options.label} duplicate final advance evidence`);
    await expectNoVisible(page, "[data-testid='apprentice-profile']", `${options.label} duplicate final advance should not return room`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: prematureEndingRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} premature ending continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='first-run-brief']", `${options.label} premature ending resumes room`);
    await expectNoVisible(page, "[data-testid='ending-card']", `${options.label} premature ending should not open ending`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key, run }) => {
        localStorage.clear();
        localStorage.setItem(key, run);
      },
      { key: RUN_STORAGE_KEY, run: savedEndingRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "엔딩 보기", `${options.label} saved ending continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='ending-card']", `${options.label} saved ending card`);
    await expectText(page, "[data-testid='ending-evidence']", "도달 근거", `${options.label} saved ending evidence`);
    await expectText(page, "[data-testid='ending-evidence']", "별빛학", `${options.label} saved ending requirement evidence`);
    await expectVisible(page, ".ending-screen .stat-list", `${options.label} saved ending stat list`);
    await expectReadableTextPanel(page, "[data-testid='ending-card']", `${options.label} saved ending card readability`);
    await expectReadableTextPanel(page, "[data-testid='ending-evidence']", `${options.label} saved ending evidence readability`);
    await expectNoHorizontalOverflow(page, `${options.label} saved ending`);
    await captureViewport(
      page,
      `${options.label}-saved-ending.png`,
      `${options.label} saved ending screenshot`,
      "[data-testid='ending-card']"
    );

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, collectionKey }) => {
        localStorage.clear();
        localStorage.setItem(runKey, "{broken-json");
        localStorage.setItem(collectionKey, JSON.stringify(["scholar", "unknown-ending", "scholar"]));
      },
      { runKey: RUN_STORAGE_KEY, collectionKey: COLLECTION_STORAGE_KEY }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} corrupted run fallback banner`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} corrupted run fallback continue disabled`);
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "1/30", `${options.label} corrupted run keeps valid collection count`);
    await expectText(page, "[data-testid='collection-summary']", "1/30", `${options.label} corrupted run collection summary count`);
    await expectText(page, "[data-testid='collection-grid']", "별빛 연구자", `${options.label} corrupted run known collection ending`);
    const corruptedRunCollectionText = await page.getByTestId("collection-grid").textContent();
    if (corruptedRunCollectionText?.includes("unknown-ending")) {
      failures.push(`${options.label} corrupted run partial recovery exposed an unknown collection ending.`);
    }
    await page.getByTestId("back-title").first().click();

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, collectionKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
        localStorage.setItem(collectionKey, "{broken-json");
      },
      { runKey: RUN_STORAGE_KEY, collectionKey: COLLECTION_STORAGE_KEY, run: serializeRun(createNewRun(7)) }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} corrupted collection fallback banner`);
    await expectVisible(page, "[data-testid='continue-run']", `${options.label} corrupted collection keeps valid run continue`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='first-run-brief']", `${options.label} corrupted collection resumed run`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key }) => {
        localStorage.clear();
        localStorage.setItem(key, JSON.stringify(["scholar", "unknown-ending", "scholar"]));
      },
      { key: COLLECTION_STORAGE_KEY }
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "1/30", `${options.label} stale collection sanitization count`);
    await expectText(page, "[data-testid='collection-summary']", "1/30", `${options.label} stale collection summary count`);
    await expectText(page, "[data-testid='collection-next-target']", "다음 목표", `${options.label} stale collection next target`);
    await expectText(page, "[data-testid='collection-groups']", "학문/기록 1/5", `${options.label} stale collection group progress`);
    await expectText(page, "[data-testid='collection-grid']", "별빛 연구자", `${options.label} known collection ending`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ key }) => {
        localStorage.clear();
        localStorage.setItem(key, JSON.stringify({ version: 1, endings: ["scholar", "unknown-ending", "scholar"] }));
      },
      { key: COLLECTION_STORAGE_KEY }
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "1/30", `${options.label} versioned collection save count`);
    await expectText(page, "[data-testid='collection-summary']", "1/30", `${options.label} versioned collection summary count`);
    await expectText(page, "[data-testid='collection-grid']", "별빛 연구자", `${options.label} versioned collection known ending`);
    const versionedCollectionText = await page.getByTestId("collection-grid").textContent();
    if (versionedCollectionText?.includes("unknown-ending")) {
      failures.push(`${options.label} versioned collection save exposed an unknown collection ending.`);
    }

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, collectionKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
        localStorage.setItem(collectionKey, JSON.stringify({ version: 2, endings: ["scholar"] }));
      },
      { runKey: RUN_STORAGE_KEY, collectionKey: COLLECTION_STORAGE_KEY, run: serializeRun(createNewRun(11)) }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} unsupported collection schema fallback banner`);
    await expectVisible(page, "[data-testid='continue-run']", `${options.label} unsupported collection schema keeps valid run continue`);
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "0/30", `${options.label} unsupported collection schema count`);
    await expectText(page, "[data-testid='collection-summary']", "0/30", `${options.label} unsupported collection schema summary count`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
      },
      { runKey: RUN_STORAGE_KEY, run: staleRunUnlocks }
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "0/30", `${options.label} run unlocked ending scope cleanup count`);
    await expectText(page, "[data-testid='collection-summary']", "0/30", `${options.label} run unlock cleanup summary count`);
    const runUnlockCollectionText = await page.getByTestId("collection-grid").textContent();
    if (runUnlockCollectionText?.includes("별빛 연구자")) {
      failures.push(`${options.label} run-local unlockedEndings leaked into collection.`);
    }

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
      },
      { runKey: RUN_STORAGE_KEY, run: unsupportedSavedMonthRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} unsupported saved month continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='first-run-brief']", `${options.label} unsupported saved month first-run brief`);
    await expectText(page, ".topbar", "Month 1 / 12", `${options.label} unsupported saved month cleanup room month`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
      },
      { runKey: RUN_STORAGE_KEY, run: unsupportedSavedScheduledMonthRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectText(page, "[data-testid='continue-run']", "이어하기", `${options.label} unsupported saved scheduled month continue label`);
    await page.getByTestId("continue-run").click();
    await expectVisible(page, "[data-testid='first-run-brief']", `${options.label} unsupported saved scheduled month first-run brief`);
    await expectText(page, ".topbar", "Month 1 / 12", `${options.label} unsupported saved scheduled month cleanup room month`);

    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
      },
      { runKey: RUN_STORAGE_KEY, run: inflatedProgressFlagsRun }
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("continue-run").click();
    await expectText(page, "[data-testid='target-ending-panel']", "별빛학 0/3", `${options.label} saved progress flag history cleanup`);

    await page.getByTestId("back-title").first().click();
    await expectVisible(page, "[data-testid='reset-local-data']", `${options.label} reset local data button`);
    await page.getByTestId("reset-local-data").click();
    await expectVisible(page, "[data-testid='reset-confirmation']", `${options.label} reset confirmation`);
    await page.getByTestId("confirm-reset-local-data").click();
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} reset completion banner`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} reset continue disabled`);
    await expectDisabled(page, "[data-testid='reset-local-data']", `${options.label} reset button disabled after clear`);
    const remainingStorage = await page.evaluate(
      ({ runKey, collectionKey }) => ({
        run: localStorage.getItem(runKey),
        collection: localStorage.getItem(collectionKey)
      }),
      { runKey: RUN_STORAGE_KEY, collectionKey: COLLECTION_STORAGE_KEY }
    );
    if (remainingStorage.run !== null || remainingStorage.collection !== null) {
      failures.push(`${options.label} local data reset did not clear storage: ${JSON.stringify(remainingStorage)}`);
    }
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "0/30", `${options.label} reset collection count`);
    assertAnalyticsEvents(analyticsEvents, options.label);
  } catch (error) {
    failures.push(`${options.label} smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }

  if (runtimeErrors.length > 0) {
    failures.push(`${options.label} runtime error(s):\n${runtimeErrors.map((error) => `  - ${error}`).join("\n")}`);
  } else {
    console.log(`OK ${options.label}: no console/page/request errors`);
  }
}

async function runStorageUnavailableSmoke(browser, options) {
  const runtimeErrors = [];
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
  });
  await context.addInitScript(() => {
    const throwStorageError = () => {
      throw new DOMException("localStorage unavailable in this embedded container", "SecurityError");
    };
    for (const method of ["getItem", "setItem", "removeItem", "clear"]) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value: throwStorageError
      });
    }
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const text = message.text();
      if (!isIgnoredConsoleMessage(text)) {
        runtimeErrors.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (!isIgnoredNetworkFailure(request.url(), failure?.errorText ?? "")) {
      runtimeErrors.push(`requestfailed: ${request.url()} ${failure?.errorText ?? ""}`.trim());
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='fallback-banner']", `${options.label} storage unavailable fallback banner`);
    await expectText(page, "[data-testid='fallback-banner']", "저장 데이터를", `${options.label} storage unavailable load warning`);
    await expectVisible(page, "[data-testid='new-run']", `${options.label} storage unavailable title new-run`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} storage unavailable continue disabled`);
    await page.getByTestId("new-run").click();
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} storage unavailable can start run`);
    await expectText(page, "[data-testid='fallback-banner']", "로컬 저장 공간", `${options.label} storage unavailable save warning`);
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='new-run']", `${options.label} storage unavailable reload returns to title`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} storage unavailable reload continue disabled`);
  } catch (error) {
    failures.push(`${options.label} storage unavailable smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }

  if (runtimeErrors.length > 0) {
    failures.push(
      `${options.label} storage unavailable runtime error(s):\n${runtimeErrors.map((error) => `  - ${error}`).join("\n")}`
    );
  } else {
    console.log(`OK ${options.label}: storage unavailable fallback`);
  }
}

async function runStorageWriteFailureSmoke(browser, options) {
  const runtimeErrors = [];
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
  });
  await context.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value: () => {
        throw new DOMException("localStorage quota exceeded in this embedded container", "QuotaExceededError");
      }
    });
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const text = message.text();
      if (!isIgnoredConsoleMessage(text)) {
        runtimeErrors.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (!isIgnoredNetworkFailure(request.url(), failure?.errorText ?? "")) {
      runtimeErrors.push(`requestfailed: ${request.url()} ${failure?.errorText ?? ""}`.trim());
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='new-run']", `${options.label} storage write failure title new-run`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} storage write failure clean continue`);
    await page.getByTestId("new-run").click();
    await expectVisible(page, "[data-testid='apprentice-profile']", `${options.label} storage write failure can start run`);
    await expectText(page, "[data-testid='fallback-banner']", "로컬 저장 공간", `${options.label} storage write failure save warning`);
    await expectNoHorizontalOverflow(page, `${options.label} storage write failure room`);
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='new-run']", `${options.label} storage write failure reload returns to title`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} storage write failure reload continue disabled`);
  } catch (error) {
    failures.push(`${options.label} storage write failure smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }

  if (runtimeErrors.length > 0) {
    failures.push(
      `${options.label} storage write failure runtime error(s):\n${runtimeErrors.map((error) => `  - ${error}`).join("\n")}`
    );
  } else {
    console.log(`OK ${options.label}: storage write failure fallback`);
  }
}

async function runStorageRemoveFailureSmoke(browser, options) {
  const runtimeErrors = [];
  const context = await browser.newContext({
    viewport: options.viewport,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch
  });
  await context.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "removeItem", {
      configurable: true,
      value: () => {
        throw new DOMException("localStorage remove blocked in this embedded container", "SecurityError");
      }
    });
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      const text = message.text();
      if (!isIgnoredConsoleMessage(text)) {
        runtimeErrors.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => {
    runtimeErrors.push(`pageerror: ${error.message}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (!isIgnoredNetworkFailure(request.url(), failure?.errorText ?? "")) {
      runtimeErrors.push(`requestfailed: ${request.url()} ${failure?.errorText ?? ""}`.trim());
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(
      ({ runKey, collectionKey, run }) => {
        localStorage.clear();
        localStorage.setItem(runKey, run);
        localStorage.setItem(collectionKey, JSON.stringify(["scholar"]));
      },
      { runKey: RUN_STORAGE_KEY, collectionKey: COLLECTION_STORAGE_KEY, run: serializeRun(createNewRun(9)) }
    );
    await page.reload({ waitUntil: "networkidle" });
    await expectVisible(page, "[data-testid='continue-run']", `${options.label} storage remove failure existing run`);
    await page.getByTestId("reset-local-data").click();
    await expectVisible(page, "[data-testid='reset-confirmation']", `${options.label} storage remove failure reset confirmation`);
    await page.getByTestId("confirm-reset-local-data").click();
    await expectText(page, "[data-testid='fallback-banner']", "삭제했습니다", `${options.label} storage remove failure reset copy`);
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} storage remove failure continue disabled`);
    const fallbackStorage = await page.evaluate(
      ({ runKey, collectionKey }) => ({
        run: localStorage.getItem(runKey),
        collection: localStorage.getItem(collectionKey)
      }),
      { runKey: RUN_STORAGE_KEY, collectionKey: COLLECTION_STORAGE_KEY }
    );
    if (fallbackStorage.run !== "" || fallbackStorage.collection !== emptyCollection) {
      failures.push(`${options.label} storage remove failure fallback values were not persisted: ${JSON.stringify(fallbackStorage)}`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await expectDisabled(page, "[data-testid='continue-run']", `${options.label} storage remove failure reload continue disabled`);
    await page.getByTestId("open-collection").click();
    await expectText(page, ".topbar", "0/30", `${options.label} storage remove failure reload collection empty`);
  } catch (error) {
    failures.push(`${options.label} storage remove failure smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }

  if (runtimeErrors.length > 0) {
    failures.push(
      `${options.label} storage remove failure runtime error(s):\n${runtimeErrors.map((error) => `  - ${error}`).join("\n")}`
    );
  } else {
    console.log(`OK ${options.label}: storage remove failure reset fallback`);
  }
}

async function captureViewport(page, filename, label, anchorSelector, options = {}) {
  try {
    if (options.resetToTop !== false) {
      await page.evaluate(() => {
        window.scrollTo({ top: 0, left: 0 });
        document.documentElement.scrollTo?.({ top: 0, left: 0 });
        document.body.scrollTo?.({ top: 0, left: 0 });
      });
      await page.waitForTimeout(50);
    }

    await expectElementInViewport(page, anchorSelector, `${label} anchor`);
    await page.screenshot({ path: resolve(outputDir, filename), fullPage: false });
  } catch (error) {
    failures.push(`${label} capture failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function dispatchHistoryState(page, starlitScreen) {
  await page.evaluate((screen) => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: { starlitScreen: screen } }));
  }, starlitScreen);
}

async function pushSharedEndingHistoryState(page, endingCode) {
  await page.evaluate((code) => {
    window.history.pushState({ starlitScreen: "ending" }, "", `/?ending=${code}`);
    window.dispatchEvent(new PopStateEvent("popstate", { state: { starlitScreen: "ending" } }));
  }, endingCode);
}

async function installControllableClock(page) {
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
    window.__advanceStarlitTime = (elapsedMs) => {
      wallNow += elapsedMs;
      monotonicNow += elapsedMs;
      return monotonicNow;
    };
    window.__advanceStarlitWallTime = (elapsedMs) => {
      wallNow += elapsedMs;
      return wallNow;
    };
  });
}

async function advanceClockAndResume(page, elapsedMs) {
  await page.evaluate((ms) => {
    if (typeof window.__advanceStarlitTime !== "function") {
      throw new Error("Missing controllable clock.");
    }
    window.__advanceStarlitTime(ms);
    window.dispatchEvent(new Event("pageshow"));
  }, elapsedMs);
}

async function advanceClockAndVisibilityResume(page, elapsedMs) {
  await page.evaluate((ms) => {
    if (typeof window.__advanceStarlitTime !== "function") {
      throw new Error("Missing controllable clock.");
    }
    window.__advanceStarlitTime(ms);
    document.dispatchEvent(new Event("visibilitychange"));
  }, elapsedMs);
}

async function advanceWallClockAndResume(page, elapsedMs) {
  await page.evaluate((ms) => {
    if (typeof window.__advanceStarlitWallTime !== "function") {
      throw new Error("Missing controllable wall clock.");
    }
    window.__advanceStarlitWallTime(ms);
    window.dispatchEvent(new Event("pageshow"));
  }, elapsedMs);
}

async function dispatchDuplicateCommand(page, testId) {
  await page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Missing command button: ${id}`);
    }
    button.click();
    button.click();
  }, testId);
}

async function corruptDatasetValue(page, selector, datasetKey, datasetValue, label) {
  await page.evaluate(
    ({ selector, datasetKey, datasetValue, label }) => {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLButtonElement)) {
        return;
      }
      element.dataset[datasetKey] = datasetValue;
      element.textContent = label;
    },
    { selector, datasetKey, datasetValue, label }
  );
}

async function expectElementInViewport(page, selector, label) {
  try {
    const result = await page.locator(selector).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);
      const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
      return {
        ok: visibleWidth > 0 && visibleHeight > 0,
        rect: {
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left)
        },
        viewport: {
          width: viewportWidth,
          height: viewportHeight
        },
        scrollY: Math.round(window.scrollY)
      };
    });

    if (!result.ok) {
      failures.push(
        `${label} is outside the screenshot viewport: rect ${JSON.stringify(result.rect)}, viewport ${JSON.stringify(
          result.viewport
        )}, scrollY ${result.scrollY}`
      );
    }
  } catch (error) {
    failures.push(`${label} viewport check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectVisible(page, selector, label) {
  try {
    await page.locator(selector).waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    failures.push(`${label} is not visible: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectNoVisible(page, selector, label) {
  try {
    const visible = await page.locator(selector).first().isVisible({ timeout: 1_000 }).catch(() => false);
    if (visible) {
      failures.push(`${label} should not be visible.`);
    }
  } catch (error) {
    failures.push(`${label} visibility check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectDisabled(page, selector, label) {
  try {
    const disabled = await page.locator(selector).first().isDisabled({ timeout: 10_000 });
    if (!disabled) {
      failures.push(`${label} is not disabled.`);
    }
  } catch (error) {
    failures.push(`${label} disabled check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectText(page, selector, text, label) {
  try {
    const content = await page.locator(selector).first().textContent({ timeout: 10_000 });
    if (!content?.includes(text)) {
      failures.push(`${label} did not include ${JSON.stringify(text)}.`);
    }
  } catch (error) {
    failures.push(`${label} text check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectNoText(page, selector, text, label) {
  try {
    const content = await page.locator(selector).first().textContent({ timeout: 10_000 });
    if (content?.includes(text)) {
      failures.push(`${label} should not include ${JSON.stringify(text)}.`);
    }
  } catch (error) {
    failures.push(`${label} negative text check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectReadableTextPanel(page, selector, label) {
  try {
    const result = await page.locator(selector).first().evaluate((panel) => {
      const viewportWidth = document.documentElement.clientWidth;
      const panelRect = panel.getBoundingClientRect();
      const issues = [];
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_ELEMENT);
      const elements = [panel];
      while (walker.nextNode()) {
        elements.push(walker.currentNode);
      }

      if (panelRect.width < Math.min(300, viewportWidth - 24)) {
        issues.push(`panel width is narrow: ${Math.round(panelRect.width)}px`);
      }

      for (const element of elements) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        const text = element.innerText?.trim();
        if (!text) {
          continue;
        }
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        const fontSize = Number.parseFloat(style.fontSize);
        const lineHeight = Number.parseFloat(style.lineHeight);
        const normalizedLineHeight = Number.isFinite(lineHeight) && fontSize > 0 ? lineHeight / fontSize : 1.2;
        const horizontalOverflow = element.scrollWidth - element.clientWidth;

        if (fontSize < 12) {
          issues.push(`${element.tagName.toLowerCase()} text below 12px: ${fontSize.toFixed(1)}px`);
        }
        if (normalizedLineHeight < 1.2) {
          issues.push(`${element.tagName.toLowerCase()} line-height below 1.2: ${normalizedLineHeight.toFixed(2)}`);
        }
        if (horizontalOverflow > 2) {
          issues.push(
            `${element.tagName.toLowerCase()} horizontal text overflow: ${element.scrollWidth}/${element.clientWidth}`
          );
        }
        if (rect.left < -1 || rect.right > viewportWidth + 1) {
          issues.push(
            `${element.tagName.toLowerCase()} clipped horizontally: ${Math.round(rect.left)}-${Math.round(rect.right)} of ${viewportWidth}`
          );
        }
      }

      return {
        ok: issues.length === 0,
        issues
      };
    });

    if (!result.ok) {
      failures.push(`${label} failed:\n${result.issues.map((issue) => `  - ${issue}`).join("\n")}`);
    }
  } catch (error) {
    failures.push(`${label} readability check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectNoHorizontalOverflow(page, label) {
  try {
    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const body = document.body;
      const rootOverflow = root.scrollWidth - root.clientWidth;
      const bodyOverflow = body.scrollWidth - body.clientWidth;
      return {
        ok: rootOverflow <= 2 && bodyOverflow <= 2,
        rootScrollWidth: root.scrollWidth,
        rootClientWidth: root.clientWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth
      };
    });
    if (!result.ok) {
      failures.push(
        `${label} has horizontal overflow: root ${result.rootScrollWidth}/${result.rootClientWidth}, body ${result.bodyScrollWidth}/${result.bodyClientWidth}`
      );
    }
  } catch (error) {
    failures.push(`${label} overflow check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  await expectStickyActionsViewportSafe(page, label);
}

async function expectStickyActionsViewportSafe(page, label) {
  try {
    const result = await page.evaluate(() => {
      const bar = document.querySelector(".sticky-actions");
      if (!(bar instanceof HTMLElement) || !isVisible(bar)) {
        return { ok: true, issues: [] };
      }

      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const rect = bar.getBoundingClientRect();
      const issues = [];
      if (rect.left < -1 || rect.right > viewportWidth + 1 || rect.top < -1 || rect.bottom > viewportHeight + 1) {
        issues.push(
          `sticky actions outside viewport: ${Math.round(rect.left)},${Math.round(rect.top)}-${Math.round(
            rect.right
          )},${Math.round(rect.bottom)} of ${viewportWidth}x${viewportHeight}`
        );
      }
      if (rect.width < Math.min(292, viewportWidth - 28)) {
        issues.push(`sticky actions width is too narrow: ${Math.round(rect.width)}px`);
      }
      if (viewportHeight - rect.bottom < 0) {
        issues.push(`sticky actions bottom is clipped by ${Math.round(rect.bottom - viewportHeight)}px`);
      }

      const controls = [...bar.querySelectorAll("button, a[href], [role='button']")].filter(
        (element) => element instanceof HTMLElement && isVisible(element) && !element.matches(":disabled")
      );
      for (const control of controls) {
        const controlRect = control.getBoundingClientRect();
        const centerX = Math.round(controlRect.left + controlRect.width / 2);
        const centerY = Math.round(controlRect.top + controlRect.height / 2);
        const topElement = document.elementFromPoint(centerX, centerY);
        if (!topElement || !control.contains(topElement)) {
          issues.push(
            `${describeControl(control)} center is occluded at ${centerX},${centerY} by ${describeControl(topElement)}`
          );
        }
      }

      return { ok: issues.length === 0, issues };

      function isVisible(element) {
        const style = window.getComputedStyle(element);
        const elementRect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          elementRect.width > 0 &&
          elementRect.height > 0
        );
      }

      function describeControl(element) {
        if (!(element instanceof Element)) {
          return "none";
        }
        const testId = element.getAttribute("data-testid");
        if (testId) {
          return `${element.tagName.toLowerCase()}[data-testid="${testId}"]`;
        }
        const className = element.getAttribute("class");
        if (className) {
          return `${element.tagName.toLowerCase()}.${className.split(/\s+/).filter(Boolean).join(".")}`;
        }
        return element.tagName.toLowerCase();
      }
    });
    if (!result.ok) {
      failures.push(`${label} sticky action viewport guard failed:\n${result.issues.map((issue) => `  - ${issue}`).join("\n")}`);
    }
  } catch (error) {
    failures.push(`${label} sticky action viewport check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function installNativeShareMock(page, mode) {
  await page.evaluate((shareMode) => {
    window.__starlitSharedData = undefined;
    window.__starlitClipboardText = "";
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__starlitSharedData = data;
        if (shareMode === "reject") {
          throw new DOMException("Native share unavailable in this preview.", "NotAllowedError");
        }
      }
    });
  }, mode);
}

async function installDelayedNativeShareMock(page, mode = "success") {
  await page.evaluate((shareMode) => {
    let settleShare;
    window.__starlitSharedData = undefined;
    window.__starlitClipboardText = "";
    window.__starlitShareCallCount = 0;
    window.__starlitShareSettled = false;
    window.__releaseStarlitShare = () => settleShare?.();
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: () => true
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__starlitSharedData = data;
        window.__starlitShareCallCount += 1;
        try {
          await new Promise((resolve, reject) => {
            settleShare = () => {
              if (shareMode === "reject") {
                reject(new DOMException("Native share unavailable after navigation.", "NotAllowedError"));
                return;
              }
              resolve();
            };
          });
        } finally {
          window.__starlitShareSettled = true;
        }
      }
    });
  }, mode);
}

async function installBlockingNativeShareMock(page) {
  await page.evaluate(() => {
    const resolvers = [];
    window.__starlitSharedData = undefined;
    window.__starlitSharePayloads = [];
    window.__starlitClipboardText = "";
    window.__starlitShareCallCount = 0;
    window.__releaseAllStarlitShares = () => {
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
      value: async (data) => {
        window.__starlitSharedData = data;
        window.__starlitSharePayloads.push(data);
        window.__starlitShareCallCount += 1;
        await new Promise((resolve) => {
          resolvers.push(resolve);
        });
      }
    });
  });
}

function assertSharePayload(payload, label) {
  if (!payload || typeof payload !== "object") {
    failures.push(`${label} was not captured.`);
    return;
  }
  if (payload.title !== "별빛 견습생") {
    failures.push(`${label} title mismatch: ${JSON.stringify(payload.title)}.`);
  }
  if (typeof payload.text !== "string" || !payload.text.includes("별빛 연구자")) {
    failures.push(`${label} text did not include ending share copy.`);
  }
  if ("url" in payload && payload.url !== undefined) {
    assertPublicEndingShareUrl(payload.url, `${label} url`);
  }
}

function assertShareCopyText(text, label) {
  if (typeof text !== "string" || !text.includes("별빛 연구자")) {
    failures.push(`${label} did not include ending share copy.`);
    return;
  }
  assertNoInternalShareUrl(text, label);
}

function assertPublicEndingShareUrl(value, label) {
  if (typeof value !== "string") {
    failures.push(`${label} must be a string when present.`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.searchParams.get("ending") !== "scholar") {
      failures.push(`${label} must be a public HTTPS ending URL, got ${JSON.stringify(value)}.`);
    }
    const unexpectedParams = [...url.searchParams.keys()].filter((key) => key !== "ending");
    if (unexpectedParams.length > 0 || url.hash) {
      failures.push(`${label} must be a canonical ending URL without extra query params or hash: ${JSON.stringify(value)}.`);
    }
    assertNoInternalShareUrl(value, label);
  } catch {
    failures.push(`${label} is not a valid URL: ${JSON.stringify(value)}.`);
  }
}

function assertNoInternalShareUrl(value, label) {
  const text = String(value);
  if (/\b(?:capacitor|file|ionic):\/\//i.test(text)) {
    failures.push(`${label} exposed an internal, local, or placeholder URL: ${JSON.stringify(text)}.`);
    return;
  }

  const urlMatches = text.match(/\bhttps?:\/\/[^\s<>"']+/gi) ?? [];
  for (const match of urlMatches) {
    try {
      const url = new URL(match.replace(/[),.;]+$/g, ""));
      if (url.protocol !== "https:" || isBlockedPublicUrlHost(url.hostname)) {
        failures.push(`${label} exposed an internal, local, or placeholder URL: ${JSON.stringify(text)}.`);
        return;
      }
    } catch {
      failures.push(`${label} exposed an unparsable URL-like share value: ${JSON.stringify(text)}.`);
      return;
    }
  }
}

function assertAnalyticsEvents(events, label) {
  const requiredEvents = [
    ["starlit_start_click", (params) => params.mode === "new"],
    ["starlit_collection_view", (params) => typeof params.unlocked_count === "number"],
    ["starlit_target_ending_selected", (params) => params.ending_code === "scholar"],
    [
      "starlit_schedule_confirmed",
      (params) => params.month === 1 && typeof params.slots === "string" && params.slots.includes("star-lore")
    ],
    ["starlit_event_seen", (params) => typeof params.event_id === "string" && params.month === 1],
    ["starlit_share_click", (params) => params.ending_code === "scholar"],
    ["starlit_ending_reached", (params) => typeof params.ending_code === "string" && params.year === 1]
  ];

  for (const [eventName, predicate] of requiredEvents) {
    const match = events.find((event) => event?.eventName === eventName && predicate(event.params ?? {}));
    if (!match) {
      failures.push(`${label} missing analytics event payload: ${eventName}. Captured: ${JSON.stringify(events)}`);
    }
  }
}

function createSpecializedEndingRun() {
  let run = createNewRun(1);
  for (const schedule of observatoryRoute()) {
    run = selectSchedule(run, schedule);
    for (let slot = 0; slot < 4; slot += 1) {
      run = resolveNextSlot(run).run;
    }
    run = advanceMonth(run);
  }
  return run;
}

function createEndingReadyRun() {
  let run = createNewRun(1);
  const route = observatoryRoute();
  for (const schedule of route.slice(0, 11)) {
    run = selectSchedule(run, schedule);
    for (let slot = 0; slot < 4; slot += 1) {
      run = resolveNextSlot(run).run;
    }
    run = advanceMonth(run);
  }
  run = selectSchedule(run, route[11]);
  for (let slot = 0; slot < 4; slot += 1) {
    run = resolveNextSlot(run).run;
  }
  return run;
}

function createFinalPendingRun() {
  let run = createNewRun(1);
  const route = observatoryRoute();
  for (const schedule of route.slice(0, 11)) {
    run = selectSchedule(run, schedule);
    for (let slot = 0; slot < 4; slot += 1) {
      run = resolveNextSlot(run).run;
    }
    run = advanceMonth(run);
  }
  run = selectSchedule(run, route[11]);
  for (let slot = 0; slot < 3; slot += 1) {
    run = resolveNextSlot(run).run;
  }
  return run;
}

function createMonthReadyRun() {
  let run = createNewRun(2);
  run = selectSchedule(run, ["star-lore", "letters", "home-rest", "park"]);
  for (let slot = 0; slot < 4; slot += 1) {
    run = resolveNextSlot(run).run;
  }
  return run;
}

function rawRun(run) {
  // Stale/corrupt save fixtures intentionally bypass serializeRun() writer guards.
  return JSON.stringify(run);
}

function observatoryRoute() {
  return [
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
}

async function expectCanvasNonBlank(page, label) {
  try {
    const canvas = page.locator("canvas").first();
    await canvas.waitFor({ state: "visible", timeout: 10_000 });
    const screenshot = await canvas.screenshot({ timeout: 10_000 });
    const result = inspectPngPixels(screenshot);

    if (!result.ok) {
      failures.push(`${label} appears blank: ${result.reason}`);
    }
  } catch (error) {
    failures.push(`${label} canvas check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectDynamicViewportResize(page, originalViewport, label) {
  const resizedViewport = {
    width: Math.max(320, originalViewport.width - Math.min(180, Math.floor(originalViewport.width * 0.16))),
    height: Math.max(620, originalViewport.height - Math.min(160, Math.floor(originalViewport.height * 0.16)))
  };

  try {
    await page.setViewportSize(resizedViewport);
    await page.waitForTimeout(100);
    await expectCanvasViewportSize(page, resizedViewport, `${label} resized canvas`);
    await expectNoHorizontalOverflow(page, `${label} resized viewport`);
    await expectCanvasNonBlank(page, `${label} resized canvas`);

    await page.setViewportSize(originalViewport);
    await page.waitForTimeout(100);
    await expectCanvasViewportSize(page, originalViewport, `${label} restored canvas`);
    await expectNoHorizontalOverflow(page, `${label} restored viewport`);
    await expectCanvasNonBlank(page, `${label} restored canvas`);
  } catch (error) {
    failures.push(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function expectCanvasVisibilityRenderLoopPause(page, label) {
  try {
    const activeState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(activeState, { motion: "animated", renderLoop: "running", reason: "active" }, `${label} active`);

    await setDocumentVisibilityState(page, "hidden");
    await page.waitForTimeout(80);
    const hiddenState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(
      hiddenState,
      { motion: "animated", renderLoop: "paused", reason: "document-hidden" },
      `${label} hidden`
    );

    await setDocumentVisibilityState(page, "visible");
    await page.waitForTimeout(80);
    const resumedState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(resumedState, { motion: "animated", renderLoop: "running", reason: "active" }, `${label} resumed`);
    await expectCanvasNonBlank(page, `${label} resumed canvas`);

    await dispatchPageLifecycleEvent(page, "pagehide");
    await page.waitForTimeout(80);
    const pageHiddenState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(
      pageHiddenState,
      { motion: "animated", renderLoop: "paused", reason: "page-hidden" },
      `${label} pagehide`
    );

    await dispatchPageLifecycleEvent(page, "pageshow");
    await page.waitForTimeout(80);
    const pageResumedState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(
      pageResumedState,
      { motion: "animated", renderLoop: "running", reason: "active" },
      `${label} pageshow`
    );
    await expectCanvasNonBlank(page, `${label} pageshow canvas`);

    await dispatchPageLifecycleEvent(page, "freeze");
    await page.waitForTimeout(80);
    const pageFrozenState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(
      pageFrozenState,
      { motion: "animated", renderLoop: "paused", reason: "page-frozen" },
      `${label} freeze`
    );

    await dispatchPageLifecycleEvent(page, "resume");
    await page.waitForTimeout(80);
    const pageResumedFromFreezeState = await readCanvasRenderLoopState(page);
    assertCanvasRenderLoopState(
      pageResumedFromFreezeState,
      { motion: "animated", renderLoop: "running", reason: "active" },
      `${label} resume`
    );
    await expectCanvasNonBlank(page, `${label} resume canvas`);
  } catch (error) {
    failures.push(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readCanvasRenderLoopState(page) {
  return await page.locator("canvas").first().evaluate((canvas) => ({
    motion: canvas.dataset.motion,
    renderLoop: canvas.dataset.renderLoop,
    reason: canvas.dataset.renderLoopReason
  }));
}

async function setDocumentVisibilityState(page, visibilityState) {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => state
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => state === "hidden"
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visibilityState);
}

async function dispatchPageLifecycleEvent(page, eventName) {
  await page.evaluate((name) => {
    const event =
      name === "pagehide" || name === "pageshow" ? new PageTransitionEvent(name) : new Event(name);
    const target = name === "freeze" || name === "resume" ? document : window;
    target.dispatchEvent(event);
  }, eventName);
}

function assertCanvasRenderLoopState(actual, expected, label) {
  if (
    actual?.motion !== expected.motion ||
    actual?.renderLoop !== expected.renderLoop ||
    actual?.reason !== expected.reason
  ) {
    failures.push(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

async function expectCanvasViewportSize(page, expectedViewport, label) {
  try {
    const result = await page.locator("canvas").first().evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      };
    });
    const expectedWidth = Math.min(expectedViewport.width, result.viewportWidth);
    const expectedHeight = Math.min(expectedViewport.height, result.viewportHeight);
    if (Math.abs(result.width - expectedWidth) > 2 || Math.abs(result.height - expectedHeight) > 2) {
      failures.push(
        `${label} does not match viewport: canvas ${Math.round(result.width)}x${Math.round(
          result.height
        )}, viewport ${result.viewportWidth}x${result.viewportHeight}, expected ${expectedWidth}x${expectedHeight}`
      );
    }
  } catch (error) {
    failures.push(`${label} size check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`preview server exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        if (server.exitCode !== null) {
          throw new Error(`preview server exited with code ${server.exitCode}`);
        }
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
  }
  throw new Error(`preview server did not become ready: ${lastError instanceof Error ? lastError.message : "timeout"}`);
}

async function findAvailablePort() {
  return await new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once("error", rejectPort);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
        } else {
          rejectPort(new Error("Could not allocate runtime smoke port."));
        }
      });
    });
  });
}

function isIgnoredConsoleMessage(text) {
  return (
    (text.includes("Failed to load resource: the server responded with a status of 404") && text.includes("favicon")) ||
    text.includes("Failed to load resource: net::ERR_NETWORK_IO_SUSPENDED") ||
    text.includes("GL Driver Message") ||
    text.includes("GPU stall due to ReadPixels")
  );
}

function isIgnoredNetworkFailure(url, errorText) {
  return (
    errorText === "net::ERR_NETWORK_IO_SUSPENDED" &&
    (url.includes("/assets/") || url.endsWith("/index.html") || url === baseUrl || url === `${baseUrl}/`)
  );
}

function inspectPngPixels(buffer) {
  const png = parsePng(buffer);
  if (!png) {
    return { ok: false, reason: "canvas screenshot is not a readable PNG" };
  }
  if (![2, 6].includes(png.colorType) || png.bitDepth !== 8) {
    return { ok: false, reason: `unsupported PNG format: bitDepth ${png.bitDepth}, colorType ${png.colorType}` };
  }

  const channels = png.colorType === 6 ? 4 : 3;
  const pixels = unfilterScanlines(png.data, png.width, png.height, channels);
  const sampleWidth = Math.min(png.width, 96);
  const sampleHeight = Math.min(png.height, 96);
  const stepX = Math.max(1, Math.floor(png.width / sampleWidth));
  const stepY = Math.max(1, Math.floor(png.height / sampleHeight));
  const colors = new Set();
  let visibleSamples = 0;

  for (let y = 0; y < png.height; y += stepY) {
    for (let x = 0; x < png.width; x += stepX) {
      const offset = (y * png.width + x) * channels;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = channels === 4 ? pixels[offset + 3] : 255;
      if (alpha > 0) {
        visibleSamples += 1;
        colors.add(`${red},${green},${blue},${alpha}`);
      }
      if (colors.size >= 8 && visibleSamples >= 32) {
        return { ok: true, colors: colors.size, visibleSamples };
      }
    }
  }

  return { ok: false, reason: `low pixel variety: ${colors.size} colors, ${visibleSamples} visible samples` };
}

function parsePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    return null;
  }

  let offset = 8;
  let header;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12]
      };
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  if (!header || idat.length === 0 || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    return null;
  }

  return {
    ...header,
    data: inflateSync(Buffer.concat(idat))
  };
}

function unfilterScanlines(scanlines, width, height, channels) {
  const rowLength = width * channels;
  const output = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    const inputRow = y * (1 + rowLength);
    const outputRow = y * rowLength;
    const previousRow = y > 0 ? outputRow - rowLength : null;
    const filter = scanlines[inputRow];
    for (let x = 0; x < rowLength; x += 1) {
      const raw = scanlines[inputRow + 1 + x];
      const left = x >= channels ? output[outputRow + x - channels] : 0;
      const up = previousRow !== null ? output[previousRow + x] : 0;
      const upLeft = previousRow !== null && x >= channels ? output[previousRow + x - channels] : 0;
      if (filter === 0) {
        output[outputRow + x] = raw;
      } else if (filter === 1) {
        output[outputRow + x] = (raw + left) & 0xff;
      } else if (filter === 2) {
        output[outputRow + x] = (raw + up) & 0xff;
      } else if (filter === 3) {
        output[outputRow + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        output[outputRow + x] = (raw + paeth(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG row filter: ${filter}`);
      }
    }
  }
  return output;
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function printReport() {
  console.log("");
  console.log("Runtime smoke check");
  console.log("===================");
  if (failures.length === 0) {
    console.log(`PASS: production preview rendered without runtime errors. Screenshots: ${outputDir}`);
  } else {
    console.log("FAIL");
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  }
}
