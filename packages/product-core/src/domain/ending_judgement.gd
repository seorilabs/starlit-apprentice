class_name SaEndingJudgement
extends RefCounted
## 엔딩 판정.
##
## LEGACY 모드는 구 TypeScript 구현과 동일하게 동작한다 — 이식 등가성 검증 전용이다.
## SPECIFICITY 모드가 새 설계다. docs/game-design/02-gdd.md 엔딩 판정

const FALLBACK_CODE := "quiet-life"

# ── 구 구현 등가 (검증 전용, 4.3c 이후 제거 예정) ────────────────────────────
## 요건을 만족하는 엔딩 중 (priority ?? 배열 인덱스) 가 가장 큰 것을 고른다.
## 동점이면 배열 인덱스가 작은 쪽. 이 규칙 때문에 priority 30 인 3종이
## 나머지 26종(최대 암묵 우선순위 28)을 전부 가린다.
static func judge_legacy(state: Dictionary, endings: Array) -> String:
	var best_code := FALLBACK_CODE
	var best_priority := -1.0
	var best_index := 0x7FFFFFFF
	for index in endings.size():
		var ending: Dictionary = endings[index]
		var reqs: Array = ending.get("requirements", [])
		if reqs.is_empty():
			continue
		if not SaEndingRequirements.all_satisfied(state, reqs):
			continue
		var priority := float(ending.get("priority", index))
		if priority > best_priority or (priority == best_priority and index < best_index):
			best_priority = priority
			best_index = index
			best_code = String(ending.get("code", FALLBACK_CODE))
	return best_code

# ── 새 설계: 특이도 점수 ────────────────────────────────────────────────────
## 배열 위치와 무관하게 콘텐츠에서 유도되는 점수로 정렬한다.
static func requirement_weight(req: Dictionary) -> float:
	var target := float(req.get("target", 0))
	match String(req.get("type", "")):
		SaEndingRequirements.TYPE_STAT:
			return maxf(0.0, target - 10.0) / 10.0
		SaEndingRequirements.TYPE_RESOURCE:
			if String(req.get("resource", "")) == "reputation":
				return target / 8.0
			return target / 100.0
		SaEndingRequirements.TYPE_FLAG:
			return target * 1.5
		SaEndingRequirements.TYPE_FLAG_SUM:
			return target * 1.2
		SaEndingRequirements.TYPE_AVERAGE:
			return maxf(0.0, target - 10.0) / 10.0
		_:
			return 0.0

static func specificity(ending: Dictionary) -> float:
	var total := 0.0
	for req in (ending.get("requirements", []) as Array):
		total += requirement_weight(req as Dictionary)
	return total + float(ending.get("band", 0)) * 3.0

static func margin(state: Dictionary, ending: Dictionary) -> float:
	var total := 0.0
	for req in (ending.get("requirements", []) as Array):
		var r: Dictionary = req
		var target := maxf(1.0, float(r.get("target", 0)))
		var value := SaEndingRequirements.current_value(state, r)
		total += clampf((value - target) / target, 0.0, 0.5)
	return total

static func score(state: Dictionary, ending: Dictionary, declared_path_ending: String) -> float:
	var bonus := 12.0 if String(ending.get("code", "")) == declared_path_ending else 0.0
	return specificity(ending) + margin(state, ending) * 2.0 + bonus

## 정렬: score desc → specificity desc → band desc → code asc
## 최종 타이브레이크가 코드 사전순이라 시드와 배열 위치 양쪽에서 독립이다.
static func judge(state: Dictionary, endings: Array, declared_path_ending: String = "") -> String:
	var best: Dictionary = {}
	var best_score := -1.0
	var best_spec := -1.0
	var best_band := -1.0
	var best_code := FALLBACK_CODE
	for ending in endings:
		var e: Dictionary = ending
		var reqs: Array = e.get("requirements", [])
		if reqs.is_empty():
			continue
		if not SaEndingRequirements.all_satisfied(state, reqs):
			continue
		var code := String(e.get("code", ""))
		var s := score(state, e, declared_path_ending)
		var sp := specificity(e)
		var bd := float(e.get("band", 0))
		var better := false
		if s > best_score: better = true
		elif s == best_score and sp > best_spec: better = true
		elif s == best_score and sp == best_spec and bd > best_band: better = true
		elif s == best_score and sp == best_spec and bd == best_band and code < best_code: better = true
		if better:
			best = e
			best_score = s
			best_spec = sp
			best_band = bd
			best_code = code
	return best_code if not best.is_empty() else FALLBACK_CODE
