class_name SaCoreTests
extends RefCounted
## 순수 코어 테스트. 엔진에 의존하지 않는다.

var _failures: Array[String] = []
var _executed := 0

func run_all() -> Array[String]:
	_failures.clear()
	_executed = 0
	_self_test()
	_test_stat_keys()
	_test_term_ceiling()
	_test_tier_factor()
	_test_no_early_cap()
	_test_requirements()
	_test_judgement_prefers_specificity()
	_test_rng_deterministic()
	_test_aptitude_multiset()
	_test_rng_shape_failure_weighted()
	_test_no_softlock()
	_test_burnout_consumes_turns()
	_test_mastery_bank_on_ceiling()
	_test_event_choice_gating()
	_test_event_check_branches()
	_test_every_condition_has_exit()
	_test_declared_path_is_recorded()
	_test_failed_locks_legendary()
	_test_debt_is_repayable()
	_test_skipped_turns_still_pay_tuition()
	_test_awaken_promotes_talent()
	# 빈 스위트가 초록으로 통과하지 않게 한다.
	if _executed == 0:
		_failures.append("실행된 검사가 0개다. 스위트가 비었거나 러너가 깨졌다.")
	return _failures

## 러너 자체가 실패를 감지하는지 확인한다. 이것이 없으면 run_all() 본문을
## 지워도 게이트가 초록이 된다.
func _self_test() -> void:
	var probe: Array[String] = []
	var before := probe.size()
	if 1 != 2:
		probe.append("의도된 실패")
	if probe.size() != before + 1:
		_failures.append("self_test: 실패 기록 경로가 동작하지 않는다.")
	_executed += 1

func _check(condition: bool, message: String) -> void:
	_executed += 1
	if not condition:
		_failures.append(message)

func _test_stat_keys() -> void:
	_check(SaStatKeys.ALL.size() == 9, "스탯은 9종이어야 한다. 실제: %d" % SaStatKeys.ALL.size())
	_check(not SaStatKeys.is_stat(SaStatKeys.REPUTATION),
		"평판은 스탯 배열에 들어가면 안 된다.")

func _test_term_ceiling() -> void:
	_check(SaGrowthCurve.term_ceiling(1) == 50, "1분기 상한은 50")
	_check(SaGrowthCurve.term_ceiling(9) == 50, "턴 9는 1분기")
	_check(SaGrowthCurve.term_ceiling(10) == 70, "턴 10은 2분기")
	_check(SaGrowthCurve.term_ceiling(19) == 88, "턴 19는 3분기")
	_check(SaGrowthCurve.term_ceiling(36) == 100, "턴 36은 4분기")

func _test_tier_factor() -> void:
	_check(is_equal_approx(SaGrowthCurve.tier_factor(10.0), 1.00), "0~29 구간은 1.00")
	_check(is_equal_approx(SaGrowthCurve.tier_factor(95.0), 0.20), "90~100 구간은 0.20")
	_check(SaGrowthCurve.tier_factor(10.0) > SaGrowthCurve.tier_factor(95.0),
		"체감 감소는 단조여야 한다.")

func _test_requirements() -> void:
	var state := {"stats": {"intellect": 70, "etiquette": 40}, "gold": 300, "stress": 20, "flags": {"lesson:letters": 5}}
	_check(SaEndingRequirements.is_satisfied(state, {"type":"stat","stat":"intellect","target":70}),
		"stat 요건은 이상(>=) 비교다.")
	_check(not SaEndingRequirements.is_satisfied(state, {"type":"stat","stat":"etiquette","target":55}),
		"미달 stat 요건은 불충족이어야 한다.")
	_check(SaEndingRequirements.is_satisfied(state, {"type":"resource","resource":"stress","target":35,"direction":"at-most"}),
		"at-most 방향은 이하(<=) 비교다.")
	_check(not SaEndingRequirements.is_satisfied(state, {"type":"resource","resource":"stress","target":10,"direction":"at-most"}),
		"at-most 초과는 불충족이어야 한다.")
	_check(SaEndingRequirements.is_satisfied(state, {"type":"flag","flag":"lesson:letters","target":5}),
		"flag 요건은 누적 횟수 비교다.")
	_check(is_equal_approx(SaEndingRequirements.current_value(state, {"type":"average","stats":["intellect","etiquette"],"target":0}), 55.0),
		"average 는 지정 스탯의 평균이다.")

## 특이도 판정이 요건이 낮은 엔딩에 가려지지 않는지 확인한다.
## 구 구현은 priority 30 을 박은 3종이 나머지를 전부 가렸다.
func _test_judgement_prefers_specificity() -> void:
	var endings: Array = [
		{"code": "low", "requirements": [{"type":"stat","stat":"intellect","target":30}]},
		{"code": "high", "requirements": [
			{"type":"stat","stat":"intellect","target":80},
			{"type":"stat","stat":"etiquette","target":70}]},
	]
	var state := {"stats": {"intellect": 90, "etiquette": 80}, "gold": 0, "stress": 0, "flags": {}}
	_check(SaEndingJudgement.judge(state, endings) == "high",
		"새 판정은 요건이 높은 엔딩을 골라야 한다.")
	_check(SaEndingJudgement.specificity(endings[1]) > SaEndingJudgement.specificity(endings[0]),
		"특이도는 요건 강도에 비례해야 한다.")
	_check(SaEndingJudgement.judge({"stats":{},"gold":0,"stress":0,"flags":{}}, endings) == SaEndingJudgement.FALLBACK_CODE,
		"자격 엔딩이 없으면 폴백이어야 한다.")

