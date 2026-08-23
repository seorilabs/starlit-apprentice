# ADR-0007 한국어 폰트는 Pretendard 정적 Regular 하나만 번들한다

- 상태: `accepted`
- 날짜: 2026-08-23

## 맥락
본문 분량이 약 70,000자인 한국어 게임이라 폰트가 pck 예산을 직접 압박한다. Pretendard 공식 배포본(v1.3.9, SIL OFL 1.1)의 실측:

| 파일 | raw | gzip |
|---|---:|---:|
| `PretendardVariable.ttf` | 6.42 MB | **2.82 MB** |
| `Pretendard-Regular.ttf` (static) | 2.59 MB | **1.11 MB** |
| `Pretendard-Bold.ttf` (static) | 2.53 MB | 1.13 MB |
| `Pretendard-Regular.otf` | 1.50 MB | 0.99 MB |

Variable 하나가 pck 예산 6 MB gzip 의 **47%** 를 혼자 먹는다.

## 결정
- **정적 `Pretendard-Regular.ttf` 하나만 번들한다** (gzip 1.11 MB).
- 볼드는 별도 파일 없이 `FontVariation.variation_embolden` 으로 합성한다 (`autoload/ui.gd::bold_of`).
- **P7 에서 실제 사용 글리프로 서브셋한다.** 콘텐츠 저작이 끝나야 글리프 집합이 확정되므로 그때 한다.
- OTF 가 0.12 MB 더 작지만 org 관례(jomul `DoHyeon-Regular.ttf`, spiritgate `NotoSansKR.ttf`)를 따라 TTF 를 쓴다.

## 근거
빈 프로젝트 + 폰트만으로 Web export 를 뽑은 실측에서 **pck gzip 1.45 MB 중 폰트가 1.11 MB(약 77%)** 였다. 즉 나머지 콘텐츠 전부에 남는 여유는 약 4.55 MB gzip 이다.

## 결과
- **오디오 예산을 명시적으로 잡아야 한다.** BGM 3종을 각 90초 `.ogg` 로 만들면 2~3 MB 가 되어 남은 여유의 절반 이상을 먹는다. 비트레이트·길이·모노 여부를 에셋 생성 전에 확정한다.
- 아트 152종과 콘텐츠 JSON 이 나머지를 나눠 쓴다.
- 폰트를 다른 페이스로 바꾸면 이 수치를 다시 실측해야 한다.

## 라이선스
SIL Open Font License 1.1. 원문을 `assets/fonts/Pretendard-LICENSE.txt` 에 동봉했고 `docs/09-knowledge/third-party-notices.md` 에 기재한다.
