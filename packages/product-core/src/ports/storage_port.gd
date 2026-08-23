class_name SaStoragePort
extends RefCounted
## 저장 포트. 코어는 파일 시스템을 모른다.

func read_run() -> Dictionary:
	return {}

func write_run(_data: Dictionary) -> bool:
	return false

func read_meta() -> Dictionary:
	return {}

func write_meta(_data: Dictionary) -> bool:
	return false