func _test_rng_deterministic() -> void:
	var a := SaRng.new(12345)
	var b := SaRng.new(12345)
	var same := true
	for i in 200:
		if a.next_uint() != b.next_uint():
			same = false
			break
	_check(same, "같은 시드는 같은 수열을 내야 한다.")
	var c := SaRng.new(999)
	_check(SaRng.new(12345).next_uint() != c.next_uint(), "다른 시드는 다른 수열을 내야 한다.")
	var zero := SaRng.new(0)
	_check(zero.next_uint() != 0, "시드 0 은 xorshift 고정점이라 회피해야 한다.")

func _test_aptitude_multiset() -> void:
	# 고정 multiset 이라 항상 강점 1개와 약점 1개가 보장된다.
	for seed_value in [1, 7, 13, 101, 4242]:
		var grades := SaAptitude.assign(SaRng.new(seed_value))
		_check(grades.size() == 9, "재능은 9스탯 전부에 배정돼야 한다.")
		var counts := {}
		for key in grades.keys():
			var g := String(grades[key])
			counts[g] = int(counts.get(g, 0)) + 1
		_check(int(counts.get("S", 0)) == 1, "S 등급은 정확히 1개여야 한다. seed=%d" % seed_value)
		_check(int(counts.get("D", 0)) == 1, "D 등급은 정확히 1개여야 한다. seed=%d" % seed_value)
		_check(int(counts.get("A", 0)) == 2, "A 등급은 정확히 2개여야 한다. seed=%d" % seed_value)
		_check(int(counts.get("B", 0)) == 4, "B 등급은 정확히 4개여야 한다. seed=%d" % seed_value)

## 불변식 15: 중앙값 상황에서 실패가 대성공보다 잦아야 한다.
## 구 구현은 336롤에서 실패 4.2% / 대성공 28% 로 크리티컬이 6.7배 잦았다.
func _test_rng_shape_failure_weighted() -> void:
	var f := SaRisk.fail_chance(40, 60, "basic", 0.0)
	var c := SaRisk.crit_chance(40, 60, 0, 0.0)
	_check(f > c, "중앙값에서 실패율(%.3f)이 대성공률(%.3f)보다 높아야 한다." % [f, c])
	_check(f >= 0.12 and f <= 0.24, "중앙값 실패율이 [0.12, 0.24] 안이어야 한다. 실제 %.3f" % f)

	# 관리를 잘하면 상승으로 뒤집힌다.
	var f_good := SaRisk.fail_chance(15, 85, "basic", 0.03)
	var c_good := SaRisk.crit_chance(15, 85, 0, 0.03)
	_check(c_good > f_good, "관리 우수 상황에서는 대성공이 실패보다 잦아야 한다.")

	# 티어가 높을수록 위험하다. 상위호환이 아니라 결정이 되게 한다.
	_check(SaRisk.fail_chance(40, 60, "arcane", 0.0) > SaRisk.fail_chance(40, 60, "basic", 0.0),
		"비전 티어는 기초보다 위험해야 한다.")

## 자원이 바닥나도 항상 최소 2개 행동을 고를 수 있어야 한다.
func _test_no_softlock() -> void:
	var actions: Array = [
		{"id":"a","cost":{"gold":-40,"energy":-12,"stress":8},"tier":"basic","stat":"intellect"},
		{"id":"chores","cost":{"gold":18,"energy":-12,"stress":8},"tier":"basic","always_available":true},
		{"id":"home","cost":{"gold":0,"energy":0,"stress":-16},"tier":"basic","always_available":true},
	]
	var broke := {"gold": 0, "energy": 0, "stress": 100, "conditions": [], "stats": {}}
	var pick := SaResources.selectable(broke, actions)
	_check(pick.size() >= 2, "자원이 0이어도 최소 2개는 선택 가능해야 한다. 실제 %d" % pick.size())
	var slumped := {"gold": 999, "energy": 99, "stress": 0, "conditions": [SaRisk.COND_SLUMP], "stats": {}}
	_check(SaResources.selectable(slumped, actions).size() >= 2,
		"슬럼프 중에도 최소 2개는 선택 가능해야 한다.")

## 번아웃은 플레이어의 선택권을 빼앗는다. 36턴 중 2턴을 소모한다.
func _test_burnout_consumes_turns() -> void:
	var state := SaResources.new_state(1)
	state["stress"] = 99
	(state["conditions"] as Array).append(SaRisk.COND_BURNOUT)
	var before := int(state["turn"])
	var result := SaTurn.resolve(state, {"id":"x","cost":{},"tier":"basic"}, {}, SaRng.new(1))
	var after := int((result["state"] as Dictionary)["turn"])
	_check(after - before == 2, "번아웃은 2턴을 소모해야 한다. 실제 %d" % (after - before))
	_check(not ((result["state"] as Dictionary)["conditions"] as Array).has(SaRisk.COND_BURNOUT),
		"번아웃은 자동 해제돼야 한다.")

