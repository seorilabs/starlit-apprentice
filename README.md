# starlit-apprentice

**별빛 견습생** — 열두 달, 서른여섯 번의 선택으로 견습생의 미래가 갈리는 육성 시뮬레이션.

## 상태

**재작성 중.** 기존 웹 클라이언트를 Godot 4로 다시 만들고 코어 루프를 재설계하고 있다.
설계는 [`docs/game-design/`](docs/game-design/)이 원장이고, 진행 단계는 [`docs/04-work/`](docs/04-work/)에 기록한다.

| | |
|---|---|
| 엔진 | Godot `4.7.2.stable` |
| 화면 | 세로 고정 720×1280 |
| 출시 타깃 | Google Play · Apple App Store · AppsInToss |
| 언어 | 한국어 (i18n 구조 선반영) |
| 백엔드 | Firebase + GA4 (로컬 저장, 서버 권위 없음) |

## 구조

```text
packages/product-core/   순수 GDScript 도메인·유스케이스·포트 (extends RefCounted 만)
autoload/                Godot 싱글턴. 어댑터 조립 지점
src/                     런타임 — platform(어댑터) · ui · game · content · audio
data/                    콘텐츠 원장 (actions · events · endings · npcs · route_plans)
apps/ait/                AppsInToss 래퍼 (Godot Web export 패키징)
firebase/  play-store/  app-store/  apps-in-toss/   마켓·백엔드 설정
docs/                    실행 원장 (9폴더 + game-design 설계 팩)
scripts/  tools/         게이트와 빌드 스크립트
```

## 검증

```bash
export GODOT_BIN=/opt/homebrew/bin/godot   # 또는 bash scripts/ensure_godot.sh

bash scripts/test_all.sh                   # import → 코어 → 엔딩 린트 → 밸런스 → 시뮬 → 스모크
python3 tools/validate_content.py .        # 콘텐츠 정적 린트
python3 tools/check_core_boundary.py .     # 코어 경계
bash scripts/check_docs.sh .               # 문서 구조
bash scripts/check_web_budget.sh .         # Web 전송 예산 (export 후)
```

전체 스위트가 5초 안에 돈다. `rm -rf .godot` 후 **1회차**가 깨끗해야 한다 — 2회차는 증거가 아니다.

## 경계

- 로그인·서버 세이브·인앱 결제 없음. 저장은 기기 로컬 1슬롯이다.
- 광고는 Android/iOS 한정이며 진행을 막지 않는다. AppsInToss 웹 빌드는 광고를 싣지 않는다.
- 기존 IP의 이름·캐릭터·UI·이벤트·엔딩을 직접 복제하지 않는다.
