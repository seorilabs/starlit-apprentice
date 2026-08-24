class_name SaEventResolution
extends RefCounted
## 선택지 이벤트 해결.
##
## 구 구현의 GameEvent 에는 choices 필드 자체가 없었다. 이벤트는 자동 적용되는
## 통보였고 12번 중 4번만 발동했으며 전부 성공했다.
## docs/game-design/02-gdd.md 콘텐츠

## 추첨이 아니라 자격이 되면 반드시 뜨는 비트. UI 와 시뮬레이션이 각자 목록을
## 들고 있다가 어긋난 적이 있어 코어에 하나로 둔다.
const SCHEDULED_CATEGORIES := ["opening", "milestone", "path", "condition", "npc", "finale"]

static func is_scheduled(event: Dictionary) -> bool:
	return SCHEDULED_CATEGORIES.has(String(event.get("category", "")))


static func _text(value: Variant) -> String:
	return "" if value == null else String(value)

## 지금 발동 가능한 이벤트 후보. 요건·제외·쿨다운·1회성을 본다.
## 이벤트 비트는 "방금 플레이한 턴"에 속한다. SaTurn.resolve 가 돌려준
## played_turn 을 넣어 판정 상태를 만든다.
## 이번 턴에 재생할 비트 목록. 예정 비트를 카테고리당 하나씩 최대 MAX 개까지
## 채우고, 자리가 남고 추첨 턴이면 기회·세계 풀에서 하나를 더 뽑는다.
##
## 규칙을 여기 두는 이유: UI·시뮬레이션·경로계획기가 각자 구현하다 네 번
## 어긋났다. 예정 비트로 큐가 꽉 차면 기회 이벤트가 영영 안 뜨는 것도
## 그렇게 놓쳤다.
const MAX_BEATS_PER_TURN := 2
const LOTTERY_EVERY := 3

static func draw_beats(beat: Dictionary, events: Array, rng: SaRng) -> Array:
	var scheduled: Array = []
	var lottery: Array = []
	for e in events:
		if is_scheduled(e as Dictionary):
			scheduled.append(e)
		else:
			lottery.append(e)

	var out: Array = []
	var cats := {}
	for e in eligible(beat, scheduled):
		var cat := String((e as Dictionary).get("category", ""))
		if cats.has(cat):
			continue
		cats[cat] = true
		out.append(e)
		if out.size() >= MAX_BEATS_PER_TURN:
			break

	if out.size() < MAX_BEATS_PER_TURN and int(beat.get("turn", 1)) % LOTTERY_EVERY == 0:
		var drawn := pick(beat, lottery, rng)
		if not drawn.is_empty():
			out.append(drawn)
	return out

static func beat_state(state: Dictionary, played_turn: int) -> Dictionary:
	var s := state.duplicate(true)
	s["turn"] = played_turn
	return s

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
		# 이번 회차 덱에 없는 기회 이벤트는 아예 나오지 않는다.
		var deck: Variant = ev.get("deck")
		if deck != null and int(deck) != int(state.get("deck", 0)):
			continue
		out.append(ev)
	# 특이도 높은 것이 먼저 온다. 호출자는 due[0] 하나만 재생하므로 정렬이
	# 곧 판정이다. 배열 순서에 맡기면 조건이 가장 느슨한 비트가 늘 이기고
	# 공들여 조건을 붙인 종막·개막이 영영 뜨지 않는다 — 실제로 그랬다.
	out.sort_custom(_more_specific)
	return out

## 요건이 많을수록, 같으면 weight 가 클수록, 그래도 같으면 id 순.
## 마지막 타이브레이크를 id 로 두어 시드와 배열 위치에 흔들리지 않게 한다.
static func specificity(event: Dictionary) -> int:
	return (event.get("requirements", []) as Array).size() \
		+ (event.get("exclusions", []) as Array).size()

static func _more_specific(a: Dictionary, b: Dictionary) -> bool:
	var sa := specificity(a)
	var sb := specificity(b)
	if sa != sb:
		return sa > sb
	var wa := int(a.get("weight", 1))
	var wb := int(b.get("weight", 1))
	if wa != wb:
		return wa > wb
	return _text(a.get("id", "")) < _text(b.get("id", ""))

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
## check.stat 이 "*best" 면 현재 최고 스탯을 쓴다.
## 계절 심사는 "대표 계열 스탯" 으로 판정한다 — 특정 스탯을 하드코딩하면
## 그 스탯을 안 키운 빌드가 심사를 통째로 놓치고 평판이 막힌다.
## 계절 심사 합산 점수의 항. 설계 팩 02-gdd 의 판정식이 원본이다.
const MILESTONE_PATH_BONUS := 10.0
const MILESTONE_NPC_WEIGHT := 0.2

static func best_stat_value(state: Dictionary) -> float:
	var stats: Dictionary = state.get("stats", {})
	var best := 0.0
	for k in stats.keys():
		best = maxf(best, float(stats[k]))
	return best

