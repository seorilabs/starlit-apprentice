#!/usr/bin/env bash
# Godot Web export 의 전송 예산과 한국어 폰트 탑재를 검증한다.
#
# 예산 근거: docs/02-decisions/0006-pck-budget.md
#   AppsInToss 는 10초 내 최초 화면을 요구한다. Godot 엔진 wasm 이 gzip 약 9MB 의
#   고정 바닥값이므로 pck 를 묶지 않으면 예산을 넘긴다.
#
# 폰트 근거: docs/02-decisions/0003-runtime-default-font.md
#   cold export 는 importer 를 돌리지 않아 폰트가 조용히 빠질 수 있다.
#   파일 존재가 아니라 "출하되는 pck 를 실제로 구동해" 부착을 확인한다.
set -euo pipefail

project_dir="${1:-.}"
out_dir="${project_dir}/build/web"
godot_bin="${GODOT_BIN:-godot}"

TOTAL_BUDGET=$((15 * 1024 * 1024))
PCK_BUDGET=$((6 * 1024 * 1024))

gz_size() { gzip -6 -c "$1" | wc -c | tr -d ' '; }
mb() { echo "scale=2; $1/1048576" | bc; }

[ -f "${out_dir}/index.pck" ] || { echo "[web-budget] export 산출물이 없다: ${out_dir}" >&2; exit 1; }

total=0
for f in "${out_dir}"/*; do
  [ -f "$f" ] || continue
  case "$f" in *.map) continue;; esac
  g=$(gz_size "$f"); total=$((total + g))
  printf "  %-34s gzip %7.2f MB\n" "$(basename "$f")" "$(mb "$g")" >&2
done
pck=$(gz_size "${out_dir}/index.pck")

printf "[web-budget] 총 전송량 %.2f MB / 예산 %.2f MB\n" "$(mb $total)" "$(mb $TOTAL_BUDGET)" >&2
printf "[web-budget] pck        %.2f MB / 예산 %.2f MB\n" "$(mb $pck)" "$(mb $PCK_BUDGET)" >&2

fail=0
[ "$total" -gt "$TOTAL_BUDGET" ] && { echo "[web-budget] 총 전송량 예산 초과" >&2; fail=1; }
[ "$pck" -gt "$PCK_BUDGET" ] && { echo "[web-budget] pck 예산 초과. 텍스처와 오디오를 먼저 의심한다." >&2; fail=1; }

# 출하되는 pck 를 실제로 구동해 폰트 부착을 확인한다.
log=$(mktemp)
"${godot_bin}" --headless --main-pack "${out_dir}/index.pck" --quit-after 30 >"$log" 2>&1 || true
clean=$(sed -e $'s/\033\\[[0-9;]*[A-Za-z]//g' "$log")
if echo "$clean" | grep -qE "폰트를 (찾지|로드하지) 못했다"; then
  echo "[web-budget] 한국어 폰트가 pck 에 없다. cold export 가 importer 를 건너뛴 것을 의심한다." >&2
  fail=1
fi
if echo "$clean" | grep -qE "^(SCRIPT ERROR|ERROR):"; then
  echo "[web-budget] 출하 pck 구동 중 Godot 에러가 있다." >&2
  echo "$clean" | grep -E "^(SCRIPT ERROR|ERROR):" >&2
  fail=1
fi
rm -f "$log"

[ "$fail" -eq 0 ] && echo "[web-budget] 통과" >&2
exit "$fail"
