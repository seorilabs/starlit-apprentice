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
	var awaken_chance := SaRisk.AWAKEN_CHANCE
	var outcome := SaRisk.roll_outcome(
		rng, int(out["stress"]), int(out["energy"]), tier,
		talent_bonus, affinity, not bool(out.get("awakened", false)), awaken_chance)

	# ── 자원 ──────────────────────────────────────────────────────────
	var cost: Dictionary = action.get("cost", {})
	out["gold"] = int(out["gold"]) + int(cost.get("gold", 0))
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
		var condition_key := SaRisk.current_condition_key(conditions)
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

	# ── 플래그 ────────────────────────────────────────────────────────
	var flag := _text(action.get("flag", ""))
	if flag != "":
		var flags: Dictionary = out["flags"]
		flags[flag] = int(flags.get(flag, 0)) + 1

	# ── 각성: 해당 스탯 재능 등급 영구 상승. 런당 1회 ─────────────────
	var promoted := false
	if outcome == SaRisk.OUTCOME_AWAKEN and primary != "":
		out["awakened"] = true
		promoted = true

	# ── 연속 실패·고스트레스 추적 (상태이상 진입 조건) ────────────────
	out["consecutive_fails"] = int(out.get("consecutive_fails", 0)) + 1 if outcome == SaRisk.OUTCOME_FAIL else 0
	out["high_stress_turns"] = int(out.get("high_stress_turns", 0)) + 1 if int(out["stress"]) >= 70 else 0
	if (out.get("conditions", []) as Array).has(SaRisk.COND_SLUMP_LIGHT):
		out["slump_light_turns"] = int(out.get("slump_light_turns", 0)) + 1

	out = SaResources.clamp_state(out)

	# ── 상태이상 진입 ─────────────────────────────────────────────────
	var entered := SaRisk.entering_conditions(out)
	for c in entered:
		(out["conditions"] as Array).append(c)

	# ── 월말 수업료 ───────────────────────────────────────────────────
	var tuition_charged := false
	if SaResources.is_month_end(turn) and turn < SaGrowthCurve.TURNS_TOTAL:
		tuition_charged = true
		if int(out["gold"]) >= SaResources.MONTHLY_TUITION:
			out["gold"] = int(out["gold"]) - SaResources.MONTHLY_TUITION
		else:
			out["in_debt"] = true
	if bool(out.get("in_debt", false)):
		out["reputation"] = int(out["reputation"]) - SaResources.DEBT_REPUTATION_PENALTY

	out["turn"] = turn + 1
	out = SaResources.clamp_state(out)

	return {
		"state": out,
		"outcome": outcome,
		"gains": gains,
		"entered_conditions": entered,
		"tuition_charged": tuition_charged,
		"promoted_talent": promoted,
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

static func _bump_affinity(out: Dictionary, npc: String, delta: int) -> void:
	var affinity: Dictionary = out["affinity"]
	affinity[npc] = clampi(int(affinity.get(npc, 0)) + delta, 0, 100)

static func _resolve_burnout(out: Dictionary) -> Dictionary:
	var turn := int(out.get("turn", 1))
	out["stress"] = int(out["stress"]) - 40
	out["energy"] = int(out["energy"]) + 30
	out["reputation"] = int(out["reputation"]) - 8
	(out["conditions"] as Array).erase(SaRisk.COND_BURNOUT)
	out["turn"] = turn + 2  # 강제로 2턴을 소모한다
	out = SaResources.clamp_state(out)
	return {
		"state": out, "outcome": SaRisk.OUTCOME_FAIL, "gains": {},
		"entered_conditions": [], "tuition_charged": false, "promoted_talent": false,
		"burnout_skipped": true,
	}
