class_name SaEndingJudgement
extends RefCounted
## 엔딩 판정. 콘텐츠에서 유도되는 특이도 점수로 정렬한다.
##
## 구 구현은 (priority ?? 배열인덱스) 로 정렬했고 priority 30 인 3종이 나머지 26종을
## 가려 만렙 런이 항상 court-scribe 로 수렴했다. 배열 위치가 판정에 개입하지 않는다.
## docs/game-design/02-gdd.md 엔딩 판정

const FALLBACK_CODE := "quiet-life"

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
		SaEndingRequirements.TYPE_AFFINITY:
			return target / 8.0
		SaEndingRequirements.TYPE_CONDITION:
			return 4.0
		SaEndingRequirements.TYPE_DECLARED:
			return 6.0
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
	var bonus := 12.0 if declared_path_ending != "" and String(ending.get("code", "")) == declared_path_ending else 0.0
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

## 선언한 진로의 대표 엔딩 코드를 콘텐츠에서 유도한다.
##
## 진로→엔딩 표를 코드에 박으면 엔딩을 추가할 때마다 표가 썩는다. 엔딩 목록에서
## declared 요건의 path 가 일치하는 것만 후보로 두고, 그중 지금 상태가 실제로
## 충족한 엔딩을 고른다. 충족하지 못한 엔딩에 보너스를 줘 봐야 judge() 가
## 어차피 걸러내므로 선언 보너스가 통째로 사라진다.
## 정렬은 judge() 와 같은 규칙이다 — 특이도 desc → band desc → 코드 asc.
static func declared_ending_code(state: Dictionary, endings: Array, declared_path: String) -> String:
	if declared_path == "":
		return ""
	var best_code := ""
	var best_spec := -1.0
	var best_band := -1.0
	for ending in endings:
		var e: Dictionary = ending
		var matches := false
		for req in (e.get("requirements", []) as Array):
			var r: Dictionary = req
			if String(r.get("type", "")) == SaEndingRequirements.TYPE_DECLARED \
				and String(r.get("path", "")) == declared_path:
				matches = true
				break
		if not matches:
			continue
		if not SaEndingRequirements.all_satisfied(state, e.get("requirements", [])):
			continue
		var code := String(e.get("code", ""))
		var sp := specificity(e)
		var bd := float(e.get("band", 0))
		var better := false
		if sp > best_spec: better = true
		elif sp == best_spec and bd > best_band: better = true
		elif sp == best_spec and bd == best_band and (best_code == "" or code < best_code): better = true
		if better:
			best_code = code
			best_spec = sp
			best_band = bd
	return best_code
