# P4.3d — legacy 제거

- 날짜: 2026-08-23
- 단계: P4.3d. 이식 완료
- 관련: [[2026-08-23-p4c-balance-harness]] · [[2026-08-23-p4-core-port]]

## 왜 지금인가

`legacy/` 를 유지한 이유는 하나였다 — **이식 중 하네스 실패가 하네스 버그인지 설계 변경인지 판별하는 기준.** 그 전환이 끝났다.

- GDScript 판정이 TypeScript 와 등가임을 179 조합으로 증명했다 (P4.3b)
- 엔딩 30종이 규칙만으로 도달 가능함을 플래너가 증명했다 (P4.3c, 29/29)

판별 기준이 더 필요하지 않다.

## 제거한 것

| 대상 | 규모 |
|---|---|
| `legacy/` 트리 | **305 MB, 추적 파일 168개** |
| `data/legacy-*.json` | 233 KB (이식 원본 · ground truth) |
| `tests/legacy_equivalence_runner.gd` | 전환기 검증 전용 |
| `SaEndingJudgement.judge_legacy()` | 코드 주석에 "4.3c 이후 제거 예정" 이라 적어 둔 그대로 |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `node_modules` | Node 워크스페이스 전체 |

## 남긴 것

`package.json` 과 `scripts/resolve-release-version.mjs` 만 남는다. **org 재사용 워크플로우의 caller 계약 자산**이라 필요하다. 태그에서 마켓별 버전 값을 유도한다.

```
node scripts/resolve-release-version.mjs --tag v1.2.3
  version_name 1.2.3 · android_version_code 1002003
  apple_marketing_version 1.2.3 · apple_build_number 1002003
```

등가성 증명 자체는 `docs/04-work/2026-08-23-p4-core-port.md` 에 수치와 함께 남아 있다. 기계장치를 영구히 들고 다닐 이유는 없다.

## 검증

```
fresh 게이트          exit=0
test_all (5단계)      전부 PASS
  코어 테스트 · 엔딩 린트 · 밸런스 29/29 · 시뮬레이션 · 스모크
콘텐츠 린트           exit=0
코어 경계 (16파일)     exit=0
문서 구조             exit=0
Web 예산              12.23 / 15.00 MB, pck 2.48 / 6.00 MB
```

## 운영 변경

미출시 단계이므로 **main 직접 푸시**로 전환했다. 브랜치 보호를 해제했고 CI 는 `push → main` 에서 계속 돈다. 마켓 출시 이후에는 브랜치·PR 흐름으로 되돌린다. `AGENTS.md` 에 반영했다.