static func success_chance(state: Dictionary, check: Dictionary) -> float:
	if check.is_empty():
		return 1.0
	var stats: Dictionary = state.get("stats", {})
	var key := _text(check.get("stat", ""))
	var value := best_stat_value(state) if key == "*best" else float(stats.get(key, 0))
	var difficulty := float(check.get("difficulty", 50))
	var aff := 0.0
	var npc := _text(check.get("npc_id", ""))
	if npc != "":
		aff = float((state.get("affinity", {}) as Dictionary).get(npc, 0))
	# 계절 심사는 판정 모형 자체가 다르다.
	#   score = 대표스탯 + 평판x0.5 + 진로일치 + NPC지원, 난이도와 직접 비교하고
	#   d20 이 ±10 만 흔든다. 즉 실력이 정하고 운은 가장자리만 건드린다.
	# 일반 선택지 공식(0.15 + (값-난이도)/100)은 50% 통과에 난이도+35 를 요구해
	# 어떤 빌드도 심사를 못 넘고 전원 낙제한다 — 실제로 그랬다.
	if _text(check.get("kind", "")) == "milestone":
		var score := value + float(state.get("reputation", 0)) * 0.5
		if _text(state.get("declared_path", "")) != "":
			score += MILESTONE_PATH_BONUS
		var support := 0.0
		for v in (state.get("affinity", {}) as Dictionary).values():
			support = maxf(support, float(v))
		score += support * MILESTONE_NPC_WEIGHT
		return clampf((score - difficulty + 10.5) / 20.0, 0.05, 0.95)
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
	var settled := {"charged": false, "paid": 0}
	if skip > 0:
		var from_turn := int(out.get("turn", 1))
		out["turn"] = from_turn + skip
		# 건너뛴 턴에 든 월말도 정산한다. 이 경로만 빠지면 turn_skip 이 붙은
		# 선택지가 수업료 회피 수단이 된다.
		settled = SaTurn.settle_tuition(out, from_turn, from_turn + skip - 1)

	var effects: Dictionary = outcome.get("effects", {}) if not outcome.is_empty() else {}
	_apply_effects(out, effects)

	# 심사 플래그는 이벤트만 남긴다. 낙제 판정도 여기서 한다.
	if SaRisk.should_fail_out(out):
		(out["conditions"] as Array).append(SaRisk.COND_FAILED)

	var seen: Dictionary = out.get("seen_events", {})
	seen[_text(event.get("id", ""))] = int(out.get("turn", 1))
	out["seen_events"] = seen

	out = SaResources.clamp_state(out)
	return {
		"state": out,
		"kind": kind,
		"result_text": _text(outcome.get("result_text", "")),
		"effects": effects,
		"tuition_charged": bool(settled["charged"]),
		"tuition_paid": int(settled["paid"]),
	}

static func _pick_outcome(outcomes: Array, kind: String) -> Dictionary:
	for o in outcomes:
		if _text((o as Dictionary).get("kind", "only")) == kind:
			return o
	# 판정이 없는 선택지는 "only" 하나만 갖는다
	return outcomes[0] if not outcomes.is_empty() else {}

static func _apply_effects(out: Dictionary, effects: Dictionary) -> void:
	var stats: Dictionary = out.get("stats", {})
	# 이벤트 스탯 획득도 분기 상한을 지킨다. 행동에만 상한을 걸면 이벤트로
	# 그냥 새어 나가고, "턴 29 이전에는 어떤 스탯도 100 에 못 간다"는
	# 구조적 보장이 튜닝 문제로 전락한다 — 실제로 턴 28 에 뚫렸다.
	var ceiling := float(SaGrowthCurve.term_ceiling(int(out.get("turn", 1))))
	for key in (effects.get("stats", {}) as Dictionary).keys():
		var before := float(stats.get(key, 0))
		var raw := float((effects["stats"] as Dictionary)[key])
		var applied := raw
		if raw > 0.0 and before >= ceiling:
			applied = raw * SaGrowthCurve.OVER_CEILING_FACTOR
		elif raw > 0.0 and before + raw > ceiling:
			# 상한을 걸치는 획득은 넘는 부분만 감쇠한다.
			applied = (ceiling - before) + (before + raw - ceiling) * SaGrowthCurve.OVER_CEILING_FACTOR
		stats[key] = int(roundf(before + applied))
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
	# 진로 선언은 플래그가 아니라 상태 필드가 원장이다. 플래그만 남기면
	# 진로 전용 액션·declared 엔딩·심사 보너스가 통째로 사문화된다.
	var declared := _text(effects.get("declared_path", ""))
	if declared != "":
		out["declared_path"] = declared
	var enter := _text(effects.get("condition", ""))
	if enter != "" and not (out.get("conditions", []) as Array).has(enter):
		(out["conditions"] as Array).append(enter)
	var clear := _text(effects.get("clear_condition", ""))
	if clear != "":
		(out["conditions"] as Array).erase(clear)
