# starlit-apprentice Agent Guide

## 기본 원칙

- 한국어를 주 언어로 쓰고 결론과 현재 상태부터 간결하게 답한다.
- 추측하지 않는다. 확정해야 하는데 모르는 값은 `확정 필요`로 남긴다.
- 사용자의 전제가 사실과 다르면 근거를 들어 바로잡는다.
- 구현·빌드·업로드·QA·심사·승인·배포·공개 상태를 구분해 정확히 표현한다.

## Source of Truth

- **`docs/`가 이 저장소의 실행 원장이다.** Obsidian은 보조 지식베이스다.
- 설계는 `docs/game-design/` 9개 문서가 소유한다. 되돌리기 어려운 결정은 전부 `docs/02-decisions/`에 있다.
- 개인 로컬 절대경로는 `AGENT.local.md`에서만 관리하고 커밋하지 않는다.

## 현재 단계

Godot 4 재작성 중이다. 진행 상황은 `docs/04-work/`를 본다.

## 구조 원칙

- **`packages/product-core/`는 순수 GDScript다.** `extends RefCounted`만 쓴다.
  금지: `Node`/`Control`/`SceneTree`/`Engine`/`Input`/`DisplayServer`, `FileAccess`/`DirAccess`/`ResourceLoader`/`ProjectSettings`, `OS`/`Time`/`JSON`, `preload()`/`load()`, Firebase·광고·결제·`JavaScriptBridge`·HTTP.
  - `JSON` 금지라 콘텐츠 파싱은 `src/content/`가 하고 코어는 `Dictionary`만 받는다.
  - `Time` 금지라 시간 의존은 전부 주입 인자다. 이것이 밸런스 하네스를 결정론적으로 만든다.
- Godot scene tree·렌더링·입력·애니메이션은 `src/`와 `autoload/`에 둔다.
- 마켓별 delivery는 `play-store/`, `app-store/`, `apps-in-toss/`, `apps/ait/`, `firebase/`로 분리한다.

## 반드시 지킬 것

- **`project.godot`에 `gui/theme/custom_font`를 넣지 않는다.** 부팅 시점 로드가 첫 import보다 앞서 clean 체크아웃마다 required check를 red로 만든다. → `docs/02-decisions/0003`
- **`JavaScriptBridge.eval(...)`을 쓰지 않는다.** `get_interface(...)`만 쓴다. AppsInToss 자동 반려 사유다. → `docs/02-decisions/0004`
- **Web pck는 gzip 6MB를 넘지 않는다.** 총 전송량 15MB gzip이 AppsInToss 10초 제약의 예산이다. → `docs/02-decisions/0006`
- **Godot은 GDScript 파스 에러에도 exit 0을 낸다.** 모든 Godot 호출을 `timeout`으로 감싸고, ANSI 코드를 제거한 뒤 `^(SCRIPT ERROR|ERROR):`를 grep해 실패시킨다. ANSI 제거를 빼먹으면 게이트가 조용히 무력화된다.
- **밸런스 상수를 원격 설정에 두지 않는다.** CI 하네스가 검증하는 대상이다.

## 검증

```bash
export GODOT_BIN=/opt/homebrew/bin/godot          # 또는 bash scripts/ensure_godot.sh
bash scripts/test_all.sh                          # 전체 (약 5초)
bash scripts/godot_quality_gate.sh --project .    # import → compile → smoke
python3 tools/validate_content.py .               # 콘텐츠 정적 린트
python3 tools/check_core_boundary.py .            # 코어 경계
bash scripts/check_docs.sh .                      # 문서 구조
```

Godot 검증은 `rm -rf .godot` 후 **두 번** 실행한다. 2회차가 깨끗한 것은 증거가 아니다.

## Git

- **미출시 단계에서는 main 직접 푸시를 쓴다.** CI 는 push→main 에서 계속 돈다.
- 마켓 출시 이후에는 브랜치와 PR 흐름으로 되돌린다.
- 커밋 메시지는 한국어로, 변경 목적이 드러나게 쓴다.
- 검증되지 않은 완료를 주장하지 않는다. `.ait` 생성 성공은 콘솔 등록·심사·공개 어느 것도 의미하지 않는다.
