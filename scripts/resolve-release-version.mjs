#!/usr/bin/env node
// org 재사용 워크플로우 caller 계약 자산.
// 태그에서 마켓별 버전 값을 유도한다. seorilabs-org-release-pipeline 스킬 참조.
//
//   node scripts/resolve-release-version.mjs --tag v1.2.3 --github-output
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : process.env.GITHUB_REF_NAME;

const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? "");
if (!match) {
  console.error(`태그가 vX.Y.Z 형식이 아니다: ${tag ?? "(없음)"}`);
  process.exit(1);
}
const [, major, minor, patch] = match.map(Number).slice(0, 4).map(String);
const versionName = `${major}.${minor}.${patch}`;
// Play 는 단조 증가하는 정수를 요구한다. major*1e6 + minor*1e3 + patch.
const androidVersionCode = Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch);

const out = {
  version_name: versionName,
  android_version_code: String(androidVersionCode),
  apple_marketing_version: versionName,
  apple_build_number: String(androidVersionCode),
  release_name: `별빛 견습생 ${versionName}`,
};

if (args.includes("--github-output") && process.env.GITHUB_OUTPUT) {
  for (const [k, v] of Object.entries(out)) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
  }
}
console.log(JSON.stringify(out, null, 2));
