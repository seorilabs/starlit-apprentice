import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const checkMode = process.argv.includes("--check");

const androidTargets = [
  ["drawable/splash.png", 480, 320],
  ["drawable-port-mdpi/splash.png", 320, 480],
  ["drawable-port-hdpi/splash.png", 480, 800],
  ["drawable-port-xhdpi/splash.png", 720, 1280],
  ["drawable-port-xxhdpi/splash.png", 960, 1600],
  ["drawable-port-xxxhdpi/splash.png", 1280, 1920],
  ["drawable-land-mdpi/splash.png", 480, 320],
  ["drawable-land-hdpi/splash.png", 800, 480],
  ["drawable-land-xhdpi/splash.png", 1280, 720],
  ["drawable-land-xxhdpi/splash.png", 1600, 960],
  ["drawable-land-xxxhdpi/splash.png", 1920, 1280]
].map(([relativePath, width, height]) => ({
  path: resolve(repoRoot, "apps/starlit-apprentice/android/app/src/main/res", relativePath),
  width,
  height
}));

const iosTargets = [
  "splash-2732x2732-2.png",
  "splash-2732x2732-1.png",
  "splash-2732x2732.png"
].map((filename) => ({
  path: resolve(repoRoot, "apps/starlit-apprentice/ios/App/App/Assets.xcassets/Splash.imageset", filename),
  width: 2732,
  height: 2732
}));

const allTargets = [...androidTargets, ...iosTargets];

if (checkMode) {
  await checkSplash();
} else {
  await syncSplash();
}

async function syncSplash() {
  const browser = await chromium.launch();
  try {
    for (const target of allTargets) {
      mkdirSync(dirname(target.path), { recursive: true });
      await renderSplash(browser, target);
    }
  } finally {
    await browser.close();
  }

  console.log(`Synced ${allTargets.length} native splash image(s).`);
}

async function checkSplash() {
  const errors = [];
  const tempRoot = mkdtempSync(join(tmpdir(), "starlit-native-splash-"));
  const browser = await chromium.launch();

  try {
    for (const target of allTargets) {
      const expectedPath = join(tempRoot, relativePath(target.path));
      mkdirSync(dirname(expectedPath), { recursive: true });
      await renderSplash(browser, { ...target, path: expectedPath });

      if (!existsSync(target.path)) {
        errors.push(`missing native splash image: ${relativePath(target.path)}`);
        continue;
      }

      const actualHash = pngRgbHash(readFileSync(target.path), target.width, target.height);
      const expectedHash = pngRgbHash(readFileSync(expectedPath), target.width, target.height);
      if (actualHash !== expectedHash) {
        errors.push(`native splash image is stale: ${relativePath(target.path)}. Run pnpm assets:sync:native-splash.`);
      }
    }
  } finally {
    await browser.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`FAIL ${error}`);
    }
    process.exit(1);
  }

  console.log("Native splash sync check: PASS");
}

