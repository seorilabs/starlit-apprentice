#!/usr/bin/env bash
set -euo pipefail

project="."
smoke_scene=""
godot_bin="${GODOT_BIN:-godot}"
log_dir="${GODOT_QUALITY_GATE_LOG_DIR:-}"
run_import=1

usage() {
  cat <<'USAGE'
Usage:
  godot_quality_gate.sh [--project PATH] [--smoke-scene RES://SCENE] [--godot-bin PATH] [--skip-import]

Checks:
  1. Runs: godot --headless --path <project> --import --quit
  2. Runs: godot --headless --path <project> --quit
  3. Fails when Godot exits non-zero
  4. Fails when Godot logs lines beginning with SCRIPT ERROR or ERROR:
  5. Optionally runs a smoke scene with the same log rules
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      project="${2:?missing value for --project}"
      shift 2
      ;;
    --smoke-scene)
      smoke_scene="${2:?missing value for --smoke-scene}"
      shift 2
      ;;
    --godot-bin)
      godot_bin="${2:?missing value for --godot-bin}"
      shift 2
      ;;
    --skip-import)
      run_import=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "${log_dir}" ]; then
  log_dir="$(mktemp -d)"
else
  mkdir -p "${log_dir}"
fi

run_godot_check() {
  local label="$1"
  shift
  local log_file="${log_dir}/${label}.log"

  echo "[godot-quality] running ${label}: $*" >&2
  set +e
  "$@" 2>&1 | tee "${log_file}"
  local status="${PIPESTATUS[0]}"
  set -e

  if [ "${status}" -ne 0 ]; then
    echo "[godot-quality] ${label} failed with exit ${status}. Log: ${log_file}" >&2
    exit "${status}"
  fi

  if grep -E "^(SCRIPT ERROR|ERROR):" "${log_file}" >/dev/null; then
    echo "[godot-quality] ${label} reported Godot errors. Log: ${log_file}" >&2
    grep -E "^(SCRIPT ERROR|ERROR):" "${log_file}" >&2 || true
    exit 1
  fi

  echo "[godot-quality] ${label} passed. Log: ${log_file}" >&2
}

run_import_warmup() {
	local log_file="${log_dir}/import-warmup.log"
	echo "[godot-quality] warming fresh import cache: ${godot_bin} --headless --path ${project} --import --quit" >&2
	set +e
	"${godot_bin}" --headless --path "${project}" --import --quit >"${log_file}" 2>&1
	local status="$?"
	set -e
	# Godot은 fresh checkout에서 Theme가 참조하는 TTF의 .godot/imported 결과를 만들기 전에
	# 프로젝트 설정을 먼저 읽어 missing fontdata 오류를 남긴다. 워밍업 뒤 strict import를 다시
	# 실행해 지속되는 SCRIPT ERROR/ERROR만 실패로 처리한다.
	if [ "${status}" -ne 0 ]; then
		echo "[godot-quality] import warmup exited ${status}; strict import will verify the result. Log: ${log_file}" >&2
	else
		echo "[godot-quality] import warmup finished. Log: ${log_file}" >&2
	fi
}

if [ "${run_import}" -eq 1 ]; then
	if [ ! -d "${project}/.godot/imported" ] || [ -z "$(find "${project}/.godot/imported" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
		run_import_warmup
	fi
	run_godot_check "import" "${godot_bin}" --headless --path "${project}" --import --quit
fi

run_godot_check "compile" "${godot_bin}" --headless --path "${project}" --quit

if [ -n "${smoke_scene}" ]; then
  run_godot_check "smoke" "${godot_bin}" --headless --path "${project}" "${smoke_scene}"
fi
