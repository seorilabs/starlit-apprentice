/**
 * vendoring한 Platform GDScript SDK의 tree 체크섬.
 *
 * Platform Release가 archive 안에 넣어 주는 `CHECKSUM`은
 * `seorilabs/platform`의 `computeVendoredTreeChecksum`이 계산한 값이다.
 * 소비자가 같은 값을 다시 계산할 수 있어야 복사본이 조용히 갈라지는 것을
 * 잡아낼 수 있으므로 그 규칙을 그대로 옮긴다.
 *
 * - 도메인 구분자로 시작해 다른 용도의 해시와 섞이지 않게 한다.
 * - 파일 경로와 내용을 8바이트 big-endian 길이와 함께 넣어
 *   경계가 다른 조합이 같은 해시를 내지 못하게 한다.
 * - 경로는 UTF-8 바이트 순으로 정렬한다.
 * - `CHECKSUM` 자기 자신은 제외한다.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

const VENDORED_TREE_HASH_DOMAIN = Buffer.from("seorilabs-vendored-tree-v1\0", "utf8");

/** Godot이 import 시 만드는 파일이라 Release archive에는 없다. */
const GODOT_GENERATED_SUFFIXES = [".uid"];

const EXCLUDED_PATHS = new Set(["CHECKSUM"]);

function updateWithLength(hash, value) {
  const content = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(content.length));
  hash.update(length);
  hash.update(content);
}

export function computeVendoredTreeChecksum(files) {
  const sorted = [...files].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")),
  );

  const seen = new Set();
  const hash = createHash("sha256");
  hash.update(VENDORED_TREE_HASH_DOMAIN);

  for (const file of sorted) {
    if (!file.path || seen.has(file.path)) {
      throw new Error(`중복되거나 비어 있는 파일 경로다: ${file.path}`);
    }
    seen.add(file.path);
    updateWithLength(hash, file.path);
    updateWithLength(hash, file.content);
  }
  return hash.digest("hex");
}

/** addon 디렉터리에서 Release archive와 같은 파일 집합을 읽는다. */
export function collectVendoredFiles(addonDir) {
  const files = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      const path = relative(addonDir, absolute).split(sep).join(posix.sep);
      if (EXCLUDED_PATHS.has(path)) continue;
      if (GODOT_GENERATED_SUFFIXES.some((suffix) => path.endsWith(suffix))) continue;
      files.push({ path, content: readFileSync(absolute) });
    }
  };

  walk(addonDir);
  return files;
}
