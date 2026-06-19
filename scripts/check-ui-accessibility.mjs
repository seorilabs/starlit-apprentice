import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const port = Number(process.env.STARLIT_UI_ACCESSIBILITY_PORT ?? (await findAvailablePort()));
const baseUrl = `http://127.0.0.1:${port}`;
const failures = [];

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
server.stdout.on("data", (chunk) => process.stdout.write(`[ui-a11y-server] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[ui-a11y-server] ${chunk}`));

try {
  checkStaticCss();
  await waitForServer(baseUrl);
  const browser = await chromium.launch();
  try {
    await checkViewport(browser, {
      label: "mobile-360",
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
      minTarget: 44
    });
    await checkViewport(browser, {
      label: "desktop-1280",
      viewport: { width: 1280, height: 900 },
      isMobile: false,
      hasTouch: false,
      minTarget: 32
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

async function checkViewport(browser, options) {
  const context = await browser.newContext({
    viewport: options.viewport,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch,
    deviceScaleFactor: options.isMobile ? 2 : 1,
    reducedMotion: "reduce"
  });
  const page = await context.newPage();

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle" });
    await checkCurrentScreen(page, `${options.label} title`, options.minTarget);

    await page.getByTestId("new-run").click();
    await waitVisible(page, "[data-testid='apprentice-profile']", `${options.label} room`);
    await checkCurrentScreen(page, `${options.label} room`, options.minTarget);

    await page.getByTestId("open-schedule").click();
    await waitVisible(page, "[data-testid='schedule-guidance']", `${options.label} schedule`);
    await checkCurrentScreen(page, `${options.label} schedule empty`, options.minTarget);

    await page.getByTestId("action-star-lore").click();
    await page.getByTestId("action-letters").click();
    await page.getByRole("button", { name: "휴식" }).click();
    await page.getByTestId("action-home-rest").click();
    await page.getByRole("button", { name: "외출" }).click();
    await page.getByTestId("action-park").click();
    await checkCurrentScreen(page, `${options.label} schedule filled`, options.minTarget);
    await page.getByTestId("confirm-schedule").click();

    await waitVisible(page, "[data-testid='activity-screen']", `${options.label} activity`);
    await checkCurrentScreen(page, `${options.label} activity`, options.minTarget);
    await page.getByTestId("finish-activity").click();
    await waitVisible(page, "[data-testid='result-deltas']", `${options.label} result`);
    await checkCurrentScreen(page, `${options.label} result`, options.minTarget);

    await page.goto(`${baseUrl}/?ending=scholar`, { waitUntil: "networkidle" });
    await waitVisible(page, "[data-testid='ending-card']", `${options.label} ending`);
    await checkCurrentScreen(page, `${options.label} shared ending`, options.minTarget);
    await page.getByTestId("open-collection").click();
    await waitVisible(page, "[data-testid='collection-grid']", `${options.label} collection`);
    await checkCurrentScreen(page, `${options.label} collection`, options.minTarget);
  } catch (error) {
    failures.push(`${options.label} accessibility path failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await context.close();
  }
}

function checkStaticCss() {
  const css = readFileSync(resolve(repoRoot, "apps/starlit-apprentice/src/styles.css"), "utf8");
  if (!css.includes(":focus-visible") || !css.includes("outline")) {
    failures.push("styles.css must define visible keyboard focus styles.");
  }
  if (!css.includes("prefers-reduced-motion: reduce")) {
    failures.push("styles.css must define reduced-motion handling.");
  }
}

async function checkCurrentScreen(page, label, minTarget) {
  await checkInteractiveElements(page, label, minTarget);
  await checkStickyActionsViewport(page, label);
  await checkTextContrast(page, label);
  await checkReducedMotionCanvasStability(page, label);
  await checkImages(page, label);
  await checkKeyboardFocus(page, label);
}

async function checkInteractiveElements(page, label, minTarget) {
  const result = await page.evaluate((targetSize) => {
    const selectors = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[tabindex]:not([tabindex='-1'])"
    ];
    const issues = [];
    const elements = [...document.querySelectorAll(selectors.join(","))];

    for (const element of elements) {
      if (!(element instanceof HTMLElement) || !isVisible(element)) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
      const name = getAccessibleName(element);
      if (!name) {
        issues.push(`${describeElement(element)} has no accessible name.`);
      }
      if (!disabled && (rect.width < targetSize || rect.height < targetSize)) {
        issues.push(
          `${describeElement(element)} target is too small: ${Math.round(rect.width)} x ${Math.round(rect.height)}`
        );
      }
    }

    return { ok: issues.length === 0, issues };

    function isVisible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function getAccessibleName(element) {
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const text = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
          .join(" ")
          .trim();
        if (text) {
          return text;
        }
      }
      return (
        element.getAttribute("aria-label")?.trim() ||
        element.getAttribute("title")?.trim() ||
        element.textContent?.trim() ||
        element.getAttribute("value")?.trim() ||
        ""
      );
    }

    function describeElement(element) {
      const tag = element.tagName.toLowerCase();
      const testId = element.getAttribute("data-testid");
      const text = element.textContent?.trim();
      if (testId) {
        return `${tag}[data-testid="${testId}"]`;
      }
      if (text) {
        return `${tag}[text="${text.slice(0, 24)}"]`;
      }
      return tag;
    }
  }, minTarget);

  if (!result.ok) {
    failures.push(`${label} interactive accessibility failed:\n${result.issues.map((issue) => `  - ${issue}`).join("\n")}`);
  }
}

async function checkStickyActionsViewport(page, label) {
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

    const controls = [...bar.querySelectorAll("button, a[href], [role='button']")].filter(
      (element) => element instanceof HTMLElement && isVisible(element) && !element.matches(":disabled")
    );
    for (const control of controls) {
      const controlRect = control.getBoundingClientRect();
      const centerX = Math.round(controlRect.left + controlRect.width / 2);
      const centerY = Math.round(controlRect.top + controlRect.height / 2);
      const topElement = document.elementFromPoint(centerX, centerY);
      if (!topElement || !control.contains(topElement)) {
        issues.push(`${describeElement(control)} center is occluded by ${describeElement(topElement)}`);
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

    function describeElement(element) {
      if (!(element instanceof Element)) {
        return "none";
      }
      const tag = element.tagName.toLowerCase();
      const testId = element.getAttribute("data-testid");
      const text = element.textContent?.trim();
      if (testId) {
        return `${tag}[data-testid="${testId}"]`;
      }
      if (text) {
        return `${tag}[text="${text.slice(0, 24)}"]`;
      }
      return tag;
    }
  });

  if (!result.ok) {
    failures.push(`${label} sticky action viewport failed:\n${result.issues.map((issue) => `  - ${issue}`).join("\n")}`);
  }
}

async function checkTextContrast(page, label) {
  const result = await page.evaluate(() => {
    const issues = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text) {
        continue;
      }
      const element = node.parentElement;
      if (!(element instanceof HTMLElement) || shouldSkipTextElement(element)) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      range.detach();
      if (rects.length === 0) {
        continue;
      }

      const style = window.getComputedStyle(element);
      const foreground = parseCssColor(style.color);
      if (!foreground || foreground.a === 0) {
        continue;
      }
      const background = getEffectiveBackground(element);
      const compositedForeground = compositeColor(foreground, background);
      const ratio = contrastRatio(compositedForeground, background);
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = parseFontWeight(style.fontWeight);
      const threshold = isLargeText(fontSize, fontWeight) ? 3 : 4.5;
      if (ratio + 0.01 < threshold) {
        issues.push(
          `${describeElement(element)} text "${text.slice(0, 28)}" contrast ${ratio.toFixed(2)} below ${threshold.toFixed(1)}`
        );
      }
    }

    return { ok: issues.length === 0, issues: issues.slice(0, 20) };

    function shouldSkipTextElement(element) {
      if (element.closest("[aria-hidden='true'], button:disabled, [aria-disabled='true']")) {
        return true;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        rect.width <= 0 ||
        rect.height <= 0
      );
    }

    function getEffectiveBackground(element) {
      const base = parseCssColor(window.getComputedStyle(document.body).backgroundColor) ?? {
        r: 17,
        g: 24,
        b: 39,
        a: 1
      };
      let background = { ...base, a: 1 };
      const stack = [];
      let current = element;
      while (current instanceof HTMLElement) {
        stack.unshift(current);
        current = current.parentElement;
      }
      for (const entry of stack) {
        const color = parseCssColor(window.getComputedStyle(entry).backgroundColor);
        if (color && color.a > 0) {
          background = compositeColor(color, background);
        }
      }
      return { ...background, a: 1 };
    }

    function parseCssColor(value) {
      const match = value.match(/^rgba?\(([^)]+)\)$/);
      if (!match) {
        return undefined;
      }
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length < 3) {
        return undefined;
      }
      const r = Number.parseFloat(parts[0]);
      const g = Number.parseFloat(parts[1]);
      const b = Number.parseFloat(parts[2]);
      const a = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
      if (![r, g, b, a].every(Number.isFinite)) {
        return undefined;
      }
      return { r, g, b, a: Math.max(0, Math.min(1, a)) };
    }

    function compositeColor(foreground, background) {
      const alpha = foreground.a + background.a * (1 - foreground.a);
      if (alpha === 0) {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha,
        a: alpha
      };
    }

    function contrastRatio(first, second) {
      const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
      const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
      return (lighter + 0.05) / (darker + 0.05);
    }

    function relativeLuminance(color) {
      const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function parseFontWeight(value) {
      if (value === "bold") {
        return 700;
      }
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : 400;
    }

    function isLargeText(fontSize, fontWeight) {
      return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    }

    function describeElement(element) {
      const tag = element.tagName.toLowerCase();
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return `${tag}[data-testid="${testId}"]`;
      }
      return tag;
    }
  });

  if (!result.ok) {
    failures.push(`${label} text contrast failed:\n${result.issues.map((issue) => `  - ${issue}`).join("\n")}`);
  }
}

async function checkReducedMotionCanvasStability(page, label) {
  try {
    const before = await readCanvasSnapshot(page);
    if (!before) {
      return;
    }
    const motionState = await readCanvasMotionState(page);
    if (motionState?.motion !== "reduced" || motionState?.renderLoop !== "paused") {
      failures.push(
        `${label} reduced-motion canvas render loop must be paused, got motion=${motionState?.motion ?? "missing"} renderLoop=${motionState?.renderLoop ?? "missing"}.`
      );
    }
    await page.waitForTimeout(280);
    const after = await readCanvasSnapshot(page);
    if (!after) {
      failures.push(`${label} reduced-motion canvas disappeared before stability check.`);
      return;
    }
    if (before !== after) {
      failures.push(`${label} reduced-motion canvas changed while animations should be stable.`);
    }
  } catch (error) {
    failures.push(`${label} reduced-motion canvas stability check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readCanvasMotionState(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return undefined;
    }
    return {
      motion: canvas.dataset.motion,
      renderLoop: canvas.dataset.renderLoop
    };
  });
}

async function readCanvasSnapshot(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0 || canvas.height === 0) {
      return undefined;
    }
    return canvas.toDataURL("image/png");
  });
}

