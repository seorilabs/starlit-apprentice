# ADR-0004 Godot 웹 로더의 코드 실행 shim 을 빌드 시 치환한다

- 상태: `accepted`
- 날짜: 2026-08-23

## 맥락
AppsInToss 게임 출시 가이드는 **"외부에서 전달받은 코드를 실행하는 기능은 사용할 수 없어요"**를 명시한다. Godot이 생성하는 웹 로더에는 `_godot_js_eval` 문자열 코드 실행 shim이 들어 있다. lizard-tycoon 빌드 `20260814-13`이 이것 때문에 `AUTO_REJECTED`됐다.

## 결정
`apps/ait/scripts/sanitize-godot-loader.mjs`가 export 후 `ait build` 전에 `_godot_js_eval`을 fail-closed `_godot_js_run`으로 치환한다(WebAssembly import 키는 보존). 빌드 후 `check-ait-code-execution.mjs`가 완성된 `.ait`를 재스캔한다. 두 스크립트 모두 자체 테스트를 `npm test`에 연결하고 `build`가 test를 먼저 실행한다.

게임 코드는 `JavaScriptBridge.get_interface(...)`만 쓰고 **`.eval(...)`을 절대 쓰지 않는다.**

## 근거
정책 조항이며 자동 반려 선례가 있다. 사후 대응이 아니라 빌드 파이프라인에 박아야 한다.

## 결과
게임 코드가 `eval`을 호출하면 sanitizer가 심사가 아니라 게임을 깨뜨린다. 그게 의도다.
