extends SceneTree
## 36턴에 실제로 도달 가능한 상한을 플래너로 측정한다.
## 요건 재조정을 감이 아니라 실측 위에서 하기 위한 도구다.

const SEEDS := [1, 7, 13, 101, 4242, 65537, 999983]

func _initialize() -> void:
	var actions: Array = _load("res://data/actions.json").get("actions", [])
	var events: Array = _load("res://data/events.json").get("events", [])
	var paths := ["star","letters","craft","stage","market","people"]

	print("=== 단일 축 최대 (플래너, 이벤트 포함, 7시드) ===")
	for stat in SaStatKeys.ALL:
		print("  스탯 %-12s %d" % [stat, _max_for([{"type":"stat","stat":stat,"target":100}], actions, events, "")])

	print("  평판(진로 무선언) %d" % _max_for([{"type":"resource","resource":"reputation","target":100}], actions, events, ""))
	for p in paths:
		print("  평판(%s 선언)  %d" % [p, _max_for([{"type":"resource","resource":"reputation","target":100}], actions, events, p)])

	for npc in ["sera","eden","harin","moran","gu","yun"]:
		print("  호감 %-6s %d" % [npc, _max_for([{"type":"affinity","npc":npc,"target":100}], actions, events, "")])
	quit(0)

func _max_for(reqs: Array, actions: Array, events: Array, path: String) -> int:
	var best := 0
	for sd in SEEDS:
		var rng := SaRng.new(sd)
		var apt := SaAptitude.assign(SaRng.new(sd * 31 + 7))
		var run := SaRoutePlanner.run({"requirements": reqs}, actions, apt, rng, path, events)
		if not bool(run.get("ok", false)):
			continue
		var st: Dictionary = run["state"]
		var r: Dictionary = reqs[0]
		best = maxi(best, int(SaEndingRequirements.current_value(st, r)))
	return best

func _load(p: String) -> Dictionary:
	var v: Variant = JSON.parse_string(FileAccess.get_file_as_string(p))
	return v as Dictionary if v is Dictionary else {}
