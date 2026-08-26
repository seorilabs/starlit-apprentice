class_name SaRisk
extends RefCounted
## 결과 판정과 상태이상.
##
## 구 구현은 336롤에서 실패 4.2% / 대성공 28% 로 크리티컬이 6.7배 잦았다.
## 리스크가 아니라 보너스 생성기였다. 36롤로 줄이고 실패 가중으로 뒤집는다.
## docs/game-design/02-gdd.md 규칙과 상태 머신

const OUTCOME_FAIL := "fail"
const OUTCOME_OK := "ok"
const OUTCOME_CRIT := "crit"
const OUTCOME_AWAKEN := "awaken"

const OUTCOME_MULTIPLIER := {
	OUTCOME_FAIL: 0.4, OUTCOME_OK: 1.0, OUTCOME_CRIT: 1.8, OUTCOME_AWAKEN: 3.0,
}

## 티어가 높을수록 위험하다. 상위호환이 아니라 결정이 되게 한다.
const TIER_PENALTY := {"basic": 0.0, "advanced": 0.05, "arcane": 0.12}

const AWAKEN_CHANCE := 0.02

# ── 상태이상 ────────────────────────────────────────────────────────────────
const COND_SLUMP_LIGHT := "slump_light"   ## 부진
const COND_SLUMP := "slump"               ## 슬럼프
const COND_INJURY := "injury"             ## 부상
const COND_BURNOUT := "burnout"           ## 번아웃
const COND_DISGRACE := "disgrace"         ## 평판 추락
const COND_FAILED := "failed"             ## 낙제

## 계절 심사 낙방·기권이 이만큼이면 낙제한다.
const MILESTONE_FAIL_LIMIT := 2

const CONDITION_MULTIPLIER := {
	"good": 1.15, "normal": 1.00, COND_SLUMP_LIGHT: 0.75, COND_SLUMP: 0.45,
}

static func fail_chance(stress: int, energy: int, tier: String, talent_bonus: float) -> float:
	var raw := 0.06 + float(stress) / 260.0 + float(60 - energy) / 500.0 \
		+ float(TIER_PENALTY.get(tier, 0.0)) - talent_bonus
	return clampf(raw, 0.03, 0.45)

static func crit_chance(stress: int, energy: int, affinity: int, talent_bonus: float) -> float:
	var raw := 0.10 + float(energy) / 900.0 - float(stress) / 700.0 \
		+ float(affinity) / 1250.0 + talent_bonus
	return clampf(raw, 0.04, 0.30)

static func roll_outcome(
	rng: SaRng, stress: int, energy: int, tier: String,
	talent_bonus: float, affinity: int, awaken_allowed: bool, awaken_chance: float
) -> String:
	var f := fail_chance(stress, energy, tier, talent_bonus)
	var c := crit_chance(stress, energy, affinity, talent_bonus)
	var r := rng.next_float()
	if r < f:
		return OUTCOME_FAIL
	if r < f + c:
		# 대성공 중 일부가 각성으로 승격된다. 런당 1회.
		if awaken_allowed and rng.next_float() < awaken_chance:
			return OUTCOME_AWAKEN
		return OUTCOME_CRIT
	return OUTCOME_OK

static func outcome_multiplier(outcome: String) -> float:
	return float(OUTCOME_MULTIPLIER.get(outcome, 1.0))

static func condition_multiplier(condition: String) -> float:
	return float(CONDITION_MULTIPLIER.get(condition, 1.0))

## 상태이상 진입 판정. 진입한 상태 배열을 돌려준다.
static func entering_conditions(state: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var stress := int(state.get("stress", 0))
	var active: Array = state.get("conditions", [])

	if stress >= 95 and not active.has(COND_BURNOUT):
		out.append(COND_BURNOUT)
	elif stress >= 90 and not active.has(COND_SLUMP):
		out.append(COND_SLUMP)
	elif int(state.get("slump_light_turns", 0)) >= 3 and not active.has(COND_SLUMP):
		out.append(COND_SLUMP)
	elif (stress >= 70 and int(state.get("high_stress_turns", 0)) >= 2) \
		or int(state.get("consecutive_fails", 0)) >= 3:
		if not active.has(COND_SLUMP_LIGHT) and not active.has(COND_SLUMP):
			out.append(COND_SLUMP_LIGHT)

	if int(state.get("reputation", 0)) <= 0 and int(state.get("reputation_peak", 0)) >= 20 \
		and not active.has(COND_DISGRACE):
		out.append(COND_DISGRACE)

	return out

## 심화·비전 티어를 잠그는 상태인가
static func locks_high_tiers(conditions: Array) -> bool:
	return conditions.has(COND_SLUMP)

## 플레이어의 선택권을 빼앗는 상태인가 (강제 턴 소모)
static func forces_turn_skip(conditions: Array) -> bool:
	return conditions.has(COND_BURNOUT)

## band 4 엔딩을 영구 잠그는가
static func locks_legendary(conditions: Array) -> bool:
	return conditions.has(COND_FAILED)

## 상태이상 해제 판정. 설계상 각 상태에는 탈출 경로가 있어야 한다.
## 이것이 없으면 부진이 영구 지속되고 카운터가 계속 올라 슬럼프를 반복 유발한다.
static func exiting_conditions(state: Dictionary, was_rest: bool, outcome: String) -> Array[String]:
	var out: Array[String] = []
	var active: Array = state.get("conditions", [])

	# 부진: 휴식 2턴 연속 또는 대성공 1회
	if active.has(COND_SLUMP_LIGHT):
		if int(state.get("consecutive_rests", 0)) >= 2:
			out.append(COND_SLUMP_LIGHT)
		elif outcome == OUTCOME_CRIT or outcome == OUTCOME_AWAKEN:
			out.append(COND_SLUMP_LIGHT)

	# 슬럼프: 휴식 3턴 연속 (온천·NPC 경로는 이벤트가 처리한다)
	if active.has(COND_SLUMP) and int(state.get("consecutive_rests", 0)) >= 3:
		out.append(COND_SLUMP)

	# 부상: 3턴 경과
	if active.has(COND_INJURY) and int(state.get("injury_turns", 0)) >= 3:
		out.append(COND_INJURY)

	# 평판 추락: 평판 15 회복
	if active.has(COND_DISGRACE) and int(state.get("reputation", 0)) >= 15:
		out.append(COND_DISGRACE)

	return out

## 심사에서 떨어지거나 기권한 횟수. 이걸 낙제로 연결하지 않으면 계절 심사가
## 아무것도 걸지 않는 서사가 되고 band 0 실패 엔딩 3종이 도달 불가가 된다.
static func milestone_failures(state: Dictionary) -> int:
	var n := 0
	for key in (state.get("flags", {}) as Dictionary).keys():
		var k := String(key)
		if k.begins_with("milestone:") and (k.ends_with(":fail") or k.ends_with(":skip")):
			n += 1
	return n

static func should_fail_out(state: Dictionary) -> bool:
	if (state.get("conditions", []) as Array).has(COND_FAILED):
		return false
	return milestone_failures(state) >= MILESTONE_FAIL_LIMIT

static func current_condition_key(conditions: Array) -> String:
	if conditions.has(COND_SLUMP):
		return COND_SLUMP
	if conditions.has(COND_SLUMP_LIGHT):
		return COND_SLUMP_LIGHT
	return "normal"
