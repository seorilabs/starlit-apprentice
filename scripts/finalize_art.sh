#!/usr/bin/env bash
# 생성된 PNG 최종본을 WebP 로 바꾸고 Godot import 를 Lossy 로 고정한다.
#
# 왜 필요한가 (ADR-0008)
#   1. 평면 벡터 아트는 WebP 에서 PNG 대비 약 9배 작다.
#   2. 그런데 Godot 은 원본을 자체 .ctex 로 재인코딩하며 그 압축을 버린다.
#      compress/mode=1 (Lossy) 로 고정해야 압축이 pck 까지 살아남는다.
#   소스 포맷만 바꾸면 아무 효과가 없다. 둘 다 해야 한다.
set -euo pipefail

art_dir="${1:-assets/art}"
quality="${ART_WEBP_QUALITY:-88}"
lossy="${ART_LOSSY_QUALITY:-0.9}"

converted=$(python3 - "$art_dir" "$quality" <<'PY'
from PIL import Image
import pathlib, sys
d, q = pathlib.Path(sys.argv[1]), int(sys.argv[2])
n = 0
for p in sorted(d.glob("*.png")):
    if p.name == "qa_sheet.png":
        continue
    Image.open(p).save(p.with_suffix(".webp"), "WEBP", quality=q, method=6)
    p.unlink()
    n += 1
print(n)
PY
)
echo "[finalize-art] PNG -> WebP q${quality}: ${converted}개" >&2

patched=$(python3 - "$art_dir" "$lossy" <<'PY'
import pathlib, re, sys
d, lossy = pathlib.Path(sys.argv[1]), sys.argv[2]
n = 0
for p in d.glob("*.webp.import"):
    t = p.read_text()
    before = t
    t = re.sub(r'^compress/mode=\d+', 'compress/mode=1', t, flags=re.M)
    t = re.sub(r'^compress/lossy_quality=[\d.]+', f'compress/lossy_quality={lossy}', t, flags=re.M)
    t = re.sub(r'^mipmaps/generate=\w+', 'mipmaps/generate=false', t, flags=re.M)
    if t != before:
        p.write_text(t)
        n += 1
print(n)
PY
)
echo "[finalize-art] import 를 Lossy 로 고정: ${patched}개" >&2

# .import 는 Godot 이 만든다. 새로 생성한 자산은 import 를 한 번 돌린 뒤 다시 실행한다.
stale=$(ls "${art_dir}"/*.webp 2>/dev/null | wc -l | tr -d ' ')
have=$(ls "${art_dir}"/*.webp.import 2>/dev/null | wc -l | tr -d ' ')
if [ "$stale" != "$have" ]; then
  echo "[finalize-art] .import 가 ${have}/${stale} 뿐이다. godot --import 를 돌린 뒤 이 스크립트를 다시 실행한다." >&2
  exit 2
fi
echo "[finalize-art] 완료. 예산은 scripts/check_web_budget.sh 로 실측한다." >&2
