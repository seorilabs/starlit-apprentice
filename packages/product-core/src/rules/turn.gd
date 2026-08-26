class_name SaTurn
extends RefCounted
## 턴 해석. 코어의 단일 공개 진입점이다.
##
## 구 구현은 월 4주를 일괄 확정하고 이후 변경을 throw 했다(실질 의사결정 12번).
## 여기서는 턴 단위로 개별 확정하고 즉시 해석한다(36번).
## docs/game-design/02-gdd.md 코어 루프

## Dictionary 값이 null 일 수 있다(휴식 액션의 stat 등). String(null) 은 런타임 에러다.
static func _text(value: Variant) -> String:
	return "" if value == null else String(value)

## action 은 data/actions.json 의 항목 하나.
## 이번 턴에 `함께` 칩이 뜨는 NPC. 없으면 빈 문자열.
##
## 규칙을 코어에 두는 이유: UI 와 시뮬레이션이 각자 판단하면 시뮬레이션이
## 검증하는 게임과 플레이어가 하는 게임이 달라진다. 실제로 어긋나 있었다.
## 매 턴 뜨면 호감이 공짜가 되므로 태그된 행동의 약 1/4 턴에만 뜬다.
static func together_candidate(state: Dictionary, action: Dictionary) -> String:
	var npc := _text(action.get("npc_tag", ""))
	if npc == "":
		return ""
	if int(state.get("stress", 0)) >= 60:
		return ""   # 마음이 무거우면 사람을 부르지 않는다
	var turn := int(state.get("turn", 1))
	return npc if (turn * 7 + npc.length()) % 4 == 0 else ""

