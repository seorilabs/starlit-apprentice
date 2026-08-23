# ADR-0003 기본 폰트를 project.godot 에 지정하지 않는다

- 상태: `accepted`
- 날짜: 2026-08-23

## 맥락
Godot에서 `gui/theme/custom_font`를 `project.godot`에 지정하면 **부팅 시점 폰트 로드가 첫 import보다 앞선다.** clean 체크아웃에서는 `.godot/imported/*.fontdata`가 아직 없어 다음이 뜬다.

```
ERROR: Cannot open file 'res://.godot/imported/....fontdata'
```

Godot은 이 상태로도 exit 0을 내지만, CI 로그 게이트는 `^ERROR:`를 실패로 처리한다. 결과적으로 **fresh 체크아웃마다 required check가 red가 되어 어떤 PR도 머지되지 않는다.**

## 결정
`project.godot`에 `gui/theme/custom_font`를 **넣지 않는다.** `autoload/ui.gd`가 import 이후에 `get_tree().root.theme`에 한국어 폰트를 부착한다. 폰트 로드 실패 시 `push_warning`을 쓰고 **`push_error`를 쓰지 않는다**(로그 게이트가 실패로 잡는다).

본문 폰트는 **Pretendard Variable**을 쓴다. 라이선스는 `09-knowledge/third-party-notices.md`에 기재한다.

## 근거
jomul이 같은 문제를 ADR 0010으로 기록했다. spiritgate는 `.tres` `FontVariation`을 써서 우연히 피해 갔을 뿐 설계된 회피가 아니다.

## 결과
- 검증은 반드시 `rm -rf .godot` 후 **두 번** 실행한다. **2회차가 깨끗한 것은 증거가 아니다.**
- Linux CI는 TTF를 만지는 Godot 명령 전에 `libfontconfig1`이 필요하다.
