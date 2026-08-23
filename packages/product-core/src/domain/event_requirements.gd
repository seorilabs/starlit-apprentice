class_name SaEventRequirements
extends RefCounted
## 이벤트·선택지 요건 평가.
##
## 엔딩 요건(SaEndingRequirements)과 타입이 다르다. 이벤트는 턴 범위·NPC 만남·
## 상태이상·진로 선언 같은 진행 상태를 본다.

static func _text(value: Variant) -> String:
	return "" if value == null else String(value)

static func is_satisfied(state: Dictionary, req: Dictionary) -> bool:
	var kind := _text(req.get("type", ""))
	match kind:
		"stat":
			var stats: Dictionary = state.get("stats", {})
			return int(stats.get(_text(req.get("stat", "")), 0)) >= int(req.get("target", 0))
		"resource":
			var value := int(state.get(_text(req.get("resource", "")), 0))
			if _text(req.get("direction", "")) == "at-most":
				return value <= int(req.get("target", 0))
			return value >= int(req.get("target", 0))
		"affinity":
			var aff: Dictionary = state.get("affinity", {})
			var have := int(aff.get(_text(req.get("npc", "")), 0))
			if _text(req.get("direction", "")) == "at-most":
				return have <= int(req.get("target", 0))
			return have >= int(req.get("target", 0))
		"npc_met":
			return (state.get("affinity", {}) as Dictionary).has(_text(req.get("npc", "")))
		"flag":
			var flags: Dictionary = state.get("flags", {})
			return int(flags.get(_text(req.get("flag", "")), 0)) >= int(req.get("target", 1))
		"turn_range":
			var turn := int(state.get("turn", 1))
			return turn >= int(req.get("from", 1)) and turn <= int(req.get("to", 36))
		"condition":
			return (state.get("conditions", []) as Array).has(_text(req.get("condition", "")))
		"declared_path":
			return _text(state.get("declared_path", "")) == _text(req.get("path", ""))
		_:
			return false

static func all_satisfied(state: Dictionary, requirements: Array) -> bool:
	for r in requirements:
		if not is_satisfied(state, r as Dictionary):
			return false
	return true

static func any_satisfied(state: Dictionary, requirements: Array) -> bool:
	for r in requirements:
		if is_satisfied(state, r as Dictionary):
			return true
	return false
