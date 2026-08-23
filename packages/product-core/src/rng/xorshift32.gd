class_name SaRng
extends RefCounted
## 결정론적 난수. 시드를 명시적으로 받고 상태를 스스로 들고 다닌다.
##
## 코어는 Time 을 모른다. 시드는 항상 주입된다. 이것이 밸런스 하네스를
## 결정론적으로 만드는 이유다.
##
## xorshift32 를 쓴다. GDScript 정수는 64bit 부호 있는 값이라 음수 우측
## 시프트가 산술 시프트가 된다. 32bit 범위 안에서만 연산해 그 함정을 피한다.
## 게임플레이 난수에 필요한 성질(결정론·재현성·균등성)은 충분히 만족한다.

const MASK := 0xFFFFFFFF

var _state: int

func _init(seed_value: int = 1) -> void:
	# 0 은 xorshift 의 고정점이라 절대 허용하지 않는다.
	_state = (seed_value & MASK)
	if _state == 0:
		_state = 0x9E3779B9

func state() -> int:
	return _state

func next_uint() -> int:
	var x := _state
	x = (x ^ (x << 13)) & MASK
	x = x ^ (x >> 17)
	x = (x ^ (x << 5)) & MASK
	_state = x
	return x

## [0.0, 1.0)
func next_float() -> float:
	return float(next_uint()) / 4294967296.0

## [lo, hi] 정수 균등
func next_int_range(lo: int, hi: int) -> int:
	if hi <= lo:
		return lo
	return lo + int(next_float() * float(hi - lo + 1))

## Fisher-Yates. 원본을 바꾸지 않고 새 배열을 돌려준다.
func shuffled(items: Array) -> Array:
	var out := items.duplicate()
	for i in range(out.size() - 1, 0, -1):
		var j := next_int_range(0, i)
		var tmp: Variant = out[i]
		out[i] = out[j]
		out[j] = tmp
	return out
