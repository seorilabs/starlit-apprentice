import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const allowManualBlockers = process.argv.includes("--allow-manual-blockers");
const manualBlockersOnly = process.argv.includes("--manual-blockers-only");
const automatedFailures = [];
const manualBlockers = [];
const warnings = [];

const spec = readJson("specs/starlit-apprentice.json");
const rootPackage = readJson("package.json");
const appPackage = readJson("apps/starlit-apprentice/package.json");
const appPackageDeps = {
  ...(appPackage.dependencies ?? {}),
  ...(appPackage.devDependencies ?? {})
};

if (!manualBlockersOnly) {
  checkSpec();
  checkRequiredFiles();
  checkAssets();
  checkNativeShell();
  checkSdkBoundaries();
  checkDocs();
}
collectManualBlockers();
printReport();

if (automatedFailures.length > 0 || (!allowManualBlockers && manualBlockers.length > 0)) {
  process.exit(1);
}

function checkSpec() {
  requireEqual("spec.status", spec.status, "approved");
  requireEqual("spec.archetype", spec.archetype, "game");
  requireEqual("spec.app.slug", spec.app?.slug, "starlit-apprentice");
  requireEqual("spec.app.appName", spec.app?.appName, "starlit-apprentice");
  requirePresent("spec.app.displayName", spec.app?.displayName);
  requirePresent("spec.app.englishDisplayName", spec.app?.englishDisplayName);
  requirePresent("spec.app.subtitle", spec.app?.subtitle);
  requireEqual("spec.mvp.periodMonths", spec.mvp?.periodMonths, 12);
  requireEqual("spec.mvp.monthlySlots", spec.mvp?.monthlySlots, 4);
  requireEqual("spec.mvp.endingCount", spec.mvp?.endingCount, 30);
  requireEqual("spec.analytics.prefix", spec.analytics?.prefix, "starlit");
  requireEqual("spec.analytics.transport", spec.analytics?.transport, "local-custom-event-only");
  requireEqual("spec.analytics.sdk", spec.analytics?.sdk, "none");

  for (const excluded of ["login", "payment", "server-save", "production-ads", "remote-js-update"]) {
    if (!spec.mvp?.excluded?.includes(excluded)) {
      automatedFailures.push(`spec.mvp.excluded must include ${excluded}`);
    }
  }
  for (const eventName of [
    "starlit_start_click",
    "starlit_schedule_confirmed",
    "starlit_event_seen",
    "starlit_ending_reached",
    "starlit_share_click",
    "starlit_collection_view",
    "starlit_target_ending_selected"
  ]) {
    if (!spec.analytics?.events?.some((event) => event?.name === eventName)) {
      automatedFailures.push(`spec.analytics.events must include ${eventName}`);
    }
  }
}

function checkRequiredFiles() {
  for (const script of [
    "test",
    "check:architecture",
    "check:content",
    "check:assets",
    "check:store-config",
    "check:versioning",
    "check:webview-security",
    "check:native-bundle-sync",
    "check:privacy",
    "check:analytics-contract",
    "check:third-party-notices",
    "assets:sync:android-icons",
    "check:android:icons",
    "assets:sync:native-splash",
    "check:native-splash",
    "build:android:qa-apk",
    "check:android:qa-apk",
    "check:play",
    "check:play:local-artifact",
    "check:app-store",
    "check:app-store:local-artifact",
    "build:apps-in-toss:ait",
    "check:apps-in-toss",
    "check:manual-qa",
    "check:manual-qa-packet",
    "release:console-packet",
    "check:release-console-packet",
    "check:release-console",
    "release:rating-content-inventory",
    "check:rating-content-inventory",
    "release:public-pages",
    "check:public-pages",
    "release:store-submission-packet",
    "check:store-submission-packet",
    "release:gate-dashboard",
    "check:release-gate-dashboard",
    "release:approval-packet",
    "check:release-approval-packet",
    "check:release-approval",
    "check:save-contract",
    "check:target-guidance",
    "check:balance",
    "check:pacing",
    "check:runtime",
    "check:ui-accessibility",
    "check:bundle-budget",
    "check:package",
    "check:public-url-guard",
    "check:release-verification-commands",
    "check:release-manual-blockers",
    "check:release-artifact-manifest",
    "check:release-packages",
    "check:release:automated",
    "qa",
    "cap:sync"
  ]) {
    if (!rootPackage.scripts?.[script]) {
      automatedFailures.push(`package.json missing script: ${script}`);
    }
  }

  for (const path of [
    "docs/store-review-notes.md",
    "docs/release-versioning.md",
    "docs/webview-security.md",
    "docs/native-bundle-sync.md",
    "docs/content-integrity.md",
    "docs/release-assets.md",
    "docs/balance-and-reachability.md",
    "docs/runtime-qa.md",
    "docs/bundle-budget.md",
    "docs/release-artifact-manifest.md",
    "docs/ui-accessibility.md",
    "docs/manual-qa.md",
    "docs/save-contract.md",
    "docs/analytics-contract.md",
    "docs/privacy-and-data-safety.md",
    "docs/public-release-pages.md",
    "docs/release-approval.md",
    "docs/third-party-notices.md",
    "docs/apps-in-toss-release.md",
    "docs/google-play-release.md",
    "docs/app-store-release.md",
    "docs/google-play-store-listing.md",
    "docs/app-store-registration.md",
    "play-store/google-play.config.json",
    "app-store/app-store.config.json",
    "apps-in-toss/README.md",
    "qa/manual-qa-evidence.json",
    "qa/manual-qa-packet.md",
    "qa/release-console-evidence.json",
    "qa/release-console-packet.md",
    "qa/rating-content-inventory.md",
    "qa/public-release-pages.md",
    "qa/store-submission-packet.md",
    "qa/release-gate-dashboard.md",
    "qa/release-approval-evidence.json",
    "qa/release-approval-packet.md",
    "qa/release-artifact-manifest.json",
    "public-pages/index.html",
    "public-pages/privacy-policy.html",
    "public-pages/support.html",
    "public-pages/assets/icon-512.png",
    "public-pages/assets/feature-graphic-1024x500.png",
    "scripts/release-verification-commands.mjs",
    "scripts/check-release-verification-commands.mjs",
    "scripts/release-console-dependencies.mjs",
    "scripts/public-url-guard.mjs",
    "scripts/check-public-url-guard.mjs",
    "docs/release-console-evidence.md",
    "play-store/README.md",
    "app-store/README.md",
    "apps/starlit-apprentice/granite.config.ts",
    "apps/starlit-apprentice/capacitor.config.ts",
    "apps/starlit-apprentice/android/app/src/main/AndroidManifest.xml",
    "apps/starlit-apprentice/ios/App/App/Info.plist"
  ]) {
    if (!exists(path)) {
      automatedFailures.push(`missing release file: ${path}`);
    }
  }
}

function checkAssets() {
  runCheck("registration image check", ["node", "scripts/check-registration-images.mjs", "--spec", "specs/starlit-apprentice.json"]);
  runCheck("content integrity check", ["pnpm", "check:content"]);
  runCheck("market store config check", ["pnpm", "check:store-config"]);
  runCheck("release versioning check", ["pnpm", "check:versioning"]);
  runCheck("WebView security check", ["pnpm", "check:webview-security"]);
  runCheck("native bundle sync check", ["pnpm", "check:native-bundle-sync"]);
  runCheck("privacy/data safety evidence check", ["pnpm", "check:privacy"]);
  runCheck("analytics contract check", ["pnpm", "check:analytics-contract"]);
  runCheck("third-party notices check", ["pnpm", "check:third-party-notices"]);
  runCheck("Android launcher icon sync check", ["pnpm", "check:android:icons"]);
  runCheck("native splash sync check", ["pnpm", "check:native-splash"]);
  runCheck("Google Play local package release check", ["pnpm", "check:play:local-artifact"]);
  runCheck("App Store local package release check", ["pnpm", "check:app-store:local-artifact"]);
  runCheck("AppsInToss release check", ["pnpm", "check:apps-in-toss"]);
  runCheck("release artifact manifest check", ["pnpm", "check:release-artifact-manifest"]);
  runCheck("manual QA packet check", ["pnpm", "check:manual-qa-packet"]);
  runCheck("manual QA evidence check", ["pnpm", "check:manual-qa"]);
  runCheck("release console packet check", ["pnpm", "check:release-console-packet"]);
  runCheck("release console evidence check", ["pnpm", "check:release-console"]);
  runCheck("rating content inventory check", ["pnpm", "check:rating-content-inventory"]);
  runCheck("public release pages check", ["pnpm", "check:public-pages"]);
  runCheck("store submission packet check", ["pnpm", "check:store-submission-packet"]);
  runCheck("release gate dashboard check", ["pnpm", "check:release-gate-dashboard"]);
  runCheck("release approval packet check", ["pnpm", "check:release-approval-packet"]);
  runCheck("release approval evidence check", ["pnpm", "check:release-approval"]);
  runCheck("save contract check", ["pnpm", "check:save-contract"]);
  runCheck("target guidance check", ["pnpm", "check:target-guidance"]);
  runCheck("bundle budget check", ["pnpm", "check:bundle-budget"]);
  runCheck("ending reachability check", ["pnpm", "check:balance"]);
  runCheck("early pacing check", ["pnpm", "check:pacing"]);
  runCheck("runtime smoke check", ["pnpm", "check:runtime"], { attempts: 2 });
  runCheck("UI accessibility check", ["pnpm", "check:ui-accessibility"]);
  runCheck("product-core package dist check", ["pnpm", "check:package"]);
  runCheck("release verification command inventory check", ["pnpm", "check:release-verification-commands"]);
  runCheck("release manual blocker fixture check", ["pnpm", "check:release-manual-blockers"]);
  runCheck("public URL guard parity check", ["pnpm", "check:public-url-guard"]);
}

