import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const failures = [];
const warnings = [];

const spec = readJson("specs/starlit-apprentice.json");
const appPackage = readJson("apps/starlit-apprentice/package.json");
const appSource = read("apps/starlit-apprentice/src/app.ts");

checkSpecContract();
checkImplementationContract();
checkSdkBoundary();
checkDocs();
printReport();

if (failures.length > 0) {
  process.exit(1);
}

function checkSpecContract() {
  const analytics = spec.analytics;
  if (!analytics || typeof analytics !== "object" || Array.isArray(analytics)) {
    failures.push("spec.analytics must be an object.");
    return;
  }
  requireEqual("spec.analytics.prefix", analytics.prefix, "starlit");
  requireEqual("spec.analytics.transport", analytics.transport, "local-custom-event-only");
  requireEqual("spec.analytics.sdk", analytics.sdk, "none");

  if (!Array.isArray(analytics.events) || analytics.events.length === 0) {
    failures.push("spec.analytics.events must list tracked events.");
    return;
  }

  const seen = new Set();
  for (const event of analytics.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      failures.push("spec.analytics.events entries must be objects.");
      continue;
    }
    if (typeof event.name !== "string" || !event.name.startsWith(`${analytics.prefix}_`)) {
      failures.push(`analytics event must start with ${analytics.prefix}_: ${JSON.stringify(event.name)}`);
    }
    if (seen.has(event.name)) {
      failures.push(`duplicate analytics event: ${event.name}`);
    }
    seen.add(event.name);
    if (typeof event.description !== "string" || event.description.trim() === "") {
      failures.push(`${event.name} must include a description.`);
    }
    if (!Array.isArray(event.params) || event.params.length === 0) {
      failures.push(`${event.name} must declare params.`);
    }
    if (typeof event.conversion !== "boolean") {
      failures.push(`${event.name} must declare conversion as a boolean.`);
    }
  }

  for (const expected of [
    "starlit_start_click",
    "starlit_schedule_confirmed",
    "starlit_event_seen",
    "starlit_ending_reached",
    "starlit_share_click",
    "starlit_collection_view",
    "starlit_target_ending_selected"
  ]) {
    if (!seen.has(expected)) {
      failures.push(`spec.analytics.events missing expected event: ${expected}`);
    }
  }
}

function checkImplementationContract() {
  if (!appSource.includes('new CustomEvent("starlit:analytics"')) {
    failures.push('app analytics transport must dispatch local CustomEvent("starlit:analytics").');
  }
  if (!appSource.includes("window.dispatchEvent")) {
    failures.push("app analytics transport must use window.dispatchEvent.");
  }
  if (/\bfetch\s*\(|\bsendBeacon\b|\bXMLHttpRequest\b/.test(extractTrackMethod(appSource))) {
    failures.push("track() must stay local-only and must not use network APIs.");
  }

  const specEvents = new Map((spec.analytics?.events ?? []).map((event) => [event.name, event]));
  const sourceEvents = extractTrackCalls(appSource);
  const sourceEventNames = new Set(sourceEvents.map((event) => event.name));

  for (const eventName of sourceEventNames) {
    if (!specEvents.has(eventName)) {
      failures.push(`app source tracks event not declared in spec.analytics.events: ${eventName}`);
    }
  }

  for (const [eventName, event] of specEvents) {
    const calls = sourceEvents.filter((sourceEvent) => sourceEvent.name === eventName);
    if (calls.length === 0) {
      failures.push(`spec analytics event is not emitted by app source: ${eventName}`);
      continue;
    }
    for (const param of event.params ?? []) {
      if (!calls.some((call) => call.params.includes(param))) {
        failures.push(`${eventName} must emit declared param: ${param}`);
      }
    }
  }
}

function checkSdkBoundary() {
  const deps = {
    ...(appPackage.dependencies ?? {}),
    ...(appPackage.devDependencies ?? {})
  };
  const disallowed = /analytics|firebase|segment|amplitude|mixpanel|sentry|appsflyer|adjust|facebook|meta/i;
  for (const packageName of Object.keys(deps)) {
    if (disallowed.test(packageName)) {
      failures.push(`Analytics contract must not add production analytics/tracking SDK dependency: ${packageName}`);
    }
  }
}

function checkDocs() {
  const path = "docs/analytics-contract.md";
  if (!exists(path)) {
    failures.push(`Missing analytics contract document: ${path}`);
    return;
  }
  const doc = read(path);
  for (const expected of [
    "pnpm check:analytics-contract",
    "local CustomEvent",
    "starlit:analytics",
    "no analytics SDK",
    "No user data collected",
    ...((spec.analytics?.events ?? []).map((event) => event.name))
  ]) {
    if (!doc.includes(expected)) {
      failures.push(`${path} must include: ${expected}`);
    }
  }
}

function extractTrackCalls(source) {
  const calls = [];
  const pattern = /this\.track\("([^"]+)",\s*\{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const params = [...match[2].matchAll(/([A-Za-z0-9_]+)\s*:/g)].map((paramMatch) => paramMatch[1]);
    calls.push({ name: match[1], params });
  }
  return calls;
}

function extractTrackMethod(source) {
  const match = source.match(/private track\([\s\S]*?\n  \}/);
  if (!match) {
    failures.push("app source must define private track().");
    return "";
  }
  return match[0];
}

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}.`);
  }
}

function readJson(path) {
  return JSON.parse(read(path));
}

function read(path) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

function exists(path) {
  return existsSync(resolve(repoRoot, path));
}

function printReport() {
  console.log("Analytics contract check");
  console.log("========================");
  console.log("");
  printSection("Failures", failures);
  printSection("Warnings", warnings);
  console.log(failures.length === 0 ? "Analytics contract: PASS" : "Analytics contract: FAIL");
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
