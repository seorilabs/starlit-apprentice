class_name SaAptitude
extends RefCounted
## 런당 재능 배정.
##
## 고정 multiset 을 9스탯에 섞어 배정한다. 고정이라 항상 강점 1개와 약점 1개가
## 보장된다 — 올S 도 올D 도 나오지 않는다.
## docs/game-design/02-gdd.md 진행

const GRADE_MULTIPLIER := {"S": 1.35, "A": 1.20, "B": 1.00, "C": 0.85, "D": 0.70}
## S1 · A2 · B4 · C1 · D1 = 9
const GRADE_MULTISET: Array[String] = ["S", "A", "A", "B", "B", "B", "B", "C", "D"]

## 재능 등급이 실패/대성공 확률에 주는 보정
const GRADE_ROLL_BONUS := {"S": 0.06, "A": 0.03, "B": 0.0, "C": -0.03, "D": -0.06}

static func assign(rng: SaRng) -> Dictionary:
	var grades := rng.shuffled(GRADE_MULTISET)
	var out := {}
	for i in SaStatKeys.ALL.size():
		out[SaStatKeys.ALL[i]] = String(grades[i])
	return out

static func multiplier(grades: Dictionary, stat: String) -> float:
	return float(GRADE_MULTIPLIER.get(String(grades.get(stat, "B")), 1.0))

static func roll_bonus(grades: Dictionary, stat: String) -> float:
	return float(GRADE_ROLL_BONUS.get(String(grades.get(stat, "B")), 0.0))

## 각성 시 해당 스탯 등급을 한 단계 올린다. 런당 1회.
static func promote(grades: Dictionary, stat: String) -> Dictionary:
	const ORDER := ["D", "C", "B", "A", "S"]
	var out := grades.duplicate()
	var current := String(out.get(stat, "B"))
	var index := ORDER.find(current)
	if index >= 0 and index < ORDER.size() - 1:
		out[stat] = ORDER[index + 1]
	return out
