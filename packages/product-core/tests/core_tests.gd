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
		{"code": "low", "priority": 30, "requirements": [{"type":"stat","stat":"intellect","target":30}]},
		{"code": "high", "requirements": [
			{"type":"stat","stat":"intellect","target":80},
			{"type":"stat","stat":"etiquette","target":70}]},
	]
	var state := {"stats": {"intellect": 90, "etiquette": 80}, "gold": 0, "stress": 0, "flags": {}}
	_check(SaEndingJudgement.judge_legacy(state, endings) == "low",
		"구 판정은 priority 30 때문에 요건이 낮은 엔딩을 고른다(회귀 기준).")
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
	_check(float(bank.get(SaStatKeys.INTELLECT, 0.0)) > 0.0,
		"상한 초과분이 숙련도로 적립돼야 한다.")

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
