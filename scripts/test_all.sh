#!/usr/bin/env bash
# 모든 Godot 테스트를 로그 게이트로 감싸 실행한다.
#
# Godot 은 GDScript 파스 에러에도 exit 0 을 낸다. 실제로 이 저장소에서 겪었다
# (새 class_name 추가 후 import 전에 실행 → Parse Error 인데 exit 0).
# 그래서 exit code 와 별개로 ANSI 를 제거한 로그에서 ^(SCRIPT ERROR|ERROR): 를 찾는다.
# ANSI 제거를 빼먹으면 색이 입혀진 줄이 매칭되지 않아 게이트가 조용히 무력화된다.
set -uo pipefail

project_dir="${PROJECT_DIR:-.}"
godot_bin="${GODOT_BIN:-godot}"
timeout_s="${GODOT_COMMAND_TIMEOUT_SECONDS:-300}"
log_dir="$(mktemp -d)"
fail=0

run_godot() {
  local label="$1"; shift
  local log="${log_dir}/${label}.log"
  echo "[test-all] ${label}" >&2
  if command -v timeout >/dev/null 2>&1; then
    timeout --kill-after=10s "${timeout_s}s" "$@" >"$log" 2>&1
  else
    "$@" >"$log" 2>&1   # macOS 기본에는 timeout 이 없다
  fi
  local status=$?
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    echo "::error::${label} 시간 초과 (${timeout_s}s)" >&2; sed -n '1,40p' "$log" >&2; fail=1; return
  fi
  # ANSI 제거 후 에러 스캔. exit code 0 이어도 실패로 처리한다.
  sed -e $'s/\033\\[[0-9;]*[A-Za-z]//g' "$log" > "${log}.clean"
  if grep -qE '^(SCRIPT ERROR|ERROR):' "${log}.clean"; then
    echo "::error::${label} 로그에 Godot 에러가 있다. exit code 는 ${status} 지만 실패로 처리한다." >&2
    grep -E '^(SCRIPT ERROR|ERROR):' "${log}.clean" | head -20 >&2
    fail=1; return
  fi
  if [ "$status" -ne 0 ]; then
    echo "::error::${label} exit=${status}" >&2; tail -30 "${log}.clean" >&2; fail=1; return
  fi
  tail -3 "${log}.clean" >&2
}

# 새 class_name 이 전역 캐시에 없으면 파스 에러가 난다. 항상 import 를 먼저 돌린다.
run_godot import "${godot_bin}" --headless --path "${project_dir}" --import --quit-after 1
run_godot core        "${godot_bin}" --headless --path "${project_dir}" --script res://tests/core_test_runner.gd
run_godot endings     "${godot_bin}" --headless --path "${project_dir}" --script res://tests/endings_lint_runner.gd
run_godot balance     "${godot_bin}" --headless --path "${project_dir}" --script res://tests/balance_runner.gd
run_godot simulation  "${godot_bin}" --headless --path "${project_dir}" --script res://tests/simulation_runner.gd
run_godot smoke       "${godot_bin}" --headless --path "${project_dir}" --script res://tests/test_runner.gd
run_godot saveload    "${godot_bin}" --headless --path "${project_dir}" --script res://tests/save_load_runner.gd
run_godot layout      "${godot_bin}" --headless --path "${project_dir}" --resolution 720x1280 --script res://tests/layout_probe.gd

echo "[test-all] $([ "$fail" -eq 0 ] && echo 통과 || echo 실패)" >&2
rm -rf "${log_dir}"
exit "$fail"
