import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const config = readJson("apps-in-toss/apps-in-toss.config.json");
const viteDistSource = resolve(repoRoot, config.build.viteDistSource);
const sourceDir = resolve(repoRoot, config.build.source);
const archivePath = resolve(repoRoot, config.build.candidateArchive);
const appRoot = resolve(repoRoot, "apps/starlit-apprentice");
const generatedAitPath = resolve(appRoot, "starlit-apprentice.ait");
const uploadableAitPath = resolve(repoRoot, config.build.uploadableAit);

run("pnpm", ["--filter", "@starlit-apprentice/app", "build"], repoRoot);

if (!existsSync(viteDistSource)) {
  throw new Error(`Missing Vite dist source: ${viteDistSource}`);
}

rmSync(sourceDir, { recursive: true, force: true });
copyRuntimeDist(viteDistSource, sourceDir);
normalizeTimestamps(sourceDir);
mkdirSync(dirname(archivePath), { recursive: true });
rmSync(archivePath, { force: true });
run("zip", ["-X", "-q", archivePath, ...listFiles(sourceDir).map((file) => relative(sourceDir, file)).sort()], sourceDir);

rmSync(generatedAitPath, { force: true });
rmSync(uploadableAitPath, { force: true });
run("pnpm", ["--filter", "@starlit-apprentice/app", "build:apps-in-toss"], repoRoot);
if (!existsSync(generatedAitPath)) {
  throw new Error(`Missing AppsInToss .ait artifact after ait build: ${generatedAitPath}`);
}
mkdirSync(dirname(uploadableAitPath), { recursive: true });
copyFileSync(generatedAitPath, uploadableAitPath);
run("pnpm", ["--filter", "@starlit-apprentice/app", "build"], repoRoot);

const bytes = statSync(archivePath).size;
const aitBytes = statSync(uploadableAitPath).size;
console.log(`AppsInToss static WebView candidate archive: ${archivePath} (${formatBytes(bytes)})`);
console.log(`AppsInToss uploadable .ait artifact: ${uploadableAitPath} (${formatBytes(aitBytes)})`);

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit"
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function copyRuntimeDist(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (shouldExclude(entry.name)) {
      continue;
    }
    const from = resolve(source, entry.name);
    const to = resolve(target, entry.name);
    if (entry.isDirectory()) {
      copyRuntimeDist(from, to);
    } else {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}

function normalizeTimestamps(root) {
  const stableDate = new Date("2026-01-01T00:00:00.000Z");
  for (const file of listFiles(root)) {
    utimesSync(file, stableDate, stableDate);
  }
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
      } else {
        files.push(path);
      }
    }
  }
  return files.sort();
}

function shouldExclude(name) {
  return (
    name === "screenshots" ||
    name === "starlit-apprentice-icon-600.png" ||
    name === "starlit-apprentice-thumbnail-1932x828.png"
  );
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
