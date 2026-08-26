extends SceneTree
## 저장·이어하기 검증. 파일 입출력이 얽혀 있어 코어 순수 테스트로는 못 잡는다.
##
## 실제 세이브(user://run.json)를 건드리지 않도록 별도 경로의 저장소를 주입한다.

const RUN_PATH := "user://test_run.json"
const META_PATH := "user://test_meta.json"
const ACTIONS_PATH := "res://data/actions.json"
const EVENTS_PATH := "res://data/events.json"
const ENDINGS_PATH := "res://data/endings.json"

func _initialize() -> void:
	var failures: Array[String] = []
	var content := {
		"actions": _load(ACTIONS_PATH).get("actions", []),
		"events": _load(EVENTS_PATH).get("events", []),
		"endings": _load(ENDINGS_PATH).get("endings", []),
		"npcs": [],
	}
	var profile := root.get_node_or_null(^"Profile")
	if profile == null:
		printerr("FAIL: Profile 오토로드가 없다")
		quit(1)
		return
	_cleanup()
	profile.use_storage(SaFileStorage.new(RUN_PATH, META_PATH))

	failures.append_array(_test_round_trip_keeps_determinism(profile, content))
	failures.append_array(_test_corrupt_run_keeps_meta(profile))
	failures.append_array(_test_deck_follows_completions(profile))
	failures.append_array(_test_atomic_write_keeps_backup(profile))

	_cleanup()
	if failures.is_empty():
		print("SAVE/LOAD PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

## 저장·복원 라운드트립 뒤의 판정이 저장 없이 계속한 것과 같아야 한다.
## RNG 내부 상태를 빠뜨리면 여기서 갈린다 — 저장이 곧 리롤이 된다.
func _test_round_trip_keeps_determinism(profile: Node, content: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var live := SaRunController.new()
	live.start(4242, content, 1)
	for i in 5:
		var pick := _pick(live)
		if pick.is_empty():
			out.append("라운드트립: 고를 행동이 없다")
			return out
		live.resolve(pick)

	if not profile.save_run(live.to_save()):
		out.append("라운드트립: 저장에 실패했다")
		return out
	var restored := SaRunController.new()
	if not restored.restore(profile.load_run(), content):
		out.append("라운드트립: 복원에 실패했다")
		return out

	if int(restored.state.get("turn", 0)) != int(live.state.get("turn", 0)):
		out.append("복원한 턴이 다르다: %d vs %d"
			% [int(restored.state.get("turn", 0)), int(live.state.get("turn", 0))])
	if restored.aptitude != live.aptitude:
		out.append("복원한 재능이 다르다")
	if int(restored.state.get("deck", -1)) != int(live.state.get("deck", -2)):
		out.append("복원한 덱이 다르다")
	if restored.pending_events.size() != live.pending_events.size():
		out.append("복원한 이벤트 큐 길이가 다르다: %d vs %d"
			% [restored.pending_events.size(), live.pending_events.size()])
	for key in (live.state.get("stats", {}) as Dictionary).keys():
		if int((restored.state["stats"] as Dictionary).get(key, -1)) \
			!= int((live.state["stats"] as Dictionary)[key]):
			out.append("복원한 스탯 %s 가 다르다" % key)

	# 같은 행동을 이어서 두 런에 각각 먹인다. 결과가 갈리면 결정론이 깨진 것이다.
	for i in 6:
		var pick := _pick(live)
		if pick.is_empty():
			break
		var a := live.resolve(pick)
		var b := restored.resolve(pick)
		if String(a["outcome"]) != String(b["outcome"]):
			out.append("턴 %d 판정이 갈렸다: %s vs %s"
				% [int(a["played_turn"]), String(a["outcome"]), String(b["outcome"])])
			break
		if int((a["state"] as Dictionary)["gold"]) != int((b["state"] as Dictionary)["gold"]):
			out.append("턴 %d 골드가 갈렸다" % int(a["played_turn"]))
			break
	return out

## 런이 깨져도 별빛 기록은 살아남아야 한다. 회차와 엔딩 목록은 런보다 오래 산다.
func _test_corrupt_run_keeps_meta(profile: Node) -> Array[String]:
	var out: Array[String] = []
	profile.record_completion("quiet-life")
	var before: int = profile.runs_completed()

	var f := FileAccess.open(RUN_PATH, FileAccess.WRITE)
	f.store_string("{ 이건 JSON 이 아니다")
	f.close()
	if FileAccess.file_exists(RUN_PATH + ".bak"):
		DirAccess.remove_absolute(RUN_PATH + ".bak")

	if not profile.load_run().is_empty():
		out.append("손상된 런이 폐기되지 않았다")
	if profile.runs_completed() != before:
		out.append("런이 깨졌는데 메타 회차가 바뀌었다: %d -> %d"
			% [before, profile.runs_completed()])
	if not (profile.meta().get("endings", []) as Array).has("quiet-life"):
		out.append("런이 깨졌는데 메타의 엔딩 목록이 사라졌다")

	# 스키마가 다른 저장도 같은 규칙으로 폐기된다.
	profile._store().write_run({"schema": 999, "state": {"turn": 3}})
	if not profile.load_run().is_empty():
		out.append("다른 스키마 버전의 런이 폐기되지 않았다")
	return out

## 완주 회차가 덱 인덱스를 정한다. 앱을 껐다 켜도 같은 덱으로 돌아가지 않는다.
func _test_deck_follows_completions(profile: Node) -> Array[String]:
	var out: Array[String] = []
	var seen := {}
	var first: int = profile.next_deck()
	seen[first] = true
	for i in SaResources.DECK_COUNT - 1:
		profile.record_completion("quiet-life")
		var deck: int = profile.next_deck()
		if deck == first and i < SaResources.DECK_COUNT - 2:
			out.append("완주해도 덱이 그대로다: %d" % deck)
		seen[deck] = true
	if seen.size() != SaResources.DECK_COUNT:
		out.append("완주를 반복해도 덱 %d종이 다 나오지 않는다: %s"
			% [SaResources.DECK_COUNT, str(seen.keys())])
	return out

## 쓰기가 끊겨도 직전 저장은 남아야 한다.
func _test_atomic_write_keeps_backup(profile: Node) -> Array[String]:
	var out: Array[String] = []
	profile.save_run({"state": {"turn": 7}})
	profile.save_run({"state": {"turn": 8}})
	if not FileAccess.file_exists(RUN_PATH + ".bak"):
		out.append("두 번째 저장에서 백업이 남지 않았다")

	# 본체만 깨뜨리면 백업에서 읽어야 한다.
	var f := FileAccess.open(RUN_PATH, FileAccess.WRITE)
	f.store_string("깨진 파일")
	f.close()
	var recovered: Dictionary = profile.load_run()
	if int((recovered.get("state", {}) as Dictionary).get("turn", 0)) != 7:
		out.append("본체가 깨졌을 때 백업으로 복구하지 못했다: %s" % str(recovered))
	return out

func _pick(run: SaRunController) -> Dictionary:
	var pool := run.offered_actions(5)
	return pool[0] if not pool.is_empty() else {}

func _cleanup() -> void:
	for p in [RUN_PATH, RUN_PATH + ".bak", RUN_PATH + ".tmp",
		META_PATH, META_PATH + ".bak", META_PATH + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
