extends SceneTree
func _initialize() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	root.add_child(packed.instantiate())

var _f := 0
func _process(_d: float) -> bool:
	_f += 1
	if _f == 15:
		_click(root)
	if _f == 40:
		_dump(root, 0)
		quit(0)
	return false

func _click(n: Node) -> void:
	for c in n.get_children():
		if c is Button and not (c as Button).disabled:
			(c as Button).emit_signal("pressed"); return
		_click(c)

func _dump(n: Node, depth: int) -> void:
	if n is Control:
		var c := n as Control
		print("%s%s [%s] size=%s pos=%s vis=%s" % ["  ".repeat(depth),
			c.name, c.get_class(), str(c.size), str(c.position), str(c.visible)])
	if depth < 4:
		for ch in n.get_children():
			_dump(ch, depth + 1)
