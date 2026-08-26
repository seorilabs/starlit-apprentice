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

# AppsInToss 의 실제 하드 리밋. 이것만 하드 실패다.
AIT_LIMIT=$((100 * 1024 * 1024))
# 아래 둘은 참고선이다. 넘어도 실패시키지 않는다 — 근거는 ADR-0010.
TOTAL_REFERENCE=$((15 * 1024 * 1024))
PCK_REFERENCE=$((6 * 1024 * 1024))

gz_size() { gzip -6 -c "$1" | wc -c | tr -d ' '; }
mb() { echo "scale=2; $1/1048576" | bc; }
file_size() {
  if stat -f%z "$1" >/dev/null 2>&1; then
    stat -f%z "$1"
  else
    stat -c%s "$1"
  fi
}

# 오디오 예산. docs/game-design/04-art-audio-bible.md
#   BGM 3종 합계 1.6MB, 각 550KB. 스테레오나 mp3 로 새면 여기서 잡는다.
BGM_TOTAL_LIMIT=$((1600 * 1024))
BGM_EACH_LIMIT=$((550 * 1024))
audio_dir="${project_dir}/assets/audio"
audio_fail=0
if [ -d "${audio_dir}" ]; then
  bgm_total=0
  for f in "${audio_dir}"/bgm_*.ogg; do
    [ -f "$f" ] || continue
    sz=$(file_size "$f"); bgm_total=$((bgm_total + sz))
    printf "  %-34s %7.2f MB\n" "audio/$(basename "$f")" "$(mb "$sz")" >&2
    if [ "$sz" -gt "$BGM_EACH_LIMIT" ]; then
      echo "::error::BGM $(basename "$f") 가 550KB 를 넘는다" >&2; audio_fail=1
    fi
  done
  printf "[web-budget] BGM 합계  %.2f MB / 상한 %.2f MB\n" "$(mb $bgm_total)" "$(mb $BGM_TOTAL_LIMIT)" >&2
  if [ "$bgm_total" -gt "$BGM_TOTAL_LIMIT" ]; then
    echo "::error::BGM 합계가 1.6MB 를 넘는다" >&2; audio_fail=1
  fi
  # mp3 는 인코더 지연이 루프 시작에 공백을 만든다. 아예 금지한다.
  if ls "${audio_dir}"/*.mp3 >/dev/null 2>&1; then
    echo "::error::assets/audio 에 mp3 가 있다. BGM 은 .ogg 로만 출하한다" >&2; audio_fail=1
  fi
fi

# 낡은 산출물을 재면 예산도 폰트 검증도 거짓이 된다. 항상 새로 만든다.
# SKIP_EXPORT=1 은 방금 export 한 것을 다시 재고 싶을 때만 쓴다.
if [ "${SKIP_EXPORT:-0}" != "1" ]; then
  bash "$(dirname "$0")/export_web.sh" "${project_dir}"
fi
[ -f "${out_dir}/index.pck" ] || { echo "[web-budget] export 산출물이 없다: ${out_dir}" >&2; exit 1; }

total=0
for f in "${out_dir}"/*; do
  [ -f "$f" ] || continue
  case "$f" in *.map) continue;; esac
  g=$(gz_size "$f"); total=$((total + g))
  printf "  %-34s gzip %7.2f MB\n" "$(basename "$f")" "$(mb "$g")" >&2
done
pck=$(gz_size "${out_dir}/index.pck")

raw_total=0
for f in "${out_dir}"/*; do
  [ -f "$f" ] || continue
  case "$f" in *.map) continue;; esac
  raw_total=$((raw_total + $(file_size "$f")))
done

printf "[web-budget] 총 전송량 %.2f MB (참고선 %.2f MB)\n" "$(mb $total)" "$(mb $TOTAL_REFERENCE)" >&2
printf "[web-budget] pck        %.2f MB (참고선 %.2f MB)\n" "$(mb $pck)" "$(mb $PCK_REFERENCE)" >&2
printf "[web-budget] 비압축      %.2f MB / AIT 상한 %.2f MB\n" "$(mb $raw_total)" "$(mb $AIT_LIMIT)" >&2

fail=0
if [ "$audio_fail" -ne 0 ]; then fail=1; fi
# 하드 실패는 플랫폼 상한 하나뿐이다. 나머지는 관측값으로 남긴다.
[ "$raw_total" -gt "$AIT_LIMIT" ] && {
  echo "[web-budget] AIT 100MB 상한 초과. 패키징이 실패한다." >&2; fail=1; }
[ "$total" -gt "$TOTAL_REFERENCE" ] && {
  echo "[web-budget] 참고: 총 전송량이 참고선을 넘었다. 로딩 화면이 있으므로 차단하지 않는다." >&2; }
[ "$pck" -gt "$PCK_REFERENCE" ] && {
  echo "[web-budget] 참고: pck 가 참고선을 넘었다. 텍스처와 오디오를 먼저 본다." >&2; }

# 로딩 화면이 실제로 셸에 들어갔는지 확인한다. 이게 빠지면 다운로드가 끝날
# 때까지 흰 화면이 남고, AIT 체크리스트의 "10초 이내 최초 화면" 이 위태로워진다.
if ! grep -q "boot-logo" "${out_dir}/index.html"; then
  echo "[web-budget] 커스텀 로딩 셸이 빌드에 없다. export_presets 의 custom_html_shell 을 확인한다." >&2
  fail=1
fi

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
