class_name SaRoutePlanner
extends RefCounted
## 엔딩 도달성 플래너.
##
## 목표 엔딩의 미충족 요건을 가장 많이 줄이는 행동을 매 턴 탐욕적으로 고른다.
## 사람이 고른 경로가 아니라 규칙만으로 도달 가능함을 증명하는 것이 목적이다.
##
## 코어는 JSON 도 시간도 모른다. 콘텐츠와 시드는 전부 주입된다.

const REST_STRESS_TRIGGER := 62
const REST_ENERGY_TRIGGER := 22
const WORK_GOLD_TRIGGER := 90

static func _text(v: Variant) -> String:
	return "" if v == null else String(v)

## 요건 하나가 얼마나 남았는지. 0 이면 충족.
static func _gap(state: Dictionary, req: Dictionary) -> float:
	if SaEndingRequirements.is_satisfied(state, req):
		return 0.0
	var kind := _text(req.get("type", ""))
	var target := float(req.get("target", 0))
	match kind:
		SaEndingRequirements.TYPE_STAT, SaEndingRequirements.TYPE_AVERAGE:
			return maxf(0.0, target - SaEndingRequirements.current_value(state, req))
		SaEndingRequirements.TYPE_AFFINITY:
			return maxf(0.0, target - SaEndingRequirements.current_value(state, req)) * 0.8
		SaEndingRequirements.TYPE_RESOURCE:
			var weight := 1.0 if _text(req.get("resource", "")) == "reputation" else 0.5
			return maxf(0.0, target - SaEndingRequirements.current_value(state, req)) * weight
		SaEndingRequirements.TYPE_FLAG, SaEndingRequirements.TYPE_FLAG_SUM:
			return maxf(0.0, target - SaEndingRequirements.current_value(state, req)) * 12.0
		_:
			return 8.0

static func _total_gap(state: Dictionary, reqs: Array) -> float:
	var sum := 0.0
	for r in reqs:
		sum += _gap(state, r as Dictionary)
	return sum

## 이 행동이 목표 요건을 얼마나 줄이는가. 클수록 좋다.
static func _score(state: Dictionary, action: Dictionary, reqs: Array, aptitude: Dictionary) -> float:
	var turn := int(state.get("turn", 1))
	var stats: Dictionary = state.get("stats", {})
	var score := 0.0

	for r in reqs:
		var req: Dictionary = r
		if SaEndingRequirements.is_satisfied(state, req):
			continue
		var kind := _text(req.get("type", ""))
		match kind:
			SaEndingRequirements.TYPE_STAT:
				var want := _text(req.get("stat", ""))
				var gain := 0.0
				if _text(action.get("stat", "")) == want:
					gain = SaGrowthCurve.gain(float(stats.get(want, 0)), turn,
						_text(action.get("tier", "basic")),
						SaAptitude.multiplier(aptitude, want), 1.0, 1.0)
				elif _text(action.get("secondary", "")) == want:
					gain = SaGrowthCurve.gain(float(stats.get(want, 0)), turn,
						_text(action.get("tier", "basic")),
						SaAptitude.multiplier(aptitude, want), 1.0, 1.0) * 0.5
				score += gain
			SaEndingRequirements.TYPE_FLAG:
				if _text(action.get("flag", "")) == _text(req.get("flag", "")):
					score += 14.0
			SaEndingRequirements.TYPE_FLAG_SUM:
				for f in (req.get("flags", []) as Array):
					if _text(action.get("flag", "")) == _text(f):
						score += 12.0
			SaEndingRequirements.TYPE_AFFINITY:
				if _text(action.get("npc_tag", "")) == _text(req.get("npc", "")):
					# 남은 격차가 클수록 더 강하게 끌어당긴다
					score += 6.0 + _gap(state, req) * 0.35
			SaEndingRequirements.TYPE_RESOURCE:
				var res := _text(req.get("resource", ""))
				if res == "gold":
					score += float((action.get("cost", {}) as Dictionary).get("gold", 0)) * 0.05
				elif res == "reputation":
					# 평판은 공개 업무(work)와 이벤트·마일스톤에서 온다.
					# 남은 격차에 비례해 끌어당기지 않으면 스탯 점수에 묻힌다.
					if _text(action.get("category", "")) == "work":
						score += 4.0 + _gap(state, req) * 1.2

	# 자원 압박이 있으면 회복·수입을 우선한다. 소프트락은 불가능하지만 낭비는 가능하다.
	var cat := _text(action.get("category", ""))
	if int(state.get("stress", 0)) >= REST_STRESS_TRIGGER or int(state.get("energy", 0)) <= REST_ENERGY_TRIGGER:
		if cat == "rest":
			score += 40.0
	if int(state.get("gold", 0)) < WORK_GOLD_TRIGGER and cat == "work":
		# 수입이 큰 일을 우선한다. 아무 일이나 고르면 가장 싼 일에 묶여
		# 성장 턴을 통째로 잃는다(실제로 겪었다).
		score += 10.0 + float((action.get("cost", {}) as Dictionary).get("gold", 0)) * 0.35
	# 종료 가드레일: 마지막 3턴은 기력 20 · 마음 80 을 맞춰 끝낸다.
	# 이걸 안 하면 요건을 채우고도 자원 가드레일에서 떨어진다.
	# 마지막 5턴. 이벤트가 이 구간에도 뜨므로 가드레일(20/80)보다 여유를 둔다.
	if turn >= SaGrowthCurve.TURNS_TOTAL - 4:
		if int(state.get("energy", 0)) < 45 and cat == "rest":
			score += 120.0
		if int(state.get("stress", 0)) > 55 and cat == "rest":
			score += 120.0

	# 슬럼프면 회복이 최우선이다. 심화·비전이 잠겨 성장이 막힌다.
	if (state.get("conditions", []) as Array).has(SaRisk.COND_SLUMP) and cat == "rest":
		score += 60.0
	return score

