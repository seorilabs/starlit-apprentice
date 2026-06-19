import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const appId = "starlit-apprentice";
const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const appPublicDir = resolve(repoRoot, "apps/starlit-apprentice/public");
const screenshotDir = resolve(appPublicDir, "screenshots");
const output = {
  logo: resolve(appPublicDir, `${appId}-icon-600.png`),
  thumbnail: resolve(appPublicDir, `${appId}-thumbnail-1932x828.png`),
  start: resolve(screenshotDir, `${appId}-start-636x1048.png`),
  main: resolve(screenshotDir, `${appId}-main-636x1048.png`),
  result: resolve(screenshotDir, `${appId}-result-636x1048.png`)
};
const port = Number(process.env.STARLIT_ASSET_PORT ?? 5327);
const baseUrl = `http://127.0.0.1:${port}`;

mkdirSync(screenshotDir, { recursive: true });
for (const path of Object.values(output)) {
  mkdirSync(dirname(path), { recursive: true });
}

const server = spawn(
  "pnpm",
  ["--dir", "apps/starlit-apprentice", "exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  }
);
server.stdout.on("data", (chunk) => process.stdout.write(`[asset-server] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[asset-server] ${chunk}`));

try {
  await waitForServer(baseUrl);
  const browser = await chromium.launch();
  try {
    await captureAppScreens(browser);
    await renderLogo(browser);
    await renderThumbnail(browser);
  } finally {
    await browser.close();
  }
  console.log(`Generated AppsInToss registration images in ${appPublicDir}`);
} finally {
  server.kill("SIGTERM");
}

async function captureAppScreens(browser) {
  const context = await browser.newContext({
    viewport: { width: 636, height: 1048 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.screenshot({ path: output.start, fullPage: false, omitBackground: false });

  await page.getByTestId("new-run").click();
  await page.getByTestId("apprentice-stage").waitFor({ state: "visible" });
  await page.screenshot({ path: output.main, fullPage: false, omitBackground: false });

  await page.getByTestId("open-schedule").click();
  await completeMonth(page);
  await page.getByTestId("monthly-coaching").scrollIntoViewIfNeeded();
  await hideStickyActionsForScreenshot(page);
  await page.screenshot({ path: output.result, fullPage: false, omitBackground: false });

  await context.close();
}

async function completeMonth(page) {
  await page.getByTestId("action-star-lore").click();
  await page.getByTestId("action-letters").click();
  await page.getByRole("button", { name: "휴식" }).click();
  await page.getByTestId("action-home-rest").click();
  await page.getByRole("button", { name: "외출" }).click();
  await page.getByTestId("action-park").click();
  await page.getByTestId("confirm-schedule").click();

  for (let slot = 0; slot < 4; slot += 1) {
    await page.getByTestId("finish-activity").click();
    await page.getByTestId("result-deltas").waitFor({ state: "visible" });
    if (slot < 3) {
      await page.getByTestId("next-action").click();
    }
  }

  await page.getByTestId("monthly-coaching").waitFor({ state: "visible" });
}

async function hideStickyActionsForScreenshot(page) {
  await page.addStyleTag({ content: ".sticky-actions { display: none !important; }" });
}

async function renderLogo(browser) {
  const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              width: 600px;
              height: 600px;
              overflow: hidden;
              background: #14213d;
            }
            body {
              display: grid;
              place-items: center;
              font-family: Inter, system-ui, sans-serif;
            }
            .mark {
              position: relative;
              width: 600px;
              height: 600px;
              background:
                linear-gradient(180deg, #14213d 0%, #203d5d 54%, #2a6f6c 55%, #2a6f6c 100%);
            }
            .star {
              position: absolute;
              left: 210px;
              top: 82px;
              width: 180px;
              height: 180px;
              clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%);
              background: #f6c85f;
              image-rendering: pixelated;
            }
            .hat {
              position: absolute;
              left: 166px;
              top: 248px;
              width: 268px;
              height: 84px;
              background: #6d5dd3;
              box-shadow: 0 24px 0 #5146a9, 0 42px 0 #f8ad9d;
            }
            .hat:before {
              content: "";
              position: absolute;
              left: 82px;
              top: -92px;
              width: 104px;
              height: 104px;
              background: #6d5dd3;
              clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
            }
            .face {
              position: absolute;
              left: 214px;
              top: 338px;
              width: 172px;
              height: 134px;
              background: #ffd7a8;
            }
            .eye {
              position: absolute;
              top: 390px;
              width: 18px;
              height: 18px;
              background: #111827;
            }
            .eye.left { left: 254px; }
            .eye.right { left: 328px; }
            .spark {
              position: absolute;
              width: 16px;
              height: 16px;
              background: #f7f1d5;
            }
            .spark.a { left: 80px; top: 134px; }
            .spark.b { left: 490px; top: 184px; }
            .spark.c { left: 94px; top: 450px; }
            .spark.d { left: 470px; top: 438px; }
          </style>
        </head>
        <body>
          <div class="mark">
            <div class="star"></div>
            <div class="hat"></div>
            <div class="face"></div>
            <div class="eye left"></div>
            <div class="eye right"></div>
            <div class="spark a"></div>
            <div class="spark b"></div>
            <div class="spark c"></div>
            <div class="spark d"></div>
          </div>
        </body>
      </html>`,
    { waitUntil: "load" }
  );
  await page.screenshot({ path: output.logo, fullPage: false, omitBackground: false });
  await page.close();
}

async function renderThumbnail(browser) {
  const page = await browser.newPage({ viewport: { width: 1932, height: 828 }, deviceScaleFactor: 1 });
  const startImage = imageDataUrl(output.start);
  const mainImage = imageDataUrl(output.main);
  const resultImage = imageDataUrl(output.result);
  await page.setContent(
    `<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              width: 1932px;
              height: 828px;
              overflow: hidden;
              background: #101828;
              font-family: Inter, system-ui, sans-serif;
            }
            .thumb {
              position: relative;
              width: 1932px;
              height: 828px;
              background:
                linear-gradient(180deg, #162447 0%, #1d3557 48%, #2a6f6c 49%, #2a6f6c 100%);
            }
            .stars {
              position: absolute;
              inset: 0;
              background-image:
                radial-gradient(#f6c85f 0 4px, transparent 5px),
                radial-gradient(#f7f1d5 0 3px, transparent 4px);
              background-position: 90px 80px, 180px 130px;
              background-size: 180px 120px, 220px 140px;
              opacity: 0.82;
            }
            .copy {
              position: absolute;
              left: 112px;
              top: 130px;
              width: 520px;
              color: #f8fafc;
            }
            .copy h1 {
              margin: 0 0 22px;
              color: #f8fafc;
              font-size: 86px;
              line-height: 1;
              letter-spacing: 0;
            }
            .copy p {
              margin: 0;
              color: #e5eef7;
              font-size: 34px;
              line-height: 1.35;
              font-weight: 800;
            }
            .phone {
              position: absolute;
              overflow: hidden;
              width: 360px;
              height: 594px;
              border-radius: 28px;
              box-shadow: 0 30px 70px rgba(0, 0, 0, 0.38);
              background: #0f172a;
            }
            .phone img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              object-position: top center;
            }
            .phone.start {
              left: 690px;
              top: 126px;
              transform: rotate(-4deg);
            }
            .phone.main {
              left: 1032px;
              top: 72px;
              width: 410px;
              height: 676px;
              transform: rotate(2deg);
              z-index: 2;
            }
            .phone.result {
              left: 1410px;
              top: 132px;
              transform: rotate(5deg);
            }
            .badge {
              position: absolute;
              left: 112px;
              top: 560px;
              display: flex;
              gap: 18px;
            }
            .badge span {
              padding: 15px 22px;
              background: #f6c85f;
              color: #172033;
              font-size: 24px;
              font-weight: 950;
            }
          </style>
        </head>
        <body>
          <div class="thumb">
            <div class="stars"></div>
            <div class="copy">
              <h1>별빛 견습생</h1>
              <p>4주 일정을 정해<br />견습생의 미래를 여는<br />픽셀 육성 시뮬레이션</p>
            </div>
            <div class="badge"><span>월간 일정</span><span>멀티 엔딩</span></div>
            <div class="phone start"><img alt="" src="${startImage}" /></div>
            <div class="phone main"><img alt="" src="${mainImage}" /></div>
            <div class="phone result"><img alt="" src="${resultImage}" /></div>
          </div>
        </body>
      </html>`,
    { waitUntil: "load" }
  );
  await page.screenshot({ path: output.thumbnail, fullPage: false, omitBackground: false });
  await page.close();
}

async function waitForServer(url) {
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 350));
  }
  throw new Error(`dev server did not become ready: ${lastError instanceof Error ? lastError.message : "timeout"}`);
}

function imageDataUrl(path) {
  return `data:image/png;base64,${readFileSync(path).toString("base64")}`;
}
