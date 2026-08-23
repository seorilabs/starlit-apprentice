class_name SaEventResolution
extends RefCounted
## 선택지 이벤트 해결.
##
## 구 구현의 GameEvent 에는 choices 필드 자체가 없었다. 이벤트는 자동 적용되는
## 통보였고 12번 중 4번만 발동했으며 전부 성공했다.
## docs/game-design/02-gdd.md 콘텐츠

static func _text(value: Variant) -> String:
	return "" if value == null else String(value)

## 지금 발동 가능한 이벤트 후보. 요건·제외·쿨다운·1회성을 본다.
static func eligible(state: Dictionary, events: Array) -> Array:
	var seen: Dictionary = state.get("seen_events", {})
	var out: Array = []
	for e in events:
		var ev: Dictionary = e
		var id := _text(ev.get("id", ""))
		if bool(ev.get("once_per_run", false)) and seen.has(id):
			continue
		var cooldown := int(ev.get("cooldown_turns", 0))
		if cooldown > 0 and seen.has(id):
			if int(state.get("turn", 1)) - int(seen[id]) < cooldown:
				continue
		if not SaEventRequirements.all_satisfied(state, ev.get("requirements", [])):
			continue
		if SaEventRequirements.any_satisfied(state, ev.get("exclusions", [])):
			continue
		out.append(ev)
	return out

## 가중 추첨. rng 는 호출자가 들고 다닌다.
static func pick(state: Dictionary, events: Array, rng: SaRng) -> Dictionary:
	var pool := eligible(state, events)
	if pool.is_empty():
		return {}
	var total := 0
	for e in pool:
		total += maxi(1, int((e as Dictionary).get("weight", 1)))
	var roll := rng.next_int_range(1, total)
	for e in pool:
		roll -= maxi(1, int((e as Dictionary).get("weight", 1)))
		if roll <= 0:
			return e
	return pool[pool.size() - 1]

## 선택지를 지금 고를 수 있는가. 못 고르면 사유를 함께 돌려준다.
## 미충족 선택지는 숨기지 않고 회색 + 사유로 노출한다 — 임계값을 학습시키고
## 재플레이 콘텐츠를 광고하기 위해서다.
static func choice_availability(state: Dictionary, choice: Dictionary) -> Dictionary:
	if not SaEventRequirements.all_satisfied(state, choice.get("requirements", [])):
		return {"ok": false, "reason": _text(choice.get("locked_reason", "아직 이 선택은 할 수 없다"))}
	var cost: Dictionary = choice.get("cost", {})
	if int(state.get("gold", 0)) + int(cost.get("gold", 0)) < 0:
		return {"ok": false, "reason": "골드가 부족하다"}
	if int(state.get("energy", 0)) + int(cost.get("energy", 0)) < 0:
		return {"ok": false, "reason": "기력이 부족하다"}
	return {"ok": true, "reason": ""}

## 선택지 판정 성공 확률. 스탯 대비 난이도 + NPC 호감 보정.
static func success_chance(state: Dictionary, check: Dictionary) -> float:
	if check.is_empty():
		return 1.0
	var stats: Dictionary = state.get("stats", {})
	var value := float(stats.get(_text(check.get("stat", "")), 0))
	var difficulty := float(check.get("difficulty", 50))
	var aff := 0.0
	var npc := _text(check.get("npc_id", ""))
	if npc != "":
		aff = float((state.get("affinity", {}) as Dictionary).get(npc, 0))
	return clampf(0.15 + (value - difficulty) / 100.0 + aff / 300.0, 0.05, 0.95)

## 선택지를 적용한다. 새 상태와 표시할 결과문을 돌려준다.
static func apply(state: Dictionary, event: Dictionary, choice: Dictionary, rng: SaRng) -> Dictionary:
	var out := state.duplicate(true)
	var check: Dictionary = choice.get("check", {}) if choice.get("check") != null else {}
	var kind := "only"
	if not check.is_empty():
		kind = "success" if rng.next_float() < success_chance(out, check) else "failure"

	var outcome := _pick_outcome(choice.get("outcomes", []), kind)
	var cost: Dictionary = choice.get("cost", {})
	out["gold"] = int(out.get("gold", 0)) + int(cost.get("gold", 0))
	out["energy"] = int(out.get("energy", 0)) + int(cost.get("energy", 0))
	out["stress"] = int(out.get("stress", 0)) + int(cost.get("stress", 0))
	var skip := int(cost.get("turn_skip", 0))
	if skip > 0:
		out["turn"] = int(out.get("turn", 1)) + skip

	var effects: Dictionary = outcome.get("effects", {}) if not outcome.is_empty() else {}
	_apply_effects(out, effects)

	var seen: Dictionary = out.get("seen_events", {})
	seen[_text(event.get("id", ""))] = int(out.get("turn", 1))
	out["seen_events"] = seen

	out = SaResources.clamp_state(out)
	return {
		"state": out,
		"kind": kind,
		"result_text": _text(outcome.get("result_text", "")),
		"effects": effects,
	}

static func _pick_outcome(outcomes: Array, kind: String) -> Dictionary:
	for o in outcomes:
		if _text((o as Dictionary).get("kind", "only")) == kind:
			return o
	# 판정이 없는 선택지는 "only" 하나만 갖는다
	return outcomes[0] if not outcomes.is_empty() else {}

static func _apply_effects(out: Dictionary, effects: Dictionary) -> void:
	var stats: Dictionary = out.get("stats", {})
	for key in (effects.get("stats", {}) as Dictionary).keys():
		stats[key] = int(stats.get(key, 0)) + int((effects["stats"] as Dictionary)[key])
	out["gold"] = int(out.get("gold", 0)) + int(effects.get("gold", 0))
	out["energy"] = int(out.get("energy", 0)) + int(effects.get("energy", 0))
	out["stress"] = int(out.get("stress", 0)) + int(effects.get("stress", 0))
	out["reputation"] = int(out.get("reputation", 0)) + int(effects.get("reputation", 0))
	var flags: Dictionary = out.get("flags", {})
	for key in (effects.get("flags", {}) as Dictionary).keys():
		flags[key] = int(flags.get(key, 0)) + int((effects["flags"] as Dictionary)[key])
	var aff: Dictionary = out.get("affinity", {})
	for key in (effects.get("affinity", {}) as Dictionary).keys():
		aff[key] = clampi(int(aff.get(key, 0)) + int((effects["affinity"] as Dictionary)[key]), 0, 100)
	var enter := _text(effects.get("condition", ""))
	if enter != "" and not (out.get("conditions", []) as Array).has(enter):
		(out["conditions"] as Array).append(enter)
	var clear := _text(effects.get("clear_condition", ""))
	if clear != "":
		(out["conditions"] as Array).erase(clear)
