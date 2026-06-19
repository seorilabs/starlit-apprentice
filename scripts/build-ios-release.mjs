import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const iosDir = resolve(repoRoot, "apps/starlit-apprentice/ios/App");
const workspace = resolve(iosDir, "App.xcworkspace");
const derivedDataPath = resolve(repoRoot, "apps/starlit-apprentice/ios/DerivedData/AppRelease");
const appBundlePath = resolve(derivedDataPath, "Build/Products/Release-iphoneos/App.app");

if (!existsSync(workspace)) {
  throw new Error(`Missing Xcode workspace: ${workspace}`);
}

run("node", ["scripts/sync-native-splash.mjs"], repoRoot);
run("pnpm", ["--filter", "@starlit-apprentice/app", "cap:sync"], repoRoot);
run(
  "xcodebuild",
  [
    "-workspace",
    "App.xcworkspace",
    "-scheme",
    "App",
    "-configuration",
    "Release",
    "-destination",
    "generic/platform=iOS",
    "-derivedDataPath",
    derivedDataPath,
    "CODE_SIGNING_ALLOWED=NO",
    "build"
  ],
  iosDir
);

if (!existsSync(appBundlePath)) {
  throw new Error(`iOS Release .app was not generated: ${appBundlePath}`);
}

console.log(`iOS Release app bundle: ${appBundlePath}`);
console.log("iOS Release build completed with CODE_SIGNING_ALLOWED=NO. App Store archive/upload still requires Apple Distribution signing.");

function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: "inherit"
  });
}
