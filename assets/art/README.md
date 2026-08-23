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

## 예산

pck gzip 6 MB 상한 중 폰트가 1.11 MB 를 이미 쓴다.
아트 152종은 오디오·콘텐츠와 남은 약 4.55 MB 를 나눠 쓴다.
근거: `docs/02-decisions/0006-pck-budget.md`, `docs/02-decisions/0007-font-budget.md`

에셋 추가 후 반드시 실측한다.

```bash
bash scripts/check_web_budget.sh .
```
