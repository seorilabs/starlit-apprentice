class_name SaGrowthCurve
extends RefCounted
## 성장 곡선. 조기 캡을 구조적으로 차단하는 분기 상한이 핵심이다.
## docs/game-design/02-gdd.md 진행

const TURNS_TOTAL := 36
const TURNS_PER_MONTH := 3

## 분기 상한. 초과 시 획득이 ×0.12 로 떨어지고 초과분 40% 는 숙련도로 적립된다.
const TERM_CEILINGS: Array[int] = [50, 70, 88, 100]
const OVER_CEILING_FACTOR := 0.12
const MASTERY_BANK_RATE := 0.40

const BASE_BY_TIER := {"basic": 8, "advanced": 11, "arcane": 14}

static func term_index(turn: int) -> int:
	## 턴 1~9 = 0, 10~18 = 1, 19~27 = 2, 28~36 = 3
	return clampi((turn - 1) / 9, 0, 3)

static func term_ceiling(turn: int) -> int:
	return TERM_CEILINGS[term_index(turn)]

static func tier_factor(current: float) -> float:
	if current < 30.0: return 1.00
	if current < 50.0: return 0.85
	if current < 65.0: return 0.70
	if current < 80.0: return 0.55
	if current < 90.0: return 0.38
	return 0.20

static func gain(
	current: float, turn: int, tier: String,
	talent: float, outcome: float, condition: float
) -> float:
	var base: float = float(BASE_BY_TIER.get(tier, BASE_BY_TIER["basic"]))
	var term: float = OVER_CEILING_FACTOR if current >= float(term_ceiling(turn)) else 1.0
	return roundf(base * talent * tier_factor(current) * term * outcome * condition)