## 36턴을 계획하고 실행한다. 실행 로그와 최종 상태를 돌려준다.
## 목표 요건을 가장 많이 줄이는 선택지를 고른다.
static func _best_choice(state: Dictionary, event: Dictionary, reqs: Array) -> Dictionary:
	var best: Dictionary = {}
	var best_score := -1e9
	# 끝이 가까울수록 자원 소모에 민감해진다.
	var end_weight := 3.0 if int(state.get("turn", 1)) >= SaGrowthCurve.TURNS_TOTAL - 4 else 1.0
	for c in (event.get("choices", []) as Array):
		var cd: Dictionary = c
		if not bool(SaEventResolution.choice_availability(state, cd).get("ok", false)):
			continue
		var s := 0.0
		# 결과를 확률로 가중한다. 균등하게 더하면 실패 분기의 비용이 과대평가돼
		# 계획기가 판정을 피하고, 심사를 기권해 낙제한다 — 실제로 그랬다.
		var chance := SaEventResolution.success_chance(
			state, cd.get("check", {}) if cd.get("check") != null else {})
		for o in (cd.get("outcomes", []) as Array):
			var od: Dictionary = o
			var eff: Dictionary = od.get("effects", {})
			var w := 1.0
			match _text(od.get("kind", "only")):
				"success": w = chance
				"failure": w = 1.0 - chance
			for r in reqs:
				var req: Dictionary = r
				if SaEndingRequirements.is_satisfied(state, req):
					continue
				match _text(req.get("type", "")):
					SaEndingRequirements.TYPE_RESOURCE:
						s += float(eff.get(_text(req.get("resource", "")), 0)) * 1.2 * w
					SaEndingRequirements.TYPE_AFFINITY:
						s += float((eff.get("affinity", {}) as Dictionary).get(_text(req.get("npc", "")), 0)) * 1.5 * w
					SaEndingRequirements.TYPE_STAT:
						s += float((eff.get("stats", {}) as Dictionary).get(_text(req.get("stat", "")), 0)) * w
					SaEndingRequirements.TYPE_FLAG:
						if (eff.get("flags", {}) as Dictionary).has(_text(req.get("flag", ""))):
							s += 14.0 * w
			# 심사 기권·낙방은 낙제로 이어져 band >= 4 엔딩을 영구히 닫는다.
			# 요건 점수만으로는 이 비용이 전혀 보이지 않는다.
			for f in (eff.get("flags", {}) as Dictionary).keys():
				var fk := _text(f)
				if fk.begins_with("milestone:") and (fk.ends_with(":skip") or fk.ends_with(":fail")):
					s -= 80.0 * w
			# 결과가 자원을 얼마나 축내는지도 본다. 요건만 보고 고르면 후반
			# 이벤트가 종료 가드레일(기력 20 · 마음 80)을 깨뜨린다.
			s -= maxf(0.0, float(eff.get("stress", 0))) * 0.6 * end_weight * w
			s += minf(0.0, float(eff.get("energy", 0))) * 0.4 * end_weight * w
		# 자원이 급하면 소모가 큰 선택지를 피한다
		var cost: Dictionary = cd.get("cost", {})
		s += float(cost.get("energy", 0)) * 0.2 + float(cost.get("gold", 0)) * 0.02
		s -= float(cost.get("turn_skip", 0)) * 25.0
		if s > best_score:
			best_score = s
			best = cd
	return best

