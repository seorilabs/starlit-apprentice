# P4.3c 코어 루프 재설계 (부분) 실행 기록

- 날짜: 2026-08-23
- 단계: P4.3c — 주 단위 루프·자원·리스크·상태이상 구현
- 관련: [[2026-08-23-p4-core-port]] · [[../game-design/02-gdd]]

## 구현한 것

| 파일 | 역할 |
|---|---|
| `src/rng/xorshift32.gd` | 결정론적 난수. 시드 명시 주입. 코어는 `Time` 을 모른다 |
| `src/domain/aptitude.gd` | 재능 고정 multiset (S1·A2·B4·C1·D1) 셔플 배정, 각성 시 등급 승격 |
| `src/rules/risk.gd` | 결과 판정 + 상태이상 6종 |
| `src/rules/resources.gd` | 자원·수업료·빚·선택 가능성 |
| `src/rules/turn.gd` | 턴 해석. 코어의 단일 공개 진입점 |
| `data/actions.json` | 액션 38종 |
| `tools/validate_content.py` | 콘텐츠 정적 린트 |
| `tests/simulation_runner.gd` | 실데이터 36턴 완주 검증 |

## 실데이터 시뮬레이션 결과 (7시드)

```
완주 7/7 | 골드<40 경험 7 | 기력<30 경험 7
상태이상 진입: { "slump_light": 2, "slump": 2 }
턴 29 이전 캡 도달: 없음
```

| 설계 주장 | 구 구현 | 실측 |
|---|---|---|
| 자원이 실제로 구속된다 (불변식 13) | 30루트 중 27개가 정확히 `stress 4 / energy 100` 으로 종료 | **전 시드에서 골드<40 · 기력<30 경험** |
| 조기 캡 불가 (불변식 6) | 주력 스탯 6~7개월차 100 | **턴 29 이전 도달 없음** |
| 실패 상태가 존재한다 (F5) | 전무 | **부진 2회 · 슬럼프 2회 진입** |
| 소프트락 불가 | 성립하나 리스크도 없음 | **7/7 완주, 선택 불가 0회** |

## 액션 38종 — 구 결함 3종 제거

| 결함 | 구 구현 | 개편 |
|---|---|---|
| 카테고리 내 비용 무차별 | 수업 6종이 비용 튜플 **1개** | **18종** |
| 스탯 병목 | `magic`·`courage` 소스 각 **1개** | 최소 **4개** |
| 교실 편중 | 전 스탯이 수업으로 상승 | 담력·언변·상재는 **일과 외출로만** |

## 겪은 것

**`String(null)` 런타임 에러.** 휴식 액션의 `"stat": null` 을 `String(action.get("stat", ""))` 로 읽었다. 키가 존재하므로 기본값이 아니라 `null` 이 돌아오고 `String(null)` 이 터진다.

더 나쁜 건 증상이었다 — `SceneTree._initialize` 안에서 에러가 나면 `quit()` 이 호출되지 않아 **프로세스가 영원히 돈다.** 3분 타임아웃으로 끊고 나서야 원인이 보였다. `_text()` 헬퍼로 null 을 명시 처리했고, 이것이 `scripts/test_all.sh` 의 `timeout` 래핑이 필요한 이유다.

## 검증

전체 스위트가 **3초**에 돈다. required check 로 두기에 충분하다.

```
test_all (import → core → equivalence → simulation → smoke)  exit=0
validate_content.py    exit=0
check_core_boundary.py exit=0 (코어 13파일)
check_docs.sh          exit=0
pnpm legacy:all        exit=0
```

## 남은 것

| 항목 | 왜 아직인가 |
|---|---|
| NPC 관계 이벤트 체인 | 이벤트 106종 저작(P6) 선행 |
| 선택지 이벤트 해결 | 같음 |
| 계절 마일스톤 | 진로 선언과 함께 구현 |
| 엔딩 30종 재저작 (band·declared 요건) | 진로 6종 확정 후 |
| 30 루트 재저작 | 위 전부 선행 |
| 4.3d `legacy/` 삭제 | 루트 재저작 통과 후 |
