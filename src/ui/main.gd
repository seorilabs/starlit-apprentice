extends Control
## 화면 스택 루트. 화면은 .tscn 이 아니라 코드로 구성한다.
## .tscn 은 머지 충돌이 심하고, 이식 원본이 이미 명령형이라 번역 단계가 불필요하다.

var _stack: Array[Control] = []

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_show_placeholder()

func _show_placeholder() -> void:
	var label := Label.new()
	label.text = "별빛 견습생"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(label)
	_stack.append(label)

func screen_depth() -> int:
	return _stack.size()
