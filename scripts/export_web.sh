#!/usr/bin/env bash
# Godot Web export. 게이트가 낡은 산출물을 재지 않도록 항상 여기서 만든다.
#
# cold export 는 importer 를 돌리지 않아 한국어 폰트와 텍스처가 조용히 pck 에서
# 빠진다(lizard-tycoon 선례). 그래서 export 전에 import 를 먼저 완주시킨다.
set -euo pipefail

project_dir="${1:-.}"
out_dir="${project_dir}/build/web"
godot_bin="${GODOT_BIN:-godot}"

file_size() {
  if stat -f%z "$1" >/dev/null 2>&1; then
    stat -f%z "$1"
  else
    stat -c%s "$1"
  fi
}

command -v "${godot_bin}" >/dev/null 2>&1 || {
  echo "[export-web] Godot 을 찾지 못했다: ${godot_bin}" >&2; exit 1; }

# 산출물이 소스와 어긋나지 않게 통째로 지운다.
rm -rf "${out_dir}"
mkdir -p "${out_dir}"

echo "[export-web] import 캐시 워밍" >&2
"${godot_bin}" --headless --path "${project_dir}" --import --quit-after 1 >/dev/null 2>&1 || true

echo "[export-web] Web export" >&2
log=$(mktemp)
"${godot_bin}" --headless --path "${project_dir}" \
  --export-release Web "build/web/index.html" >"$log" 2>&1 || {
    sed -e $'s/\033\\[[0-9;]*[A-Za-z]//g' "$log" >&2; rm -f "$log"
    echo "[export-web] export 실패" >&2; exit 1; }

# Godot 은 export 실패에도 exit 0 을 내는 경우가 있다. 산출물로 확인한다.
clean=$(sed -e $'s/\033\\[[0-9;]*[A-Za-z]//g' "$log"); rm -f "$log"
if echo "$clean" | grep -qE "^(SCRIPT ERROR|ERROR):"; then
  echo "[export-web] export 로그에 에러가 있다." >&2
  echo "$clean" | grep -E "^(SCRIPT ERROR|ERROR):" >&2
  exit 1
fi
[ -s "${out_dir}/index.pck" ] || { echo "[export-web] index.pck 이 없다" >&2; exit 1; }
[ -s "${out_dir}/index.wasm" ] || { echo "[export-web] index.wasm 이 없다" >&2; exit 1; }

printf "[export-web] 완료 · pck %d KB · wasm %d KB\n" \
  $(( $(file_size "${out_dir}/index.pck") / 1024 )) \
  $(( $(file_size "${out_dir}/index.wasm") / 1024 )) >&2