## 분기 상한을 넘기면 초과분 40% 가 숙련도로 적립된다.
func _test_mastery_bank_on_ceiling() -> void:
	var state := SaResources.new_state(1)
	(state["stats"] as Dictionary)[SaStatKeys.INTELLECT] = 49
	state["turn"] = 5  # 1분기, 상한 50
	var action := {"id":"l","cost":{"gold":-20,"energy":-8,"stress":5},
		"tier":"basic","stat":SaStatKeys.INTELLECT,"npc_tag":"","flag":"lesson:x"}
	var apt := {}
	for k in SaStatKeys.ALL: apt[k] = "B"
	var result := SaTurn.resolve(state, action, apt, SaRng.new(1))
	var s: Dictionary = result["state"]
	_check(int((s["stats"] as Dictionary)[SaStatKeys.INTELLECT]) <= 50,
		"1분기에는 상한 50 을 넘을 수 없다.")
	var bank: Dictionary = s["mastery_bank"]
	var banked := float(bank.get(SaStatKeys.INTELLECT, 0.0))
	_check(banked > 0.0, "상한 초과분이 숙련도로 적립돼야 한다.")

	# 적립분은 다음 분기 첫 턴에 지급된다. 지급이 없으면 상한 근처의 고티어
	# 행동이 손해가 되어 "상한 직전에는 저티어를 반복하라"가 최적 플레이가 된다.
	var rest := {"id": "r", "cost": {}, "category": "rest", "tier": "basic"}
	var same_term := s.duplicate(true)
	same_term["turn"] = 5
	var stay := SaTurn.resolve(same_term, rest, apt, SaRng.new(2))
	_check((stay["mastery_released"] as Dictionary).is_empty(),
		"분기 경계가 아닌 턴에는 지급이 없어야 한다.")
	_check(is_equal_approx(float(((stay["state"] as Dictionary)["mastery_bank"] as Dictionary)
		.get(SaStatKeys.INTELLECT, 0.0)), banked),
		"분기 안에서는 적립분이 그대로 남아 있어야 한다.")

	var crossing := s.duplicate(true)
	crossing["turn"] = 9  # 1분기 마지막 턴. 다음 턴이 2분기다.
	var before_stat := int((crossing["stats"] as Dictionary)[SaStatKeys.INTELLECT])
	var crossed := SaTurn.resolve(crossing, rest, apt, SaRng.new(3))
	var after: Dictionary = crossed["state"]
	var released: Dictionary = crossed["mastery_released"]
	_check(int(released.get(SaStatKeys.INTELLECT, 0)) == int(roundf(banked)),
		"분기 경계에서 적립분이 지급돼야 한다. 적립 %.2f, 지급 %d"
			% [banked, int(released.get(SaStatKeys.INTELLECT, 0))])
	_check(int((after["stats"] as Dictionary)[SaStatKeys.INTELLECT])
		== before_stat + int(roundf(banked)),
		"지급분이 스탯에 실제로 더해져야 한다.")
	_check(is_equal_approx(float((after["mastery_bank"] as Dictionary)
		.get(SaStatKeys.INTELLECT, 0.0)), 0.0),
		"지급 후 적립분은 0 이 돼야 한다.")

	# 새 분기 상한을 넘는 몫은 버린다. 재적립하면 영원히 이월돼 분기 상한이
	# 유예에 지나지 않게 된다.
	var overflowing := SaResources.new_state(1)
	overflowing["turn"] = 9
	(overflowing["stats"] as Dictionary)[SaStatKeys.INTELLECT] = 69
	(overflowing["mastery_bank"] as Dictionary)[SaStatKeys.INTELLECT] = 12.0
	var capped: Dictionary = SaTurn.resolve(overflowing, rest, apt, SaRng.new(4))
	var capped_state: Dictionary = capped["state"]
	_check(int((capped_state["stats"] as Dictionary)[SaStatKeys.INTELLECT])
		== SaGrowthCurve.term_ceiling(10),
		"지급은 새 분기 상한 70 을 넘지 못한다. 실제: %d"
			% int((capped_state["stats"] as Dictionary)[SaStatKeys.INTELLECT]))
	_check(is_equal_approx(float((capped_state["mastery_bank"] as Dictionary)
		.get(SaStatKeys.INTELLECT, 0.0)), 0.0),
		"상한에 막힌 몫은 버려지고 재적립되지 않아야 한다.")

## 미충족 선택지는 숨기지 않고 사유와 함께 노출한다.
func _test_event_choice_gating() -> void:
	var state := SaResources.new_state(1)
	(state["affinity"] as Dictionary)["harin"] = 10
	var locked := {"id":"b","requirements":[{"type":"affinity","npc":"harin","target":25}],
		"locked_reason":"하린과 아직 그렇게 친하지 않다","cost":{},"outcomes":[]}
	var avail := SaEventResolution.choice_availability(state, locked)
	_check(not bool(avail["ok"]), "호감 미달 선택지는 잠겨야 한다.")
	_check(String(avail["reason"]) != "", "잠긴 선택지는 사유를 노출해야 한다.")

	(state["affinity"] as Dictionary)["harin"] = 30
	_check(bool(SaEventResolution.choice_availability(state, locked)["ok"]),
		"호감을 채우면 열려야 한다.")

	var costly := {"id":"c","requirements":[],"cost":{"gold":-99999},"outcomes":[]}
	_check(not bool(SaEventResolution.choice_availability(state, costly)["ok"]),
		"감당 못 하는 비용은 잠겨야 한다.")

