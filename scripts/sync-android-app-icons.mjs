import { execFileSync } from "node:child_process";
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

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const checkMode = process.argv.includes("--check");
const sourceIcon = resolve(repoRoot, "play-store/assets/icon-512.png");
const resRoot = resolve(repoRoot, "apps/starlit-apprentice/android/app/src/main/res");
const backgroundColor = "#14213D";

const densityTargets = [
  { dir: "mipmap-mdpi", launcher: 48, foreground: 108 },
  { dir: "mipmap-hdpi", launcher: 72, foreground: 162 },
  { dir: "mipmap-xhdpi", launcher: 96, foreground: 216 },
  { dir: "mipmap-xxhdpi", launcher: 144, foreground: 324 },
  { dir: "mipmap-xxxhdpi", launcher: 192, foreground: 432 }
];

const pngTargets = densityTargets.flatMap(({ dir, launcher, foreground }) => [
  { path: join(resRoot, dir, "ic_launcher.png"), size: launcher },
  { path: join(resRoot, dir, "ic_launcher_round.png"), size: launcher },
  { path: join(resRoot, dir, "ic_launcher_foreground.png"), size: foreground }
]);

const xmlTargets = new Map([
  [
    join(resRoot, "values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${backgroundColor}</color>
</resources>
`
  ],
  [
    join(resRoot, "mipmap-anydpi-v26/ic_launcher.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
  ],
  [
    join(resRoot, "mipmap-anydpi-v26/ic_launcher_round.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
  ]
]);

const removedDefaultFiles = [
  join(resRoot, "drawable/ic_launcher_background.xml"),
  join(resRoot, "drawable-v24/ic_launcher_foreground.xml")
];

if (!existsSync(sourceIcon)) {
  throw new Error(`Missing Android icon source: ${sourceIcon}`);
}

if (checkMode) {
  checkIcons();
} else {
  syncIcons();
}

function syncIcons() {
  for (const file of removedDefaultFiles) {
    rmSync(file, { force: true });
  }

  for (const [path, content] of xmlTargets) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  for (const target of pngTargets) {
    mkdirSync(dirname(target.path), { recursive: true });
    resizePng(sourceIcon, target.path, target.size);
  }

  console.log(`Synced ${pngTargets.length} Android launcher icon PNGs from ${sourceIcon}`);
}

function checkIcons() {
  const errors = [];
  const tempRoot = mkdtempSync(join(tmpdir(), "starlit-android-icons-"));

  try {
    for (const removedFile of removedDefaultFiles) {
      if (existsSync(removedFile)) {
        errors.push(`remove unused default Capacitor icon resource: ${relativePath(removedFile)}`);
      }
    }

    for (const [path, expected] of xmlTargets) {
      if (!existsSync(path)) {
        errors.push(`missing Android icon XML: ${relativePath(path)}`);
        continue;
      }
      if (readFileSync(path, "utf8") !== expected) {
        errors.push(`Android icon XML is stale: ${relativePath(path)}`);
      }
    }

    for (const target of pngTargets) {
      const expectedPath = join(tempRoot, relativePath(target.path));
      mkdirSync(dirname(expectedPath), { recursive: true });
      resizePng(sourceIcon, expectedPath, target.size);

      if (!existsSync(target.path)) {
        errors.push(`missing Android launcher icon: ${relativePath(target.path)}`);
        continue;
      }

      const actualHash = sha256(readFileSync(target.path));
      const expectedHash = sha256(readFileSync(expectedPath));
      if (actualHash !== expectedHash) {
        errors.push(
          `Android launcher icon is stale: ${relativePath(target.path)}. Run pnpm assets:sync:android-icons.`
        );
      }
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`FAIL ${error}`);
    }
    process.exit(1);
  }

  console.log("Android launcher icon sync check: PASS");
}

function resizePng(input, output, size) {
  execFileSync("sips", ["-s", "format", "png", "-z", String(size), String(size), input, "--out", output], {
    stdio: "ignore"
  });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function relativePath(path) {
  return path.slice(repoRoot.length + 1).split("\\").join("/");
}
