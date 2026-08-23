class_name SaResources
extends RefCounted
## 자원 규칙.
##
## 구 구현은 월말 무상 회복 + 무료 휴식 2종 + 골드 하한 0 때문에
## 2개월차부터 기력 100 · 스트레스 0~4 로 고정됐다. 30 루트 중 27개가
## 정확히 stress 4 / energy 100 으로 끝났다. 자원이 제약이 아니었다.
## docs/game-design/02-gdd.md 경제

const START_GOLD := 120
const START_ENERGY := 70
const START_STRESS := 15
const START_REPUTATION := 5
const START_STAT := 10

const ENERGY_MAX := 100
const ENERGY_MAX_INJURED := 70
const STRESS_MAX := 100

## 월납 수업료. 12개월 = 480금화의 필수 지출.
const MONTHLY_TUITION := 28

## 빚: 미납 시 발생. 매 턴 평판을 깎고 일 수입을 줄인다.
const DEBT_REPUTATION_PENALTY := 1
const DEBT_WORK_MULTIPLIER := 0.85

## 휴식 회복은 체력에 비례한다. 체력 투자가 곧 경제 투자가 된다.
static func rest_recovery(stamina: int) -> int:
	return 18 + int(floor(float(stamina) / 6.0))

## deck 은 이번 회차에 열리는 기회 이벤트 덱(0~2). 회차마다 다른 덱을 주면
## 연속 두 회차의 기회 이벤트가 하나도 겹치지 않는다 — 재플레이 서사의 핵심 장치라
## 호출자가 회차 수에서 유도해 주입한다. 코어는 회차 수를 모른다.
const DECK_COUNT := 3

static func new_state(seed_value: int, deck: int = 0) -> Dictionary:
	var stats := {}
	for key in SaStatKeys.ALL:
		stats[key] = START_STAT
	return {
		"turn": 1,
		"deck": posmod(deck, DECK_COUNT),
		"stats": stats,
		"gold": START_GOLD,
		"energy": START_ENERGY,
		"stress": START_STRESS,
		"reputation": START_REPUTATION,
		"reputation_peak": START_REPUTATION,
		"flags": {},
		"affinity": {},
		"conditions": [],
		"mastery_bank": {},
		"declared_path": "",
		"in_debt": false,
		"awakened": false,
		"consecutive_fails": 0,
		"high_stress_turns": 0,
		"slump_light_turns": 0,
		"milestone_failures": 0,
		"consecutive_rests": 0,
		"injury_turns": 0,
		"seed": seed_value,
	}

static func month_of(turn: int) -> int:
	return int((turn - 1) / SaGrowthCurve.TURNS_PER_MONTH) + 1

static func is_month_end(turn: int) -> bool:
	return turn % SaGrowthCurve.TURNS_PER_MONTH == 0

static func clamp_state(state: Dictionary) -> Dictionary:
	var out := state.duplicate(true)
	var energy_cap := ENERGY_MAX_INJURED if (out.get("conditions", []) as Array).has(SaRisk.COND_INJURY) else ENERGY_MAX
	out["gold"] = maxi(0, int(out.get("gold", 0)))
	out["energy"] = clampi(int(out.get("energy", 0)), 0, energy_cap)
	out["stress"] = clampi(int(out.get("stress", 0)), 0, STRESS_MAX)
	out["reputation"] = clampi(int(out.get("reputation", 0)), 0, 100)
	out["reputation_peak"] = maxi(int(out.get("reputation_peak", 0)), int(out["reputation"]))
	var stats: Dictionary = out.get("stats", {})
	for key in stats.keys():
		stats[key] = clampi(int(stats[key]), 0, 100)
	return out

## 행동을 지금 고를 수 있는가. 자원 부족이면 사유를 돌려준다.
## Dictionary 값이 null 일 수 있다(휴식 액션의 stat 등). String(null) 은 런타임 에러다.
static func _text(value: Variant) -> String:
	return "" if value == null else String(value)

static func affordability(state: Dictionary, action: Dictionary) -> Dictionary:
	if bool(action.get("always_available", false)):
		return {"ok": true, "reason": ""}
	var cost: Dictionary = action.get("cost", {})
	var gold_delta := int(cost.get("gold", 0))
	if gold_delta < 0 and int(state.get("gold", 0)) + gold_delta < 0:
		return {"ok": false, "reason": "골드가 부족하다"}
	var energy_delta := int(cost.get("energy", 0))
	if energy_delta < 0 and int(state.get("energy", 0)) + energy_delta < 0:
		return {"ok": false, "reason": "기력이 부족하다"}
	var conditions: Array = state.get("conditions", [])
	if SaRisk.locks_high_tiers(conditions) and _text(action.get("tier", "basic")) != "basic":
		return {"ok": false, "reason": "슬럼프 중에는 심화·비전을 할 수 없다"}
	if conditions.has(SaRisk.COND_INJURY) and _text(action.get("stat", "")) == SaStatKeys.STAMINA:
		return {"ok": false, "reason": "부상 중에는 몸을 쓸 수 없다"}
	return unlock_status(state, action)

## 해금 조건. 이것을 검사하지 않으면 심화·비전·진로 전용이 턴 1 부터 열려
## 티어 진행 설계 전체가 무력화된다.
static func unlock_status(state: Dictionary, action: Dictionary) -> Dictionary:
	var unlock: Variant = action.get("unlock")
	if unlock == null or not (unlock is Dictionary):
		return {"ok": true, "reason": ""}
	var u: Dictionary = unlock

	if u.has("declared_path"):
		if _text(state.get("declared_path", "")) != _text(u.get("declared_path", "")):
			return {"ok": false, "reason": "진로를 선언해야 열린다"}

	if u.has("month_min"):
		if month_of(int(state.get("turn", 1))) < int(u["month_min"]):
			return {"ok": false, "reason": "%d월부터 열린다" % int(u["month_min"])}

	if u.has("stat_min"):
		var stat := _text(action.get("stat", ""))
		var have := int((state.get("stats", {}) as Dictionary).get(stat, 0))
		if have < int(u["stat_min"]):
			return {"ok": false, "reason": "%d 이상 필요 (지금 %d)" % [int(u["stat_min"]), have]}

	if u.has("line_count"):
		var flag := _text(action.get("flag", ""))
		var count := int((state.get("flags", {}) as Dictionary).get(flag, 0))
		if count < int(u["line_count"]):
			return {"ok": false, "reason": "이 계열을 %d회 더 해야 한다" % (int(u["line_count"]) - count)}

	if u.has("affinity_min"):
		var npc := _text(action.get("npc_tag", ""))
		var aff := int((state.get("affinity", {}) as Dictionary).get(npc, 0))
		if aff < int(u["affinity_min"]):
			return {"ok": false, "reason": "호감 %d 이상 필요" % int(u["affinity_min"])}

	return {"ok": true, "reason": ""}

## 자원과 무관하게 항상 고를 수 있는 행동. 소프트락을 불가능하게 만든다.
static func always_available(actions: Array) -> Array:
	var out: Array = []
	for a in actions:
		if bool((a as Dictionary).get("always_available", false)):
			out.append(a)
	return out

## 이번 턴에 고를 수 있는 행동 전부
static func selectable(state: Dictionary, actions: Array) -> Array:
	var out: Array = []
	for a in actions:
		if bool(affordability(state, a as Dictionary).get("ok", false)):
			out.append(a)
	return out
