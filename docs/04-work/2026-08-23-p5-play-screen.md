# P5 플레이 화면 — 대시보드 금지 게이트 대응

- 날짜: 2026-08-23
- 단계: P5 런타임 — 메인 플레이 루프 UI
- 관련: [[2026-08-23-p7-art-icons]] · [[../game-design/05-ux-flow]]

## 화면 구성

org 하드 게이트는 "메인 플레이 화면은 장르의 판타지와 행동 결과가 먼저 보여야 한다.
숫자 카드와 관리 패널이 화면을 지배하는 simulator/dashboard 구성을 기본값으로 쓰지 않는다"이다.
설계 팩의 비중을 `src/ui/ui_kit.gd` 상수로 고정해 구현이 표류하지 못하게 했다.

| 영역 | 비중 | 상수 |
|---|---:|---|
| 장면 (배경 + 견습생 피겨 + 현장 NPC) | 62% | `SCENE_RATIO` |
| 선택 밴드 (일러스트 행동 카드) | 30% | `BAND_RATIO` |
| 자원 핍 + 초상 | 우측 오버레이 | — |

**카드당 숫자 최대 2개**를 UI 코드에서 강제한다. 스탯 효과와 기력 비용만 노출하고
나머지는 해석 연출에서 드러낸다. 14개 스탯 카드 그리드는 존재하지 않는다.

화면 스택은 `src/ui/main.gd` 하나가 관리한다 — 타이틀 → 턴 → 해석 오버레이 → 이벤트 → 별자리 → 엔딩.
`.tscn`은 `scenes/main.tscn` 하나뿐이라 머지 충돌면이 없다.

## 코어 결함 1건 — 해금 검사가 아예 없었다

720×1280 스크린샷을 찍어보니 **진로 전용 비전 액션 "관측"이 턴 1 에 선택 가능**했다.

`SaResources.affordability`가 골드·기력만 보고 `action.unlock`을 한 번도 읽지 않았다.
`data/actions.json`의 38개 액션 중 심화·비전·진로 전용이 `unlock`을 갖고 있는데
그 필드가 코드에서 사용된 적이 없어 **티어 진행 설계 전체가 무력화돼 있었다.**
밸런스 하네스는 `route_plans.json`이 지정한 액션만 재생하므로 이 구멍을 볼 수 없었다.

`SaResources.unlock_status()`를 추가해 5종 조건을 검사한다:
`declared_path` / `month_min` / `stat_min` / `line_count` / `affinity_min`.

수정 후 밸런스 하네스는 **29/29 · 시드 7개 · 203 시뮬레이션으로 변화 없음** —
경로 계획이 원래 해금 조건을 지키고 있었음이 확인됐고, 게이팅이 도달성을 깨지 않았다.

미충족 카드는 숨기지 않고 회색 + 사유를 표시한다. 설계 팩대로 임계값을 학습시키는 장치다.

## 레이아웃 회귀 가드 (`tests/layout_probe.gd`)

구현 중 화면이 통째로 비었다. 원인은 `add_child` **뒤에** `set_anchors_preset`을 부른 것으로,
`SaTurnScreen`이 size `(0, 0)`으로 남았다. **Godot 은 이때 에러를 내지 않는다.**
스모크 테스트는 인스턴스화만 확인하므로 잡지 못한다.

추측 대신 `tools/dump_layout.gd`로 실제 크기를 덤프해 진단했고,
같은 부류를 막는 검사를 `scripts/test_all.sh` 체인에 넣었다:

- 턴 화면이 부모의 95% 이상을 채우는가
- 자식이 있는데 size 0 인 `Control` 이 있는가
- 활성 버튼의 높이가 88px 미만인가 (보조 어포던스인 `함께` 칩은 예외)

현재 실측: 루트 `(965, 1280)` · 턴 화면 `(965, 1280)` · 크기0 `0` · 작은 버튼 `0`.

`Button` 은 컨테이너가 아니라 자식 크기를 따르지 않는다. 카드 높이는 명시해야 한다.

## 엔진 핀 4.7.1 → 4.7.2

Homebrew 가 로컬 바이너리를 4.7.2 로 올려 `.godot-version` 핀과 어긋났다.
4.7.2 export template 이 로컬에 있고, CI 가 받는 Linux 바이너리·템플릿 URL 둘 다 200 이며,
전 검증 체인이 4.7.2 에서 통과해 핀을 맞췄다.
갱신 대상은 `.godot-version`, `scripts/ensure_godot.sh`, `godot-checks.yml`, README, 설계 팩, 서드파티 고지다.
ADR 과 날짜 붙은 작업 기록은 그 시점의 사실이라 고치지 않았다.

## 검증

```
scripts/test_all.sh          core · endings · balance · simulation · smoke · layout 전부 통과
tools/check_core_boundary.py 코어 16개 파일 통과
tools/validate_content.py    액션 38 · 이벤트 23
scripts/check_docs.sh        ADR 9
scripts/check_web_budget.sh  전송 12.23MB / 15MB · pck 2.48MB / 6MB
```

## 남은 것

- 이벤트 오버레이와 밴드에 세로 여백이 남는다. 카드 수가 4~6 으로 변하므로 콘텐츠 확장 뒤 다듬는다.
- 해석 연출(카메라 push-in, 별자리 발광, 숫자 팝)은 미구현. P7 연출 패스에서 붙인다.
- 이벤트 23/106, NPC 이벤트 6/30. 평판 공급이 얇아 밴드 3~4 하네스 기준이 잠정 1 시드다.
