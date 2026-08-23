# product-core

엔진과 마켓 SDK를 알지 못하는 순수 로직이다. **`extends RefCounted` 만 쓴다.**

금지: `Node`/`Control`/`SceneTree`/`Engine`/`Input`/`DisplayServer`,
`FileAccess`/`DirAccess`/`ResourceLoader`/`ProjectSettings`,
`OS`/`Time`/`JSON`, `preload()`/`load()`,
Firebase·광고·결제·`JavaScriptBridge`·HTTP.

- `JSON` 금지라 콘텐츠 파싱은 `src/content/` 가 하고 코어는 `Dictionary` 만 받는다.
- `Time` 금지라 시간 의존은 전부 주입 인자다. 이것이 밸런스 하네스를 결정론적으로 만든다.

`class_name` 접두사는 `Sa` 를 쓴다. 경계는 `tools/check_core_boundary.py` 가 강제한다.
