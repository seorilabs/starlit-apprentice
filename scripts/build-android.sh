#!/usr/bin/env bash
set -euo pipefail
ulimit -c 0

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

fail() {
  echo "[android-build] $1" >&2
  exit 1
}

[ -f build.env ] || fail "build.env가 없다."
set -a
# shellcheck disable=SC1091
. ./build.env
set +a

godot_bin="${GODOT_BIN:-godot}"
for tool in "$godot_bin" java keytool jarsigner python3; do
  command -v "$tool" >/dev/null 2>&1 || fail "툴체인에 $tool이 없다."
done

engine="$($godot_bin --headless --version | head -1)"
case "$engine" in
  "${GODOT_VERSION}.${GODOT_STATUS}"*) ;;
  *) fail "Godot 버전 불일치: 실제=$engine, 요구=${GODOT_VERSION}.${GODOT_STATUS}" ;;
esac

build_mode="${SEORI_BUILD_MODE:-production}"
case "$build_mode" in
  build-only|production) ;;
  *) fail "SEORI_BUILD_MODE는 build-only 또는 production이어야 한다." ;;
esac

temporary_directory=""
created_android_template=false
preset_backup=""
cleanup() {
  exit_status=$?
  trap - EXIT
  if [ -n "$preset_backup" ] && [ -f "$preset_backup" ]; then
    cp "$preset_backup" "$repo_root/export_presets.cfg"
    rm -f "$preset_backup"
  fi
  if [ "$created_android_template" = true ]; then
    rm -rf "$repo_root/android/build"
    rm -f "$repo_root/android/.build_version" "$repo_root/android/.gdignore"
    rmdir "$repo_root/android" 2>/dev/null || true
  fi
  if [ -n "$temporary_directory" ] && [ -d "$temporary_directory" ]; then
    rm -f "$temporary_directory"/*.jks "$temporary_directory"/*.log
    rmdir "$temporary_directory" 2>/dev/null || true
  fi
  exit "$exit_status"
}
trap cleanup EXIT

if [ "$build_mode" = build-only ]; then
  : "${SEORI_SOURCE_SHA:?SEORI_SOURCE_SHA가 필요하다.}"
  [[ "$SEORI_SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "SEORI_SOURCE_SHA 형식이 잘못됐다."
  if [ -e .git ]; then
    command -v git >/dev/null 2>&1 || fail "checkout SHA 확인에 git이 필요하다."
    actual_sha="$(git rev-parse 'HEAD^{commit}')"
    [ "$actual_sha" = "$SEORI_SOURCE_SHA" ] || fail "checkout SHA와 SEORI_SOURCE_SHA가 다르다."
  fi
  : "${SEORI_ANDROID_AAB_OUTPUT:?SEORI_ANDROID_AAB_OUTPUT이 필요하다.}"
  [[ "$SEORI_ANDROID_AAB_OUTPUT" = /* && "$SEORI_ANDROID_AAB_OUTPUT" = *.aab ]] || \
    fail "SEORI_ANDROID_AAB_OUTPUT은 absolute .aab 경로여야 한다."
  output_parent="$(dirname "$SEORI_ANDROID_AAB_OUTPUT")"
  [ -d "$output_parent" ] || fail "산출물 디렉터리가 없다: $output_parent"
  canonical_output="$(cd "$output_parent" && pwd -P)/$(basename "$SEORI_ANDROID_AAB_OUTPUT")"
  [ "$canonical_output" = "$SEORI_ANDROID_AAB_OUTPUT" ] || fail "산출물 경로가 canonical하지 않다."
  artifact="$canonical_output"

  if [ -n "${GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64:-}" ] \
    || [ -n "${GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD:-}" ] \
    || [ -n "${GOOGLE_PLAY_UPLOAD_KEY_ALIAS:-}" ]; then
    fail "build-only 실행에 production signing 입력을 주입할 수 없다."
  fi

  temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/starlit-build-only.XXXXXX")"
  password="seori-${SEORI_SOURCE_SHA:0:24}"
  SEORI_KEYSTORE_PASSWORD="$password" keytool -genkeypair -noprompt \
    -keystore "$temporary_directory/build-only.jks" \
    -storetype JKS \
    -storepass:env SEORI_KEYSTORE_PASSWORD \
    -keypass:env SEORI_KEYSTORE_PASSWORD \
    -alias seori-build-only \
    -keyalg RSA \
    -keysize 2048 \
    -validity 1 \
    -dname "CN=Seorilabs Build Only, OU=CI, O=Seorilabs, C=KR" >/dev/null
  export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$temporary_directory/build-only.jks"
  export GODOT_ANDROID_KEYSTORE_RELEASE_USER=seori-build-only
  export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$password"
else
  if [ -n "${ANDROID_VERSION_NAME:-}" ] || [ -n "${ANDROID_VERSION_CODE:-}" ]; then
    fail "legacy ANDROID_VERSION_NAME/ANDROID_VERSION_CODE를 사용할 수 없다."
  fi
  : "${SEORI_RELEASE_TAG:?SEORI_RELEASE_TAG가 필요하다.}"
  : "${SEORI_RELEASE_VERSION_NAME:?SEORI_RELEASE_VERSION_NAME이 필요하다.}"
  : "${SEORI_RELEASE_VERSION_CODE:?SEORI_RELEASE_VERSION_CODE가 필요하다.}"
  version_name="$SEORI_RELEASE_VERSION_NAME"
  [[ "$version_name" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || \
    fail "SEORI_RELEASE_VERSION_NAME은 stable SemVer여야 한다."
  [ "$SEORI_RELEASE_TAG" = "v$version_name" ] || \
    fail "SEORI_RELEASE_TAG와 SEORI_RELEASE_VERSION_NAME이 다르다."
  version_code="$SEORI_RELEASE_VERSION_CODE"
  if [[ ! "$version_code" =~ ^[1-9][0-9]*$ ]] || (( version_code > 2100000000 )); then
    fail "SEORI_RELEASE_VERSION_CODE는 1..2100000000 정수여야 한다."
  fi
  : "${GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64:?GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64가 필요하다.}"
  : "${GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD:?GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD가 필요하다.}"
  keystore_base64="$GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64"
  keystore_password="$GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD"
  alias_name="${GOOGLE_PLAY_UPLOAD_KEY_ALIAS:-}"
  unset GOOGLE_PLAY_UPLOAD_KEYSTORE_BASE64 GOOGLE_PLAY_UPLOAD_KEYSTORE_PASSWORD GOOGLE_PLAY_UPLOAD_KEY_ALIAS
  temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/starlit-production.XXXXXX")"
  if ! printf '%s' "$keystore_base64" | base64 --decode > "$temporary_directory/upload.jks" 2>/dev/null; then
    printf '%s' "$keystore_base64" | base64 -D > "$temporary_directory/upload.jks"
  fi
  unset keystore_base64
  [ -s "$temporary_directory/upload.jks" ] || fail "업로드 키스토어 복원에 실패했다."
  if [ -z "$alias_name" ]; then
    alias_name="$(SEORI_KEYSTORE_PASSWORD="$keystore_password" keytool -list -v \
      -keystore "$temporary_directory/upload.jks" -storepass:env SEORI_KEYSTORE_PASSWORD \
      | awk -F': ' '/^Alias name: /{print $2; exit}')"
  fi
  [ -n "$alias_name" ] || fail "업로드 키 alias를 확인할 수 없다."
  export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$temporary_directory/upload.jks"
  export GODOT_ANDROID_KEYSTORE_RELEASE_USER="$alias_name"
  export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$keystore_password"
  unset keystore_password
  artifact="$repo_root/$AAB_PATH"

  preset_backup="$temporary_directory/export_presets.cfg.backup"
  cp export_presets.cfg "$preset_backup"
  python3 - export_presets.cfg "$version_name" "$version_code" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
version_name = sys.argv[2]
version_code = sys.argv[3]
text = path.read_text(encoding="utf-8")
text, code_count = re.subn(r"(?m)^version/code=\d+$", f"version/code={version_code}", text)
text, name_count = re.subn(r'(?m)^version/name="[^"]*"$', f'version/name="{version_name}"', text)
if code_count != 1 or name_count != 1:
    raise SystemExit("Android version field count mismatch")
path.write_text(text, encoding="utf-8")
PY
fi

mkdir -p "$(dirname "$artifact")"
rm -f "$artifact"

run_godot_checked() {
  local label="$1"
  shift
  local log_file="$temporary_directory/$label.log"
  local command_status
  local errors
  set +e
  "$godot_bin" "$@" >"$log_file" 2>&1
  command_status=$?
  set -e
  if [ "$command_status" -ne 0 ]; then
    sed -n '1,240p' "$log_file" >&2
    fail "Godot ${label} 단계가 exit ${command_status}로 실패했다."
  fi
  errors="$(sed $'s/\\033\\[[0-9;]*m//g' "$log_file" | grep -E '^(SCRIPT ERROR|ERROR):' \
    | grep -Ev '^ERROR: [0-9]+ resources? still in use at exit' || true)"
  if [ -n "$errors" ]; then
    printf '%s\n' "$errors" >&2
    fail "Godot $label 로그에서 오류를 발견했다."
  fi
}

run_godot_checked import --headless --path "$PROJECT_DIR" --import --quit
if [ ! -d android/build ]; then
  created_android_template=true
  run_godot_checked export --headless --path "$PROJECT_DIR" \
    --install-android-build-template --export-release Android "$artifact"
else
  run_godot_checked export --headless --path "$PROJECT_DIR" --export-release Android "$artifact"
fi
unset GODOT_ANDROID_KEYSTORE_RELEASE_PATH GODOT_ANDROID_KEYSTORE_RELEASE_USER GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD

[ -s "$artifact" ] || fail "AAB가 생성되지 않았다: $artifact"
verify_output="$(LC_ALL=C jarsigner -verify "$artifact" 2>&1)" || fail "AAB 서명 검증이 실패했다."
case "$verify_output" in
  *"jar verified."*) ;;
  *) fail "AAB가 서명되지 않았다." ;;
esac

echo "Android AAB 생성 완료: $artifact"