## 판정이 있는 선택지는 성공·실패가 서로 다른 결과를 낸다.
func _test_event_check_branches() -> void:
	var state := SaResources.new_state(1)
	(state["stats"] as Dictionary)["commerce"] = 60
	var high := SaEventResolution.success_chance(state, {"stat":"commerce","difficulty":35})
	(state["stats"] as Dictionary)["commerce"] = 10
	var low := SaEventResolution.success_chance(state, {"stat":"commerce","difficulty":35})
	_check(high > low, "스탯이 높을수록 성공 확률이 높아야 한다. %.2f vs %.2f" % [high, low])
	_check(high <= 0.95 and low >= 0.05, "성공 확률은 [0.05, 0.95] 로 클램프돼야 한다.")

	var ev := {"id":"e1","choices":[]}
	var choice := {"id":"a","requirements":[],"cost":{"energy":-10},
		"check":{"stat":"commerce","difficulty":0},
		"outcomes":[
			{"kind":"success","result_text":"성공했다","effects":{"gold":90}},
			{"kind":"failure","result_text":"실패했다","effects":{"gold":20}}]}
	var r := SaEventResolution.apply(state, ev, choice, SaRng.new(1))
	_check(["success","failure"].has(String(r["kind"])), "판정 결과는 success 또는 failure 여야 한다.")
	_check(String(r["result_text"]) != "", "결과문이 비면 안 된다.")
	var seen: Dictionary = (r["state"] as Dictionary)["seen_events"]
	_check(seen.has("e1"), "발동한 이벤트는 seen_events 에 기록돼야 한다.")

	# once_per_run 은 두 번 뽑히지 않는다
	var once := [{"id":"e1","once_per_run":true,"requirements":[],"exclusions":[],"weight":1,"choices":[]}]
	_check(SaEventResolution.eligible(r["state"], once).is_empty(),
		"once_per_run 이벤트는 재발동하지 않아야 한다.")

## 모든 상태이상에 도달 가능한 탈출 경로가 있어야 한다.
## 구현 누락으로 부진이 영구 지속돼 슬럼프를 반복 유발한 적이 있다.
## (7시드 시뮬레이션에서 슬럼프 진입 23회 → 탈출 구현 후 9회)
func _test_every_condition_has_exit() -> void:
	# 부진: 휴식 2턴 연속으로 탈출
	var s := SaResources.new_state(1)
	(s["conditions"] as Array).append(SaRisk.COND_SLUMP_LIGHT)
	s["consecutive_rests"] = 2
	_check(SaRisk.exiting_conditions(s, true, SaRisk.OUTCOME_OK).has(SaRisk.COND_SLUMP_LIGHT),
		"부진은 휴식 2턴으로 탈출해야 한다.")

	# 부진: 대성공으로도 탈출
	var s2 := SaResources.new_state(1)
	(s2["conditions"] as Array).append(SaRisk.COND_SLUMP_LIGHT)
	_check(SaRisk.exiting_conditions(s2, false, SaRisk.OUTCOME_CRIT).has(SaRisk.COND_SLUMP_LIGHT),
		"부진은 대성공으로도 탈출해야 한다.")

	# 슬럼프: 휴식 3턴 연속
	var s3 := SaResources.new_state(1)
	(s3["conditions"] as Array).append(SaRisk.COND_SLUMP)
	s3["consecutive_rests"] = 3
	_check(SaRisk.exiting_conditions(s3, true, SaRisk.OUTCOME_OK).has(SaRisk.COND_SLUMP),
		"슬럼프는 휴식 3턴으로 탈출해야 한다.")

	# 부상: 3턴 경과
	var s4 := SaResources.new_state(1)
	(s4["conditions"] as Array).append(SaRisk.COND_INJURY)
	s4["injury_turns"] = 3
	_check(SaRisk.exiting_conditions(s4, false, SaRisk.OUTCOME_OK).has(SaRisk.COND_INJURY),
		"부상은 3턴 경과로 탈출해야 한다.")

	# 평판 추락: 평판 15 회복
	var s5 := SaResources.new_state(1)
	(s5["conditions"] as Array).append(SaRisk.COND_DISGRACE)
	s5["reputation"] = 15
	_check(SaRisk.exiting_conditions(s5, false, SaRisk.OUTCOME_OK).has(SaRisk.COND_DISGRACE),
		"평판 추락은 평판 15 회복으로 탈출해야 한다.")

	# 번아웃은 강제 소모 후 자동 해제된다(turn.gd 의 _resolve_burnout).
	# 낙제는 의도적으로 탈출이 없다 — 이번 런의 band 4 를 영구 잠근다.
	_check(not SaRisk.exiting_conditions(SaResources.new_state(1), true, SaRisk.OUTCOME_OK).has(SaRisk.COND_FAILED),
		"낙제는 탈출 경로가 없어야 한다(설계상 의도).")

	# 탈출 조건 미충족 시에는 나가지 않아야 한다
	var s6 := SaResources.new_state(1)
	(s6["conditions"] as Array).append(SaRisk.COND_SLUMP_LIGHT)
	s6["consecutive_rests"] = 1
	_check(SaRisk.exiting_conditions(s6, true, SaRisk.OUTCOME_OK).is_empty(),
		"휴식 1턴만으로는 부진에서 나가면 안 된다.")

## 설계의 핵심 주장: 어떤 스탯도 턴 29 이전에 100 에 도달할 수 없다.
## 최대 집중 플레이어(재능 B, 전부 성공, 보통 컨디션, 비전 최단 해금)를 시뮬레이션한다.
func _test_no_early_cap() -> void:
	var value := 10.0
	var reached_at := 0
	for turn in range(1, SaGrowthCurve.TURNS_TOTAL + 1):
		var tier := "basic"
		if turn >= 19 and value >= 65.0:
			tier = "arcane"
		elif value >= 40.0:
			tier = "advanced"
		value = minf(100.0, value + SaGrowthCurve.gain(value, turn, tier, 1.0, 1.0, 1.0))
		if value >= 100.0 and reached_at == 0:
			reached_at = turn
	_check(reached_at == 0 or reached_at >= 29,
		"턴 29 이전에 100 도달은 불가능해야 한다. 실제 도달 턴: %d" % reached_at)