static func run(
	target: Dictionary, actions: Array, aptitude: Dictionary, rng: SaRng,
	declared_path: String = "", events: Array = []
) -> Dictionary:
	var state := SaResources.new_state(rng.state())
	var reqs: Array = target.get("requirements", [])
	var picks: Array[String] = []

	while int(state.get("turn", 1)) <= SaGrowthCurve.TURNS_TOTAL:
		var turn := int(state.get("turn", 1))
		# 월 7 에 진로를 선언한다. band >= 3 엔딩의 하드 요건이다.
		if turn >= 19 and declared_path != "" and _text(state.get("declared_path", "")) == "":
			state["declared_path"] = declared_path

		var pool := SaResources.selectable(state, actions)
		if pool.is_empty():
			return {"ok": false, "reason": "턴 %d 에 선택 가능한 행동이 없다" % turn,
				"state": state, "picks": picks}
		var best: Dictionary = {}
		var best_score := -1e9
		for a in pool:
			var ad: Dictionary = a
			# 진로 전용 비전은 선언한 경로만 쓴다
			if _text(ad.get("category", "")) == "path":
				if _text((ad.get("unlock", {}) as Dictionary).get("declared_path", "")) != declared_path:
					continue
			var s := _score(state, ad, reqs, aptitude)
			if s > best_score:
				best_score = s
				best = ad
		if best.is_empty():
			best = pool[0]
		# 함께 수식: 호감 요건이 있으면 붙인다. 설계된 기제인데 안 쓰면
		# band 4 의 호감 80 이 구조적으로 도달 불가능해진다.
		# 마음 +4 를 내고 호감 +10 과 스탯 x1.25 를 얻는다.
		var together := ""
		if int(state.get("stress", 0)) < 55:
			for r in reqs:
				var req2: Dictionary = r
				if _text(req2.get("type", "")) != SaEndingRequirements.TYPE_AFFINITY:
					continue
				if SaEndingRequirements.is_satisfied(state, req2):
					continue
				if _text(best.get("npc_tag", "")) == _text(req2.get("npc", "")):
					together = _text(req2.get("npc", ""))
					break

		var result := SaTurn.resolve(state, best, aptitude, rng, together)
		state = result["state"]
		picks.append(_text(best.get("id", "")))

		# 이벤트를 발동시킨다. 평판·NPC 호감은 주로 여기서 온다.
		# 이걸 빼면 band 3/4 요건이 구조적으로 도달 불가능해진다.
		# 이벤트를 발동시킨다. 평판·NPC 호감은 주로 여기서 온다.
		# 큐 구성 규칙은 코어에 하나만 둔다 — 네 곳이 각자 구현하다 어긋났다.
		if not events.is_empty():
			var beat := SaEventResolution.beat_state(state, int(result["played_turn"]))
			for q in SaEventResolution.draw_beats(beat, events, rng):
				var ev: Dictionary = q
				var choice := _best_choice(beat, ev, reqs)
				if choice.is_empty():
					continue
				state = (SaEventResolution.apply(state, ev, choice, rng))["state"]
				beat = SaEventResolution.beat_state(state, int(result["played_turn"]))

	return {"ok": true, "reason": "", "state": state, "picks": picks,
		"remaining_gap": _total_gap(state, reqs)}
