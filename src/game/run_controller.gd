class_name SaRunController
extends RefCounted
## 코어 규칙과 UI 사이의 얇은 조정자.
##
## 코어는 Node 도 시간도 모른다. 여기서 상태를 들고 다니며 UI 가 묻는 것에 답한다.

var state: Dictionary
var aptitude: Dictionary
var rng: SaRng
var actions: Array
var events: Array
var endings: Array
var npcs: Array

var last_result: Dictionary = {}
## 한 턴에 뜰 이벤트 큐. 마지막 턴은 계절 심사와 종막이 함께 온다 —
## 하나만 재생하면 둘 중 하나가 영영 뜨지 않는다.
var pending_events: Array = []
## 이벤트 판정용 상태. state 는 이미 다음 턴을 가리킨다.
var beat: Dictionary = {}
## run_completed 중복 방지. 엔딩 화면은 여러 번 그려질 수 있다.
var _completed_emitted := false

## 계측 신호. 여기서 전역 버스(Events)를 직접 부르지 않는다 — autoload 이름은
## --script 러너에서 해석되지 않아 하네스가 통째로 컴파일 실패한다.
## 중계는 씬 트리를 아는 src/ui/main.gd 가 한다.
signal turn_resolved(payload: Dictionary)
signal condition_entered(condition: String)
signal event_choice_made(event_id: String, choice_id: String)
signal milestone_result(season: int, grade: String)
signal run_completed(ending_code: String)

func start(seed_value: int, content: Dictionary, deck: int = 0) -> void:
	_completed_emitted = false
	rng = SaRng.new(seed_value)
	aptitude = SaAptitude.assign(SaRng.new(seed_value * 31 + 7))
	state = SaResources.new_state(seed_value, deck)
	actions = content.get("actions", [])
	events = content.get("events", [])
	endings = content.get("endings", [])
	npcs = content.get("npcs", [])

## 이어하기용 직렬화. RNG 내부 상태까지 담아야 복원 이후의 판정이
## 저장 없이 계속했을 때와 같아진다 — 그러지 않으면 저장이 곧 리롤이 된다.
func to_save() -> Dictionary:
	var queued: Array = []
	for e in pending_events:
		queued.append(String((e as Dictionary).get("id", "")))
	return {
		"state": state,
		"aptitude": aptitude,
		"rng": rng.state() if rng != null else 1,
		"pending_events": queued,
		"beat": beat,
	}

## 저장본에서 런을 되살린다. 콘텐츠는 파일에서 다시 읽는다 — 저장본에 이벤트
## 본문을 통째로 넣으면 콘텐츠 수정이 기존 저장을 화석으로 만든다.
func restore(data: Dictionary, content: Dictionary) -> bool:
	if data.is_empty():
		return false
	var saved: Dictionary = _numeric(data.get("state", {}))
	if saved.is_empty() or not saved.has("turn"):
		return false
	state = saved
	aptitude = data.get("aptitude", {})
	# SaRng 는 생성자가 곧 상태 주입이다. 저장된 내부 상태를 그대로 넣으면
	# 다음 난수가 저장 시점의 다음 난수와 같다.
	rng = SaRng.new(int(data.get("rng", 1)))
	actions = content.get("actions", [])
	events = content.get("events", [])
	endings = content.get("endings", [])
	npcs = content.get("npcs", [])
	beat = _numeric(data.get("beat", {}))
	pending_events = []
	for id in (data.get("pending_events", []) as Array):
		var found := _event(String(id))
		if not found.is_empty():
			pending_events.append(found)
	return true

func _event(id: String) -> Dictionary:
	for e in events:
		if String((e as Dictionary).get("id", "")) == id:
			return e
	return {}

## JSON 은 정수와 실수를 구분하지 않아 왕복하면 turn 이 5.0 이 된다.
## 정수로 되돌려 놓지 않으면 저장 전후로 코어에 들어가는 값의 타입이 달라진다.
static func _numeric(value: Variant) -> Variant:
	if value is Dictionary:
		var out := {}
		for k in (value as Dictionary).keys():
			out[k] = _numeric((value as Dictionary)[k])
		return out
	if value is Array:
		var arr: Array = []
		for v in (value as Array):
			arr.append(_numeric(v))
		return arr
	if value is float and is_equal_approx(float(value), roundf(float(value))):
		return int(roundf(float(value)))
	return value

func turn() -> int:
	return int(state.get("turn", 1))

func month() -> int:
	return SaResources.month_of(turn())

## 상순 / 중순 / 하순
func phase_label() -> String:
	match (turn() - 1) % SaGrowthCurve.TURNS_PER_MONTH:
		0: return "상순"
		1: return "중순"
		_: return "하순"

## NPC 이름·초상은 data/npcs.json 이 원장이다. UI 에 하드코딩하지 않는다.
func npc_name(id: String) -> String:
	return String(_npc(id).get("name", id))

func npc_art(id: String) -> String:
	return String(_npc(id).get("art_key", ""))

func _npc(id: String) -> Dictionary:
	for n in npcs:
		var d: Dictionary = n
		if String(d.get("id", "")) == id:
			return d
	return {}

func is_over() -> bool:
	return turn() > SaGrowthCurve.TURNS_TOTAL

## 이번 턴에 보여줄 행동 카드. 카테고리를 섞어 4~6장으로 제한한다.
## 수업만 5장 나오면 선택이 되지 않는다.
func offered_actions(limit: int = 5) -> Array:
	var pool := SaResources.selectable(state, actions)
	if pool.size() <= limit:
		return pool
	var by_cat := {}
	for a in pool:
		var c := String((a as Dictionary).get("category", ""))
		if not by_cat.has(c):
			by_cat[c] = []
		(by_cat[c] as Array).append(a)
	var out: Array = []
	var cats: Array = by_cat.keys()
	var i := 0
	while out.size() < limit and i < 60:
		var bucket: Array = by_cat[cats[i % cats.size()]]
		if not bucket.is_empty():
			out.append(bucket.pop_front())
		i += 1
	return out