async function checkImages(page, label) {
  const result = await page.evaluate(() => {
    const issues = [];
    for (const image of [...document.images]) {
      if (!image.hasAttribute("alt")) {
        issues.push(`img ${image.currentSrc || image.src} is missing alt.`);
      }
    }
    return { ok: issues.length === 0, issues };
  });

  if (!result.ok) {
    failures.push(`${label} image accessibility failed:\n${result.issues.map((issue) => `  - ${issue}`).join("\n")}`);
  }
}

async function checkKeyboardFocus(page, label) {
  try {
    await page.keyboard.press("Tab");
    const result = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement) || element === document.body) {
        return { ok: false, issue: "Tab did not focus an interactive element." };
      }
      const style = window.getComputedStyle(element);
      const outlineWidth = Number.parseFloat(style.outlineWidth);
      const hasOutline = style.outlineStyle !== "none" && Number.isFinite(outlineWidth) && outlineWidth >= 2;
      const hasShadow = style.boxShadow !== "none";
      return {
        ok: hasOutline || hasShadow,
        issue: `Focused ${element.tagName.toLowerCase()} has no visible outline or shadow.`
      };
    });
    if (!result.ok) {
      failures.push(`${label} keyboard focus failed: ${result.issue}`);
    }
  } catch (error) {
    failures.push(`${label} keyboard focus check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function waitVisible(page, selector, label) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 10_000 }).catch((error) => {
    throw new Error(`${label} did not become visible: ${error instanceof Error ? error.message : String(error)}`);
  });
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
          rejectPort(new Error("Could not allocate UI accessibility port."));
        }
      });
    });
  });
}

function printReport() {
  console.log("UI accessibility check");
  console.log("======================");
  console.log("");
  if (failures.length === 0) {
    console.log("Failures");
    console.log("- none");
    console.log("");
    console.log("UI accessibility checks: PASS");
    return;
  }
  console.log("Failures");
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
  console.log("");
  console.log("UI accessibility checks: FAIL");
}