## 진로 선언이 상태에 남아야 후반 콘텐츠 전체가 열린다.
##
## 선언 이벤트가 플래그만 남기던 시절에는 state.declared_path 가 런 내내 빈
## 문자열이었다. 그래서 진로 전용 액션 6종이 영구 잠김이고, declared 요건
## 엔딩 12건이 도달 불가였으며, 계절 심사의 진로 보너스가 한 번도 안 붙었다.
func _test_declared_path_is_recorded() -> void:
	var state := SaResources.new_state(1)
	state["turn"] = 19
	var event := {"id": "path.declaration", "choices": []}
	var choice := {
		"id": "star", "requirements": [], "cost": {}, "check": null,
		"outcomes": [{"kind": "only", "result_text": "별의 길이라 적었다",
			"effects": {"flags": {"path:star": 1}, "declared_path": "star"}}],
	}
	var star_action := {"id": "path.star", "stat": SaStatKeys.STARSENSE, "tier": "arcane",
		"cost": {}, "unlock": {"declared_path": "star", "month_min": 7}}
	var craft_action := {"id": "path.craft", "stat": SaStatKeys.CRAFT, "tier": "arcane",
		"cost": {}, "unlock": {"declared_path": "craft", "month_min": 7}}
	var star_ending := {"code": "observatory-director", "band": 3, "requirements": [
		{"type": "stat", "stat": SaStatKeys.STARSENSE, "target": 46},
		{"type": "declared", "path": "star"}]}

	_check(not bool(SaResources.unlock_status(state, star_action)["ok"]),
		"선언 전에는 진로 전용 액션이 잠겨 있어야 한다.")
	_check(not SaEndingRequirements.all_satisfied(state, star_ending["requirements"]),
		"선언 전에는 declared 요건 엔딩이 충족되면 안 된다.")

	var after: Dictionary = SaEventResolution.apply(state, event, choice, SaRng.new(1))["state"]
	_check(String(after.get("declared_path", "")) == "star",
		"선언 선택지는 state.declared_path 에 기록돼야 한다. 실제: '%s'"
			% String(after.get("declared_path", "")))
	_check(int((after["flags"] as Dictionary).get("path:star", 0)) == 1,
		"서사·엔딩 호환용 플래그도 함께 남아야 한다.")

	_check(bool(SaResources.unlock_status(after, star_action)["ok"]),
		"선언한 진로의 전용 액션은 열려야 한다.")
	_check(not bool(SaResources.unlock_status(after, craft_action)["ok"]),
		"선언하지 않은 진로의 전용 액션은 계속 잠겨야 한다.")

	(after["stats"] as Dictionary)[SaStatKeys.STARSENSE] = 50
	_check(SaEndingRequirements.all_satisfied(after, star_ending["requirements"]),
		"선언 후에는 declared 요건 엔딩이 충족될 수 있어야 한다.")

	# 계절 심사 보너스는 선언 여부로만 갈린다.
	# 난이도는 양쪽 다 클램프([0.05, 0.95]) 밖으로 나가지 않는 값을 쓴다.
	var check := {"kind": "milestone", "stat": SaStatKeys.STARSENSE, "difficulty": 60}
	var before_state := state.duplicate(true)
	(before_state["stats"] as Dictionary)[SaStatKeys.STARSENSE] = 50
	var gap := SaEventResolution.success_chance(after, check) \
		- SaEventResolution.success_chance(before_state, check)
	_check(is_equal_approx(gap, SaEventResolution.MILESTONE_PATH_BONUS / 20.0),
		"심사 확률이 선언 전후로 진로 보너스만큼 차이나야 한다. 실제 차이: %.3f" % gap)

	# 진로→엔딩 표는 코드가 아니라 엔딩 데이터에서 나온다.
	var endings := [star_ending,
		{"code": "quiet-life", "band": 0, "requirements": [{"type": "stat", "stat": SaStatKeys.STARSENSE, "target": 1}]},
		{"code": "master-of-forge", "band": 4, "requirements": [{"type": "declared", "path": "craft"}]}]
	_check(SaEndingJudgement.declared_ending_code(after, endings, "star") == "observatory-director",
		"선언한 진로의 엔딩 코드는 엔딩 데이터에서 유도돼야 한다.")
	_check(SaEndingJudgement.declared_ending_code(after, endings, "craft") == "",
		"충족하지 못한 진로 엔딩은 보너스 대상이 아니다.")
	_check(SaEndingJudgement.declared_ending_code(after, endings, "") == "",
		"선언하지 않았으면 진로 엔딩 코드가 없다.")

## 낙제한 런은 band 4 엔딩을 받을 수 없다.
##
## SaRisk.locks_legendary() 는 선언만 돼 있고 호출하는 곳이 없었다. 그래서
## 계절 심사 2회 낙방으로 낙제한 런도 스탯만 채우면 최상위 엔딩을 받았다.
func _test_failed_locks_legendary() -> void:
	var endings := [
		{"code": "legend", "band": 4, "requirements": [
			{"type": "stat", "stat": SaStatKeys.INTELLECT, "target": 60}]},
		{"code": "solid", "band": 3, "requirements": [
			{"type": "stat", "stat": SaStatKeys.INTELLECT, "target": 50}]},
	]
	var clean := SaResources.new_state(1)
	(clean["stats"] as Dictionary)[SaStatKeys.INTELLECT] = 70
	_check(SaEndingJudgement.judge(clean, endings) == "legend",
		"낙제가 아니면 band 4 엔딩이 그대로 나와야 한다.")

	var failed := clean.duplicate(true)
	(failed["conditions"] as Array).append(SaRisk.COND_FAILED)
	_check(SaEndingJudgement.judge(failed, endings) == "solid",
		"낙제 상태에서는 band 4 가 후보에서 빠지고 band 3 이 나와야 한다.")

	# band 4 만 남은 목록이면 걸러진 뒤 폴백으로 떨어진다.
	_check(SaEndingJudgement.judge(failed, [endings[0]]) == SaEndingJudgement.FALLBACK_CODE,
		"낙제 상태에서 후보가 전부 걸러지면 폴백을 돌려줘야 한다.")

	# 낙제가 아닌 상태의 판정은 수정 전과 같아야 한다 — 잠금이 band 3 이하를
	# 건드리면 기존 엔딩 26종의 판정이 통째로 흔들린다.
	var low := SaResources.new_state(1)
	(low["stats"] as Dictionary)[SaStatKeys.INTELLECT] = 55
	var low_failed := low.duplicate(true)
	(low_failed["conditions"] as Array).append(SaRisk.COND_FAILED)
	_check(SaEndingJudgement.judge(low, endings) == SaEndingJudgement.judge(low_failed, endings),
		"band 3 이하만 충족한 상태는 낙제 여부와 무관하게 같은 엔딩이어야 한다.")
	_check(SaEndingJudgement.LEGENDARY_BAND == 4,
		"잠금 임계값은 band 4 다.")

