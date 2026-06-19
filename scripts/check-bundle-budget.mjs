import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const distRoot = resolve(repoRoot, "apps/starlit-apprentice/dist");
const failures = [];
const warnings = [];

const budgets = {
  totalRawBytes: 240_000,
  totalGzipBytes: 80_000,
  jsRawBytes: 170_000,
  jsGzipBytes: 60_000,
  cssRawBytes: 80_000,
  cssGzipBytes: 16_000,
  indexRawBytes: 4_000
};

checkDist();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkDist() {
  if (!existsSync(distRoot)) {
    failures.push("Missing app dist. Run pnpm --filter @starlit-apprentice/app build.");
    return;
  }

  const files = listFiles(distRoot);
  const relativeFiles = files.map((file) => relative(distRoot, file));
  const byExtension = new Map();
  for (const file of files) {
    const extension = extname(file) || "(none)";
    byExtension.set(extension, [...(byExtension.get(extension) ?? []), file]);
  }

  requireFile(relativeFiles, "index.html");
  requireSome(relativeFiles, /^assets\/index-[A-Za-z0-9_-]+\.js$/);
  requireSome(relativeFiles, /^assets\/index-[A-Za-z0-9_-]+\.css$/);

  const forbiddenRuntimeAssets = [
    "starlit-apprentice-icon-600.png",
    "starlit-apprentice-thumbnail-1932x828.png",
    "screenshots/"
  ];
  for (const forbidden of forbiddenRuntimeAssets) {
    if (relativeFiles.some((file) => file === forbidden || file.startsWith(forbidden))) {
      failures.push(`Runtime dist must not include registration-only asset: ${forbidden}`);
    }
  }
  if (relativeFiles.some((file) => file.endsWith(".map"))) {
    failures.push("Runtime dist must not include sourcemaps.");
  }

  const totalRaw = sumBytes(files);
  const totalGzip = sumGzipBytes(files);
  assertBudget("total raw dist", totalRaw, budgets.totalRawBytes);
  assertBudget("total gzip dist", totalGzip, budgets.totalGzipBytes);

  checkFileGroup("JavaScript", byExtension.get(".js") ?? [], budgets.jsRawBytes, budgets.jsGzipBytes);
  checkFileGroup("CSS", byExtension.get(".css") ?? [], budgets.cssRawBytes, budgets.cssGzipBytes);

  const indexPath = resolve(distRoot, "index.html");
  if (existsSync(indexPath)) {
    const indexText = readFileSync(indexPath, "utf8");
    assertBudget("index.html raw", statSync(indexPath).size, budgets.indexRawBytes);
    if (/https?:\/\//.test(indexText)) {
      failures.push("index.html must not reference external network assets.");
    }
  }

  for (const [extension, groupFiles] of [...byExtension.entries()].sort()) {
    const raw = sumBytes(groupFiles);
    const gzip = sumGzipBytes(groupFiles);
    console.log(`${extension}: ${formatBytes(raw)} raw, ${formatBytes(gzip)} gzip`);
  }
}

function checkFileGroup(label, files, rawBudget, gzipBudget) {
  if (files.length === 0) {
    failures.push(`Missing ${label} bundle.`);
    return;
  }
  const raw = sumBytes(files);
  const gzip = sumGzipBytes(files);
  assertBudget(`${label} raw`, raw, rawBudget);
  assertBudget(`${label} gzip`, gzip, gzipBudget);
}

function requireFile(files, expected) {
  if (!files.includes(expected)) {
    failures.push(`Runtime dist missing required file: ${expected}`);
  }
}

function requireSome(files, pattern) {
  if (!files.some((file) => pattern.test(file))) {
    failures.push(`Runtime dist missing file matching ${pattern}.`);
  }
}

function assertBudget(label, actual, limit) {
  if (actual > limit) {
    failures.push(`${label} exceeds budget: ${formatBytes(actual)} > ${formatBytes(limit)}.`);
  } else if (actual > limit * 0.9) {
    warnings.push(`${label} is above 90% of budget: ${formatBytes(actual)} / ${formatBytes(limit)}.`);
  }
}

function listFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        stack.push(path);
      } else {
        files.push(path);
      }
    }
  }
  return files;
}

function sumBytes(files) {
  return files.reduce((sum, file) => sum + statSync(file).size, 0);
}

function sumGzipBytes(files) {
  return files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function printReport() {
  console.log("");
  console.log("Bundle budget check");
  console.log("===================");
  console.log("");
  printSection("Failures", failures);
  printSection("Warnings", warnings);
  console.log(failures.length === 0 ? "Bundle budget checks: PASS" : "Bundle budget checks: FAIL");
}

function printSection(title, items) {
  console.log(title);
  if (items.length === 0) {
    console.log("- none");
  } else {
    for (const item of items) {
      console.log(`- ${item}`);
    }
  }
  console.log("");
}