## aptitude 는 SaAptitude.assign 결과.
## rng 는 호출자가 들고 다닌다 — 코어는 시간도 전역 상태도 모른다.
static func resolve(
	state: Dictionary, action: Dictionary, aptitude: Dictionary,
	rng: SaRng, together_npc: String = ""
) -> Dictionary:
	var out := state.duplicate(true)
	var turn := int(out.get("turn", 1))
	var tier := _text(action.get("tier", "basic"))
	var primary := _text(action.get("stat", ""))
	var conditions: Array = out.get("conditions", [])

	# 번아웃은 선택권을 빼앗는다. 강제로 2턴을 소모한다.
	if SaRisk.forces_turn_skip(conditions):
		return _resolve_burnout(out)

	var talent_bonus := SaAptitude.roll_bonus(aptitude, primary) if primary != "" else 0.0
	var affinity := int((out.get("affinity", {}) as Dictionary).get(_text(action.get("npc_tag", "")), 0))
	var outcome := SaRisk.roll_outcome(
		rng, int(out["stress"]), int(out["energy"]), tier,
		talent_bonus, affinity, not bool(out.get("awakened", false)), SaRisk.AWAKEN_CHANCE)

	# ── 자원 ──────────────────────────────────────────────────────────
	var cost: Dictionary = action.get("cost", {})
	var gold_delta := int(cost.get("gold", 0))
	# 빚은 평판만이 아니라 벌이도 깎는다. 수입에만 곱한다 — 지출에 곱하면
	# 빚진 견습생이 물건을 더 싸게 사는 셈이 된다.
	if gold_delta > 0 and bool(out.get("in_debt", false)):
		gold_delta = int(floor(float(gold_delta) * SaResources.DEBT_WORK_MULTIPLIER))
	out["gold"] = int(out["gold"]) + gold_delta
	var recovery := _text(action.get("recovery", ""))
	if recovery == "stamina_scaled":
		out["energy"] = int(out["energy"]) + SaResources.rest_recovery(int((out["stats"] as Dictionary).get(SaStatKeys.STAMINA, 10)))
	elif recovery == "fixed_30":
		out["energy"] = int(out["energy"]) + 30
	else:
		out["energy"] = int(out["energy"]) + int(cost.get("energy", 0))
	out["stress"] = int(out["stress"]) + int(cost.get("stress", 0))
	if together_npc != "":
		out["stress"] = int(out["stress"]) + 4

	# ── 스탯 ──────────────────────────────────────────────────────────
	var gains := {}
	if primary != "":
		var condition_key := SaRisk.current_condition_key(conditions, int(out["stress"]))
		var condition_mult := SaRisk.condition_multiplier(condition_key)
		var outcome_mult := SaRisk.outcome_multiplier(outcome)
		var together_mult := 1.25 if together_npc != "" else 1.0
		gains = _apply_gain(out, action, aptitude, primary, tier, outcome_mult, condition_mult, together_mult)

	# ── NPC 호감: 행동에 붙은 패시브 라이더. 추가 클릭 0회 ─────────────
	var npc := _text(action.get("npc_tag", ""))
	if npc != "":
		var delta := 0
		match outcome:
			SaRisk.OUTCOME_FAIL: delta = -1
			SaRisk.OUTCOME_CRIT, SaRisk.OUTCOME_AWAKEN: delta = 3
			_: delta = 2
		_bump_affinity(out, npc, delta)
	if together_npc != "":
		_bump_affinity(out, together_npc, 10)

	# ── 평판: 공개 업무만 기여한다. 스탯이 아니라 사회 지표다.
	var rep_gain := int(action.get("reputation", 0))
	if rep_gain > 0 and outcome != SaRisk.OUTCOME_FAIL:
		out["reputation"] = int(out.get("reputation", 0)) + rep_gain

	# ── 플래그 ────────────────────────────────────────────────────────
	var flag := _text(action.get("flag", ""))
	if flag != "":
		var flags: Dictionary = out["flags"]
		flags[flag] = int(flags.get(flag, 0)) + 1

	# ── 각성: 해당 스탯 재능 등급 영구 상승. 런당 1회 ─────────────────
	# 승급본을 결과에 실어 보낸다. 코어는 재능을 들고 있지 않으므로 호출자가
	# 갱신해야 한다 — 이 값을 버리면 각성이 그 턴의 3.0배로 끝나고 남은 턴의
	# 성장률·안정성 상방이 통째로 사라진다.
	var promoted := false
	var grades := aptitude
	if outcome == SaRisk.OUTCOME_AWAKEN and primary != "":
		out["awakened"] = true
		promoted = true
		# 이미 S 면 promote() 가 그대로 돌려준다. 각성 자체는 소모된다.
		grades = SaAptitude.promote(aptitude, primary)

	# ── 연속 휴식 추적 (상태이상 해제 조건) ───────────────────────────
	var is_rest := _text(action.get("category", "")) == "rest"
	out["consecutive_rests"] = int(out.get("consecutive_rests", 0)) + 1 if is_rest else 0
	if (out.get("conditions", []) as Array).has(SaRisk.COND_INJURY):
		out["injury_turns"] = int(out.get("injury_turns", 0)) + 1

	# ── 연속 실패·고스트레스 추적 (상태이상 진입 조건) ────────────────
	out["consecutive_fails"] = int(out.get("consecutive_fails", 0)) + 1 if outcome == SaRisk.OUTCOME_FAIL else 0
	out["high_stress_turns"] = int(out.get("high_stress_turns", 0)) + 1 if int(out["stress"]) >= 70 else 0
	if (out.get("conditions", []) as Array).has(SaRisk.COND_SLUMP_LIGHT):
		out["slump_light_turns"] = int(out.get("slump_light_turns", 0)) + 1

	out = SaResources.clamp_state(out)

	# ── 상태이상 해제가 진입보다 먼저다. 같은 턴에 나갔다 들어오지 않게 한다.
	var exited := SaRisk.exiting_conditions(out, is_rest, outcome)
	for c in exited:
		(out["conditions"] as Array).erase(c)
		if c == SaRisk.COND_SLUMP_LIGHT:
			out["slump_light_turns"] = 0
			out["consecutive_fails"] = 0
		elif c == SaRisk.COND_INJURY:
			out["injury_turns"] = 0

	# ── 상태이상 진입 ─────────────────────────────────────────────────
	var entered := SaRisk.entering_conditions(out)
	for c in entered:
		(out["conditions"] as Array).append(c)

	# ── 월말 수업료 ───────────────────────────────────────────────────
	var settled := settle_tuition(out, turn, turn)
	var tuition_charged := bool(settled["charged"])
	var tuition_paid := int(settled["paid"])
	# 청산된 턴부터는 평판을 깎지 않는다.
	if bool(out.get("in_debt", false)):
		out["reputation"] = int(out["reputation"]) - SaResources.DEBT_REPUTATION_PENALTY

	out["turn"] = turn + 1
	var released := _release_mastery(out, turn)
	out = SaResources.clamp_state(out)

	return {
		"state": out,
		# 방금 플레이한 턴. state.turn 은 이미 다음 턴을 가리키므로, 이벤트 비트를
		# state.turn 으로 판정하면 첫 턴과 마지막 턴의 비트가 통째로 잘린다.
		"played_turn": turn,
		"outcome": outcome,
		"gains": gains,
		"entered_conditions": entered,
		"aptitude": grades,
		"tuition_charged": tuition_charged,
		"tuition_paid": tuition_paid,
		"debt_amount": int(out.get("debt_amount", 0)),
		"promoted_talent": promoted,
		"mastery_released": released,
	}

static func _apply_gain(
	out: Dictionary, action: Dictionary, aptitude: Dictionary, primary: String,
	tier: String, outcome_mult: float, condition_mult: float, together_mult: float
) -> Dictionary:
	var gains := {}
	var turn := int(out.get("turn", 1))
	var stats: Dictionary = out["stats"]
	var pairs := [[primary, 1.0]]
	var secondary := _text(action.get("secondary", ""))
	if secondary != "":
		pairs.append([secondary, 0.5])
	for pair in pairs:
		var key := String(pair[0])
		var share := float(pair[1])
		var current := float(stats.get(key, 0))
		var raw := SaGrowthCurve.gain(
			current, turn, tier,
			SaAptitude.multiplier(aptitude, key),
			outcome_mult, condition_mult) * share * together_mult
		var ceiling := float(SaGrowthCurve.term_ceiling(turn))
		# 분기 상한 초과분의 40% 는 숙련도로 적립돼 다음 분기 첫 턴에 반영된다.
		if current + raw > ceiling and current < ceiling:
			var overflow := (current + raw) - ceiling
			var bank: Dictionary = out["mastery_bank"]
			bank[key] = float(bank.get(key, 0.0)) + overflow * SaGrowthCurve.MASTERY_BANK_RATE
			raw = ceiling - current
		var applied := int(round(raw))
		stats[key] = int(current) + applied
		gains[key] = applied
	return gains

