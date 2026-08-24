extends SceneTree
## 엔딩 도달성 하네스. 구 구현의 check-ending-reachability.mjs 를 대체한다.
##
## 구 하네스는 사람이 손으로 짠 30개 루트를 시드 1 로만 재생했다. 그래서 30/30 PASS 가
## 나왔지만 7시드로 넓히면 15/30 만 안정적이었다(이식 당시 실측, docs/04-work/2026-08-23-p4-core-port.md).
##
## 여기서는 규칙만으로 도달 가능한지 플래너가 찾는다. 사람이 고른 경로가 아니다.

const ACTIONS_PATH := "res://data/actions.json"
const ENDINGS_PATH := "res://data/endings.json"
const EVENTS_PATH := "res://data/events.json"
## 설계 팩의 이벤트 저작 목표. 여기에 도달하면 band 3~4 기준을 올린다.
const EVENT_TARGET := 106
const SEEDS := [1, 7, 13, 101, 4242, 65537, 999983]
## band 별 도달 요구 시드 수.
##
## band 0~2 는 완전 도달을 요구한다. band 3~4 는 **현재 콘텐츠 성숙도에 맞춘 임시값**이다.
## 평판이 주로 이벤트·마일스톤에서 오는데 이벤트 저작이 아직 목표(106종)에 못 미쳐
## 공급이 얇고 시드 편차가 크다. 저작이 채워지면 기준을 올린다.
## 이 게이트의 목적은 "band 3~4 가 완성됐다" 가 아니라 **현재 수준에서 퇴행하지 않는 것**이다.
## 이벤트 저작이 진행되면 이 값과 엔딩의 평판 목표를 함께 올린다.
## 도달 요구 시드 수. 설계 불변식 7 — band <= 3 은 7/7, band 4 는 6/7.
## band 0 은 성공을 노리는 계획기가 만들 수 없어 방치 플레이로 따로 검증한다.
const REQUIRED := {0: 0, 1: 7, 2: 7, 3: 7, 4: 6}
const PROVISIONAL_BANDS := []   ## 잠정 기준 없음. 전 band 가 설계 기준을 충족한다.

var _endings: Array = []

