# ADR-0002 클라이언트를 Godot 4로 재작성한다

- 상태: `accepted`
- 날짜: 2026-08-23

## 맥락
현행 클라이언트는 손으로 짠 Canvas 2D + `innerHTML` DOM + Vite + Capacitor다. `app.ts`가 1,913줄 god object이고 상태 변경마다 DOM 전체를 교체해 포커스·애니메이션·스크린리더가 매번 초기화된다. 화면 전환 애니메이션과 포커스 관리가 구조적으로 불가능하다.

## 결정
Godot `4.7.1.stable`로 재작성한다. `project.godot`은 저장소 루트에 둔다.

## 근거
- org 게임 표준이 Godot + Firebase다. 론칭된 3개 게임(lizard-tycoon, spiritgate-defenders, jomul)이 전부 `project.godot`을 루트에 둔다. `godot/` 하위는 템플릿뿐이다.
- org 재사용 워크플로우 기본값이 `project_dir: "."`이고, AIT 래퍼 스크립트와 web export 스크립트가 전부 루트를 전제한다.
- 4.7.1은 최근 론칭 2개가 핀한 버전이고 export template이 로컬에 설치돼 있다.

## 결과
- TypeScript `product-core`(3,000줄 + 테스트 1,495줄)를 GDScript로 이식해야 한다. 이식 완료 전까지 `legacy/`가 밸런스 원장으로 남는다.
- Godot이 저장소 전체를 스캔하므로 `legacy/.gdignore`로 제외한다.
