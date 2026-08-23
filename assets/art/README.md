# assets/art

## 스타일 앵커 — 손대지 않는다

`style/anchor.png` 는 **2026-08-23 사용자 승인**을 받은 스타일 기준점이다.
이후 생성되는 모든 에셋이 이 이미지를 스타일 레퍼런스로 붙여서 만들어진다.

**앵커나 `style/style-guide.md` 를 바꾸면 이미 만든 에셋 전부를 다시 만들어야 한다.**
가볍게 재생성하지 않는다.

- 모델: `gemini-3-pro-image`
- 팔레트 준수 실측: 비배경 픽셀의 82.5% 가 지정 6색 + 아웃라인 이내(RGB 거리 60)
- 이탈 17.5% 는 대부분 인접색 안티에일리어싱 블렌드

## 경로

```text
style/style-guide.md      팔레트·아웃라인·음영·광원 규칙 (프롬프트에 그대로 들어간다)
style/anchor.png          승인된 앵커 (흰 배경 원본)
asset-manifest.json       에셋 목록
<name>.png                최종 (투명, 엔진 투입용)
raw/<name>.png            원본 생성물 (재처리는 무료, 재생성은 유료)
```

## 크기

**하드 상한은 AppsInToss 패키징 100 MB(비압축) 뿐이다.** gzip 총량과 pck 는 참고선으로
관측만 한다 — 근거는 `docs/02-decisions/0009-loading-shell-over-size-cap.md`.
10초 조항은 크기가 아니라 커스텀 로딩 셸(`web/shell.html`)이 만족시킨다.

다만 **WebP 는 이미 압축돼 있어 gzip 이 듣지 않는다.** 에셋을 추가하면 그만큼
그대로 전송량이 된다. 추가 후 반드시 실측해 증가분을 확인한다.

```bash
bash scripts/check_web_budget.sh .
```

## 배치 생성 시 반드시 `--only` 를 쓴다

파이프라인의 "기존 최종본 건너뛰기" 는 `<name>.png` 를 찾는다. 우리는 최종본을
**WebP** 로 저장하므로(ADR-0008) 그 판정이 항상 빗나가고, `--only` 없이 돌리면
**이미 승인된 자산까지 전부 재생성한다.**

실제로 겪었다 — 아이콘 배치를 돌렸더니 승인된 `apprentice_bright` 를 다시 만들려
했고, 중단 시점에 `raw/` 원본 3개가 새 이미지로 덮여 최종본과 어긋났다(git 에서 복원).

```bash
source ~/.config/seorilabs/gemini-api-key.env
python3 ~/.claude/skills/game-asset-pipeline/scripts/generate_assets.py \
  --manifest assets/art/asset-manifest.json \
  --only <신규 이름들만 나열>
```

생성 후에는 PNG 최종본을 WebP 로 바꾸고 PNG 를 지운다.

```bash
python3 - <<'PY'
from PIL import Image; import pathlib
for p in pathlib.Path("assets/art").glob("*.png"):
    Image.open(p).save(p.with_suffix(".webp"), "WEBP", quality=88, method=6); p.unlink()
PY
bash scripts/check_web_budget.sh .
```
