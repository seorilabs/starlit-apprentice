extends SceneTree
## 실제 data/actions.json 으로 36턴을 완주시켜 설계 불변식을 검증한다.
##
## 코어는 JSON 을 모르므로 로딩은 여기서 하고 코어에는 Dictionary 만 넘긴다.

const ACTIONS_PATH := "res://data/actions.json"
const EVENTS_PATH := "res://data/events.json"
const SEEDS := [1, 7, 13, 101, 4242, 65537, 999983]

func _initialize() -> void:
	var failures: Array[String] = []
	var data := _load(ACTIONS_PATH)
	var actions: Array = data.get("actions", [])
	var events: Array = _load(EVENTS_PATH).get("events", [])
	if events.is_empty():
		failures.append("이벤트가 비었다")
	if actions.size() != 38:
		failures.append("액션이 38개가 아니다: %d" % actions.size())

	var earliest_cap := 99
	var gold_pressure := 0
	var energy_pressure := 0
	var completed := 0
	var condition_hits := {}
	var events_fired := 0
	var locked_choices_seen := 0
	var distinct_events := {}
	var together_used := 0
	var npc_events := 0
	var peak_affinity := {}

	for seed_value in SEEDS:
		var rng := SaRng.new(seed_value)
		var apt := SaAptitude.assign(SaRng.new(seed_value * 31 + 7))
		var state := SaResources.new_state(seed_value)
		var min_gold := 99999
		var min_energy := 99999
		var guard := 0

		while int(state.get("turn", 1)) <= SaGrowthCurve.TURNS_TOTAL:
			guard += 1
			if guard > 200:
				failures.append("seed %d: 턴 루프가 끝나지 않는다" % seed_value)
				break
			var pick := _choose(state, actions, rng)
			if pick.is_empty():
				failures.append("seed %d turn %d: 고를 수 있는 행동이 없다 (소프트락)"
					% [seed_value, int(state["turn"])])
				break
			var before := int(state["turn"])
			# 함께는 호감의 주 채널이다. 안 쓰면 NPC 콘텐츠 30종이 검증되지 않는다.
			var together := SaTurn.together_candidate(state, pick)
			var result := SaTurn.resolve(state, pick, apt, rng, together)
			if together != "":
				together_used += 1
			state = result["state"]
			if int(state["turn"]) <= before:
				failures.append("seed %d: 턴이 진행되지 않았다" % seed_value)
				break
			for c in (result["entered_conditions"] as Array):
				condition_hits[c] = int(condition_hits.get(c, 0)) + 1
			# 마일스톤·진로는 추첨이 아니라 예정된 비트다. 매 턴 자격을 확인한다.
			var scheduled: Array = []
			for e in events:
				if SaEventResolution.is_scheduled(e as Dictionary):
					scheduled.append(e)
			var beat := SaEventResolution.beat_state(state, int(result["played_turn"]))
			var due := SaEventResolution.eligible(beat, scheduled)
			var queue: Array = []
			var cats := {}
			for e in due:
				var cat3 := String((e as Dictionary).get("category", ""))
				if cats.has(cat3):
					continue
				cats[cat3] = true
				queue.append(e)
				if queue.size() >= 2:
					break
			if queue.is_empty() and int(result["played_turn"]) % 3 == 0:
				var pool: Array = []
				for e in events:
					if not SaEventResolution.is_scheduled(e as Dictionary):
						pool.append(e)
				var drawn := SaEventResolution.pick(beat, pool, rng)
				if not drawn.is_empty():
					queue.append(drawn)
			for q in queue:
				var ev: Dictionary = q
				var choices: Array = ev.get("choices", [])
				var open_choices: Array = []
				for c in choices:
					var av := SaEventResolution.choice_availability(beat, c as Dictionary)
					if bool(av["ok"]):
						open_choices.append(c)
					else:
						locked_choices_seen += 1
						if String(av["reason"]) == "":
							failures.append("%s: 잠긴 선택지에 사유가 없다" % str(ev.get("id")))
				if open_choices.is_empty():
					failures.append("%s: 고를 수 있는 선택지가 없다" % str(ev.get("id")))
					continue
				var chosen: Dictionary = open_choices[rng.next_int_range(0, open_choices.size() - 1)]
				var outcome := SaEventResolution.apply(state, ev, chosen, rng)
				if String(outcome.get("result_text", "")) == "":
					failures.append("%s:%s 결과문이 비었다" % [str(ev.get("id")), str(chosen.get("id"))])
				state = outcome["state"]
				beat = SaEventResolution.beat_state(state, int(result["played_turn"]))
				events_fired += 1
				distinct_events[str(ev.get("id"))] = true
				if String(ev.get("category", "")) == "npc":
					npc_events += 1

			min_gold = mini(min_gold, int(state["gold"]))
			min_energy = mini(min_energy, int(state["energy"]))
			# 불변식 6: 턴 29 이전에 100 도달 금지
			if before < 29:
				for key in (state["stats"] as Dictionary).keys():
					if int((state["stats"] as Dictionary)[key]) >= 100:
						earliest_cap = mini(earliest_cap, before)

		for npc_id in (state.get("affinity", {}) as Dictionary).keys():
			var v := int((state["affinity"] as Dictionary)[npc_id])
			peak_affinity[npc_id] = maxi(int(peak_affinity.get(npc_id, 0)), v)
		if int(state.get("turn", 1)) > SaGrowthCurve.TURNS_TOTAL:
			completed += 1
		if min_gold < 40:
			gold_pressure += 1
		if min_energy < 30:
			energy_pressure += 1

	print("완주 %d/%d | 골드<40 경험 %d | 기력<30 경험 %d" % [completed, SEEDS.size(), gold_pressure, energy_pressure])
	print("상태이상 진입: %s" % str(condition_hits))
	print("이벤트 발동 %d회, 고유 %d종 | 잠긴 선택지 노출 %d회"
		% [events_fired, distinct_events.size(), locked_choices_seen])
	var by_cat := {}
	for id in distinct_events.keys():
		var prefix := String(id).split(".")[0]
		by_cat[prefix] = int(by_cat.get(prefix, 0)) + 1
	print("고유 이벤트 분포: %s" % str(by_cat))
	print("함께 사용 %d회 | NPC 이벤트 %d회 | 시드별 최고 호감 %s"
		% [together_used, npc_events, str(peak_affinity)])
	print("턴 29 이전 캡 도달: %s" % ("없음" if earliest_cap == 99 else "턴 %d" % earliest_cap))

	if completed != SEEDS.size():
		failures.append("완주하지 못한 시드가 있다: %d/%d" % [completed, SEEDS.size()])
	if earliest_cap != 99:
		failures.append("불변식 6 위반: 턴 %d 에 스탯이 100 에 도달했다" % earliest_cap)
	# 불변식 13: 자원이 실제로 구속돼야 한다
	if events_fired == 0:
		failures.append("이벤트가 한 번도 발동하지 않았다")
	if locked_choices_seen == 0:
		failures.append("잠긴 선택지가 한 번도 노출되지 않았다. 요건 게이팅이 동작하지 않는다")
	# 함께가 죽으면 호감이 라이더(+2)만 남아 NPC 콘텐츠 30종이 통째로 도달 불가가 된다.
	if together_used == 0:
		failures.append("함께 수식이 한 번도 사용되지 않았다. 호감의 주 채널이 죽었다")
	if npc_events < SEEDS.size() * 3:
		failures.append("NPC 이벤트가 시드당 3회 미만이다: %d/%d" % [npc_events, SEEDS.size()])
	if gold_pressure == 0:
		failures.append("불변식 13 위반: 어느 시드에서도 골드가 40 아래로 내려가지 않았다. 자원이 제약이 아니다")

	if failures.is_empty():
		print("SIMULATION PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

## 탐욕적이지 않은 대표 플레이: 자원이 급하면 회복·수입, 아니면 성장.
func _choose(state: Dictionary, actions: Array, rng: SaRng) -> Dictionary:
	var pool := SaResources.selectable(state, actions)
	if pool.is_empty():
		return {}
	var energy := int(state.get("energy", 0))
	var stress := int(state.get("stress", 0))
	var gold := int(state.get("gold", 0))
	var want := "lesson"
	if stress >= 65 or energy <= 20:
		want = "rest"
	elif gold < 80:
		want = "work"
	var filtered: Array = []
	for a in pool:
		if String((a as Dictionary).get("category", "")) == want:
			filtered.append(a)
	var source: Array = filtered if not filtered.is_empty() else pool
	return source[rng.next_int_range(0, source.size() - 1)]

func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		printerr("FAIL: 파일 없음 %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed as Dictionary if parsed is Dictionary else {}
