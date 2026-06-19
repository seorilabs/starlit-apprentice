import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const failures = [];
const warnings = [];

const expectedCsp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self' blob:";

checkHtmlCsp("source index.html", "apps/starlit-apprentice/index.html");
checkHtmlCsp("production dist index.html", "apps/starlit-apprentice/dist/index.html");
checkSourceBoundary();
checkNativeBoundary();
checkDocs();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkHtmlCsp(label, path) {
  if (!exists(path)) {
    failures.push(`${label} is missing: ${path}`);
    return;
  }

  const html = read(path);
  const policies = [...html.matchAll(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi)].map((match) => match[0]);
  if (policies.length !== 1) {
    failures.push(`${label} must include exactly one Content-Security-Policy meta tag, got ${policies.length}`);
    return;
  }

  const content = extractMetaContent(policies[0]);
  if (content !== expectedCsp) {
    failures.push(`${label} CSP must match the release policy.`);
  }

  const directives = parseDirectives(content);
  for (const [directive, expectedValue] of [
    ["default-src", "'self'"],
    ["script-src", "'self'"],
    ["style-src", "'self' 'unsafe-inline'"],
    ["img-src", "'self' data: blob:"],
    ["font-src", "'self' data:"],
    ["connect-src", "'self'"],
    ["media-src", "'none'"],
    ["object-src", "'none'"],
    ["frame-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
    ["worker-src", "'self' blob:"]
  ]) {
    if (directives.get(directive) !== expectedValue) {
      failures.push(`${label} CSP ${directive} must be ${expectedValue}, got ${JSON.stringify(directives.get(directive))}`);
    }
  }

  for (const forbidden of ["unsafe-eval", "http:", "https:", "*"]) {
    if (content.includes(forbidden)) {
      failures.push(`${label} CSP must not include ${forbidden}`);
    }
  }

  if (directives.get("script-src")?.includes("unsafe-inline")) {
    failures.push(`${label} CSP script-src must not allow unsafe-inline`);
  }
}

function checkSourceBoundary() {
  const scannedFiles = [
    ...listFiles("apps/starlit-apprentice/src"),
    ...listFiles("packages/product-core/src")
  ].filter((path) => [".ts", ".tsx", ".js", ".jsx"].includes(extname(path)) && !/\.test\.[tj]sx?$/.test(path));

  const blockedPatterns = [
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bsendBeacon\b/,
    /\bWebSocket\b/,
    /\bEventSource\b/,
    /window\.open\s*\(/,
    /target=["']_blank["']/,
    /https?:\/\//,
    /<iframe\b/i,
    /\beval\s*\(/,
    /\bnew\s+Function\b/
  ];

  for (const file of scannedFiles) {
    const text = readAbsolute(file);
    for (const pattern of blockedPatterns) {
      if (pattern.test(text)) {
        failures.push(`WebView security source scan failed: ${relative(repoRoot, file)} matches ${pattern}`);
      }
    }
  }
}

function checkNativeBoundary() {
  const capacitorConfig = read("apps/starlit-apprentice/capacitor.config.ts");
  if (!capacitorConfig.includes('webDir: "dist"')) {
    failures.push('Capacitor config must use webDir: "dist" for bundled store builds.');
  }
  if (/server\s*:\s*\{[\s\S]*url\s*:/m.test(capacitorConfig)) {
    failures.push("Capacitor config must not configure server.url for store/WebView release builds.");
  }
}

function checkDocs() {
  const doc = read("docs/webview-security.md");
  for (const expected of [
    "pnpm check:webview-security",
    expectedCsp,
    "Scripts must load only from the bundled app origin.",
    "Runtime network connections are limited to `self`",
    "Capacitor must keep `webDir: \"dist\"` and must not configure `server.url`."
  ]) {
    if (!doc.includes(expected)) {
      failures.push(`docs/webview-security.md must include: ${expected}`);
    }
  }
}

function extractMetaContent(metaTag) {
  const match = metaTag.match(/\scontent=(["'])(.*?)\1/i);
  return match?.[2] ?? "";
}

function parseDirectives(policy) {
  const directives = new Map();
  for (const rawDirective of policy.split(";")) {
    const directive = rawDirective.trim();
    if (!directive) {
      continue;
    }
    const [name, ...valueParts] = directive.split(/\s+/);
    directives.set(name, valueParts.join(" "));
  }
  return directives;
}

function listFiles(root) {
  const absoluteRoot = resolve(repoRoot, root);
  if (!existsSync(absoluteRoot)) {
    failures.push(`Missing source directory: ${root}`);
    return [];
  }
  const files = [];
  const stack = [absoluteRoot];
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

function printReport() {
  console.log("WebView security check");
  console.log("======================");
  console.log("");

  printSection("Failures", failures);
  printSection("Warnings", warnings);

  if (failures.length === 0) {
    console.log("WebView security checks: PASS");
  } else {
    console.log("WebView security checks: FAIL");
  }
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

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function readAbsolute(path) {
  return readFileSync(path, "utf8");
}

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}