## 빚은 갚을 수 있어야 한다.
##
## 예전에는 in_debt 를 true 로 만드는 코드만 있고 false 로 되돌리는 경로가
## 없었다. 3개월차에 한 번 미납하면 남은 33턴 동안 매 턴 평판 -1 이 확정돼
## 평판 추락으로 이어지는 단방향 데스 스파이럴이 됐다.
## DEBT_WORK_MULTIPLIER 도 정의만 되고 어디서도 곱해지지 않았다.
func _test_debt_is_repayable() -> void:
	var apt := {}
	for k in SaStatKeys.ALL: apt[k] = "B"
	var work := {"id": "w", "cost": {"gold": 40, "energy": -8}, "category": "work",
		"tier": "basic", "stat": SaStatKeys.COMMERCE}
	var rest := {"id": "r", "cost": {}, "category": "rest", "tier": "basic"}

	# 골드 0 으로 월말을 지나면 빚이 생기고 밀린 금액은 수업료와 같다.
	var broke := SaResources.new_state(1)
	broke["turn"] = 3  # 월말
	broke["gold"] = 0
	var after: Dictionary = SaTurn.resolve(broke, rest, apt, SaRng.new(1))["state"]
	_check(bool(after.get("in_debt", false)), "골드 0 으로 월말을 지나면 빚이 생겨야 한다.")
	_check(int(after.get("debt_amount", 0)) == SaResources.MONTHLY_TUITION,
		"밀린 금액은 수업료와 같아야 한다. 실제: %d" % int(after.get("debt_amount", 0)))

	# 빚 상태의 수입은 DEBT_WORK_MULTIPLIER 만큼 깎인다. 지출은 그대로다.
	var earning := after.duplicate(true)
	earning["turn"] = 4
	earning["gold"] = 0
	earning["energy"] = 80
	var earned: Dictionary = SaTurn.resolve(earning, work, apt, SaRng.new(2))["state"]
	var expected := int(floor(40.0 * SaResources.DEBT_WORK_MULTIPLIER))
	_check(int(earned.get("gold", 0)) == expected,
		"빚 상태의 수입은 x%.2f 여야 한다. 기대 %d, 실제 %d"
			% [SaResources.DEBT_WORK_MULTIPLIER, expected, int(earned.get("gold", 0))])
	var spending := earning.duplicate(true)
	spending["gold"] = 100
	var spent: Dictionary = SaTurn.resolve(spending,
		{"id": "s", "cost": {"gold": -30}, "category": "lesson", "tier": "basic",
		"stat": SaStatKeys.INTELLECT}, apt, SaRng.new(3))["state"]
	_check(int(spent.get("gold", 0)) == 70, "지출에는 배수가 붙지 않아야 한다. 실제: %d"
		% int(spent.get("gold", 0)))

	# 다음 월말에 당월 수업료 + 밀린 금액을 낼 수 있으면 빚이 청산된다.
	var solvent := after.duplicate(true)
	solvent["turn"] = 6
	solvent["gold"] = SaResources.MONTHLY_TUITION * 3
	var cleared_result := SaTurn.resolve(solvent, rest, apt, SaRng.new(4))
	var cleared: Dictionary = cleared_result["state"]
	_check(not bool(cleared.get("in_debt", true)), "전액을 내면 빚이 청산돼야 한다.")
	_check(int(cleared.get("debt_amount", -1)) == 0, "청산 후 밀린 금액은 0 이어야 한다.")
	_check(int(cleared_result["tuition_paid"]) == SaResources.MONTHLY_TUITION * 2,
		"청산 턴에는 당월 수업료와 밀린 금액을 함께 낸다.")

	# 청산 이후 턴에는 빚 때문에 평판이 깎이지 않는다.
	var quiet := cleared.duplicate(true)
	quiet["reputation"] = 30
	var next_turn: Dictionary = SaTurn.resolve(quiet, rest, apt, SaRng.new(5))["state"]
	_check(int(next_turn.get("reputation", 0)) >= 30,
		"청산 이후에는 빚 페널티가 붙지 않아야 한다. 실제: %d" % int(next_turn.get("reputation", 0)))

	# 부분 상환: 낼 수 있는 만큼 내고 나머지가 남는다. 전액이 아니면 한 푼도
	# 못 갚게 하면 밀린 금액이 커질수록 청산 문턱이 계단식으로 멀어진다.
	var partial := after.duplicate(true)
	partial["turn"] = 6
	partial["gold"] = 20
	var partial_result := SaTurn.resolve(partial, rest, apt, SaRng.new(6))
	var partial_state: Dictionary = partial_result["state"]
	_check(int(partial_result["tuition_paid"]) == 20, "가진 골드 전액이 상환에 쓰여야 한다.")
	_check(int(partial_state.get("gold", -1)) == 0, "부분 상환 후 골드는 0 이다.")
	_check(int(partial_state.get("debt_amount", 0)) == SaResources.MONTHLY_TUITION * 2 - 20,
		"남은 미납분이 밀린 금액으로 이월돼야 한다. 실제: %d"
			% int(partial_state.get("debt_amount", 0)))
	_check(bool(partial_state.get("in_debt", false)), "다 갚지 못했으면 빚 상태가 유지된다.")