async function renderSplash(browser, { width, height, path }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const minSide = Math.min(width, height);
  const markSize = Math.round(Math.min(minSide * 0.34, height * 0.22));
  const titleSize = Math.max(18, Math.round(minSide * 0.045));
  const titleTop = Math.round(markSize * 0.23);
  const horizon = height >= width ? 63 : 58;

  await page.setContent(
    `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <style>
            html, body {
              margin: 0;
              width: ${width}px;
              height: ${height}px;
              overflow: hidden;
              background: #14213d;
              font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            body {
              position: relative;
              display: grid;
              place-items: center;
              background:
                linear-gradient(180deg, #14213d 0%, #203d5d ${horizon - 12}%, #2a6f6c ${horizon}%, #2a6f6c 100%);
            }
            .spark {
              position: absolute;
              width: ${Math.max(4, Math.round(minSide * 0.012))}px;
              height: ${Math.max(4, Math.round(minSide * 0.012))}px;
              background: #f7f1d5;
              image-rendering: pixelated;
            }
            .spark.a { left: 18%; top: 19%; }
            .spark.b { left: 78%; top: 26%; }
            .spark.c { left: 23%; top: 73%; }
            .spark.d { left: 75%; top: 70%; }
            .lockup {
              transform: translateY(${height >= width ? "-8%" : "0"});
              display: grid;
              justify-items: center;
            }
            .mark {
              position: relative;
              width: ${markSize}px;
              height: ${markSize}px;
              image-rendering: pixelated;
            }
            .star {
              position: absolute;
              left: 35%;
              top: 8%;
              width: 30%;
              height: 30%;
              clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%);
              background: #f6c85f;
            }
            .hat {
              position: absolute;
              left: 23%;
              top: 38%;
              width: 54%;
              height: 17%;
              background: #6d5dd3;
              box-shadow: 0 ${Math.round(markSize * 0.045)}px 0 #5146a9, 0 ${Math.round(markSize * 0.08)}px 0 #f8ad9d;
            }
            .hat:before {
              content: "";
              position: absolute;
              left: 32%;
              top: -115%;
              width: 36%;
              height: 125%;
              background: #6d5dd3;
              clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
            }
            .face {
              position: absolute;
              left: 34%;
              top: 56%;
              width: 32%;
              height: 26%;
              background: #ffd7a8;
            }
            .eye {
              position: absolute;
              top: 66%;
              width: 4%;
              height: 4%;
              background: #111827;
            }
            .eye.left { left: 42%; }
            .eye.right { left: 54%; }
            .title {
              margin-top: ${titleTop}px;
              color: #f7f1d5;
              font-weight: 800;
              font-size: ${titleSize}px;
              line-height: 1.1;
              letter-spacing: 0;
              text-shadow: 0 ${Math.max(2, Math.round(titleSize * 0.12))}px 0 rgba(17, 24, 39, 0.45);
              white-space: nowrap;
            }
          </style>
        </head>
        <body>
          <div class="spark a"></div>
          <div class="spark b"></div>
          <div class="spark c"></div>
          <div class="spark d"></div>
          <div class="lockup">
            <div class="mark" aria-hidden="true">
              <div class="star"></div>
              <div class="hat"></div>
              <div class="face"></div>
              <div class="eye left"></div>
              <div class="eye right"></div>
            </div>
            <div class="title">Star Apprentice</div>
          </div>
        </body>
      </html>`,
    { waitUntil: "load" }
  );
  await page.screenshot({ path, fullPage: false, omitBackground: false });
  await page.close();
}

function pngRgbHash(buffer, expectedWidth, expectedHeight) {
  const { width, height, rgba } = readPngRgba(buffer);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`expected ${expectedWidth}x${expectedHeight} PNG, got ${width}x${height}`);
  }

  const rgb = Buffer.alloc(width * height * 3);
  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4, targetIndex += 3) {
    rgb[targetIndex] = rgba[sourceIndex];
    rgb[targetIndex + 1] = rgba[sourceIndex + 1];
    rgb[targetIndex + 2] = rgba[sourceIndex + 2];
  }
  return createHash("sha256").update(rgb).digest("hex");
}

function readPngRgba(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, signature.length).equals(signature)) {
    throw new Error("not a PNG");
  }

  let width;
  let height;
  let bitDepth;
  let colorType;
  const idatChunks = [];
  let offset = signature.length;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) {
      throw new Error("truncated PNG chunk");
    }

    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
      const interlace = buffer[start + 12];
      if (interlace !== 0) {
        throw new Error("interlaced PNG is not supported");
      }
    } else if (type === "IDAT") {
      idatChunks.push(buffer.subarray(start, end));
    } else if (type === "IEND") {
      break;
    }

    offset = end + 4;
  }

  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`unsupported PNG format: ${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = Buffer.alloc(width * height * 4);
  let readOffset = 0;
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[readOffset];
    readOffset += 1;
    const row = Buffer.from(inflated.subarray(readOffset, readOffset + rowBytes));
    readOffset += rowBytes;
    unfilterRow(row, previous, bytesPerPixel, filter);

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      rgba[target] = row[source];
      rgba[target + 1] = row[source + 1];
      rgba[target + 2] = row[source + 2];
      rgba[target + 3] = colorType === 6 ? row[source + 3] : 255;
    }
    previous = row;
  }

  return { width, height, rgba };
}

function unfilterRow(row, previous, bytesPerPixel, filter) {
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;
    if (filter === 1) {
      row[index] = (row[index] + left) & 0xff;
    } else if (filter === 2) {
      row[index] = (row[index] + up) & 0xff;
    } else if (filter === 3) {
      row[index] = (row[index] + Math.floor((left + up) / 2)) & 0xff;
    } else if (filter === 4) {
      row[index] = (row[index] + paeth(left, up, upLeft)) & 0xff;
    } else if (filter !== 0) {
      throw new Error(`unsupported PNG filter: ${filter}`);
    }
  }
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) {
    return left;
  }
  return pb <= pc ? up : upLeft;
}

function relativePath(path) {
  return path.slice(repoRoot.length + 1).split("\\").join("/");
}
