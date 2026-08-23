extends SceneTree
## 코어 순수 테스트 헤드리스 러너.

func _initialize() -> void:
	var suite := SaCoreTests.new()
	var failures := suite.run_all()
	if failures.is_empty():
		print("CORE TESTS PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	print("CORE TESTS FAIL: %d" % failures.size())
	quit(1)
