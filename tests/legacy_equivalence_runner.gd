extends SceneTree
## 구 TypeScript 엔진과 GDScript 이식본의 판정 등가성 검증.
##
## legacy 엔진으로 30개 루트 × 7시드를 돌려 얻은 최종 상태(ground truth)에 대고
## GDScript 의 요건 평가 + 엔딩 판정이 같은 결론을 내는지 확인한다.
##
## 이것이 "하네스가 옳다"는 증거다. 이 등가성이 성립한 뒤에야 재설계로 넘어간다.
## 코어는 JSON 을 모르므로 로딩은 여기서 하고 코어에는 Dictionary 만 넘긴다.

const ENDINGS_PATH := "res://data/legacy-endings.json"
const STATES_PATH := "res://data/legacy-final-states.json"

func _initialize() -> void:
	var failures: Array[String] = []
	var endings := _load(ENDINGS_PATH).get("endings", []) as Array
	var truth := _load(STATES_PATH)
	var routes: Dictionary = truth.get("routes", {})

	if endings.size() != 30:
		failures.append("엔딩이 30개가 아니다: %d" % endings.size())
	if routes.is_empty():
		failures.append("ground truth 가 비어 있다.")

	var compared := 0
	var mismatched := 0
	for code in routes.keys():
		for entry in (routes[code] as Array):
			var e: Dictionary = entry
			if not bool(e.get("ok", false)):
				continue  # legacy 에서 차단된 조합은 비교 대상이 아니다
			var state := {
				"stats": e.get("stats", {}),
				"gold": e.get("gold", 0),
				"energy": e.get("energy", 0),
				"stress": e.get("stress", 0),
				"flags": e.get("flags", {}),
			}
			var expected := String(e.get("judged", ""))
			var actual := SaEndingJudgement.judge_legacy(state, endings)
			compared += 1
			if actual != expected:
				mismatched += 1
				if mismatched <= 5:
					failures.append("판정 불일치 route=%s seed=%s legacy=%s gdscript=%s"
						% [code, str(e.get("seed")), expected, actual])

	if compared == 0:
		failures.append("비교한 조합이 0개다. ground truth 로딩이 깨졌다.")

	# ── 섀도잉 회귀 증명 ────────────────────────────────────────────────
	# 모든 요건을 만족하는 만렙 상태에서 구 판정은 배열 인덱스 2번(court-scribe)으로
	# 수렴한다. 새 특이도 판정은 요건이 실제로 더 높은 엔딩을 고른다.
	var maxed := _maxed_state(endings)
	var legacy_maxed := SaEndingJudgement.judge_legacy(maxed, endings)
	var new_maxed := SaEndingJudgement.judge(maxed, endings)
	var eligible := 0
	for ending in endings:
		var reqs2: Array = (ending as Dictionary).get("requirements", [])
		if not reqs2.is_empty() and SaEndingRequirements.all_satisfied(maxed, reqs2):
			eligible += 1
	print("만렙 상태 자격 엔딩 %d개 → 구 판정 '%s' / 새 판정 '%s'"
		% [eligible, legacy_maxed, new_maxed])

	if eligible < 20:
		failures.append("만렙 상태가 자격을 갖춘 엔딩이 %d개뿐이다. 상태 구성이 잘못됐다." % eligible)
	if legacy_maxed != "court-scribe":
		failures.append("구 판정이 court-scribe 로 수렴하지 않았다: %s" % legacy_maxed)
	if new_maxed == legacy_maxed:
		failures.append("새 판정이 구 판정과 같다. 섀도잉이 고쳐지지 않았다.")
	var new_spec := _spec_of(endings, new_maxed)
	var legacy_spec := _spec_of(endings, legacy_maxed)
	if new_spec <= legacy_spec:
		failures.append("새 판정이 고른 엔딩의 특이도가 더 높지 않다: %.1f vs %.1f"
			% [new_spec, legacy_spec])
	print("특이도: 새 판정 %.1f / 구 판정 %.1f" % [new_spec, legacy_spec])

	print("등가성 비교: %d 조합, 불일치 %d" % [compared, mismatched])

	if failures.is_empty():
		print("LEGACY EQUIVALENCE PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

## 모든 엔딩 요건을 넉넉히 넘기는 상태를 만든다.
func _maxed_state(endings: Array) -> Dictionary:
	var stats := {}
	var flags := {}
	for ending in endings:
		for req in ((ending as Dictionary).get("requirements", []) as Array):
			var r: Dictionary = req
			match String(r.get("type", "")):
				"stat":
					stats[String(r.get("stat", ""))] = 100
				"flag":
					flags[String(r.get("flag", ""))] = 48
				"flag-sum":
					for f in (r.get("flags", []) as Array):
						flags[String(f)] = 48
				"average":
					for s in (r.get("stats", []) as Array):
						stats[String(s)] = 100
	return {"stats": stats, "gold": 9999, "energy": 100, "stress": 0, "flags": flags}

func _spec_of(endings: Array, code: String) -> float:
	for ending in endings:
		if String((ending as Dictionary).get("code", "")) == code:
			return SaEndingJudgement.specificity(ending as Dictionary)
	return -1.0

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		printerr("FAIL: 파일 없음 %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