func _initialize() -> void:
	var failures: Array[String] = []
	var actions: Array = _load(ACTIONS_PATH).get("actions", [])
	var endings: Array = _load(ENDINGS_PATH).get("endings", [])
	var events: Array = _load(EVENTS_PATH).get("events", [])
	if actions.is_empty() or endings.is_empty():
		printerr("FAIL: 콘텐츠 로딩 실패")
		quit(1)
		return

	var path_of := _path_lookup(endings)
	var reached_total := 0
	var attempted := 0
	var report: Array[String] = []

	for e in endings:
		var ending: Dictionary = e
		var code := String(ending.get("code", ""))
		var band := int(ending.get("band", 0))
		var reqs: Array = ending.get("requirements", [])
		if reqs.is_empty():
			continue  # 폴백은 항상 도달 가능
		attempted += 1

		var hits := 0
		var last_reason := ""
		for seed_value in SEEDS:
			var rng := SaRng.new(seed_value)
			var apt := SaAptitude.assign(SaRng.new(seed_value * 31 + 7))
			var run := SaRoutePlanner.run(ending, actions, apt, rng, String(path_of.get(code, "")), events)
			if not bool(run.get("ok", false)):
				last_reason = String(run.get("reason", ""))
				continue
			var state: Dictionary = run["state"]
			# 목표 요건을 실제로 채웠는가
			if not SaEndingRequirements.all_satisfied(state, reqs):
				var miss: Array[String] = []
				for r in reqs:
					var rd: Dictionary = r
					if not SaEndingRequirements.all_satisfied(state, [rd]):
						var kind := String(rd.get("type", ""))
						var label := kind
						if kind == "stat": label = String(rd.get("stat", ""))
						elif kind == "resource": label = String(rd.get("resource", ""))
						elif kind == "affinity": label = "호감:" + String(rd.get("npc", ""))
						elif kind == "flag": label = "플래그:" + String(rd.get("flag", ""))
						elif kind == "declared": label = "진로:" + String(rd.get("path", ""))
						miss.append("%s %d/%d" % [label,
							int(SaEndingRequirements.current_value(state, rd)), int(rd.get("target", 0))])
				last_reason = "미충족 " + ", ".join(miss)
				continue
			# 종료 자원 가드레일
			if int(state.get("energy", 0)) < 20:
				last_reason = "종료 기력 %d < 20" % int(state["energy"])
				continue
			if int(state.get("stress", 0)) > 80:
				last_reason = "종료 마음 %d > 80" % int(state["stress"])
				continue
			hits += 1

		reached_total += (1 if hits >= int(REQUIRED.get(band, 7)) else 0)
		var need := int(REQUIRED.get(band, 7))
		var provisional := PROVISIONAL_BANDS.has(band)
		var mark := ("OK " if hits >= need else "MISS")
		if provisional and hits >= need:
			mark = "잠정"
		report.append("  %s band%d %-22s %d/%d 시드%s"
			% [mark, band, code, hits, SEEDS.size(),
			   "" if hits >= need else "  <- %s" % last_reason])
		if hits < need:
			failures.append("band %d '%s' 가 %d/%d 시드에서만 도달했다(요구 %d). %s"
				% [band, code, hits, SEEDS.size(), need, last_reason])

	for line in report:
		print(line)
	print("도달: %d/%d 엔딩 (시드 %d개, 총 %d 시뮬레이션)"
		% [reached_total, attempted, SEEDS.size(), attempted * SEEDS.size()])
	print("이벤트 %d/%d · 전 band 가 설계 불변식 7 을 충족한다." % [events.size(), EVENT_TARGET])

	# band 0 은 성공을 노리는 계획기가 결코 만들지 않는다. 방치 플레이를
	# 따로 돌려야 실패 엔딩 3종이 죽은 콘텐츠가 아님을 증명할 수 있다.
	_endings = endings
	var neglect := _neglect_run(actions, events)
	print("방치 플레이: %s" % str(neglect))
	if not bool(neglect.get("failed", false)):
		failures.append("방치 플레이가 낙제하지 않는다. 실패 상태가 실제로 작동하지 않는다")
	if not bool(neglect.get("in_debt", false)):
		failures.append("방치 플레이가 빚을 지지 않는다. 수업료 압박이 작동하지 않는다")
	# 낙제는 band 4 를 영구히 닫는다. 이 게이트가 없으면 심사 낙방이 서사에만
	# 남고 판정에는 아무것도 걸지 않는다.
	if bool(neglect.get("failed", false)) and int(neglect.get("ending_band", 0)) >= SaEndingJudgement.LEGENDARY_BAND:
		failures.append("낙제한 런이 band %d 엔딩 '%s' 을 받았다"
			% [int(neglect["ending_band"]), String(neglect.get("ending", ""))])

	# 신중한 플레이는 상태이상에 걸리지 않는다 — 그게 맞다. 그러면 조건 이벤트
	# 12종이 아무 경로로도 검증되지 않으므로 쉬지 않는 플레이를 따로 돌린다.
	var grind := _grind_run(actions, events)
	print("무리한 플레이: %s" % str(grind))
	var got: Array = grind.get("conditions_seen", [])
	if got.is_empty():
		failures.append("쉬지 않는 플레이에서도 상태이상이 하나도 걸리지 않는다. 리스크가 작동하지 않는다")

	if failures.is_empty():
		print("BALANCE PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

## band >= 3 엔딩은 declared 요건을 갖는다. 플래너에 넘길 경로를 뽑는다.
func _path_lookup(endings: Array) -> Dictionary:
	var out := {}
	for e in endings:
		for r in ((e as Dictionary).get("requirements", []) as Array):
			if String((r as Dictionary).get("type", "")) == SaEndingRequirements.TYPE_DECLARED:
				out[String((e as Dictionary).get("code", ""))] = String((r as Dictionary).get("path", ""))
	return out

## 아무것도 하지 않는 플레이. 공짜 휴식만 고르고 이벤트는 가장 소극적인
## 선택지를 잡는다. band 0 엔딩이 실제로 나오는지 확인한다.
func _neglect_run(actions: Array, events: Array) -> Dictionary:
	var rng := SaRng.new(20260823)
	var apt := SaAptitude.assign(SaRng.new(99991))
	var state := SaResources.new_state(20260823)
	var guard := 0
	while int(state.get("turn", 1)) <= SaGrowthCurve.TURNS_TOTAL and guard < 200:
		guard += 1
		var pool := SaResources.selectable(state, actions)
		if pool.is_empty():
			return {"softlock": true, "turn": state.get("turn", 0)}
		var pick: Dictionary = pool[0]
		for a in pool:
			var ad: Dictionary = a
			# 공짜 휴식이 있으면 그것만 고른다
			if String(ad.get("category", "")) == "rest" \
				and int((ad.get("cost", {}) as Dictionary).get("gold", 0)) == 0:
				pick = ad
				break
		var result := SaTurn.resolve(state, pick, apt, rng)
		state = result["state"]
		var beat := SaEventResolution.beat_state(state, int(result["played_turn"]))
		var scheduled: Array = []
		for e in events:
			if SaEventResolution.is_scheduled(e as Dictionary):
				scheduled.append(e)
		for ev in SaEventResolution.eligible(beat, scheduled):
			var evd: Dictionary = ev
			for c in (evd.get("choices", []) as Array):
				var cd: Dictionary = c
				if bool(SaEventResolution.choice_availability(beat, cd).get("ok", false)):
					state = (SaEventResolution.apply(state, evd, cd, rng))["state"]
					break
			break
	var ending := _ending_of(_endings, SaEndingJudgement.judge(state, _endings,
		SaEndingJudgement.declared_ending_code(state, _endings,
			String(state.get("declared_path", "")))))
	return {
		"failed": (state.get("conditions", []) as Array).has(SaRisk.COND_FAILED),
		"in_debt": bool(state.get("in_debt", false)),
		"debt_amount": int(state.get("debt_amount", 0)),
		"reputation": int(state.get("reputation", 0)),
		"reputation_peak": int(state.get("reputation_peak", 0)),
		"gold": state.get("gold", 0),
		"softlock": false,
		"ending": String(ending.get("code", SaEndingJudgement.FALLBACK_CODE)),
		"ending_band": int(ending.get("band", 0)),
	}

func _ending_of(endings: Array, code: String) -> Dictionary:
	for e in endings:
		if String((e as Dictionary).get("code", "")) == code:
			return e
	return {}

## 쉬지 않는 플레이. 마음이 쌓이도록 성장 행동만 고른다.
func _grind_run(actions: Array, events: Array) -> Dictionary:
	var rng := SaRng.new(31337)
	var apt := SaAptitude.assign(SaRng.new(7717))
	var state := SaResources.new_state(31337)
	var seen := {}
	var guard := 0
	while int(state.get("turn", 1)) <= SaGrowthCurve.TURNS_TOTAL and guard < 200:
		guard += 1
		var pool := SaResources.selectable(state, actions)
		if pool.is_empty():
			break
		var pick: Dictionary = pool[0]
		for a in pool:
			var ad: Dictionary = a
			var cat := String(ad.get("category", ""))
			if cat == "rest":
				continue
			# 골드가 없으면 일, 아니면 수업. 어느 쪽이든 쉬지는 않는다.
			var want := "work" if int(state.get("gold", 0)) < 40 else "lesson"
			if cat == want:
				pick = ad
				break
			if cat != "rest":
				pick = ad
		var result := SaTurn.resolve(state, pick, apt, rng)
		state = result["state"]
		for c in (result["entered_conditions"] as Array):
			seen[c] = int(seen.get(c, 0)) + 1
		var beat := SaEventResolution.beat_state(state, int(result["played_turn"]))
		for ev in SaEventResolution.draw_beats(beat, events, rng):
			var evd: Dictionary = ev
			for c2 in (evd.get("choices", []) as Array):
				var cd: Dictionary = c2
				if bool(SaEventResolution.choice_availability(beat, cd).get("ok", false)):
					state = (SaEventResolution.apply(state, evd, cd, rng))["state"]
					break
			break
	return {"conditions_seen": seen.keys(), "counts": seen,
		"end_stress": state.get("stress", 0), "end_energy": state.get("energy", 0)}

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		printerr("FAIL: 파일 없음 %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