## 턴을 건너뛰어도 월말 수업료는 청구된다.
##
## 번아웃은 resolve() 초입에서 조기 반환해 월말 블록을 건너뛰었고, turn + 2 가
## 월말 턴을 뛰어넘으면 그 달 수업료가 통째로 사라졌다. 스트레스를 높게 유지하는
## 플레이가 지출을 줄이는 보상을 받아 12개월 480금화 설계에 구멍이 났다.
func _test_skipped_turns_still_pay_tuition() -> void:
	var apt := {}
	for k in SaStatKeys.ALL: apt[k] = "B"
	var rest := {"id": "r", "cost": {}, "category": "rest", "tier": "basic"}

	# 턴 5 에서 번아웃 → 턴 7 도착. 건너뛴 턴 6 의 수업료가 청구된다.
	var burnt := SaResources.new_state(1)
	burnt["turn"] = 5
	burnt["gold"] = 200
	(burnt["conditions"] as Array).append(SaRisk.COND_BURNOUT)
	var jumped := SaTurn.resolve(burnt, rest, apt, SaRng.new(1))
	var after: Dictionary = jumped["state"]
	_check(int(after["turn"]) == 7, "번아웃은 2턴을 소모한다. 실제 도착 턴: %d" % int(after["turn"]))
	_check(bool(jumped["tuition_charged"]),
		"건너뛴 구간에 월말이 있으면 tuition_charged 가 참이어야 한다.")
	_check(int(after["gold"]) == 200 - SaResources.MONTHLY_TUITION,
		"턴 6 의 수업료가 청구돼야 한다. 실제 골드: %d" % int(after["gold"]))

	# 월말 턴에서 번아웃해도 그 달 수업료는 청구된다.
	var burnt_at_month_end := SaResources.new_state(1)
	burnt_at_month_end["turn"] = 6
	burnt_at_month_end["gold"] = 200
	(burnt_at_month_end["conditions"] as Array).append(SaRisk.COND_BURNOUT)
	var at_end: Dictionary = SaTurn.resolve(burnt_at_month_end, rest, apt, SaRng.new(2))["state"]
	_check(int(at_end["gold"]) == 200 - SaResources.MONTHLY_TUITION,
		"월말 번아웃도 청구돼야 한다. 실제 골드: %d" % int(at_end["gold"]))

	# 골드가 없으면 번아웃 경로에서도 빚으로 넘어간다.
	var broke := SaResources.new_state(1)
	broke["turn"] = 5
	broke["gold"] = 0
	(broke["conditions"] as Array).append(SaRisk.COND_BURNOUT)
	var indebted: Dictionary = SaTurn.resolve(broke, rest, apt, SaRng.new(3))["state"]
	_check(bool(indebted.get("in_debt", false)), "번아웃 경로에서도 미납은 빚이 된다.")
	_check(int(indebted.get("debt_amount", 0)) == SaResources.MONTHLY_TUITION,
		"밀린 금액이 수업료와 같아야 한다. 실제: %d" % int(indebted.get("debt_amount", 0)))

	# 이벤트의 cost.turn_skip 도 같은 정산을 탄다.
	var event_state := SaResources.new_state(1)
	event_state["turn"] = 6
	event_state["gold"] = 200
	var skipping := {"id": "c", "requirements": [], "cost": {"turn_skip": 2}, "check": null,
		"outcomes": [{"kind": "only", "result_text": "앓아누웠다", "effects": {}}]}
	var skipped: Dictionary = SaEventResolution.apply(
		event_state, {"id": "e", "choices": []}, skipping, SaRng.new(4))["state"]
	_check(int(skipped["turn"]) == 8, "turn_skip 2 는 두 턴을 건너뛴다.")
	_check(int(skipped["gold"]) == 200 - SaResources.MONTHLY_TUITION,
		"건너뛴 턴 6 의 수업료가 청구돼야 한다. 실제 골드: %d" % int(skipped["gold"]))

	# 같은 월말이 두 번 청구되지 않는다 — 정상 해석이 청구한 턴 6 을
	# 뒤따르는 이벤트가 다시 청구하면 안 된다.
	var normal := SaResources.new_state(1)
	normal["turn"] = 6
	normal["gold"] = 200
	var played: Dictionary = SaTurn.resolve(normal, rest, apt, SaRng.new(5))["state"]
	var after_event: Dictionary = SaEventResolution.apply(
		played, {"id": "e2", "choices": []},
		{"id": "c2", "requirements": [], "cost": {"turn_skip": 1}, "check": null,
		"outcomes": [{"kind": "only", "result_text": "하루가 갔다", "effects": {}}]},
		SaRng.new(6))["state"]
	_check(int(after_event["gold"]) == 200 - SaResources.MONTHLY_TUITION,
		"턴 6 은 한 번만 청구돼야 한다. 실제 골드: %d" % int(after_event["gold"]))

	# 번아웃 없이 정상 진행하면 12개월 동안 11회(마지막 턴 제외) 청구된다.
	var run := SaResources.new_state(1)
	run["gold"] = 9999
	while int(run.get("turn", 1)) <= SaGrowthCurve.TURNS_TOTAL:
		run = SaTurn.resolve(run, rest, apt, SaRng.new(7))["state"]
	var spent := 9999 - int(run["gold"])
	_check(spent == SaResources.MONTHLY_TUITION * 11,
		"정상 런의 총 수업료는 11회분이어야 한다. 실제: %d" % spent)

