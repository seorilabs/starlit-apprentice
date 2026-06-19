import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

const appId = "starlit-apprentice";
const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const port = Number(process.env.STARLIT_STORE_ASSET_PORT ?? 5328);
const baseUrl = `http://127.0.0.1:${port}`;
let crcTable;

const states = ["start", "main", "schedule", "result"];
const output = {
  playIcon: resolve(repoRoot, "play-store/assets/icon-512.png"),
  playFeature: resolve(repoRoot, "play-store/assets/feature-graphic-1024x500.png"),
  appStoreIcon: resolve(repoRoot, "app-store/assets/starlit-apprentice-store-icon-1024.png"),
  playPhone: paths("play-store/screenshots/phone", "1080x1920"),
  playTablet7: paths("play-store/screenshots/tablet-7", "1440x2560"),
  playTablet10: paths("play-store/screenshots/tablet-10", "1800x3200"),
  appStoreIphone69: paths("app-store/screenshots/iphone-6-9", "1290x2796"),
  appStoreIpad13: paths("app-store/screenshots/ipad-13", "2048x2732")
};

for (const path of [
  output.playIcon,
  output.playFeature,
  output.appStoreIcon,
  ...Object.values(output.playPhone),
  ...Object.values(output.playTablet7),
  ...Object.values(output.playTablet10),
  ...Object.values(output.appStoreIphone69),
  ...Object.values(output.appStoreIpad13)
]) {
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
server.stdout.on("data", (chunk) => process.stdout.write(`[store-asset-server] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[store-asset-server] ${chunk}`));

try {
  await waitForServer(baseUrl);
  const browser = await chromium.launch();
  try {
    await captureAppScreens(browser, {
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 3,
      outputPaths: output.playPhone
    });
    await captureAppScreens(browser, {
      viewport: { width: 720, height: 1280 },
      deviceScaleFactor: 2,
      outputPaths: output.playTablet7
    });
    await captureAppScreens(browser, {
      viewport: { width: 900, height: 1600 },
      deviceScaleFactor: 2,
      outputPaths: output.playTablet10
    });
    await captureAppScreens(browser, {
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 3,
      outputPaths: output.appStoreIphone69
    });
    await captureAppScreens(browser, {
      viewport: { width: 1024, height: 1366 },
      deviceScaleFactor: 2,
      outputPaths: output.appStoreIpad13
    });

    await renderIcon(browser, { size: 512, path: output.playIcon, omitBackground: true });
    convertPngRgbToRgba(output.playIcon);
    await renderIcon(browser, { size: 1024, path: output.appStoreIcon, omitBackground: false });
    await renderPlayFeatureGraphic(browser);
  } finally {
    await browser.close();
  }
  console.log("Generated Google Play and App Store assets.");
} finally {
  server.kill("SIGTERM");
}

function paths(dir, suffix) {
  return Object.fromEntries(
    states.map((state) => [
      state,
      resolve(repoRoot, `${dir}/${appId}-${state}-${suffix}.png`)
    ])
  );
}

async function captureAppScreens(browser, { viewport, deviceScaleFactor, outputPaths }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("canvas").waitFor({ state: "visible" });
  await page.screenshot({ path: outputPaths.start, fullPage: false, omitBackground: false });

  await page.getByTestId("new-run").click();
  await page.getByTestId("apprentice-stage").waitFor({ state: "visible" });
  await page.screenshot({ path: outputPaths.main, fullPage: false, omitBackground: false });

  await page.getByTestId("open-schedule").click();
  await page.getByTestId("confirm-schedule").waitFor({ state: "visible" });
  await page.screenshot({ path: outputPaths.schedule, fullPage: false, omitBackground: false });

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
  await page.getByTestId("monthly-coaching").scrollIntoViewIfNeeded();
  await page.addStyleTag({ content: ".sticky-actions { display: none !important; }" });
  await page.screenshot({ path: outputPaths.result, fullPage: false, omitBackground: false });

  await context.close();
}

async function renderIcon(browser, { size, path, omitBackground }) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              width: ${size}px;
              height: ${size}px;
              overflow: hidden;
              background: ${omitBackground ? "transparent" : "#14213d"};
            }
            body {
              display: grid;
              place-items: center;
              font-family: Inter, system-ui, sans-serif;
            }
            .mark {
              position: relative;
              width: ${size}px;
              height: ${size}px;
              background:
                linear-gradient(180deg, #14213d 0%, #203d5d 54%, #2a6f6c 55%, #2a6f6c 100%);
            }
            .star {
              position: absolute;
              left: 35%;
              top: 13.7%;
              width: 30%;
              height: 30%;
              clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%);
              background: #f6c85f;
              image-rendering: pixelated;
            }
            .hat {
              position: absolute;
              left: 27.7%;
              top: 41.3%;
              width: 44.6%;
              height: 14%;
              background: #6d5dd3;
              box-shadow: 0 ${size * 0.04}px 0 #5146a9, 0 ${size * 0.07}px 0 #f8ad9d;
            }
            .hat:before {
              content: "";
              position: absolute;
              left: 30.6%;
              top: -109.5%;
              width: 38.8%;
              height: 123.8%;
              background: #6d5dd3;
              clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
            }
            .face {
              position: absolute;
              left: 35.7%;
              top: 56.3%;
              width: 28.7%;
              height: 22.3%;
              background: #ffd7a8;
            }
            .eye {
              position: absolute;
              top: 65%;
              width: 3%;
              height: 3%;
              background: #111827;
            }
            .eye.left { left: 42.3%; }
            .eye.right { left: 54.7%; }
            .spark {
              position: absolute;
              width: 2.7%;
              height: 2.7%;
              background: #f7f1d5;
            }
            .spark.a { left: 13.3%; top: 22.3%; }
            .spark.b { left: 81.7%; top: 30.7%; }
            .spark.c { left: 15.7%; top: 75%; }
            .spark.d { left: 78.3%; top: 73%; }
            .alpha-anchor {
              position: fixed;
              left: 0;
              top: 0;
              width: 1px;
              height: 1px;
              background: rgba(20, 33, 61, 0.995);
            }
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
          ${omitBackground ? '<div class="alpha-anchor"></div>' : ""}
        </body>
      </html>`,
    { waitUntil: "load" }
  );
  await page.screenshot({ path, fullPage: false, omitBackground });
  await page.close();
}

async function renderPlayFeatureGraphic(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const startImage = imageDataUrl(output.playPhone.start);
  const mainImage = imageDataUrl(output.playPhone.main);
  const resultImage = imageDataUrl(output.playPhone.result);
  await page.setContent(
    `<!doctype html>
      <html lang="ko">
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              width: 1024px;
              height: 500px;
              overflow: hidden;
              background: #203d5d;
              font-family: Inter, system-ui, sans-serif;
            }
            .feature {
              position: relative;
              width: 1024px;
              height: 500px;
              background:
                linear-gradient(180deg, #15284a 0%, #203d5d 54%, #2a6f6c 55%, #2a6f6c 100%);
            }
            .stars {
              position: absolute;
              inset: 0;
              background-image:
                radial-gradient(#f6c85f 0 3px, transparent 4px),
                radial-gradient(#f7f1d5 0 2px, transparent 3px);
              background-position: 52px 48px, 118px 82px;
              background-size: 120px 90px, 150px 100px;
              opacity: 0.82;
            }
            .copy {
              position: absolute;
              left: 58px;
              top: 76px;
              width: 340px;
              color: #f8fafc;
            }
            h1 {
              margin: 0 0 18px;
              color: #f8fafc;
              font-size: 56px;
              line-height: 1;
              letter-spacing: 0;
            }
            p {
              margin: 0;
              color: #e5eef7;
              font-size: 24px;
              line-height: 1.35;
              font-weight: 850;
            }
            .badge {
              position: absolute;
              left: 58px;
              top: 350px;
              display: flex;
              gap: 10px;
            }
            .badge span {
              padding: 10px 14px;
              background: #f6c85f;
              color: #172033;
              font-size: 17px;
              font-weight: 950;
            }
            .screen {
              position: absolute;
              overflow: hidden;
              width: 190px;
              height: 338px;
              box-shadow: 0 24px 46px rgba(0, 0, 0, 0.3);
              background: #0f172a;
            }
            .screen img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              object-position: top center;
            }
            .screen.start {
              left: 434px;
              top: 92px;
              transform: rotate(-4deg);
            }
            .screen.main {
              left: 594px;
              top: 58px;
              width: 220px;
              height: 391px;
              transform: rotate(1.5deg);
              z-index: 2;
            }
            .screen.result {
              left: 778px;
              top: 98px;
              transform: rotate(4deg);
            }
          </style>
        </head>
        <body>
          <div class="feature">
            <div class="stars"></div>
            <div class="copy">
              <h1>별빛 견습생</h1>
              <p>월간 일정으로 만드는<br />30가지 미래</p>
            </div>
            <div class="badge"><span>육성</span><span>선택</span><span>멀티 엔딩</span></div>
            <div class="screen start"><img alt="" src="${startImage}" /></div>
            <div class="screen main"><img alt="" src="${mainImage}" /></div>
            <div class="screen result"><img alt="" src="${resultImage}" /></div>
          </div>
        </body>
      </html>`,
    { waitUntil: "load" }
  );
  await page.screenshot({ path: output.playFeature, fullPage: false, omitBackground: false });
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

function convertPngRgbToRgba(path) {
  const source = readFileSync(path);
  const png = parsePng(source);
  if (png.ihdr.colorType === 6) {
    return;
  }
  if (
    png.ihdr.bitDepth !== 8 ||
    png.ihdr.colorType !== 2 ||
    png.ihdr.compression !== 0 ||
    png.ihdr.filter !== 0 ||
    png.ihdr.interlace !== 0
  ) {
    throw new Error(`Cannot convert PNG to RGBA: unsupported format in ${path}`);
  }

  const rgb = unfilterRgbScanlines(inflateSync(Buffer.concat(png.idat)), png.ihdr.width, png.ihdr.height);
  const rgbaScanlines = Buffer.alloc(png.ihdr.height * (1 + png.ihdr.width * 4));
  for (let y = 0; y < png.ihdr.height; y += 1) {
    const outRow = y * (1 + png.ihdr.width * 4);
    const inRow = y * png.ihdr.width * 3;
    rgbaScanlines[outRow] = 0;
    for (let x = 0; x < png.ihdr.width; x += 1) {
      const input = inRow + x * 3;
      const outputIndex = outRow + 1 + x * 4;
      rgbaScanlines[outputIndex] = rgb[input];
      rgbaScanlines[outputIndex + 1] = rgb[input + 1];
      rgbaScanlines[outputIndex + 2] = rgb[input + 2];
      rgbaScanlines[outputIndex + 3] = 255;
    }
  }

  const ihdr = Buffer.from(png.ihdr.raw);
  ihdr[9] = 6;
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(rgbaScanlines)),
      pngChunk("IEND", Buffer.alloc(0))
    ])
  );
}

function parsePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("Invalid PNG signature.");
  }

  let offset = 8;
  let ihdr;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      ihdr = {
        raw: Buffer.from(data),
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
  if (!ihdr || idat.length === 0) {
    throw new Error("PNG missing IHDR or IDAT chunk.");
  }
  return { ihdr, idat };
}

function unfilterRgbScanlines(scanlines, width, height) {
  const bpp = 3;
  const rowLength = width * bpp;
  const outputBuffer = Buffer.alloc(width * height * bpp);
  for (let y = 0; y < height; y += 1) {
    const inputRow = y * (1 + rowLength);
    const outputRow = y * rowLength;
    const previousRow = y > 0 ? outputRow - rowLength : null;
    const filter = scanlines[inputRow];
    for (let x = 0; x < rowLength; x += 1) {
      const raw = scanlines[inputRow + 1 + x];
      const left = x >= bpp ? outputBuffer[outputRow + x - bpp] : 0;
      const up = previousRow !== null ? outputBuffer[previousRow + x] : 0;
      const upLeft = previousRow !== null && x >= bpp ? outputBuffer[previousRow + x - bpp] : 0;
      if (filter === 0) {
        outputBuffer[outputRow + x] = raw;
      } else if (filter === 1) {
        outputBuffer[outputRow + x] = (raw + left) & 0xff;
      } else if (filter === 2) {
        outputBuffer[outputRow + x] = (raw + up) & 0xff;
      } else if (filter === 3) {
        outputBuffer[outputRow + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        outputBuffer[outputRow + x] = (raw + paeth(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG row filter: ${filter}`);
      }
    }
  }
  return outputBuffer;
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

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable() {
  if (crcTable) {
    return crcTable;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  crcTable = table;
  return table;
}
