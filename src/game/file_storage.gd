class_name SaFileStorage
extends SaStoragePort
## 파일 기반 저장 포트 구현.
##
## 코어는 파일 시스템도 JSON 도 모른다(SaStoragePort 주석). 그래서 실제 입출력은
## 전부 여기에 둔다. 코어는 Dictionary 만 주고받는다.
##
## 쓰기는 tmp → rename 으로 한다. 게임은 턴마다 저장하고 모바일은 언제든 프로세스를
## 죽이므로, 쓰다 만 파일이 원본을 덮어쓰면 런 하나가 통째로 날아간다.

var _run_path: String
var _meta_path: String

func _init(run_path: String = "user://run.json", meta_path: String = "user://meta.json") -> void:
	_run_path = run_path
	_meta_path = meta_path

func read_run() -> Dictionary:
	return _read(_run_path)

func write_run(data: Dictionary) -> bool:
	return _write(_run_path, data)

func read_meta() -> Dictionary:
	return _read(_meta_path)

func write_meta(data: Dictionary) -> bool:
	return _write(_meta_path, data)

## 런만 지운다. 메타(별빛 기록)는 런보다 오래 살아야 한다.
func clear_run() -> void:
	for p in [_run_path, _run_path + ".bak", _run_path + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)

func has_run() -> bool:
	return FileAccess.file_exists(_run_path) or FileAccess.file_exists(_run_path + ".bak")

func _read(path: String) -> Dictionary:
	# 본체가 깨졌으면 직전 백업으로 되돌아간다.
	for p in [path, path + ".bak"]:
		if not FileAccess.file_exists(p):
			continue
		# JSON.parse_string 은 실패를 엔진 로그에 ERROR 로 남긴다. 손상된
		# 저장은 정상 경로(백업으로 되돌아간다)라 로그 게이트를 깨뜨리면 안 된다.
		var reader := JSON.new()
		if reader.parse(FileAccess.get_file_as_string(p)) != OK:
			continue
		if reader.data is Dictionary:
			return reader.data as Dictionary
	return {}

func _write(path: String, data: Dictionary) -> bool:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(JSON.stringify(data))
	f.close()
	if FileAccess.file_exists(path):
		# 원본을 백업으로 밀어 둔 뒤 교체한다. 어느 지점에서 끊겨도
		# tmp·원본·백업 중 최소 하나는 온전한 JSON 이다.
		var bak := path + ".bak"
		if FileAccess.file_exists(bak):
			DirAccess.remove_absolute(bak)
		DirAccess.rename_absolute(path, bak)
	return DirAccess.rename_absolute(tmp, path) == OK
