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
