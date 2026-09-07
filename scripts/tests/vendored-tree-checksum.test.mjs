import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  collectVendoredFiles,
  computeVendoredTreeChecksum,
} from "../lib/vendored_tree_checksum.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const addonDir = join(repoRoot, "addons", "seorilabs_platform");
const ADDON_PREFIX = "addons/seorilabs_platform";
const RELEASE_CHECKSUM = "44aefc49e7cf53ebfda1872ff9e7d500fc270d06089b0657cba561ba317daaa5";

function git(...args) {
  return execFileSync("git", ["-C", repoRoot, ...args], { maxBuffer: 1 << 28 });
}

function trackedPaths(...pathspecs) {
  return git("ls-files", "-z", ...pathspecs)
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

test("vendoring한 SDK는 Release archive의 CHECKSUM을 재현한다", () => {
  const actual = computeVendoredTreeChecksum(collectVendoredFiles(addonDir));
  assert.equal(actual, RELEASE_CHECKSUM);
});

/**
 * Backoffice repository-discovery는 `.uid` 예외 없이 저장소에 커밋된 벤더링 파일
 * 전부로 tree checksum을 다시 계산해 `integration=SDK`를 판정한다. 여기서 같은
 * 규칙을 돌려, Release archive에 없는 파일이 함께 커밋돼 판정이
 * CUSTOM_HTTP(TREE_CHECKSUM_MISMATCH)로 떨어지는 회귀를 막는다.
 */
test("커밋된 벤더링 파일만으로 계산해도 Backoffice와 같은 CHECKSUM이 나온다", () => {
  const committed = trackedPaths(ADDON_PREFIX)
    .map((tracked) => ({
      path: tracked.slice(ADDON_PREFIX.length + 1),
      content: readFileSync(join(repoRoot, tracked)),
    }))
    .filter((file) => file.path !== "CHECKSUM");

  assert.equal(computeVendoredTreeChecksum(committed), RELEASE_CHECKSUM);
});

test("Godot이 만든 .uid는 벤더링 디렉터리에 커밋되지 않는다", () => {
  assert.deepEqual(trackedPaths(`${ADDON_PREFIX}/**/*.uid`, `${ADDON_PREFIX}/*.uid`), []);
});

/** ignore 규칙이 벤더링 밖으로 번지면 정상 자산인 .uid가 조용히 사라진다. */
test("벤더링 밖의 .uid는 계속 추적되고 ignore되지 않는다", () => {
  const outside = trackedPaths("*.uid").filter((path) => !path.startsWith(`${ADDON_PREFIX}/`));
  assert.ok(outside.length > 0, "벤더링 밖 .uid가 하나도 추적되지 않는다");

  // check-ignore는 추적 중인 경로를 기본적으로 건너뛰므로 --no-index로 규칙 자체를 본다.
  // 일치 항목이 없으면 exit 1이라 종료 코드가 아니라 stdout으로 판정한다.
  const ignored = spawnSync("git", ["-C", repoRoot, "check-ignore", "--no-index", "--stdin"], {
    input: `${outside.join("\n")}\n`,
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  assert.equal(ignored.error, undefined);
  assert.equal(ignored.stdout.trim(), "");
});

test("Godot이 만든 .uid와 CHECKSUM은 해시에서 빠진다", () => {
  const dir = mkdtempSync(join(tmpdir(), "vendored-tree-"));
  mkdirSync(join(dir, "core"));
  writeFileSync(join(dir, "VERSION"), "0.6.8\n");
  writeFileSync(join(dir, "core", "backoff.gd"), "extends Node\n");

  const before = computeVendoredTreeChecksum(collectVendoredFiles(dir));

  writeFileSync(join(dir, "CHECKSUM"), `${before}\n`);
  writeFileSync(join(dir, "core", "backoff.gd.uid"), "uid://abcdefg\n");
  assert.equal(computeVendoredTreeChecksum(collectVendoredFiles(dir)), before);

  writeFileSync(join(dir, "VERSION"), "0.6.5\n");
  assert.notEqual(computeVendoredTreeChecksum(collectVendoredFiles(dir)), before);
});

test("경로와 내용은 길이와 함께 해싱해 경계가 섞이지 않는다", () => {
  const split = computeVendoredTreeChecksum([
    { path: "ab", content: Buffer.from("cd") },
  ]);
  const shifted = computeVendoredTreeChecksum([
    { path: "abc", content: Buffer.from("d") },
  ]);
  assert.notEqual(split, shifted);
});

test("같은 경로가 두 번 오면 거부한다", () => {
  assert.throws(
    () =>
      computeVendoredTreeChecksum([
        { path: "VERSION", content: Buffer.from("0.6.8\n") },
        { path: "VERSION", content: Buffer.from("0.6.5\n") },
      ]),
    /중복되거나 비어 있는 파일 경로다/u,
  );
});
