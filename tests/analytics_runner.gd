extends SceneTree
## 계측 배선 검증.
##
## 계측은 조용히 죽는 종류의 기능이다 — 이벤트가 안 나가도 게임은 멀쩡히 돌아서
## 론칭 후에야 데이터가 비었다는 걸 알게 된다. 그래서 emit 횟수를 테스트로 고정한다.

const ACTIONS_PATH := "res://data/actions.json"
const EVENTS_PATH := "res://data/events.json"
const ENDINGS_PATH := "res://data/endings.json"

var _turn_events: Array = []
var _completed: Array = []
var _conditions: Array = []
var _milestones: Array = []

func _initialize() -> void:
	var failures: Array[String] = []
	var content := {
		"actions": _load(ACTIONS_PATH).get("actions", []),
		"events": _load(EVENTS_PATH).get("events", []),
		"endings": _load(ENDINGS_PATH).get("endings", []),
		"npcs": [],
	}
	var analytics := root.get_node_or_null(^"Analytics")
	if analytics == null:
		printerr("FAIL: Analytics 오토로드가 없다")
		quit(1)
		return
	# 러너에서는 오토로드가 서로를 이름으로 찾지 못한다. 직접 넘긴다.
	if analytics.ensure(root.get_node_or_null(^"Events"),
		root.get_node_or_null(^"Platform"), root.get_node_or_null(^"GameData")) == null:
		printerr("FAIL: 어댑터가 포트를 만들지 못했다")
		quit(1)
		return

	# autoload 는 --script 러너에서 전역 이름으로 해석되지 않는다. 노드로 받는다.
	var bus := root.get_node(^"Events")
	bus.turn_resolved.connect(func(r): _turn_events.append(r))
	bus.run_completed.connect(func(c): _completed.append(c))
	bus.condition_entered.connect(func(c): _conditions.append(c))
	bus.milestone_result.connect(func(s, g): _milestones.append([s, g]))

	failures.append_array(_test_one_event_per_turn(content))
	failures.append_array(_test_run_completed_once(content))
	failures.append_array(_test_noop_without_config())
	failures.append_array(_test_platform_on_every_event())

	if failures.is_empty():
		print("ANALYTICS PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

## 한 턴 해석당 turn_resolved 가 정확히 1회여야 한다.
func _test_one_event_per_turn(content: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var run := SaRunController.new()
	# 실제 게임에서는 main.gd 가 중계한다. 러너에는 UI 가 없으므로 같은 배선을 건다.
	var bus := root.get_node(^"Events")
	run.turn_resolved.connect(func(p): bus.turn_resolved.emit(p))
	run.condition_entered.connect(func(c): bus.condition_entered.emit(c))
	run.run_completed.connect(func(c): bus.run_completed.emit(c))
	run.start(4242, content, 0)
	_turn_events.clear()
	var turns := 5
	for i in turns:
		var pool := run.offered_actions(5)
		if pool.is_empty():
			out.append("고를 행동이 없다")
			return out
		run.resolve(pool[0])
	if _turn_events.size() != turns:
		out.append("turn_resolved 가 턴당 1회가 아니다: %d회 / %d턴"
			% [_turn_events.size(), turns])
		return out
	var first: Dictionary = _turn_events[0]
	for key in [SaAnalyticsPort.PARAM_TURN, SaAnalyticsPort.PARAM_MONTH,
		SaAnalyticsPort.PARAM_ACTION_ID, SaAnalyticsPort.PARAM_OUTCOME,
		SaAnalyticsPort.PARAM_STRESS, SaAnalyticsPort.PARAM_ENERGY]:
		if not first.has(key):
			out.append("turn_resolved 에 %s 가 없다. 턴 이탈 지점을 알 수 없다" % key)
	if String(first.get(SaAnalyticsPort.PARAM_ACTION_ID, "")) == "":
		out.append("turn_resolved 의 action_id 가 비었다")
	return out

## 엔딩 확정 시 run_completed 는 1회다. 엔딩 화면은 여러 번 그려질 수 있다.
func _test_run_completed_once(content: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var run := SaRunController.new()
	var bus := root.get_node(^"Events")
	run.run_completed.connect(func(c): bus.run_completed.emit(c))
	run.start(7, content, 0)
	_completed.clear()
	run.judge()
	run.judge()
	run.judge()
	if _completed.size() != 1:
		out.append("run_completed 가 %d회 발생했다(기대 1회)" % _completed.size())
	# 밴드는 어댑터가 엔딩 데이터에서 유도한다.
	var analytics := root.get_node(^"Analytics")
	if analytics.sink == null:
		out.append("어댑터의 포트가 비어 있다")
		return out
	var sent: Array = analytics.sink.sent
	var last := {}
	for s in sent:
		if String((s as Dictionary)["event"]) == SaAnalyticsPort.EVENT_RUN_COMPLETED:
			last = (s as Dictionary)["params"]
	if last.is_empty():
		out.append("어댑터가 run_completed 를 포트로 넘기지 않았다")
	elif not last.has(SaAnalyticsPort.PARAM_ENDING_BAND):
		out.append("run_completed 에 엔딩 밴드가 없다")
	return out

## 설정이 없으면 아무것도 보내지 않고 예외도 던지지 않는다.
func _test_noop_without_config() -> Array[String]:
	var out: Array[String] = []
	var sink := SaAnalyticsSink.new({}, Callable(), false)
	if sink.enabled():
		out.append("설정이 없는데 전송이 켜져 있다")
	sink.track(SaAnalyticsPort.EVENT_TURN_RESOLVED, {"turn": 1})
	if sink.sent.size() != 1:
		out.append("no-op 이어도 이벤트는 기록돼야 한다")

	# 측정 ID 만 있고 secret 이 없으면 여전히 꺼져 있어야 한다.
	var half := SaAnalyticsSink.new({"measurement_id": "G-TEST"}, Callable(), false)
	if half.enabled():
		out.append("secret 없이 전송이 켜졌다")

	var delivered: Array = []
	var full := SaAnalyticsSink.new({"measurement_id": "G-TEST", "api_secret": "s"},
		func(_n, _p): delivered.append(_n), false)
	full.track(SaAnalyticsPort.EVENT_RUN_COMPLETED, {})
	if delivered.size() != 1:
		out.append("설정이 갖춰지면 전송돼야 한다")
	return out

## docs/02-decisions/0005 — 모든 이벤트에 platform 이 실린다.
func _test_platform_on_every_event() -> Array[String]:
	var out: Array[String] = []
	var analytics := root.get_node(^"Analytics")
	if analytics.sink == null:
		out.append("어댑터의 포트가 비어 있다")
		return out
	var bus := root.get_node(^"Events")
	bus.event_shown.emit("probe.event")
	bus.event_choice_made.emit("probe.event", "a")
	bus.condition_entered.emit(SaRisk.COND_SLUMP)
	bus.milestone_result.emit(1, "pass")
	var seen := {}
	for s in (analytics.sink.sent as Array):
		var entry: Dictionary = s
		seen[String(entry["event"])] = true
		var params: Dictionary = entry["params"]
		if String(params.get(SaAnalyticsPort.PARAM_PLATFORM, "")) == "":
			out.append("%s 에 platform 이 없다" % String(entry["event"]))
	for name in [SaAnalyticsPort.EVENT_TURN_RESOLVED, SaAnalyticsPort.EVENT_EVENT_SHOWN,
		SaAnalyticsPort.EVENT_EVENT_CHOICE, SaAnalyticsPort.EVENT_CONDITION_ENTERED,
		SaAnalyticsPort.EVENT_MILESTONE_RESULT, SaAnalyticsPort.EVENT_RUN_COMPLETED]:
		if not seen.has(name):
			out.append("이벤트 '%s' 가 포트로 한 번도 넘어가지 않았다" % name)
	return out

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
