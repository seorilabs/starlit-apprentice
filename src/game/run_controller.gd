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

func start(seed_value: int, content: Dictionary, deck: int = 0) -> void:
	rng = SaRng.new(seed_value)
	aptitude = SaAptitude.assign(SaRng.new(seed_value * 31 + 7))
	state = SaResources.new_state(seed_value, deck)
	actions = content.get("actions", [])
	events = content.get("events", [])
	endings = content.get("endings", [])
	npcs = content.get("npcs", [])

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
	# 결과는 실제 상태에 적용하되, 남은 비트의 판정은 같은 턴에 머문다.
	beat = SaEventResolution.beat_state(state, int(beat.get("turn", 1)))
	return outcome

func judge() -> Dictionary:
	var code := SaEndingJudgement.judge(state, endings, "")
	for e in endings:
		if String((e as Dictionary).get("code", "")) == code:
			return e
	return {}

## 초상의 표정이 마음 수치의 1차 표시다. docs/game-design/03-ui-ux-spec.md
func apprentice_art() -> String:
	var conditions: Array = state.get("conditions", [])
	if conditions.has(SaRisk.COND_SLUMP) or conditions.has(SaRisk.COND_BURNOUT):
		return "apprentice_tired"
	if int(state.get("stress", 0)) >= 60:
		return "apprentice_tired"
	if int(state.get("stress", 0)) <= 25:
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
