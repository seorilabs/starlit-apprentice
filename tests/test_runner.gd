extends SceneTree
## 스모크. 모든 autoload 가 살아 있고 메인 씬이 인스턴스화되는지 확인한다.
## Godot 은 파스 에러에도 exit 0 을 내므로 이 씬이 실제 검증이다.

func _initialize() -> void:
	var failures: Array[String] = []

	for name in ["Events", "Ui", "GameData", "Platform", "Profile", "Audio", "Analytics"]:
		if root.get_node_or_null(NodePath(name)) == null:
			failures.append("autoload 누락: %s" % name)

	var packed := load("res://scenes/main.tscn")
	if packed == null:
		failures.append("메인 씬을 로드하지 못했다.")
	else:
		var instance := (packed as PackedScene).instantiate()
		if instance == null:
			failures.append("메인 씬을 인스턴스화하지 못했다.")
		else:
			instance.free()

	# 폰트가 실제로 붙었는지. project.godot 이 아니라 autoload 가 붙이는 경로다.
	var ui := root.get_node_or_null(^"Ui")
	if ui != null and ui.get("theme") != null:
		var theme: Theme = ui.get("theme")
		if theme.default_font == null:
			failures.append("기본 폰트가 Theme 에 부착되지 않았다.")

	if failures.is_empty():
		print("SMOKE PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)
