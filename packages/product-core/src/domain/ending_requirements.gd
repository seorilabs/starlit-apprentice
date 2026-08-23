class_name SaEndingRequirements
extends RefCounted
## 엔딩 요건 평가. 5개 타입을 지원한다.
##
## 코어는 JSON 을 모른다. 호출자가 파싱한 Dictionary 를 넘긴다.
## 상태 Dictionary 형태: {stats: {key: int}, gold: int, energy: int, stress: int, flags: {key: int}}

const TYPE_STAT := "stat"
const TYPE_RESOURCE := "resource"
const TYPE_FLAG := "flag"
const TYPE_FLAG_SUM := "flag-sum"
const TYPE_AVERAGE := "average"
## 재설계로 추가된 타입. band >= 3 엔딩은 declared 를 하드 요건으로 갖는다.
const TYPE_AFFINITY := "affinity"
const TYPE_CONDITION := "condition"
const TYPE_DECLARED := "declared"

const DIRECTION_AT_MOST := "at-most"

static func current_value(state: Dictionary, req: Dictionary) -> float:
	match String(req.get("type", "")):
		TYPE_STAT:
			var stats: Dictionary = state.get("stats", {})
			return float(stats.get(String(req.get("stat", "")), 0))
		TYPE_RESOURCE:
			return float(state.get(String(req.get("resource", "")), 0))
		TYPE_FLAG:
			var flags: Dictionary = state.get("flags", {})
			return float(flags.get(String(req.get("flag", "")), 0))
		TYPE_FLAG_SUM:
			var flags2: Dictionary = state.get("flags", {})
			var sum := 0.0
			for f in (req.get("flags", []) as Array):
				sum += float(flags2.get(String(f), 0))
			return sum
		TYPE_AVERAGE:
			var stats2: Dictionary = state.get("stats", {})
			var keys: Array = req.get("stats", [])
			if keys.is_empty():
				return 0.0
			var total := 0.0
			for k in keys:
				total += float(stats2.get(String(k), 0))
			return total / float(keys.size())
		TYPE_AFFINITY:
			var aff: Dictionary = state.get("affinity", {})
			return float(aff.get(String(req.get("npc", "")), 0))
		_:
			return 0.0

static func is_satisfied(state: Dictionary, req: Dictionary) -> bool:
	var kind := String(req.get("type", ""))

	# 상태이상 요건. direction=absent 이면 "그 상태가 아니어야 한다".
	if kind == TYPE_CONDITION:
		var has := (state.get("conditions", []) as Array).has(String(req.get("condition", "")))
		return not has if String(req.get("direction", "")) == "absent" else has

	# 진로 선언 요건. 이것이 희귀·전설 엔딩을 선언 없이 도달 불가능하게 만든다.
	if kind == TYPE_DECLARED:
		return String(state.get("declared_path", "")) == String(req.get("path", ""))

	var target := float(req.get("target", 0))
	var value := current_value(state, req)
	if String(req.get("direction", "")) == DIRECTION_AT_MOST:
		return value <= target
	return value >= target

static func all_satisfied(state: Dictionary, requirements: Array) -> bool:
	for req in requirements:
		if not is_satisfied(state, req as Dictionary):
			return false
	return true

## 미충족 요건만 돌려준다. UI 힌트와 코칭에 쓴다.
static func pending(state: Dictionary, requirements: Array) -> Array:
	var out: Array = []
	for req in requirements:
		if not is_satisfied(state, req as Dictionary):
			out.append(req)
	return out
