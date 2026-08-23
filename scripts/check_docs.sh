#!/usr/bin/env bash
# docs/ 원장 구조만 검사한다. 산문 내용은 검사하지 않는다.
# 저자가 쓴 문장에 저자가 고른 문구가 있는지 확인하는 것은 아무것도 검증하지 않는다.
# docs/02-decisions/0001-docs-as-source-of-truth.md
set -euo pipefail

root="${1:-.}"
fail=0
err() { echo "::error::$*" >&2; fail=1; }

for d in 01-planning 02-decisions 03-architecture 04-work 05-markets 06-release 07-qa 08-ops 09-knowledge; do
  [ -d "${root}/docs/${d}" ] || err "docs/${d} 가 없다"
  [ -f "${root}/docs/${d}/README.md" ] || err "docs/${d}/README.md 가 없다"
done
[ -f "${root}/docs/README.md" ] || err "docs/README.md 가 없다"

# 설계 팩 9종
for f in 00-product-brief 01-research-dossier 02-gdd 03-ui-ux-spec 04-art-audio-bible \
         05-economy-content-liveops 06-technical-production-plan 07-qa-launch-plan decision-log; do
  [ -f "${root}/docs/game-design/${f}.md" ] || err "docs/game-design/${f}.md 가 없다"
done

# ADR 번호 연속성. 빠진 번호는 결정이 유실됐다는 신호다.
# bash 3.2(macOS 기본)에는 mapfile 이 없다. 이식 가능한 형태로 쓴다.
count=0
expected=0
while IFS= read -r n; do
  [ -n "$n" ] || continue
  actual=$((10#$n))
  [ "$actual" -eq "$expected" ] || err "ADR 번호가 끊겼다: ${expected} 이 없고 ${actual} 이 있다"
  expected=$((actual + 1))
  count=$((count + 1))
done <<EOF
$(find "${root}/docs/02-decisions" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.md' -exec basename {} \; | cut -c1-4 | sort -n)
EOF
[ "$count" -gt 0 ] || err "ADR 이 하나도 없다"

[ "$fail" -eq 0 ] && echo "[check-docs] 통과 (ADR ${count}개)"
exit "$fail"
