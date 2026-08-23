# 02-decisions — ADR

되돌리기 어려운 결정은 전부 여기 있다. 번호는 연속이어야 하며 `scripts/check_docs.sh` 가 검사한다.

결정을 바꿀 때는 기존 ADR 을 수정하지 않고 새 번호를 추가한 뒤 이전 것을 `superseded` 로 표시한다.

| ADR | 결정 |
|---|---|
| 0001 | docs/ 를 실행 원장으로 삼는다 |
| 0002 | 클라이언트를 Godot 4 로 재작성한다 |
| 0003 | 기본 폰트를 project.godot 에 지정하지 않는다 |
| 0004 | Godot 웹 로더의 코드 실행 shim 을 빌드 시 치환한다 |
| 0005 | GA4 Measurement Protocol Web 스트림의 구조적 한계를 수용한다 |
| 0006 | Web pck 예산을 gzip 6MB 로 고정한다 |
| 0007 | 한국어 폰트는 Pretendard 정적 Regular 하나만 번들한다 |
