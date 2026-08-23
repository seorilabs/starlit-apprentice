extends SceneTree
## 엔딩 콘텐츠 정적 린트. 실제 판정 공식(SaEndingJudgement)을 그대로 쓴다.
##
## Python 으로 재구현하면 런타임과 어긋날 수 있다. 린트와 판정이 같은 코드를 봐야 한다.
## 설계 불변식 8(섀도잉 금지) + band 설계 준수.

const ENDINGS_PATH := "res://data/endings.json"

func _initialize() -> void:
	var failures: Array[String] = []
	var d := _load(ENDINGS_PATH)
	var endings: Array = d.get("endings", [])

	if endings.size() != 30:
		failures.append("엔딩이 30개가 아니다: %d" % endings.size())

	# band 분포 (설계: 실패 3 / 일상 5 / 전문 10 / 희귀 8 / 전설 4)
	var want := {0: 3, 1: 5, 2: 10, 3: 8, 4: 4}
	var got := {}
	for e in endings:
		var b := int((e as Dictionary).get("band", -1))
		got[b] = int(got.get(b, 0)) + 1
	for b in want.keys():
		if int(got.get(b, 0)) != int(want[b]):
			failures.append("band %d 가 %d개다. 설계는 %d개" % [b, int(got.get(b, 0)), int(want[b])])

	# 코드 중복 금지
	var codes := {}
	for e in endings:
		var c := String((e as Dictionary).get("code", ""))
		if codes.has(c):
			failures.append("엔딩 code 중복: %s" % c)
		codes[c] = true

	# band >= 3 은 진로 선언을 하드 요건으로 가져야 한다.
	# 이것이 희귀·전설 엔딩을 선언 없이 도달 불가능하게 만든다.
	for e in endings:
		var ed: Dictionary = e
		if int(ed.get("band", 0)) < 3:
			continue
		var has_declared := false
		for r in (ed.get("requirements", []) as Array):
			if String((r as Dictionary).get("type", "")) == SaEndingRequirements.TYPE_DECLARED:
				has_declared = true
		if not has_declared:
			failures.append("band %d 엔딩 '%s' 에 declared 요건이 없다"
				% [int(ed.get("band", 0)), String(ed.get("code", ""))])

	# 폴백은 요건이 없어야 한다
	for e in endings:
		var ed2: Dictionary = e
		if String(ed2.get("code", "")) == SaEndingJudgement.FALLBACK_CODE:
			if not (ed2.get("requirements", []) as Array).is_empty():
				failures.append("폴백 엔딩에 요건이 있으면 안 된다")

	# ── 불변식 8: 섀도잉 금지 ──────────────────────────────────────
	# A 의 요건이 B 의 상위집합인데 특이도가 B 이하면 A 는 영원히 도달 불가능하다.
	for i in endings.size():
		for j in endings.size():
			if i == j:
				continue
			var a: Dictionary = endings[i]
			var b: Dictionary = endings[j]
			var ra: Array = a.get("requirements", [])
			var rb: Array = b.get("requirements", [])
			if ra.is_empty() or rb.is_empty():
				continue
			if _same_set(ra, rb):
				if i < j:
					failures.append("'%s' 와 '%s' 의 요건 집합이 동일하다"
						% [String(a.get("code","")), String(b.get("code",""))])
				continue
			if _is_superset(ra, rb) and SaEndingJudgement.specificity(a) <= SaEndingJudgement.specificity(b):
				failures.append("'%s' 가 '%s' 를 상위집합으로 포함하는데 특이도가 낮거나 같다 (%.1f <= %.1f). 도달 불가능하다"
					% [String(a.get("code","")), String(b.get("code","")),
					   SaEndingJudgement.specificity(a), SaEndingJudgement.specificity(b)])

	# 특이도가 band 와 대체로 함께 오르는지
	var by_band := {}
	for e in endings:
		var ed3: Dictionary = e
		var bd := int(ed3.get("band", 0))
		by_band[bd] = maxf(float(by_band.get(bd, 0.0)), SaEndingJudgement.specificity(ed3))
	var prev := -1.0
	for bd in [0, 1, 2, 3, 4]:
		var v := float(by_band.get(bd, 0.0))
		if bd > 0 and v <= prev:
			failures.append("band %d 최대 특이도(%.1f)가 band %d(%.1f) 이하다" % [bd, v, bd-1, prev])
		prev = v
	print("band 별 최대 특이도: %s" % str(by_band))

	if failures.is_empty():
		print("ENDINGS LINT PASS (엔딩 %d, 요건 %d)" % [endings.size(), _count_reqs(endings)])
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

func _key(r: Dictionary) -> String:
	return "%s|%s|%s|%s|%s" % [r.get("type",""), r.get("stat",""), r.get("resource",""),
		r.get("flag", r.get("npc", r.get("path", r.get("condition","")))), str(r.get("target",""))]

func _keys(reqs: Array) -> Dictionary:
	var out := {}
	for r in reqs:
		out[_key(r as Dictionary)] = true
	return out

func _same_set(a: Array, b: Array) -> bool:
	var ka := _keys(a)
	var kb := _keys(b)
	if ka.size() != kb.size():
		return false
	for k in ka.keys():
		if not kb.has(k):
			return false
	return true

func _is_superset(a: Array, b: Array) -> bool:
	var ka := _keys(a)
	var kb := _keys(b)
	if ka.size() <= kb.size():
		return false
	for k in kb.keys():
		if not ka.has(k):
			return false
	return true

func _count_reqs(endings: Array) -> int:
	var n := 0
	for e in endings:
		n += (e as Dictionary).get("requirements", []).size()
	return n

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		printerr("FAIL: 파일 없음 %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