## 각성은 재능 등급을 영구히 올린다.
##
## SaAptitude.promote() 는 정의돼 있었지만 호출부가 0 이었다. 런당 1회뿐인
## 최상위 결과가 그 턴의 3.0배 획득으로 끝나고, 남은 턴의 성장률·안정성
## 상방이 통째로 사라져 있었다.
func _test_awaken_promotes_talent() -> void:
	var apt := {}
	for k in SaStatKeys.ALL: apt[k] = "B"
	var lesson := {"id": "l", "cost": {"gold": -20, "energy": -8, "stress": 5},
		"tier": "basic", "stat": SaStatKeys.INTELLECT, "npc_tag": "", "flag": "lesson:x"}

	# 각성 결과를 직접 만들어 승급 경로만 본다. 각성은 확률 0.02 라
	# 난수에 기대면 테스트가 시드 사냥이 된다.
	var promoted := SaAptitude.promote(apt, SaStatKeys.INTELLECT)
	_check(String(promoted[SaStatKeys.INTELLECT]) == "A",
		"각성은 등급을 한 단계 올린다. 실제: %s" % String(promoted[SaStatKeys.INTELLECT]))
	_check(SaAptitude.multiplier(promoted, SaStatKeys.INTELLECT)
		> SaAptitude.multiplier(apt, SaStatKeys.INTELLECT),
		"승급하면 성장 배율이 커져야 한다.")
	_check(SaAptitude.roll_bonus(promoted, SaStatKeys.INTELLECT)
		> SaAptitude.roll_bonus(apt, SaStatKeys.INTELLECT),
		"승급하면 판정 보정이 커져야 한다.")

	# S 는 상한이다. 크래시 없이 그대로 유지된다.
	var maxed := {}
	for k in SaStatKeys.ALL: maxed[k] = "S"
	_check(String(SaAptitude.promote(maxed, SaStatKeys.INTELLECT)[SaStatKeys.INTELLECT]) == "S",
		"S 등급에서 각성해도 S 를 유지해야 한다.")

	# resolve() 는 승급 여부와 무관하게 늘 재능을 돌려준다. 호출자가
	# 이것만 보고 갱신할 수 있어야 한다.
	var state := SaResources.new_state(1)
	var result := SaTurn.resolve(state, lesson, apt, SaRng.new(1))
	_check((result as Dictionary).has("aptitude"),
		"resolve() 는 재능을 결과에 담아야 한다.")
	if not bool(result["promoted_talent"]):
		_check(result["aptitude"] == apt,
			"각성이 없으면 재능이 그대로여야 한다.")

	# 승급된 재능으로 같은 행동을 하면 더 많이 자란다.
	var plain := SaTurn.resolve(state, lesson, apt, SaRng.new(9))
	var boosted := SaTurn.resolve(state, lesson, promoted, SaRng.new(9))
	_check(int((boosted["gains"] as Dictionary).get(SaStatKeys.INTELLECT, 0))
		> int((plain["gains"] as Dictionary).get(SaStatKeys.INTELLECT, 0)),
		"승급 후 성장량이 커야 한다. %d vs %d"
			% [int((boosted["gains"] as Dictionary).get(SaStatKeys.INTELLECT, 0)),
			   int((plain["gains"] as Dictionary).get(SaStatKeys.INTELLECT, 0))])

	# 런당 1회. awakened 가 서면 roll_outcome 이 각성을 더 내지 않는다.
	var spent := SaResources.new_state(1)
	spent["awakened"] = true
	var awakened_again := false
	var rng := SaRng.new(7)
	for i in 400:
		if SaRisk.roll_outcome(rng, 10, 90, "basic", 0.0, 0, false, SaRisk.AWAKEN_CHANCE) \
			== SaRisk.OUTCOME_AWAKEN:
			awakened_again = true
			break
	_check(not awakened_again, "각성은 런당 1회여야 한다.")

	# 휴식처럼 stat 이 비어 있으면 올릴 대상이 없다.
	var rest := {"id": "r", "cost": {}, "category": "rest", "tier": "basic"}
	var rested := SaTurn.resolve(SaResources.new_state(1), rest, apt, SaRng.new(3))
	_check(not bool(rested["promoted_talent"]), "stat 이 없는 행동은 승급하지 않는다.")
	_check(rested["aptitude"] == apt, "stat 이 없는 행동은 재능을 바꾸지 않는다.")

	# 번아웃 경로는 재능을 건드리지 않는다 — 결과에 aptitude 를 담지 않아
	# 호출자의 기존 값이 그대로 남는다.
	var burnt := SaResources.new_state(1)
	(burnt["conditions"] as Array).append(SaRisk.COND_BURNOUT)
	var skipped := SaTurn.resolve(burnt, lesson, apt, SaRng.new(4))
	_check(not (skipped as Dictionary).has("aptitude"),
		"번아웃 경로는 재능을 돌려주지 않아야 한다.")
	_check(not bool(skipped["promoted_talent"]), "번아웃 경로는 승급하지 않는다.")
