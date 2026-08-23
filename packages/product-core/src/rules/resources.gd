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
const MONTHLY_TUITION := 40

## 빚: 미납 시 발생. 매 턴 평판을 깎고 일 수입을 줄인다.
const DEBT_REPUTATION_PENALTY := 1
const DEBT_WORK_MULTIPLIER := 0.85

## 휴식 회복은 체력에 비례한다. 체력 투자가 곧 경제 투자가 된다.
static func rest_recovery(stamina: int) -> int:
	return 18 + int(floor(float(stamina) / 6.0))

static func new_state(seed_value: int) -> Dictionary:
	var stats := {}
	for key in SaStatKeys.ALL:
		stats[key] = START_STAT
	return {
		"turn": 1,
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
