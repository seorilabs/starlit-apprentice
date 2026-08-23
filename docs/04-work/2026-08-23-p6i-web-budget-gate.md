# 웹 예산 게이트가 낡은 산출물을 재고 있었다

- 날짜: 2026-08-23
- 단계: P6 마무리 — 빌드 산출물 표류 차단
- 관련: [[../02-decisions/0006-pck-budget]] · [[2026-08-23-p6h-event-pool-complete]]

## 무엇이 잘못됐나

`scripts/check_web_budget.sh` 는 `build/web/` 에 이미 있는 산출물을 잰다.
**export 는 어디서도 하지 않는다.** 그래서

- 콘텐츠를 106종까지 늘리는 동안 게이트는 계속 **몇 시간 전 pck** 를 재고 있었다
- 엔진 핀을 4.7.1 → 4.7.2 로 올린 뒤에는 낡은 pck 를 열지 못해
  `Pack version unsupported: 4` 로 **게이트가 실제로 실패(exit 1)** 하고 있었다

계획서가 R13 으로 경고한 형태 그대로다 — 산출물이 소스와 어긋나는데 그걸
검사하는 경로가 없다.

**내 보고에도 오류가 있었다.** stdout 마지막 줄의 "통과"만 보고 통과로 보고했고
종료 코드를 확인하지 않았다. 스크립트는 성공일 때만 그 줄을 찍지만, 파이프로
넘긴 tail 이 앞선 실행의 출력이었다.

## 고친 것

`scripts/export_web.sh` 를 만들었다.

- `build/web` 을 통째로 지우고 시작한다 — 부분 갱신은 표류의 원인이다
- **export 전에 import 를 완주시킨다.** cold export 는 importer 를 돌리지 않아
  한국어 폰트와 텍스처가 조용히 pck 에서 빠진다(lizard-tycoon 선례, R2)
- export 로그의 `^(SCRIPT ERROR|ERROR):` 를 검사한다. Godot 은 export 실패에도
  exit 0 을 내는 경우가 있어 산출물 존재까지 따로 확인한다

`check_web_budget.sh` 가 매번 이것을 먼저 부른다. `SKIP_EXPORT=1` 은 방금 export 한
것을 다시 잴 때만 쓴다.

## CI 에도 없었다

`godot-checks.yml` 의 `check_command` 에 경계·콘텐츠·문서·테스트·품질 게이트는
있는데 **웹 예산만 빠져 있었다.** export 템플릿이 필요해서다
(`with_export_templates: false`).

`with_export_templates: true` 인 `Web Budget` job 을 따로 추가했다.
`actionlint` 통과. 기존 job 이름은 건드리지 않았다 — required check 컨텍스트가
거기서 파생된다.

## 실측 (재export 후)

| 항목 | gzip |
|---|---:|
| index.wasm | 9.64 MB |
| index.pck | 2.55 MB |
| 기타 | 0.10 MB |
| **총 전송량** | **12.29 MB / 15 MB** |

**남은 여유는 2.71 MB 이고, 제약은 pck(6MB)가 아니라 총량(15MB)이다.**
엔진 wasm 9.64 MB 가 고정 바닥값이라 아트와 오디오가 나눠 쓸 몫이 그만큼이다.
엔딩 일러스트 30종과 BGM 을 여기에 맞춰 설계해야 한다.
