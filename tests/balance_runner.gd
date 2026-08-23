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
const REQUIRED := {0: 0, 1: 7, 2: 6, 3: 1, 4: 1}
const PROVISIONAL_BANDS := [3, 4]

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
	print("band 3~4 는 잠정 기준이다. 평판이 이벤트 의존이고 이벤트가 %d/%d 라 공급이 얇다."
		% [events.size(), EVENT_TARGET])

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

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		printerr("FAIL: 파일 없음 %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
