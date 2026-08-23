extends SceneTree
## UI 레이아웃 회귀 가드.
##
## 실제로 겪은 버그: SaTurnScreen 을 add_child 한 뒤 set_anchors_preset 을 부르면
## 크기가 (0,0) 으로 남아 화면 전체가 빈 채로 렌더된다. Godot 은 에러를 내지 않는다.
## 스모크 테스트는 인스턴스화만 확인하므로 이걸 못 잡는다.

const MIN_TOUCH := 88.0

var _f := 0
var _failures: Array[String] = []

func _initialize() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	root.add_child(packed.instantiate())

func _process(_d: float) -> bool:
	_f += 1
	if _f == 15:
		_press_first(root)   # 새로 시작 → 턴 화면
	if _f == 45:
		_check()
		if _failures.is_empty():
			print("LAYOUT PASS")
			quit(0)
		else:
			for m in _failures:
				printerr("FAIL: %s" % m)
			quit(1)
	return false

func _check() -> void:
	var main := root.get_child(root.get_child_count() - 1) as Control
	if main == null or main.size.x <= 0.0 or main.size.y <= 0.0:
		_failures.append("루트 화면 크기가 0이다")
		return

	# 턴 화면이 부모를 채워야 한다
	var turn := _find(main, "SaTurnScreen")
	if turn == null:
		_failures.append("턴 화면을 찾지 못했다")
		return
	if turn.size.x < main.size.x * 0.95 or turn.size.y < main.size.y * 0.95:
		_failures.append("턴 화면이 부모를 채우지 않는다: %s vs %s" % [str(turn.size), str(main.size)])

	# 크기가 0 인 Control 이 있으면 안 된다 (렌더는 되는데 안 보이는 상태)
	var zero := 0
	_count_zero(turn, func(): zero += 1)
	if zero > 0:
		_failures.append("크기가 0인 Control 이 %d개 있다" % zero)

	# 터치 타깃 최소 88px
	var small: Array[String] = []
	_check_touch(turn, small)
	if not small.is_empty():
		_failures.append("터치 타깃이 %.0fpx 미만: %s" % [MIN_TOUCH, ", ".join(small)])

	print("루트 %s · 턴 화면 %s · 크기0 %d · 작은 버튼 %d"
		% [str(main.size), str(turn.size), zero, small.size()])

func _find(node: Node, script_name: String) -> Control:
	for c in node.get_children():
		if c is Control and c.get_script() != null:
			var path := String((c.get_script() as Script).resource_path)
			if path.contains("turn_screen"):
				return c as Control
		var found := _find(c, script_name)
		if found != null:
			return found
	return null

func _count_zero(node: Node, bump: Callable) -> void:
	for c in node.get_children():
		if c is Control:
			var ctl := c as Control
			if ctl.visible and ctl.size.x <= 0.0 and ctl.size.y <= 0.0 and ctl.get_child_count() > 0:
				bump.call()
		_count_zero(c, bump)

func _check_touch(node: Node, out: Array[String]) -> void:
	for c in node.get_children():
		if c is Button:
			var b := c as Button
			if b.visible and not b.disabled and b.size.y > 0.0 and b.size.y < MIN_TOUCH:
				# 카드 안의 함께 칩은 보조 어포던스라 예외로 둔다
				if not b.text.begins_with("함께"):
					out.append("%s(%.0f)" % [b.text.substr(0, 8), b.size.y])
		_check_touch(c, out)

func _press_first(n: Node) -> void:
	for c in n.get_children():
		if c is Button and not (c as Button).disabled:
			(c as Button).emit_signal("pressed")
			return
		_press_first(c)
