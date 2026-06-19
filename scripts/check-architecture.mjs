import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const coreSrc = resolve(root, "packages/product-core/src");
const forbiddenSources = [
  "@capacitor/",
  "@apps-in-toss/",
  "@toss/",
  "firebase",
  "react",
  "react-native",
  "expo",
  "google",
  "apple"
];

const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

const failures = [];

for (const file of walk(coreSrc)) {
  if (!file.endsWith(".ts") || file.endsWith(".test.ts")) {
    continue;
  }
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(importPattern)) {
    const source = match[1] ?? match[2];
    if (!source) {
      continue;
    }
    if (!source.startsWith(".")) {
      failures.push(`${display(file)} imports external module "${source}"`);
      continue;
    }
    const target = resolve(file, "..", source);
    if (!target.startsWith(coreSrc)) {
      failures.push(`${display(file)} imports outside product-core/src: "${source}"`);
    }
    const forbidden = forbiddenSources.find((entry) => source.includes(entry));
    if (forbidden) {
      failures.push(`${display(file)} imports forbidden platform source "${source}"`);
    }
  }
}

if (failures.length > 0) {
  console.error("Architecture boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Architecture boundary check passed.");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

function display(file) {
  return relative(root, file);
}
