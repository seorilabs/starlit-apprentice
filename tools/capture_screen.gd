extends SceneTree
## 실제 화면을 PNG 로 캡처한다. 대시보드 금지 게이트는 눈으로 판정해야 한다.
## 사용: godot --path . --script res://tools/capture_screen.gd -- <out.png> [턴 수]

var _frames := 0
var _out := "user://screen.png"
var _advance := 0

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() >= 1: _out = args[0]
	if args.size() >= 2: _advance = int(args[1])
	var packed := load("res://scenes/main.tscn") as PackedScene
	root.add_child(packed.instantiate())

func _process(_delta: float) -> bool:
	_frames += 1
	if _frames == 12:
		_click_first_button(root)     # 새로 시작
	if _frames > 12 and _advance > 0 and _frames % 10 == 0:
		_advance -= 1
		_click_first_button(root)     # 행동 카드 하나
	if _frames >= 24 + _advance * 10:
		var img := root.get_texture().get_image()
		img.save_png(_out)
		print("saved %s" % _out)
		quit(0)
	return false

func _click_first_button(node: Node) -> void:
	for c in node.get_children():
		if c is Button and not (c as Button).disabled:
			(c as Button).emit_signal("pressed")
			return
		_click_first_button(c)
