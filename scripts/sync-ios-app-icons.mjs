import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const sourceIcon = resolve(repoRoot, "app-store/assets/starlit-apprentice-store-icon-1024.png");
const appIconDir = resolve(repoRoot, "apps/starlit-apprentice/ios/App/App/Assets.xcassets/AppIcon.appiconset");

if (!existsSync(sourceIcon)) {
  throw new Error(`Missing source App Store icon: ${sourceIcon}`);
}

mkdirSync(appIconDir, { recursive: true });

const icons = [
  { idiom: "iphone", size: "20x20", scale: "2x", pixels: 40 },
  { idiom: "iphone", size: "20x20", scale: "3x", pixels: 60 },
  { idiom: "iphone", size: "29x29", scale: "2x", pixels: 58 },
  { idiom: "iphone", size: "29x29", scale: "3x", pixels: 87 },
  { idiom: "iphone", size: "40x40", scale: "2x", pixels: 80 },
  { idiom: "iphone", size: "40x40", scale: "3x", pixels: 120 },
  { idiom: "iphone", size: "60x60", scale: "2x", pixels: 120 },
  { idiom: "iphone", size: "60x60", scale: "3x", pixels: 180 },
  { idiom: "ipad", size: "20x20", scale: "1x", pixels: 20 },
  { idiom: "ipad", size: "20x20", scale: "2x", pixels: 40 },
  { idiom: "ipad", size: "29x29", scale: "1x", pixels: 29 },
  { idiom: "ipad", size: "29x29", scale: "2x", pixels: 58 },
  { idiom: "ipad", size: "40x40", scale: "1x", pixels: 40 },
  { idiom: "ipad", size: "40x40", scale: "2x", pixels: 80 },
  { idiom: "ipad", size: "76x76", scale: "1x", pixels: 76 },
  { idiom: "ipad", size: "76x76", scale: "2x", pixels: 152 },
  { idiom: "ipad", size: "83.5x83.5", scale: "2x", pixels: 167 },
  { idiom: "ios-marketing", size: "1024x1024", scale: "1x", pixels: 1024 }
];

const expectedFilenames = new Set(icons.map((icon) => filenameFor(icon)));

for (const filename of readdirSync(appIconDir)) {
  if (filename.endsWith(".png") && !expectedFilenames.has(filename)) {
    unlinkSync(resolve(appIconDir, filename));
  }
}

for (const icon of icons) {
  const filename = filenameFor(icon);
  const output = resolve(appIconDir, filename);
  execFileSync("sips", ["-s", "format", "png", "-z", String(icon.pixels), String(icon.pixels), sourceIcon, "--out", output], {
    stdio: "ignore"
  });
  icon.filename = filename;
}

writeFileSync(
  resolve(appIconDir, "Contents.json"),
  `${JSON.stringify(
    {
      images: icons.map(({ idiom, size, scale, filename }) => ({ filename, idiom, scale, size })),
      info: {
        author: "xcode",
        version: 1
      }
    },
    null,
    2
  )}\n`
);

console.log(`Synced ${icons.length} iOS AppIcon slots from ${sourceIcon}`);

function filenameFor(icon) {
  const safeSize = icon.size.replace(".", "_").replace("x", "-");
  return `app-icon-${icon.idiom}-${safeSize}-${icon.scale}.png`;
}
