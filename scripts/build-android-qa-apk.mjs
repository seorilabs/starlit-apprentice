import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const androidDir = resolve(repoRoot, "apps/starlit-apprentice/android");
const artifactPath = resolve(androidDir, "app/build/outputs/apk/debug/app-debug.apk");

const javaHome = resolveJavaHome();
const env = { ...process.env };
if (javaHome) {
  env.JAVA_HOME = javaHome;
  env.PATH = `${join(javaHome, "bin")}:${env.PATH ?? ""}`;
}

console.log(`Using JAVA_HOME=${env.JAVA_HOME ?? "(current shell default)"}`);
run("node", ["scripts/sync-android-app-icons.mjs"], repoRoot, env);
run("node", ["scripts/sync-native-splash.mjs"], repoRoot, env);
run("pnpm", ["--filter", "@starlit-apprentice/app", "cap:sync"], repoRoot, env);
run("./gradlew", [":app:assembleDebug"], androidDir, env);

if (!existsSync(artifactPath)) {
  throw new Error(`Android QA APK was not generated: ${artifactPath}`);
}

const bytes = statSync(artifactPath).size;
console.log(`Android QA APK: ${artifactPath} (${formatBytes(bytes)})`);
console.log("This debug-signed APK is for target-device QA only; it is not a Play upload artifact.");

function resolveJavaHome() {
  const existing = process.env.JAVA_HOME;
  if (existing && javaMajor(existing) === 21) {
    return existing;
  }

  if (process.platform === "darwin") {
    try {
      const detected = execFileSync("/usr/libexec/java_home", ["-v", "21"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      if (detected) {
        return detected;
      }
    } catch {
      // Fall through to the current shell Java. Gradle will report a precise error if it is incompatible.
    }
  }

  return existing;
}

function javaMajor(javaHome) {
  try {
    const output = execFileSync(join(javaHome, "bin/java"), ["-version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return parseMajor(output);
  } catch (error) {
    return parseMajor(`${error.stdout?.toString?.() ?? ""}\n${error.stderr?.toString?.() ?? ""}`);
  }
}

function parseMajor(output) {
  const match = output.match(/version "(?:(\d+)\.)?(\d+)/);
  if (!match) {
    return null;
  }
  return Number(match[1] ?? match[2]);
}

function run(command, args, cwd, env) {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: "inherit"
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