## 분기 상한 초과분으로 적립된 숙련도를 새 분기 첫 턴에 지급한다.
##
## 적립만 하고 지급하지 않으면 상한 근처의 고티어 행동이 손해가 되어
## "상한 직전에는 저티어를 반복하라"가 최적 플레이가 된다. 조기 캡을 막으려던
## 상한 설계가 정반대로 뒤집힌다.
static func _release_mastery(out: Dictionary, from_turn: int) -> Dictionary:
	var released := {}
	var turn := int(out.get("turn", 1))
	if SaGrowthCurve.term_index(turn) == SaGrowthCurve.term_index(from_turn):
		return released
	var bank: Dictionary = out.get("mastery_bank", {})
	var stats: Dictionary = out["stats"]
	var ceiling := float(SaGrowthCurve.term_ceiling(turn))
	for key in bank.keys():
		var amount := float(bank[key])
		# 지급 여부와 무관하게 비운다. 상한에 막힌 몫을 다시 적립하면
		# 영원히 이월돼 분기 상한이 유예에 지나지 않게 된다.
		bank[key] = 0.0
		if amount <= 0.0:
			continue
		var current := float(stats.get(key, 0))
		var applied := int(roundf(minf(current + amount, ceiling) - current))
		if applied <= 0:
			continue
		stats[key] = int(current) + applied
		released[key] = applied
	return released

## from_turn~to_turn(양끝 포함) 구간에 든 월말을 전부 정산한다.
##
## 번아웃의 강제 2턴 소모와 이벤트의 cost.turn_skip 이 턴을 건너뛰는데,
## 정산이 resolve() 본문에만 있던 시절에는 건너뛴 구간의 월말 수업료가
## 통째로 사라졌다. 스트레스를 높게 유지하는 플레이가 지출을 줄이는 방향으로
## 보상받아, 12개월 480금화라는 필수 지출 설계에 회피 구멍이 났다.
##
## 각 호출자는 자기가 실제로 소모한 턴 구간만 넘긴다. 구간이 겹치지 않으므로
## 같은 월말이 두 번 청구되지 않는다.
static func settle_tuition(out: Dictionary, from_turn: int, to_turn: int) -> Dictionary:
	var charged := false
	var paid := 0
	for t in range(maxi(1, from_turn), to_turn + 1):
		if not SaResources.is_month_end(t) or t >= SaGrowthCurve.TURNS_TOTAL:
			continue
		charged = true
		# 당월 수업료와 밀린 금액을 함께 청구한다. 낼 수 있는 만큼 내는
		# 부분 상환을 허용한다. 전액이 아니면 한 푼도 못 갚게 하면 밀린 금액이
		# 커질수록 청산 문턱이 계단식으로 멀어져, 단방향 데스 스파이럴이 된다.
		var due := SaResources.MONTHLY_TUITION + int(out.get("debt_amount", 0))
		var pay := mini(int(out.get("gold", 0)), due)
		out["gold"] = int(out.get("gold", 0)) - pay
		out["debt_amount"] = due - pay
		out["in_debt"] = int(out["debt_amount"]) > 0
		paid += pay
	return {"charged": charged, "paid": paid}

static func _bump_affinity(out: Dictionary, npc: String, delta: int) -> void:
	var affinity: Dictionary = out["affinity"]
	affinity[npc] = clampi(int(affinity.get(npc, 0)) + delta, 0, 100)

static func _resolve_burnout(out: Dictionary) -> Dictionary:
	var turn := int(out.get("turn", 1))
	out["stress"] = int(out["stress"]) - 40
	out["energy"] = int(out["energy"]) + 30
	out["reputation"] = int(out["reputation"]) - 8
	(out["conditions"] as Array).erase(SaRisk.COND_BURNOUT)
	# 소모한 두 턴(turn, turn + 1)에 든 월말은 그대로 청구된다. 건너뛴다고
	# 수업료가 면제되면 고스트레스 플레이가 지출을 회피하는 보상을 받는다.
	var settled := settle_tuition(out, turn, turn + 1)
	out["turn"] = turn + 2  # 강제로 2턴을 소모한다
	# 강제 소모가 분기 경계를 건너뛸 수 있다(예: 턴 8 -> 10). 적립분은 그때도 지급한다.
	var released := _release_mastery(out, turn)
	out = SaResources.clamp_state(out)
	return {
		"state": out, "played_turn": turn, "outcome": SaRisk.OUTCOME_FAIL, "gains": {},
		"entered_conditions": [], "tuition_charged": bool(settled["charged"]),
		"tuition_paid": int(settled["paid"]), "debt_amount": int(out.get("debt_amount", 0)),
		"promoted_talent": false, "burnout_skipped": true, "mastery_released": released,
	}