## 이 행동을 고르면 함께할 수 있는 NPC. 런당 2~3턴만 등장하도록 결정론적으로 제한한다.
func together_candidate(action: Dictionary) -> String:
	return SaTurn.together_candidate(state, action)

func resolve(action: Dictionary, together: String = "") -> Dictionary:
	last_result = SaTurn.resolve(state, action, aptitude, rng, together)
	state = last_result["state"]
	# 각성은 재능 등급을 영구히 올린다. 받아 두지 않으면 승급이 그 턴에 증발한다.
	# 번아웃 경로는 aptitude 를 돌려주지 않으므로 기존 값이 그대로 남는다.
	aptitude = last_result.get("aptitude", aptitude)
	# 계측. 코어는 시그널을 모르므로 emit 은 여기서 한다.
	turn_resolved.emit({
		SaAnalyticsPort.PARAM_TURN: int(last_result["played_turn"]),
		SaAnalyticsPort.PARAM_MONTH: SaResources.month_of(int(last_result["played_turn"])),
		SaAnalyticsPort.PARAM_ACTION_ID: String(action.get("id", "")),
		SaAnalyticsPort.PARAM_OUTCOME: String(last_result.get("outcome", "")),
		SaAnalyticsPort.PARAM_STRESS: int(state.get("stress", 0)),
		SaAnalyticsPort.PARAM_ENERGY: int(state.get("energy", 0)),
	})
	for c in (last_result.get("entered_conditions", []) as Array):
		condition_entered.emit(String(c))
	# 이벤트는 방금 플레이한 턴의 비트다. state.turn 으로 판정하면 개막과
	# 종막이 창 밖으로 밀려 영영 뜨지 않는다.
	beat = SaEventResolution.beat_state(state, int(last_result["played_turn"]))
	pending_events = _draw_events()
	return last_result

func _draw_events() -> Array:
	if events.is_empty():
		return []
	return SaEventResolution.draw_beats(beat, events, rng)

func apply_event_choice(choice: Dictionary) -> Dictionary:
	var ev: Dictionary = pending_events.pop_front() if not pending_events.is_empty() else {}
	var outcome := SaEventResolution.apply(state, ev, choice, rng)
	state = outcome["state"]
	event_choice_made.emit(String(ev.get("id", "")), String(choice.get("id", "")))
	_emit_milestone(outcome)
	# 결과는 실제 상태에 적용하되, 남은 비트의 판정은 같은 턴에 머문다.
	beat = SaEventResolution.beat_state(state, int(beat.get("turn", 1)))
	return outcome

## 계절 심사 결과는 이벤트가 남기는 milestone:sN:<등급> 플래그가 원장이다.
## 별도 표를 만들지 않고 그 플래그에서 유도한다.
func _emit_milestone(outcome: Dictionary) -> void:
	var flags: Dictionary = (outcome.get("effects", {}) as Dictionary).get("flags", {})
	for key in flags.keys():
		var parts := String(key).split(":")
		if parts.size() != 3 or parts[0] != "milestone":
			continue
		milestone_result.emit(int(parts[1].substr(1)), parts[2])

func judge() -> Dictionary:
	# 선언한 진로의 엔딩 코드는 엔딩 데이터에서 유도한다. 빈 문자열을 넘기면
	# 선언 보너스가 실제 런에서 한 번도 붙지 않는다.
	var declared := SaEndingJudgement.declared_ending_code(
		state, endings, String(state.get("declared_path", "")))
	var code := SaEndingJudgement.judge(state, endings, declared)
	# 런당 한 번만 센다. judge() 는 화면을 다시 그릴 때 여러 번 불릴 수 있다.
	if not _completed_emitted:
		_completed_emitted = true
		run_completed.emit(code)
	for e in endings:
		if String((e as Dictionary).get("code", "")) == code:
			return e
	return {}

## 지금 컨디션. 성장 배율이 여기서 갈리므로 화면에 보여야 한다.
func condition_label() -> String:
	match SaRisk.current_condition_key(state.get("conditions", []), int(state.get("stress", 0))):
		SaRisk.COND_SLUMP: return "슬럼프"
		SaRisk.COND_SLUMP_LIGHT: return "부진"
		SaRisk.CONDITION_GOOD: return "좋음"
		_: return "보통"

## 초상의 표정이 마음 수치의 1차 표시다. docs/game-design/03-ui-ux-spec.md
func apprentice_art() -> String:
	var conditions: Array = state.get("conditions", [])
	if conditions.has(SaRisk.COND_SLUMP) or conditions.has(SaRisk.COND_BURNOUT):
		return "apprentice_tired"
	if int(state.get("stress", 0)) >= 60:
		return "apprentice_tired"
	if int(state.get("stress", 0)) <= SaRisk.GOOD_CONDITION_STRESS_MAX:
		return "apprentice_bright"
	return "apprentice"

## 장면 배경. 행동 장소에 맞춘다.
func scene_art(action: Dictionary = {}) -> String:
	var place := String(action.get("place", "")) if action.get("place") != null else ""
	if place.contains("천문탑") or place.contains("첨탑"):
		return "bg_tower"
	if place.contains("광장") or place.contains("시장") or place.contains("공원"):
		return "bg_plaza"
	return "bg_room"