function checkNativeShell() {
  const capacitorConfig = read("apps/starlit-apprentice/capacitor.config.ts");
  if (!capacitorConfig.includes('appId: "com.seorilabs.starlitapprentice"')) {
    automatedFailures.push("Capacitor appId must be com.seorilabs.starlitapprentice");
  }
  if (!capacitorConfig.includes('webDir: "dist"')) {
    automatedFailures.push("Capacitor webDir must be dist");
  }
  if (/server\s*:\s*\{[\s\S]*url\s*:/m.test(capacitorConfig)) {
    automatedFailures.push("Capacitor config must not use server.url for store builds");
  }

  const androidManifest = read("apps/starlit-apprentice/android/app/src/main/AndroidManifest.xml");
  if (!androidManifest.includes('android:allowBackup="false"')) {
    automatedFailures.push("Android allowBackup must be false for local-only game saves");
  }
  if (!androidManifest.includes('android:screenOrientation="portrait"')) {
    automatedFailures.push("Android MainActivity must be portrait for the current vertical UI");
  }
  if (!androidManifest.includes('android:exported="true"')) {
    automatedFailures.push("Android launcher activity must explicitly set android:exported");
  }

  const iosInfo = read("apps/starlit-apprentice/ios/App/App/Info.plist");
  if (iosInfo.includes("UIInterfaceOrientationLandscapeLeft") || iosInfo.includes("UIInterfaceOrientationLandscapeRight")) {
    automatedFailures.push("iOS Info.plist must not allow landscape orientations for the current vertical UI");
  }
  if (!iosInfo.includes("UIInterfaceOrientationPortrait")) {
    automatedFailures.push("iOS Info.plist must allow portrait orientation");
  }
}

function checkSdkBoundaries() {
  for (const packageName of Object.keys(appPackageDeps)) {
    if (/firebase|admob|analytics|crashlytics|purchase|billing/i.test(packageName)) {
      automatedFailures.push(`MVP must not include production SDK dependency: ${packageName}`);
    }
  }

  runCheck("product core architecture check", ["node", "scripts/check-architecture.mjs"]);
}

function checkDocs() {
  const storeNotes = read("docs/store-review-notes.md");
  if (!storeNotes.includes("not a remote website wrapper")) {
    automatedFailures.push("docs/store-review-notes.md must state bundled app review position");
  }
  if (!storeNotes.includes("No login, payment, server save, sensitive data collection, or production ad SDK")) {
    automatedFailures.push("docs/store-review-notes.md must state MVP policy limits");
  }

  const versioningNotes = read("docs/release-versioning.md");
  if (!versioningNotes.includes("pnpm check:versioning") || !versioningNotes.includes("Marketing version") || !versioningNotes.includes("Build number")) {
    automatedFailures.push("docs/release-versioning.md must document release version/build verification.");
  }
  if (!versioningNotes.includes("Android `versionName`") || !versioningNotes.includes("iOS Debug and Release `MARKETING_VERSION`")) {
    automatedFailures.push("docs/release-versioning.md must document Android and iOS version metadata.");
  }

  const webviewSecurityNotes = read("docs/webview-security.md");
  if (!webviewSecurityNotes.includes("pnpm check:webview-security") || !webviewSecurityNotes.includes("Content Security Policy")) {
    automatedFailures.push("docs/webview-security.md must document the WebView security checker and CSP.");
  }
  if (!webviewSecurityNotes.includes("script-src 'self'") || !webviewSecurityNotes.includes("connect-src 'self'")) {
    automatedFailures.push("docs/webview-security.md must document script/connect CSP boundaries.");
  }

  const nativeBundleNotes = read("docs/native-bundle-sync.md");
  if (!nativeBundleNotes.includes("pnpm check:native-bundle-sync") || !nativeBundleNotes.includes("pnpm cap:sync")) {
    automatedFailures.push("docs/native-bundle-sync.md must document native bundle sync verification commands.");
  }
  if (!nativeBundleNotes.includes("apps/starlit-apprentice/android/app/src/main/assets/public") || !nativeBundleNotes.includes("apps/starlit-apprentice/ios/App/App/public")) {
    automatedFailures.push("docs/native-bundle-sync.md must document Android and iOS native public bundle paths.");
  }
  if (!nativeBundleNotes.includes("cordova.js") || !nativeBundleNotes.includes("server.url") || !nativeBundleNotes.includes("Content-Security-Policy")) {
    automatedFailures.push("docs/native-bundle-sync.md must document Capacitor extras, server.url boundary, and CSP sync.");
  }

  const contentNotes = read("docs/content-integrity.md");
  if (!contentNotes.includes("pnpm check:content") || !contentNotes.includes("ending requirements reference known stats")) {
    automatedFailures.push("docs/content-integrity.md must document content integrity verification.");
  }
  if (!contentNotes.includes("static registry immutability guard")) {
    automatedFailures.push("docs/content-integrity.md must document static registry immutability guard coverage.");
  }
  if (!contentNotes.includes("registry lookup guard")) {
    automatedFailures.push("docs/content-integrity.md must document registry lookup guard coverage.");
  }
  if (!contentNotes.includes("ending requirement directions are constrained by type")) {
    automatedFailures.push("docs/content-integrity.md must document ending requirement direction guard coverage.");
  }

  const privacyNotes = read("docs/privacy-and-data-safety.md");
  if (!privacyNotes.includes("No user data collected or shared") || !privacyNotes.includes("Data Not Collected")) {
    automatedFailures.push("docs/privacy-and-data-safety.md must document data safety and app privacy candidate declarations.");
  }
  if (!privacyNotes.includes("pnpm check:privacy") || !privacyNotes.includes("privacy policy URL remains a manual console gate")) {
    automatedFailures.push("docs/privacy-and-data-safety.md must document privacy evidence verification and remaining manual policy URL gate.");
  }
  if (!privacyNotes.includes("docs/public-release-pages.md") || !privacyNotes.includes("pnpm release:public-pages")) {
    automatedFailures.push("docs/privacy-and-data-safety.md must document public privacy policy page generation.");
  }
  if (!privacyNotes.includes("starlit:analytics") || !privacyNotes.includes("pnpm check:analytics-contract")) {
    automatedFailures.push("docs/privacy-and-data-safety.md must document local-only analytics event contract.");
  }

  const analyticsNotes = read("docs/analytics-contract.md");
  if (
    !analyticsNotes.includes("pnpm check:analytics-contract") ||
    !analyticsNotes.includes("local CustomEvent") ||
    !analyticsNotes.includes("starlit:analytics") ||
    !analyticsNotes.includes("no analytics SDK")
  ) {
    automatedFailures.push("docs/analytics-contract.md must document local analytics contract, CustomEvent transport, and no-SDK boundary.");
  }
  for (const eventName of spec.analytics?.events?.map((event) => event.name) ?? []) {
    if (!analyticsNotes.includes(eventName)) {
      automatedFailures.push(`docs/analytics-contract.md must document ${eventName}.`);
    }
  }

  const publicReleasePageNotes = read("docs/public-release-pages.md");
  if (
    !publicReleasePageNotes.includes("pnpm release:public-pages") ||
    !publicReleasePageNotes.includes("pnpm check:public-pages") ||
    !publicReleasePageNotes.includes("public-pages/privacy-policy.html") ||
    !publicReleasePageNotes.includes("qa/public-release-pages.md")
  ) {
    automatedFailures.push("docs/public-release-pages.md must document generated public pages, packet, and check command.");
  }
  if (!publicReleasePageNotes.includes("Do not paste placeholder URLs") || !publicReleasePageNotes.includes("privacy/support/marketing URL gates")) {
    automatedFailures.push("docs/public-release-pages.md must document public URL manual gate boundaries.");
  }
  if (
    !publicReleasePageNotes.includes("public HTTPS URLs") ||
    !publicReleasePageNotes.includes("username/password credentials") ||
    !publicReleasePageNotes.includes("non-public/reserved IPv4") ||
    !publicReleasePageNotes.includes("IPv6 local/documentation/multicast") ||
    !publicReleasePageNotes.includes("192.0.0.9/32") ||
    !publicReleasePageNotes.includes("192.0.0.10/32") ||
    !publicReleasePageNotes.includes("3fff::/20") ||
    !publicReleasePageNotes.includes("5f00::/16")
  ) {
    automatedFailures.push("docs/public-release-pages.md must document public HTTPS URL credential and host guardrails.");
  }
  if (!publicReleasePageNotes.includes("Native share ending URL base")) {
    automatedFailures.push("docs/public-release-pages.md must document native share ending URL hosting guidance.");
  }
  if (!publicReleasePageNotes.includes("canonical `?ending=<code>` links only")) {
    automatedFailures.push("docs/public-release-pages.md must document canonical ending-only native share URL generation.");
  }
  if (!publicReleasePageNotes.includes("known `@starlit-apprentice/product-core` ending code")) {
    automatedFailures.push("docs/public-release-pages.md must document known ending-code native share URL generation.");
  }

  const thirdPartyNotes = read("docs/third-party-notices.md");
  if (
    !thirdPartyNotes.includes("pnpm check:third-party-notices") ||
    !thirdPartyNotes.includes("@capacitor/core") ||
    !thirdPartyNotes.includes("does not bundle a third-party game engine")
  ) {
    automatedFailures.push("docs/third-party-notices.md must document shipped third-party packages and verification command.");
  }
  if (!thirdPartyNotes.includes("No production ad SDK, analytics SDK, billing SDK, Firebase SDK, or tracking SDK")) {
    automatedFailures.push("docs/third-party-notices.md must document MVP third-party SDK policy boundary.");
  }

  const googlePlayReleaseNotes = read("docs/google-play-release.md");
  if (!googlePlayReleaseNotes.includes("pnpm build:android:aab") || !googlePlayReleaseNotes.includes("Target SDK")) {
    automatedFailures.push("docs/google-play-release.md must document Android AAB build and target SDK evidence.");
  }
  if (!googlePlayReleaseNotes.includes("signed upload AAB still requires upload-key configuration")) {
    automatedFailures.push("docs/google-play-release.md must document the remaining signed upload-key gate.");
  }
  if (!googlePlayReleaseNotes.includes("base/assets/public") || !googlePlayReleaseNotes.includes("SHA-256")) {
    automatedFailures.push("docs/google-play-release.md must document Android AAB web-asset hash parity verification.");
  }
  if (!googlePlayReleaseNotes.includes("pnpm check:android:icons") || !googlePlayReleaseNotes.includes("launcher icon")) {
    automatedFailures.push("docs/google-play-release.md must document Android launcher icon verification.");
  }
  if (!googlePlayReleaseNotes.includes("pnpm check:native-splash") || !googlePlayReleaseNotes.includes("splash")) {
    automatedFailures.push("docs/google-play-release.md must document native splash verification.");
  }
  if (
    !googlePlayReleaseNotes.includes("qa/release-console-evidence.json") ||
    !googlePlayReleaseNotes.includes("GOOGLE_PLAY_CONFIG_PATH") ||
    !googlePlayReleaseNotes.includes("RELEASE_CONSOLE_EVIDENCE_PATH") ||
    !googlePlayReleaseNotes.includes("ANDROID_AAB_PATH") ||
    !googlePlayReleaseNotes.includes("corresponding release console evidence items are `passed`") ||
    !googlePlayReleaseNotes.includes("AAB contains signature metadata")
  ) {
    automatedFailures.push("docs/google-play-release.md must document Google Play strict evidence sources, fixture override paths, and signed AAB metadata boundary.");
  }

  const appStoreReleaseNotes = read("docs/app-store-release.md");
  if (!appStoreReleaseNotes.includes("pnpm check:app-store") || !appStoreReleaseNotes.includes("TARGETED_DEVICE_FAMILY")) {
    automatedFailures.push("docs/app-store-release.md must document App Store release verification and target device family evidence.");
  }
  if (!appStoreReleaseNotes.includes("signed archive/upload still requires Apple Distribution signing")) {
    automatedFailures.push("docs/app-store-release.md must document the remaining Apple Distribution signing gate.");
  }
  if (!appStoreReleaseNotes.includes("App.app/public") || !appStoreReleaseNotes.includes("SHA-256")) {
    automatedFailures.push("docs/app-store-release.md must document iOS .app web-asset hash parity verification.");
  }
  if (!appStoreReleaseNotes.includes("pnpm check:native-splash") || !appStoreReleaseNotes.includes("Splash.imageset")) {
    automatedFailures.push("docs/app-store-release.md must document iOS native splash verification.");
  }
  if (
    !appStoreReleaseNotes.includes("qa/release-console-evidence.json") ||
    !appStoreReleaseNotes.includes("APP_STORE_CONFIG_PATH") ||
    !appStoreReleaseNotes.includes("RELEASE_CONSOLE_EVIDENCE_PATH") ||
    !appStoreReleaseNotes.includes("IOS_APP_PATH") ||
    !appStoreReleaseNotes.includes("corresponding release console evidence items are `passed`") ||
    !appStoreReleaseNotes.includes("_CodeSignature/CodeResources")
  ) {
    automatedFailures.push("docs/app-store-release.md must document App Store strict evidence sources, fixture override paths, and code signature metadata boundary.");
  }

  const appsInTossNotes = read("apps-in-toss/README.md");
  if (!appsInTossNotes.includes("starlit-apprentice")) {
    automatedFailures.push("apps-in-toss/README.md must include appName");
  }

  const appsInTossReleaseNotes = read("docs/apps-in-toss-release.md");
  if (!appsInTossReleaseNotes.includes("pnpm check:apps-in-toss") || !appsInTossReleaseNotes.includes("100MB")) {
    automatedFailures.push("docs/apps-in-toss-release.md must document AppsInToss release checks and bundle size gate.");
  }
  if (!appsInTossReleaseNotes.includes("apps-in-toss/build/starlit-apprentice.ait") || !appsInTossReleaseNotes.includes("console upload")) {
    automatedFailures.push("docs/apps-in-toss-release.md must document local .ait generation and remaining console upload gate.");
  }
  if (
    !appsInTossReleaseNotes.includes("qa/release-console-evidence.json") ||
    !appsInTossReleaseNotes.includes("APPS_IN_TOSS_CONFIG_PATH") ||
    !appsInTossReleaseNotes.includes("RELEASE_CONSOLE_EVIDENCE_PATH") ||
    !appsInTossReleaseNotes.includes("manualEvidence") ||
    !appsInTossReleaseNotes.includes("corresponding release console evidence items are `passed`")
  ) {
    automatedFailures.push("docs/apps-in-toss-release.md must document AppsInToss strict evidence sources and fixture override paths.");
  }

  const releaseAssets = read("docs/release-assets.md");
  for (const expected of ["600 x 600", "1932 x 828", "636 x 1048", "512 x 512", "1024 x 500", "1080 x 1920", "1290 x 2796", "2048 x 2732"]) {
    if (!releaseAssets.includes(expected)) {
      automatedFailures.push(`docs/release-assets.md must include ${expected} asset requirements`);
    }
  }
  if (!releaseAssets.includes("pnpm assets:sync:android-icons") || !releaseAssets.includes("pnpm check:android:icons")) {
    automatedFailures.push("docs/release-assets.md must document Android launcher icon sync and verification.");
  }
  if (!releaseAssets.includes("pnpm assets:sync:native-splash") || !releaseAssets.includes("pnpm check:native-splash")) {
    automatedFailures.push("docs/release-assets.md must document native splash sync and verification.");
  }
  if (!releaseAssets.includes("pnpm check:store-config") || !releaseAssets.includes("byte-identical screenshots")) {
    automatedFailures.push("docs/release-assets.md must document store screenshot duplicate guardrails.");
  }

  const balanceNotes = read("docs/balance-and-reachability.md");
  if (!balanceNotes.includes("30-ending") || !balanceNotes.includes("pnpm check:balance")) {
    automatedFailures.push("docs/balance-and-reachability.md must document 30-ending reachability and pnpm check:balance.");
  }
  if (!balanceNotes.includes("energy >= 20") || !balanceNotes.includes("stress <= 80")) {
    automatedFailures.push("docs/balance-and-reachability.md must document final route resource guardrails.");
  }
  if (!balanceNotes.includes("pnpm check:pacing") || !balanceNotes.includes("first-three-month")) {
    automatedFailures.push("docs/balance-and-reachability.md must document first-three-month pacing guardrails.");
  }
  if (!balanceNotes.includes("scripts/qa-route-plans.mjs") || !balanceNotes.includes("guided-balanced")) {
    automatedFailures.push("docs/balance-and-reachability.md must document shared QA pacing route plans.");
  }
  if (!balanceNotes.includes("getSchedulePlanStatus") || !balanceNotes.includes("schedule affordability")) {
    automatedFailures.push("docs/balance-and-reachability.md must document product-core schedule affordability status.");
  }
  if (!balanceNotes.includes("schedule resource forecast guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document schedule resource forecast guard coverage.");
  }
  if (!balanceNotes.includes("schedule plan status action-list guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document schedule plan status action-list guard coverage.");
  }
  if (!balanceNotes.includes("non-array action lists")) {
    automatedFailures.push("docs/balance-and-reachability.md must document non-array schedule action-list guard coverage.");
  }
  if (!balanceNotes.includes("schedule plan resource finite guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document schedule plan resource finite guard coverage.");
  }
  if (!balanceNotes.includes("schedule plan finite forecast fallback")) {
    automatedFailures.push("docs/balance-and-reachability.md must document schedule plan finite forecast fallback coverage.");
  }
  if (!balanceNotes.includes("schedule plan resource bounds guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document schedule plan resource bounds guard coverage.");
  }
  if (!balanceNotes.includes("schedule plan run-state bounds guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document schedule plan run-state bounds guard coverage.");
  }
  if (!balanceNotes.includes("direct run-state version guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document direct run-state version guard coverage.");
  }
  if (!balanceNotes.includes("direct run-state shape guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document direct run-state shape guard coverage.");
  }
  if (!balanceNotes.includes("new-run seed guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document new-run seed guard coverage.");
  }
  if (!balanceNotes.includes("selectSchedule") || !balanceNotes.includes("core affordability invariant")) {
    automatedFailures.push("docs/balance-and-reachability.md must document selectSchedule core affordability invariant.");
  }
  if (!balanceNotes.includes("monthly schedule overwrite guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document the monthly schedule overwrite guard.");
  }
  if (!balanceNotes.includes("schedule selection slot-index guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document the schedule selection slot-index guard.");
  }
  if (!balanceNotes.includes("schedule selection run-state bounds guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document the schedule selection run-state bounds guard.");
  }
  if (!balanceNotes.includes("progression slot-index/history continuity guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document the progression slot-index/history continuity guard.");
  }
  if (!balanceNotes.includes("progression finite-state guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document the progression finite-state guard.");
  }
  if (!balanceNotes.includes("run-state bounds guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document the run-state bounds guard.");
  }
  if (!balanceNotes.includes("Target recommendation affordability") || !balanceNotes.includes("planned schedule prefix")) {
    automatedFailures.push("docs/balance-and-reachability.md must document target recommendation affordability filtering.");
  }
  if (!balanceNotes.includes("target recommendation planned-action guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document target recommendation planned-action guard coverage.");
  }
  if (!balanceNotes.includes("read-model finite-state guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document read-model finite-state guard coverage.");
  }
  if (!balanceNotes.includes("read-model display limit guard")) {
    automatedFailures.push("docs/balance-and-reachability.md must document read-model display limit guard coverage.");
  }

  const runtimeNotes = read("docs/runtime-qa.md");
  if (!runtimeNotes.includes("pnpm check:runtime") || !runtimeNotes.includes("production preview")) {
    automatedFailures.push("docs/runtime-qa.md must document production preview runtime smoke checks.");
  }
  if (
    !runtimeNotes.includes("first-run guidance") ||
    !runtimeNotes.includes("schedule readiness") ||
    !runtimeNotes.includes("schedule affordability")
  ) {
    automatedFailures.push("docs/runtime-qa.md must document first-run guidance, schedule readiness, and schedule affordability runtime checks.");
  }
  if (!runtimeNotes.includes("collection guidance")) {
    automatedFailures.push("docs/runtime-qa.md must document collection guidance runtime checks.");
  }
  if (!runtimeNotes.includes("target-ending guidance") || !runtimeNotes.includes("target action recommendations")) {
    automatedFailures.push("docs/runtime-qa.md must document target-ending guidance and target action recommendation runtime checks.");
  }
  if (!runtimeNotes.includes("ending evidence")) {
    automatedFailures.push("docs/runtime-qa.md must document ending evidence runtime checks.");
  }
  if (!runtimeNotes.includes("event effect")) {
    automatedFailures.push("docs/runtime-qa.md must document event effect runtime checks.");
  }
  if (!runtimeNotes.includes("dynamic preview port")) {
    automatedFailures.push("docs/runtime-qa.md must document dynamic preview port behavior.");
  }
  if (!runtimeNotes.includes("browser back navigation")) {
    automatedFailures.push("docs/runtime-qa.md must document browser back navigation runtime checks.");
  }
  if (!runtimeNotes.includes("duplicate command event guard")) {
    automatedFailures.push("docs/runtime-qa.md must document duplicate command event guard runtime checks.");
  }
  if (!runtimeNotes.includes("schedule action stale click guard")) {
    automatedFailures.push("docs/runtime-qa.md must document schedule action stale click guard runtime checks.");
  }
  if (!runtimeNotes.includes("duplicate result command guard")) {
    automatedFailures.push("docs/runtime-qa.md must document duplicate result command guard runtime checks.");
  }
  if (!runtimeNotes.includes("room command stale event guard")) {
    automatedFailures.push("docs/runtime-qa.md must document room command stale event guard runtime checks.");
  }
  if (!runtimeNotes.includes("active target reselection guard")) {
    automatedFailures.push("docs/runtime-qa.md must document active target reselection guard runtime checks.");
  }
  if (!runtimeNotes.includes("activity resume elapsed-time guard")) {
    automatedFailures.push("docs/runtime-qa.md must document activity resume elapsed-time guard runtime checks.");
  }
  if (!runtimeNotes.includes("activity reload resume guard")) {
    automatedFailures.push("docs/runtime-qa.md must document activity reload resume guard runtime checks.");
  }
  if (!runtimeNotes.includes("activity visibilitychange resume guard")) {
    automatedFailures.push("docs/runtime-qa.md must document activity visibilitychange resume guard runtime checks.");
  }
  if (!runtimeNotes.includes("activity monotonic clock guard")) {
    automatedFailures.push("docs/runtime-qa.md must document activity monotonic clock guard runtime checks.");
  }
  if (!runtimeNotes.includes("dynamic viewport resize guard")) {
    automatedFailures.push("docs/runtime-qa.md must document dynamic viewport resize guard runtime checks.");
  }
  if (!runtimeNotes.includes("canvas visibilitychange render-loop pause")) {
    automatedFailures.push("docs/runtime-qa.md must document canvas visibilitychange render-loop pause runtime checks.");
  }
  if (!runtimeNotes.includes("canvas pagehide/pageshow render-loop pause")) {
    automatedFailures.push("docs/runtime-qa.md must document canvas pagehide/pageshow render-loop pause runtime checks.");
  }
  if (!runtimeNotes.includes("canvas freeze/resume render-loop pause")) {
    automatedFailures.push("docs/runtime-qa.md must document canvas freeze/resume render-loop pause runtime checks.");
  }
  if (!runtimeNotes.includes("stale browser history state guard")) {
    automatedFailures.push("docs/runtime-qa.md must document stale browser history state guard runtime checks.");
  }
  if (!runtimeNotes.includes("unknown DOM dataset guard")) {
    automatedFailures.push("docs/runtime-qa.md must document unknown DOM dataset guard runtime checks.");
  }
  if (!runtimeNotes.includes("month-complete reload recovery")) {
    automatedFailures.push("docs/runtime-qa.md must document month-complete reload recovery runtime checks.");
  }
  if (!runtimeNotes.includes("shared ending popstate cleanup")) {
    automatedFailures.push("docs/runtime-qa.md must document shared ending popstate cleanup runtime checks.");
  }
  if (!runtimeNotes.includes("shared ending collection isolation")) {
    automatedFailures.push("docs/runtime-qa.md must document shared ending collection isolation runtime checks.");
  }
  if (!runtimeNotes.includes("invalid shared ending URL cleanup")) {
    automatedFailures.push("docs/runtime-qa.md must document invalid shared ending URL cleanup runtime checks.");
  }
  if (!runtimeNotes.includes("shared ending local run preservation")) {
    automatedFailures.push("docs/runtime-qa.md must document shared ending local run preservation runtime checks.");
  }
  if (!runtimeNotes.includes("shared ending synthetic stat suppression")) {
    automatedFailures.push("docs/runtime-qa.md must document shared ending synthetic stat suppression runtime checks.");
  }
  if (!runtimeNotes.includes("saved-ending recovery") || !runtimeNotes.includes("event/ending text readability")) {
    automatedFailures.push("docs/runtime-qa.md must document saved-ending recovery and event/ending readability runtime checks.");
  }
  if (!runtimeNotes.includes("native share invocation") || !runtimeNotes.includes("native share rejection fallback")) {
    automatedFailures.push("docs/runtime-qa.md must document native share success and fallback runtime checks.");
  }
  if (!runtimeNotes.includes("native share in-flight guard")) {
    automatedFailures.push("docs/runtime-qa.md must document native share in-flight guard runtime checks.");
  }
  if (!runtimeNotes.includes("native share stale completion guard")) {
    automatedFailures.push("docs/runtime-qa.md must document native share stale completion guard runtime checks.");
  }
  if (!runtimeNotes.includes("native share stale in-flight retarget guard")) {
    automatedFailures.push("docs/runtime-qa.md must document native share stale in-flight retarget guard runtime checks.");
  }
  if (!runtimeNotes.includes("native share internal URL guard") || !runtimeNotes.includes("native share placeholder URL guard")) {
    automatedFailures.push("docs/runtime-qa.md must document native share internal and placeholder URL guard runtime checks.");
  }
  if (!runtimeNotes.includes("local analytics CustomEvent payloads")) {
    automatedFailures.push("docs/runtime-qa.md must document analytics CustomEvent runtime smoke checks.");
  }
  if (!runtimeNotes.includes("confirmed local data reset")) {
    automatedFailures.push("docs/runtime-qa.md must document confirmed local data reset runtime checks.");
  }
  if (!runtimeNotes.includes("stale collection sanitization")) {
    automatedFailures.push("docs/runtime-qa.md must document stale collection sanitization runtime checks.");
  }
  if (!runtimeNotes.includes("collection save schema version guard") || !runtimeNotes.includes("versioned collection save")) {
    automatedFailures.push("docs/runtime-qa.md must document versioned collection save and collection schema guard runtime checks.");
  }
  if (!runtimeNotes.includes("partial storage recovery")) {
    automatedFailures.push("docs/runtime-qa.md must document partial storage recovery runtime checks.");
  }
  if (!runtimeNotes.includes("storage unavailable fallback")) {
    automatedFailures.push("docs/runtime-qa.md must document storage unavailable fallback runtime checks.");
  }
  if (!runtimeNotes.includes("storage write failure fallback")) {
    automatedFailures.push("docs/runtime-qa.md must document storage write failure fallback runtime checks.");
  }
  if (!runtimeNotes.includes("storage remove failure reset fallback") || !runtimeNotes.includes("versioned empty collection reset fallback")) {
    automatedFailures.push("docs/runtime-qa.md must document storage remove failure reset fallback runtime checks with the versioned empty collection fallback.");
  }
  if (!runtimeNotes.includes("viewport anchor")) {
    automatedFailures.push("docs/runtime-qa.md must document runtime screenshot viewport anchor checks.");
  }
  if (!runtimeNotes.includes("sticky action viewport guard")) {
    automatedFailures.push("docs/runtime-qa.md must document sticky action viewport guard runtime checks.");
  }

  const bundleBudgetNotes = read("docs/bundle-budget.md");
  if (!bundleBudgetNotes.includes("pnpm check:bundle-budget") || !bundleBudgetNotes.includes("publicDir: false")) {
    automatedFailures.push("docs/bundle-budget.md must document the bundle budget checker and publicDir runtime boundary.");
  }
  if (!bundleBudgetNotes.includes("Total gzip dist") || !bundleBudgetNotes.includes("sourcemaps")) {
    automatedFailures.push("docs/bundle-budget.md must document runtime dist budgets and sourcemap exclusion.");
  }

  const uiAccessibilityNotes = read("docs/ui-accessibility.md");
  if (!uiAccessibilityNotes.includes("pnpm check:ui-accessibility") || !uiAccessibilityNotes.includes("44 x 44")) {
    automatedFailures.push("docs/ui-accessibility.md must document UI accessibility verification and touch target size.");
  }
  if (!uiAccessibilityNotes.includes("prefers-reduced-motion") || !uiAccessibilityNotes.includes("visible focus style")) {
    automatedFailures.push("docs/ui-accessibility.md must document reduced-motion and focus-style checks.");
  }
  if (!uiAccessibilityNotes.includes("reduced-motion canvas") || !uiAccessibilityNotes.includes("render-loop stays paused")) {
    automatedFailures.push("docs/ui-accessibility.md must document reduced-motion canvas stability and render-loop pause checks.");
  }
  if (!uiAccessibilityNotes.includes("color contrast")) {
    automatedFailures.push("docs/ui-accessibility.md must document text color contrast checks.");
  }
  if (!uiAccessibilityNotes.includes("sticky bottom action") || !uiAccessibilityNotes.includes("not occluded")) {
    automatedFailures.push("docs/ui-accessibility.md must document sticky bottom action viewport and occlusion checks.");
  }

  const manualQaNotes = read("docs/manual-qa.md");
  if (!manualQaNotes.includes("pnpm check:manual-qa") || !manualQaNotes.includes("qa/manual-qa-evidence.json")) {
    automatedFailures.push("docs/manual-qa.md must document the manual QA evidence checker and source file.");
  }
  if (
    !manualQaNotes.includes("MANUAL_QA_EVIDENCE_PATH") ||
    !manualQaNotes.includes("RELEASE_ARTIFACT_MANIFEST_PATH") ||
    !manualQaNotes.includes("fixture validation")
  ) {
    automatedFailures.push("docs/manual-qa.md must document manual QA fixture override paths.");
  }
  if (!manualQaNotes.includes("target-device-pacing") || !manualQaNotes.includes("apps-in-toss-preview")) {
    automatedFailures.push("docs/manual-qa.md must document target-device and AppsInToss preview manual QA items.");
  }
  if (!manualQaNotes.includes("manualQaBuildId") || !manualQaNotes.includes("qa/release-artifact-manifest.json")) {
    automatedFailures.push("docs/manual-qa.md must document release artifact manifest usage for manual QA evidence.");
  }
  if (
    !manualQaNotes.includes("public HTTPS URL") ||
    !manualQaNotes.includes("canonical ending-only link") ||
    !manualQaNotes.includes("known `@starlit-apprentice/product-core` ending code") ||
    !manualQaNotes.includes("targetEvidence[].receivedShareUrl") ||
    !manualQaNotes.includes("capacitor://localhost") ||
    !manualQaNotes.includes("example.com")
  ) {
    automatedFailures.push("docs/manual-qa.md must document native share public HTTPS URL evidence requirements, known ending-code validation, and receivedShareUrl capture.");
  }
  if (!manualQaNotes.includes("pnpm release:manual-qa-packet") || !manualQaNotes.includes("qa/manual-qa-packet.md")) {
    automatedFailures.push("docs/manual-qa.md must document manual QA handoff packet generation and output file.");
  }
  if (
    !manualQaNotes.includes("deterministic route cues") ||
    !manualQaNotes.includes("product-core action data") ||
    !manualQaNotes.includes("scripts/qa-route-plans.mjs")
  ) {
    automatedFailures.push("docs/manual-qa.md must document deterministic route cues in the manual QA packet.");
  }
  if (!manualQaNotes.includes("Local screenshot and recording paths must be repo-relative files that exist")) {
    automatedFailures.push("docs/manual-qa.md must document local attachment path existence validation.");
  }
  if (
    !manualQaNotes.includes("public, credential-free, non-placeholder URL") ||
    !manualQaNotes.includes("credential-free") ||
    !manualQaNotes.includes("credentialed URLs with username/password") ||
    !manualQaNotes.includes("IPv6 local/documentation/multicast") ||
    !manualQaNotes.includes("example.com")
  ) {
    automatedFailures.push("docs/manual-qa.md must document manual QA credential/placeholder/internal URL rejection.");
  }
  if (!manualQaNotes.includes("target-specific evidence coverage") || !manualQaNotes.includes("targetEvidence[]")) {
    automatedFailures.push("docs/manual-qa.md must document target-specific manual QA evidence coverage.");
  }
  if (!manualQaNotes.includes("local unsigned iOS `.app`") || !manualQaNotes.includes("AAB alone is not target-device QA evidence")) {
    automatedFailures.push("docs/manual-qa.md must document target-device artifact-use boundaries.");
  }
  if (!manualQaNotes.includes("local `.ait` alone is package evidence only") || !manualQaNotes.includes("stable console QR/test-scheme evidence")) {
    automatedFailures.push("docs/manual-qa.md must document AppsInToss .ait and console QR/test-scheme evidence boundaries.");
  }

  const releaseConsoleNotes = read("docs/release-console-evidence.md");
  if (!releaseConsoleNotes.includes("pnpm check:release-console") || !releaseConsoleNotes.includes("qa/release-console-evidence.json")) {
    automatedFailures.push("docs/release-console-evidence.md must document the release console evidence checker and source file.");
  }
  if (
    !releaseConsoleNotes.includes("RELEASE_CONSOLE_EVIDENCE_PATH") ||
    !releaseConsoleNotes.includes("RELEASE_ARTIFACT_MANIFEST_PATH") ||
    !releaseConsoleNotes.includes("fixture validation")
  ) {
    automatedFailures.push("docs/release-console-evidence.md must document release console fixture override paths.");
  }
  if (!releaseConsoleNotes.includes("pnpm release:console-packet") || !releaseConsoleNotes.includes("qa/release-console-packet.md")) {
    automatedFailures.push("docs/release-console-evidence.md must document release console packet generation and output file.");
  }
  if (!releaseConsoleNotes.includes("apps-in-toss-ait-upload") || !releaseConsoleNotes.includes("google-play-signed-aab-upload") || !releaseConsoleNotes.includes("app-store-signed-build-upload")) {
    automatedFailures.push("docs/release-console-evidence.md must document AppsInToss, Google Play, and App Store console evidence items.");
  }
  if (!releaseConsoleNotes.includes("manualQaBuildId") || !releaseConsoleNotes.includes("qa/release-artifact-manifest.json")) {
    automatedFailures.push("docs/release-console-evidence.md must document release artifact manifest usage for console evidence.");
  }
  if (!releaseConsoleNotes.includes("Local screenshot and recording paths must be repo-relative files that exist")) {
    automatedFailures.push("docs/release-console-evidence.md must document local attachment path existence validation.");
  }
  if (
    !releaseConsoleNotes.includes("Dependency Rules") ||
    !releaseConsoleNotes.includes("apps-in-toss-deployment-approval") ||
    !releaseConsoleNotes.includes("google-play-track-preview") ||
    !releaseConsoleNotes.includes("app-store-review-metadata")
  ) {
    automatedFailures.push("docs/release-console-evidence.md must document release console dependency rules.");
  }
  if (
    !releaseConsoleNotes.includes("local Android QA APK") ||
    !releaseConsoleNotes.includes("local unsigned/upload AAB") ||
    !releaseConsoleNotes.includes("local unsigned iOS `.app`") ||
    !releaseConsoleNotes.includes("target-specific console reference")
  ) {
    automatedFailures.push("docs/release-console-evidence.md must document local artifact boundaries and target-specific console references.");
  }
  if (
    !releaseConsoleNotes.includes("public, credential-free, non-placeholder URL") ||
    !releaseConsoleNotes.includes("credential-free") ||
    !releaseConsoleNotes.includes("credentialed URLs with username/password") ||
    !releaseConsoleNotes.includes("IPv6 local/documentation/multicast") ||
    !releaseConsoleNotes.includes("example.com")
  ) {
    automatedFailures.push("docs/release-console-evidence.md must document release console credential/placeholder/internal URL rejection.");
  }

  const releaseApprovalNotes = read("docs/release-approval.md");
  if (
    !releaseApprovalNotes.includes("pnpm check:release-approval") ||
    !releaseApprovalNotes.includes("qa/release-approval-evidence.json") ||
    !releaseApprovalNotes.includes("qa/release-approval-packet.md") ||
    !releaseApprovalNotes.includes("manualQaBuildId")
  ) {
    automatedFailures.push("docs/release-approval.md must document release approval evidence, packet, checker, and artifact binding.");
  }
  if (!releaseApprovalNotes.includes("Do not submit review, publish production, or start rollout")) {
    automatedFailures.push("docs/release-approval.md must document final release approval stop rules.");
  }
  if (
    !releaseApprovalNotes.includes("pnpm check:manual-qa:strict") ||
    !releaseApprovalNotes.includes("pnpm check:release-console:strict") ||
    !releaseApprovalNotes.includes("pnpm check:store-config:strict") ||
    !releaseApprovalNotes.includes("native-share `receivedShareUrl` validation") ||
    !releaseApprovalNotes.includes("store public URL guardrails")
  ) {
    automatedFailures.push("docs/release-approval.md must document strict prerequisite checks before final approval.");
  }
  if (
    !releaseApprovalNotes.includes("RELEASE_APPROVAL_EVIDENCE_PATH") ||
    !releaseApprovalNotes.includes("RELEASE_ARTIFACT_MANIFEST_PATH") ||
    !releaseApprovalNotes.includes("MANUAL_QA_EVIDENCE_PATH") ||
    !releaseApprovalNotes.includes("RELEASE_CONSOLE_EVIDENCE_PATH") ||
    !releaseApprovalNotes.includes("GOOGLE_PLAY_CONFIG_PATH") ||
    !releaseApprovalNotes.includes("APP_STORE_CONFIG_PATH") ||
    !releaseApprovalNotes.includes("strict prerequisite checkers")
  ) {
    automatedFailures.push("docs/release-approval.md must document release approval fixture override paths and strict prerequisite propagation.");
  }
  if (
    !releaseApprovalNotes.includes("repo-local generated packets") ||
    !releaseApprovalNotes.includes("local build artifacts") ||
    !releaseApprovalNotes.includes("username/password credentials") ||
    !releaseApprovalNotes.includes("placeholder URLs such as `example.com`")
  ) {
    automatedFailures.push("docs/release-approval.md must document final approval reference boundaries.");
  }
  const releaseApprovalPacket = read("qa/release-approval-packet.md");
  if (!releaseApprovalPacket.includes("Store invalid public URL fields")) {
    automatedFailures.push("qa/release-approval-packet.md must summarize invalid store public URL fields before final approval.");
  }
  if (
    !releaseApprovalPacket.includes("RELEASE_APPROVAL_EVIDENCE_PATH") ||
    !releaseApprovalPacket.includes("strict prerequisite checkers")
  ) {
    automatedFailures.push("qa/release-approval-packet.md must document release approval fixture override paths.");
  }

  const artifactManifestNotes = read("docs/release-artifact-manifest.md");
  if (
    !artifactManifestNotes.includes("pnpm release:artifact-manifest") ||
    !artifactManifestNotes.includes("pnpm check:release-artifact-manifest") ||
    !artifactManifestNotes.includes("manualQaBuildId")
  ) {
    automatedFailures.push("docs/release-artifact-manifest.md must document artifact manifest generation, verification, and manual QA build ID.");
  }
  if (
    !artifactManifestNotes.includes("verification command set") ||
    !artifactManifestNotes.includes("pnpm check:release-verification-commands") ||
    !artifactManifestNotes.includes("pnpm check:release-manual-blockers") ||
    !artifactManifestNotes.includes("pnpm check:public-url-guard") ||
    !artifactManifestNotes.includes("scripts/release-verification-commands.mjs") ||
    !artifactManifestNotes.includes("README.md") ||
    !artifactManifestNotes.includes("AGENT.md")
  ) {
    automatedFailures.push("docs/release-artifact-manifest.md must document the shared release verification command set.");
  }

  const releaseReadinessNotes = read("docs/release-readiness.md");
  if (
    !releaseReadinessNotes.includes("qa/store-submission-packet.md") ||
    !releaseReadinessNotes.includes("pnpm check:store-submission-packet") ||
    !releaseReadinessNotes.includes("invalid public URL field counts") ||
    !releaseReadinessNotes.includes("release gate status") ||
    !releaseReadinessNotes.includes("not-submittable") ||
    !releaseReadinessNotes.includes("qa/rating-content-inventory.md") ||
    !releaseReadinessNotes.includes("pnpm check:rating-content-inventory") ||
    !releaseReadinessNotes.includes("qa/public-release-pages.md") ||
    !releaseReadinessNotes.includes("pnpm check:public-pages") ||
    !releaseReadinessNotes.includes("qa/release-gate-dashboard.md") ||
    !releaseReadinessNotes.includes("pnpm check:release-gate-dashboard") ||
    !releaseReadinessNotes.includes("open manual/console gate counts") ||
    !releaseReadinessNotes.includes("qa/release-approval-evidence.json") ||
    !releaseReadinessNotes.includes("pnpm check:release-approval")
  ) {
    automatedFailures.push("docs/release-readiness.md must document the generated rating inventory, public release pages, store submission packet, release gate dashboard, release approval evidence, and checkers.");
  }
  if (!releaseReadinessNotes.includes("repo-local rating answer snapshot")) {
    automatedFailures.push("docs/release-readiness.md must document the repo-local rating answer snapshot.");
  }
  if (!releaseReadinessNotes.includes("ending requirement direction guard")) {
    automatedFailures.push("docs/release-readiness.md must document ending requirement direction guard coverage.");
  }
  if (!releaseReadinessNotes.includes("Manual blocker reporting is evidence-conditioned")) {
    automatedFailures.push("docs/release-readiness.md must document evidence-conditioned manual blocker reporting.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:release-manual-blockers")) {
    automatedFailures.push("docs/release-readiness.md must document the release manual blocker fixture check.");
  }
  const releaseGateDashboardNotes = read("qa/release-gate-dashboard.md");
  if (
    !releaseGateDashboardNotes.includes("native-share") ||
    !releaseGateDashboardNotes.includes("targetEvidence[].receivedShareUrl") ||
    !releaseGateDashboardNotes.includes("known product-core ending code")
  ) {
    automatedFailures.push("qa/release-gate-dashboard.md must include the native-share receivedShareUrl known ending-code stop rule.");
  }
  if (
    !releaseReadinessNotes.includes("native-share `targetEvidence[].receivedShareUrl`") ||
    !releaseReadinessNotes.includes("known ending-code stop rules")
  ) {
    automatedFailures.push("docs/release-readiness.md must document native-share receivedShareUrl and known ending-code release gate dashboard stop rules.");
  }
  if (!releaseReadinessNotes.includes("target action recommendations")) {
    automatedFailures.push("docs/release-readiness.md must document target action recommendation runtime coverage.");
  }
  if (!releaseReadinessNotes.includes("target recommendation affordability filtering")) {
    automatedFailures.push("docs/release-readiness.md must document target recommendation affordability filtering.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("schedule plan status action-list guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core schedule plan status guard coverage.");
  }
  if (!releaseReadinessNotes.includes("non-array action lists")) {
    automatedFailures.push("docs/release-readiness.md must document non-array schedule action-list guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("schedule resource forecast guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core schedule resource forecast guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("schedule plan resource finite guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core schedule resource finite guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("schedule plan finite forecast fallback")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core schedule plan finite forecast fallback coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("schedule plan resource bounds guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core schedule resource bounds guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("schedule plan run-state bounds guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core schedule plan run-state bounds guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built direct run-state version guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core direct run-state version guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built direct run-state shape guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core direct run-state shape guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built non-object direct run-state guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core non-object direct run-state guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built new-run seed guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core new-run seed guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built zero-persist RNG seed guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core zero-persist RNG seed guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("static registry immutability guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core static registry immutability guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built registry lookup guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core registry lookup guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built public URL guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core public URL guard coverage.");
  }
  if (!releaseReadinessNotes.includes("built known ending-code share URL guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core known ending-code share URL guard coverage.");
  }
  if (
    !releaseReadinessNotes.includes("pnpm check:public-url-guard") ||
    !releaseReadinessNotes.includes("pnpm check:release-verification-commands") ||
    !releaseReadinessNotes.includes("public URL guard parity") ||
    !releaseReadinessNotes.includes("scripts/public-url-guard.mjs") ||
    !releaseReadinessNotes.includes("@starlit-apprentice/product-core") ||
    !releaseReadinessNotes.includes("agree on public") ||
    !releaseReadinessNotes.includes("192.0.0.9/32") ||
    !releaseReadinessNotes.includes("192.0.0.10/32") ||
    !releaseReadinessNotes.includes("64:ff9b:1::/48") ||
    !releaseReadinessNotes.includes("3fff::/20") ||
    !releaseReadinessNotes.includes("5f00::/16") ||
    !releaseReadinessNotes.includes("unknown ending-code rejection")
  ) {
    automatedFailures.push("docs/release-readiness.md must document public URL guard parity coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("read-model finite-state guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core read-model finite-state guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built serializeRun save-write finite-state guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core serializeRun save-write guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built serializeRun save-write version guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core serializeRun save-write version guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built serializeRun save-write registry guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core serializeRun save-write registry guard coverage.");
  }
  if (
    !releaseReadinessNotes.includes("pnpm check:package") ||
    !releaseReadinessNotes.includes("built serializeRun save-write flag guard") ||
    !releaseReadinessNotes.includes("known flag keys")
  ) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core serializeRun save-write flag guard and known flag key coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built serializeRun save-write history guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core serializeRun save-write history guard coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("built serializeCollection save-write registry guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core serializeCollection save-write registry guard coverage.");
  }
  if (!releaseReadinessNotes.includes("built collection load-time stale ending sanitization")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core collection load-time sanitization coverage.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:package") || !releaseReadinessNotes.includes("read-model display limit guard")) {
    automatedFailures.push("docs/release-readiness.md must document packaged product-core read-model display limit guard coverage.");
  }
  if (!releaseReadinessNotes.includes("run-state bounds guard")) {
    automatedFailures.push("docs/release-readiness.md must document run-state bounds guard release coverage.");
  }
  if (
    !releaseReadinessNotes.includes("pnpm check:target-guidance") ||
    !releaseReadinessNotes.includes("getEndingActionRecommendations")
  ) {
    automatedFailures.push("docs/release-readiness.md must document target guidance recommendation coverage.");
  }
  if (!releaseReadinessNotes.includes("target recommendation planned-action guard")) {
    automatedFailures.push("docs/release-readiness.md must document target recommendation planned-action guard coverage.");
  }
  if (!releaseReadinessNotes.includes("schedule affordability")) {
    automatedFailures.push("docs/release-readiness.md must document schedule affordability runtime coverage.");
  }
  if (!releaseReadinessNotes.includes("runtime screenshot viewport anchor checks")) {
    automatedFailures.push("docs/release-readiness.md must document runtime screenshot viewport anchor checks.");
  }
  if (!releaseReadinessNotes.includes("text color contrast checks")) {
    automatedFailures.push("docs/release-readiness.md must document text color contrast release coverage.");
  }
  if (
    !releaseReadinessNotes.includes("reduced-motion canvas stability") ||
    !releaseReadinessNotes.includes("reduced-motion canvas render-loop pause")
  ) {
    automatedFailures.push("docs/release-readiness.md must document reduced-motion canvas stability and render-loop pause release coverage.");
  }
  if (!releaseReadinessNotes.includes("duplicate screenshot guardrails")) {
    automatedFailures.push("docs/release-readiness.md must document store screenshot duplicate guardrails.");
  }
  if (!releaseReadinessNotes.includes("pnpm check:analytics-contract") || !releaseReadinessNotes.includes("starlit:analytics")) {
    automatedFailures.push("docs/release-readiness.md must document analytics contract release coverage.");
  }
  if (!releaseReadinessNotes.includes("confirmed local data reset")) {
    automatedFailures.push("docs/release-readiness.md must document local data reset release coverage.");
  }
  if (!releaseReadinessNotes.includes("malformed history entry cleanup") || !releaseReadinessNotes.includes("invalid history month/slot cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document malformed history entry and invalid month/slot cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("history event cleanup") || !releaseReadinessNotes.includes("generated monthly event round-trip")) {
    automatedFailures.push("docs/release-readiness.md must document history event cleanup and monthly event round-trip coverage.");
  }
  if (!releaseReadinessNotes.includes("not-started saved schedule affordability cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document saved schedule affordability cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("in-progress saved schedule continuity cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document in-progress saved schedule continuity cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("completed saved schedule continuity cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document completed saved schedule continuity cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("saved month progress cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document saved month progress cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("saved schedule month progress cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document saved schedule month progress cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("saved progress flag history cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document saved progress flag history cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("saved history progress cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document saved history progress cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("monthly schedule overwrite guard")) {
    automatedFailures.push("docs/release-readiness.md must document monthly schedule overwrite guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("schedule selection slot-index guard")) {
    automatedFailures.push("docs/release-readiness.md must document schedule selection slot-index guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("schedule selection run-state bounds guard")) {
    automatedFailures.push("docs/release-readiness.md must document schedule selection run-state bounds guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("partial/orphan-slot schedule overwrite guard")) {
    automatedFailures.push("docs/release-readiness.md must document partial/orphan-slot schedule overwrite guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("progression slot-index/history continuity guard")) {
    automatedFailures.push("docs/release-readiness.md must document progression slot-index/history continuity guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("progression finite-state guard")) {
    automatedFailures.push("docs/release-readiness.md must document progression finite-state guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("registry-backed history label canonicalization")) {
    automatedFailures.push("docs/release-readiness.md must document registry-backed history label canonicalization release coverage.");
  }
  if (!releaseReadinessNotes.includes("plausible flag count caps") || !releaseReadinessNotes.includes("unknown saved flag cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document save flag count cap and unknown saved flag cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("premature endingCode cleanup") || !releaseReadinessNotes.includes("completed run endingCode canonicalization")) {
    automatedFailures.push("docs/release-readiness.md must document saved endingCode cleanup and canonicalization release coverage.");
  }
  if (!releaseReadinessNotes.includes("run unlocked ending scope cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document run unlocked ending scope cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("shared ending synthetic stat suppression")) {
    automatedFailures.push("docs/release-readiness.md must document shared ending synthetic stat suppression release coverage.");
  }
  if (!releaseReadinessNotes.includes("shared ending popstate cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document shared ending popstate cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("invalid shared ending URL cleanup")) {
    automatedFailures.push("docs/release-readiness.md must document invalid shared ending URL cleanup release coverage.");
  }
  if (!releaseReadinessNotes.includes("duplicate command event guard")) {
    automatedFailures.push("docs/release-readiness.md must document duplicate command event guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("schedule action stale click guard")) {
    automatedFailures.push("docs/release-readiness.md must document schedule action stale click guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("duplicate result command guard")) {
    automatedFailures.push("docs/release-readiness.md must document duplicate result command guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("room command stale event guard")) {
    automatedFailures.push("docs/release-readiness.md must document room command stale event guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("active target reselection guard")) {
    automatedFailures.push("docs/release-readiness.md must document active target reselection guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("activity resume elapsed-time guard")) {
    automatedFailures.push("docs/release-readiness.md must document activity resume elapsed-time guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("activity reload resume guard")) {
    automatedFailures.push("docs/release-readiness.md must document activity reload resume guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("activity visibilitychange resume guard")) {
    automatedFailures.push("docs/release-readiness.md must document activity visibilitychange resume guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("activity monotonic clock guard")) {
    automatedFailures.push("docs/release-readiness.md must document activity monotonic clock guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("dynamic viewport resize guard")) {
    automatedFailures.push("docs/release-readiness.md must document dynamic viewport resize guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("canvas visibilitychange render-loop pause")) {
    automatedFailures.push("docs/release-readiness.md must document canvas visibilitychange render-loop pause release coverage.");
  }
  if (!releaseReadinessNotes.includes("canvas pagehide/pageshow render-loop pause")) {
    automatedFailures.push("docs/release-readiness.md must document canvas pagehide/pageshow render-loop pause release coverage.");
  }
  if (!releaseReadinessNotes.includes("canvas freeze/resume render-loop pause")) {
    automatedFailures.push("docs/release-readiness.md must document canvas freeze/resume render-loop pause release coverage.");
  }
  if (!releaseReadinessNotes.includes("native share in-flight guard")) {
    automatedFailures.push("docs/release-readiness.md must document native share in-flight guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("native share stale completion guard")) {
    automatedFailures.push("docs/release-readiness.md must document native share stale completion guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("native share stale in-flight retarget guard")) {
    automatedFailures.push("docs/release-readiness.md must document native share stale in-flight retarget guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("stale browser history state guard")) {
    automatedFailures.push("docs/release-readiness.md must document stale browser history state guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("unknown DOM dataset guard")) {
    automatedFailures.push("docs/release-readiness.md must document unknown DOM dataset guard release coverage.");
  }
  if (
    !releaseReadinessNotes.includes("non-object/missing-version/unsupported-version/malformed JSON run save rejection")
  ) {
    automatedFailures.push("docs/release-readiness.md must document malformed run save rejection release coverage.");
  }
  if (
    !releaseReadinessNotes.includes("product-core loader JSON parse guard") ||
    !releaseReadinessNotes.includes("malformed JSON collection save rejection")
  ) {
    automatedFailures.push("docs/release-readiness.md must document product-core loader JSON parse guard coverage for run and collection saves.");
  }
  if (!releaseReadinessNotes.includes("save schema version guard")) {
    automatedFailures.push("docs/release-readiness.md must document save schema version guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("collection save schema version guard") || !releaseReadinessNotes.includes("versioned collection save sanitization")) {
    automatedFailures.push("docs/release-readiness.md must document collection save schema version guard release coverage.");
  }
  if (!releaseReadinessNotes.includes("partial storage recovery")) {
    automatedFailures.push("docs/release-readiness.md must document partial storage recovery release coverage.");
  }
  if (!releaseReadinessNotes.includes("storage unavailable fallback")) {
    automatedFailures.push("docs/release-readiness.md must document storage unavailable fallback release coverage.");
  }
  if (!releaseReadinessNotes.includes("storage write failure fallback")) {
    automatedFailures.push("docs/release-readiness.md must document storage write failure fallback release coverage.");
  }
  if (!releaseReadinessNotes.includes("storage remove failure reset fallback") || !releaseReadinessNotes.includes("versioned empty collection reset fallback")) {
    automatedFailures.push("docs/release-readiness.md must document storage remove failure reset fallback release coverage with the versioned empty collection fallback.");
  }
  if (!releaseReadinessNotes.includes("target-specific evidence coverage") || !releaseReadinessNotes.includes("open target evidence entries")) {
    automatedFailures.push("docs/release-readiness.md must document target-specific manual QA coverage.");
  }
  if (!releaseReadinessNotes.includes("prerequisite ordering")) {
    automatedFailures.push("docs/release-readiness.md must document release console prerequisite ordering.");
  }
  if (
    !releaseReadinessNotes.includes("store public URL guardrails") ||
    !releaseReadinessNotes.includes("HTTPS-only") ||
    !releaseReadinessNotes.includes("credential-free") ||
    !releaseReadinessNotes.includes("username/password credential") ||
    !releaseReadinessNotes.includes("localhost/non-public IPv4/IPv6")
  ) {
    automatedFailures.push("docs/release-readiness.md must document store public URL guardrails.");
  }
  if (
    !releaseReadinessNotes.includes("public HTTPS credential-free native share ending URL evidence") ||
    !releaseReadinessNotes.includes("canonical ending-only share URLs") ||
    !releaseReadinessNotes.includes("known `@starlit-apprentice/product-core` ending codes") ||
    !releaseReadinessNotes.includes("targetEvidence[].receivedShareUrl") ||
    !releaseReadinessNotes.includes("shared product-core URL validation")
  ) {
    automatedFailures.push("docs/release-readiness.md must document native share public HTTPS ending URL evidence, known ending-code validation, receivedShareUrl capture, and shared URL validation.");
  }

  const saveContractNotes = read("docs/save-contract.md");
  if (!saveContractNotes.includes("pnpm check:save-contract") || !saveContractNotes.includes("RunState.version")) {
    automatedFailures.push("docs/save-contract.md must document the save contract checker and run schema.");
  }
  if (!saveContractNotes.includes("old three-slot saves") || !saveContractNotes.includes("stale collection sanitization")) {
    automatedFailures.push("docs/save-contract.md must document legacy schedule and stale collection sanitization.");
  }
  if (!saveContractNotes.includes("shared ending collection isolation")) {
    automatedFailures.push("docs/save-contract.md must document shared ending collection isolation.");
  }
  if (!saveContractNotes.includes("invalid shared ending URL cleanup")) {
    automatedFailures.push("docs/save-contract.md must document invalid shared ending URL cleanup.");
  }
  if (!saveContractNotes.includes("shared ending local run preservation")) {
    automatedFailures.push("docs/save-contract.md must document shared ending local run preservation.");
  }
  if (!saveContractNotes.includes("shared ending synthetic stat suppression")) {
    automatedFailures.push("docs/save-contract.md must document shared ending synthetic stat suppression.");
  }
  if (!saveContractNotes.includes("shared ending popstate cleanup")) {
    automatedFailures.push("docs/save-contract.md must document shared ending popstate cleanup.");
  }
  if (!saveContractNotes.includes("partial storage recovery")) {
    automatedFailures.push("docs/save-contract.md must document partial storage recovery.");
  }
  if (!saveContractNotes.includes("storage unavailable fallback")) {
    automatedFailures.push("docs/save-contract.md must document storage unavailable fallback.");
  }
  if (!saveContractNotes.includes("storage write failure fallback")) {
    automatedFailures.push("docs/save-contract.md must document storage write failure fallback.");
  }
  if (
    !saveContractNotes.includes("storage remove failure reset fallback") ||
    !saveContractNotes.includes("fallback writes") ||
    !saveContractNotes.includes("versioned empty collection reset fallback")
  ) {
    automatedFailures.push("docs/save-contract.md must document storage remove failure reset fallback with the versioned empty collection fallback.");
  }
  if (!saveContractNotes.includes("malformed history entry cleanup") || !saveContractNotes.includes("invalid history month/slot cleanup")) {
    automatedFailures.push("docs/save-contract.md must document malformed history entry and invalid month/slot cleanup.");
  }
  if (!saveContractNotes.includes("history event cleanup") || !saveContractNotes.includes("generated monthly event round-trip")) {
    automatedFailures.push("docs/save-contract.md must document history event cleanup and monthly event round-trip coverage.");
  }
  if (!saveContractNotes.includes("not-started saved schedule affordability cleanup")) {
    automatedFailures.push("docs/save-contract.md must document saved schedule affordability cleanup.");
  }
  if (!saveContractNotes.includes("in-progress saved schedule continuity cleanup")) {
    automatedFailures.push("docs/save-contract.md must document in-progress saved schedule continuity cleanup.");
  }
  if (!saveContractNotes.includes("completed saved schedule continuity cleanup")) {
    automatedFailures.push("docs/save-contract.md must document completed saved schedule continuity cleanup.");
  }
  if (!saveContractNotes.includes("saved month progress cleanup")) {
    automatedFailures.push("docs/save-contract.md must document saved month progress cleanup.");
  }
  if (!saveContractNotes.includes("saved schedule month progress cleanup")) {
    automatedFailures.push("docs/save-contract.md must document saved schedule month progress cleanup.");
  }
  if (!saveContractNotes.includes("saved progress flag history cleanup")) {
    automatedFailures.push("docs/save-contract.md must document saved progress flag history cleanup.");
  }
  if (!saveContractNotes.includes("saved history progress cleanup")) {
    automatedFailures.push("docs/save-contract.md must document saved history progress cleanup.");
  }
  if (!saveContractNotes.includes("monthly schedule overwrite guard")) {
    automatedFailures.push("docs/save-contract.md must document monthly schedule overwrite guard coverage.");
  }
  if (!saveContractNotes.includes("schedule selection slot-index guard")) {
    automatedFailures.push("docs/save-contract.md must document schedule selection slot-index guard coverage.");
  }
  if (!saveContractNotes.includes("schedule selection run-state bounds guard")) {
    automatedFailures.push("docs/save-contract.md must document schedule selection run-state bounds guard coverage.");
  }
  if (!saveContractNotes.includes("partial/orphan-slot schedule overwrite guard")) {
    automatedFailures.push("docs/save-contract.md must document partial/orphan-slot schedule overwrite guard coverage.");
  }
  if (!saveContractNotes.includes("progression slot-index/history continuity guard")) {
    automatedFailures.push("docs/save-contract.md must document progression slot-index/history continuity guard coverage.");
  }
  if (!saveContractNotes.includes("progression finite-state guard")) {
    automatedFailures.push("docs/save-contract.md must document progression finite-state guard coverage.");
  }
  if (!saveContractNotes.includes("run-state bounds guard")) {
    automatedFailures.push("docs/save-contract.md must document run-state bounds guard coverage.");
  }
  if (!saveContractNotes.includes("direct run-state version guard")) {
    automatedFailures.push("docs/save-contract.md must document direct run-state version guard coverage.");
  }
  if (!saveContractNotes.includes("direct run-state shape guard")) {
    automatedFailures.push("docs/save-contract.md must document direct run-state shape guard coverage.");
  }
  if (!saveContractNotes.includes("non-object direct run-state guard")) {
    automatedFailures.push("docs/save-contract.md must document non-object direct run-state guard coverage.");
  }
  if (!saveContractNotes.includes("new-run seed guard")) {
    automatedFailures.push("docs/save-contract.md must document new-run seed guard coverage.");
  }
  if (!saveContractNotes.includes("zero-persist RNG seed guard")) {
    automatedFailures.push("docs/save-contract.md must document zero-persist RNG seed guard coverage.");
  }
  if (!saveContractNotes.includes("serializeRun save-write finite-state guard")) {
    automatedFailures.push("docs/save-contract.md must document serializeRun save-write finite-state guard coverage.");
  }
  if (!saveContractNotes.includes("serializeRun save-write version guard")) {
    automatedFailures.push("docs/save-contract.md must document serializeRun save-write version guard coverage.");
  }
  if (!saveContractNotes.includes("serializeRun save-write registry guard")) {
    automatedFailures.push("docs/save-contract.md must document serializeRun save-write registry guard coverage.");
  }
  if (!saveContractNotes.includes("serializeRun save-write flag guard")) {
    automatedFailures.push("docs/save-contract.md must document serializeRun save-write flag guard coverage.");
  }
  if (!saveContractNotes.includes("serializeRun save-write history guard")) {
    automatedFailures.push("docs/save-contract.md must document serializeRun save-write history guard coverage.");
  }
  if (!saveContractNotes.includes("serializeCollection save-write registry guard")) {
    automatedFailures.push("docs/save-contract.md must document serializeCollection save-write registry guard coverage.");
  }
  if (!saveContractNotes.includes("registry-backed history label canonicalization")) {
    automatedFailures.push("docs/save-contract.md must document registry-backed history label canonicalization coverage.");
  }
  if (
    !saveContractNotes.includes("plausible flag count caps") ||
    !saveContractNotes.includes("48-slot") ||
    !saveContractNotes.includes("336-day") ||
    !saveContractNotes.includes("unknown saved flag cleanup") ||
    !saveContractNotes.includes("known flag key guard")
  ) {
    automatedFailures.push("docs/save-contract.md must document save flag count caps, unknown saved flag cleanup, and known flag key guard.");
  }
  if (!saveContractNotes.includes("premature endingCode cleanup") || !saveContractNotes.includes("completed run endingCode canonicalization")) {
    automatedFailures.push("docs/save-contract.md must document saved endingCode cleanup and canonicalization.");
  }
  if (!saveContractNotes.includes("run unlocked ending scope cleanup")) {
    automatedFailures.push("docs/save-contract.md must document run unlocked ending scope cleanup.");
  }
  if (!saveContractNotes.includes("non-object/missing-version/unsupported-version/malformed JSON run save rejection")) {
    automatedFailures.push("docs/save-contract.md must document malformed run save rejection coverage.");
  }
  if (
    !saveContractNotes.includes("product-core loader JSON parse guard") ||
    !saveContractNotes.includes("malformed JSON collection save rejection")
  ) {
    automatedFailures.push("docs/save-contract.md must document product-core loader JSON parse guard coverage for malformed run and collection JSON saves.");
  }
  if (!saveContractNotes.includes("save schema version guard")) {
    automatedFailures.push("docs/save-contract.md must document save schema version guard coverage.");
  }
  if (!saveContractNotes.includes("collection save schema version guard") || !saveContractNotes.includes("versioned collection save")) {
    automatedFailures.push("docs/save-contract.md must document collection save schema version guard coverage.");
  }
  if (!saveContractNotes.includes("targetEndingCode")) {
    automatedFailures.push("docs/save-contract.md must document targetEndingCode save sanitization.");
  }
  if (!saveContractNotes.includes("clearAllStorage()") || !saveContractNotes.includes("local data reset")) {
    automatedFailures.push("docs/save-contract.md must document clearAllStorage() and local data reset.");
  }
}

function collectManualBlockers() {
  const manualQa = readJson(process.env.MANUAL_QA_EVIDENCE_PATH ?? "qa/manual-qa-evidence.json");
  const consoleEvidence = readJson(process.env.RELEASE_CONSOLE_EVIDENCE_PATH ?? "qa/release-console-evidence.json");
  const releaseApproval = readJson(process.env.RELEASE_APPROVAL_EVIDENCE_PATH ?? "qa/release-approval-evidence.json");
  const appsInToss = readJson(process.env.APPS_IN_TOSS_CONFIG_PATH ?? "apps-in-toss/apps-in-toss.config.json");
  const googlePlay = readJson(process.env.GOOGLE_PLAY_CONFIG_PATH ?? "play-store/google-play.config.json");
  const appStore = readJson(process.env.APP_STORE_CONFIG_PATH ?? "app-store/app-store.config.json");
  const openManualQa = Array.isArray(manualQa.items)
    ? manualQa.items.filter((item) => item?.status !== "passed")
    : [];
  const openConsoleEvidence = Array.isArray(consoleEvidence.items)
    ? consoleEvidence.items.filter((item) => item?.status !== "passed")
    : [];
  const consoleStatusById = new Map(
    Array.isArray(consoleEvidence.items)
      ? consoleEvidence.items.map((item) => [item?.id, item?.status])
      : []
  );

  if (openManualQa.length > 0) {
    manualBlockers.push(`Human QA evidence is incomplete in qa/manual-qa-evidence.json: ${openManualQa.map((item) => item.id).join(", ")}.`);
  }
  if (openConsoleEvidence.length > 0) {
    manualBlockers.push(`Release console evidence is incomplete in qa/release-console-evidence.json: ${openConsoleEvidence.map((item) => item.id).join(", ")}.`);
  }
  if (releaseApproval.status !== "approved") {
    manualBlockers.push(`Final release approval is not complete in qa/release-approval-evidence.json: ${releaseApproval.status}.`);
  }

  const appsInTossCategoryOpen =
    hasUnresolved(appsInToss.manualEvidence?.consoleGameCategoryAndExposure) ||
    consoleStatusById.get("apps-in-toss-category-exposure") !== "passed";
  const appsInTossRatingOpen =
    hasUnresolved(appsInToss.manualEvidence?.gameRatingEvidence) ||
    consoleStatusById.get("apps-in-toss-game-rating") !== "passed";
  const appsInTossReleaseOpen =
    hasUnresolved(appsInToss.manualEvidence?.aitBundleUpload) ||
    hasUnresolved(appsInToss.manualEvidence?.qrTossAppTest) ||
    hasUnresolved(appsInToss.manualEvidence?.deploymentApproval) ||
    hasAnyOpen(consoleStatusById, [
      "apps-in-toss-ait-upload",
      "apps-in-toss-qr-preview",
      "apps-in-toss-category-exposure",
      "apps-in-toss-game-rating",
      "apps-in-toss-deployment-approval"
    ]);
  const googlePlayReleaseOpen =
    hasUnresolved(googlePlay.privacyPolicyUrl) ||
    hasUnresolved(googlePlay.contentDeclarations?.contentRating) ||
    hasUnresolved(googlePlay.contentDeclarations?.koreaGameRating) ||
    hasUnresolved(googlePlay.manualEvidence) ||
    hasAnyOpen(consoleStatusById, [
      "google-play-signed-aab-upload",
      "google-play-content-rating",
      "google-play-korea-game-rating",
      "google-play-data-safety",
      "google-play-track-preview"
    ]);
  const appStoreReleaseOpen =
    hasUnresolved(appStore.sku) ||
    hasUnresolved(appStore.contact) ||
    hasUnresolved(appStore.privacyPolicyUrl) ||
    hasUnresolved(appStore.supportUrl) ||
    hasUnresolved(appStore.marketingUrl) ||
    hasUnresolved(appStore.reviewDeclarations?.ageRating) ||
    hasAnyOpen(consoleStatusById, [
      "app-store-signed-build-upload",
      "app-store-age-rating",
      "app-store-privacy-export",
      "app-store-review-metadata"
    ]);
  const googleAppleConsoleOpen = hasAnyOpen(consoleStatusById, [
    "google-play-signed-aab-upload",
    "google-play-content-rating",
    "google-play-korea-game-rating",
    "google-play-data-safety",
    "google-play-track-preview",
    "app-store-signed-build-upload",
    "app-store-age-rating",
    "app-store-privacy-export",
    "app-store-review-metadata"
  ]);

  if (appsInTossCategoryOpen) {
    manualBlockers.push("AppsInToss console game category and exposure fields must be confirmed in the console.");
  }
  if (appsInTossRatingOpen) {
    manualBlockers.push("AppsInToss game rating evidence is required for game apps: store rating URL/self-rating data or Game Rating and Administration Committee certificate.");
  }
  if (appsInTossReleaseOpen) {
    manualBlockers.push("AppsInToss .ait console upload, QR/Toss-app test, game category/exposure, game rating evidence, and deployment approval are still manual gates; do not submit or publish production versions.");
  }
  if (googlePlayReleaseOpen) {
    manualBlockers.push("Google Play release has local unsigned AAB build evidence, but still needs signed AAB upload, content rating, production/internal-track decision, and Play Console submission of the prepared Data safety evidence.");
  }
  if (appStoreReleaseOpen) {
    manualBlockers.push("App Store release has local unsigned release build, AppIcon, privacy, and export evidence, but still needs signed archive/upload, age rating, App Review metadata, and App Store Connect submission of the prepared privacy/export evidence.");
  }
  if (googleAppleConsoleOpen) {
    manualBlockers.push("Google Play/App Store console uploads and previews must be verified with the generated market-specific assets.");
  }
  if (releaseApproval.status !== "approved") {
    manualBlockers.push("Final release approval must be explicitly recorded for the current manualQaBuildId before review submission, production publish, or rollout.");
  }

  warnings.push(
    "AppsInToss docs say non-game apps require at least one app feature; this app is classified as game, so feature registration is not treated as an automated blocker.",
  );
  if (appsInTossRatingOpen) {
    warnings.push("AppsInToss docs require game rating classification evidence for game apps; no console/store evidence exists in this repo yet.");
  }
}

function hasAnyOpen(statusById, ids) {
  return ids.some((id) => statusById.get(id) !== "passed");
}

function hasUnresolved(value) {
  if (typeof value === "string") {
    return value.includes("확정 필요") || value.trim() === "";
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasUnresolved(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((entry) => hasUnresolved(entry));
  }
  return value === undefined || value === null;
}

function printReport() {
  console.log("Release readiness check");
  console.log("=======================");
  console.log("");

  printSection("Automated blockers", automatedFailures);
  printSection("Manual blockers", manualBlockers);
  printSection("Warnings", warnings);

  if (automatedFailures.length === 0) {
    console.log("Automated release checks: PASS");
  } else {
    console.log("Automated release checks: FAIL");
  }

  if (manualBlockers.length === 0) {
    console.log("Manual release gates: CLEAR");
  } else {
    console.log(`Manual release gates: ${manualBlockers.length} blocker(s)`);
  }
}

function runCheck(label, command, options = {}) {
  const attempts = options.attempts ?? 1;
  const errors = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      execFileSync(command[0], command.slice(1), {
        cwd: repoRoot,
        stdio: "pipe"
      });
      return;
    } catch (error) {
      const stderr = error?.stderr?.toString?.() ?? "";
      const stdout = error?.stdout?.toString?.() ?? "";
      errors.push(`${stderr || stdout ? (stderr || stdout).trim() : "no output"}`);
    }
  }

  const suffix = attempts > 1 ? ` after ${attempts} attempt(s)` : "";
  automatedFailures.push(`${label} failed${suffix}: ${errors.at(-1)}`);
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

function requireEqual(label, actual, expected) {
  if (actual !== expected) {
    automatedFailures.push(`${label} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function requirePresent(label, actual) {
  if (typeof actual !== "string" || actual.trim() === "") {
    automatedFailures.push(`${label} is required`);
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
