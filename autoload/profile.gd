extends Node
## 저장·로드. StoragePort 구현을 통해 코어와 대화한다.
##
## 런은 언제든 폐기될 수 있지만 메타(별빛 기록)는 회차를 넘어 살아남는다.
## 덱 로테이션이 메타에서 유도되므로, 메타가 날아가면 앱을 켤 때마다 같은
## 기회 이벤트만 보게 된다.

const RUN_SAVE_PATH := "user://run.json"
const META_SAVE_PATH := "user://meta.json"
const SAVE_SCHEMA_VERSION := 1

var _storage: SaFileStorage

func _ready() -> void:
	if _storage == null:
		_storage = SaFileStorage.new(RUN_SAVE_PATH, META_SAVE_PATH)

## 테스트가 실제 세이브를 건드리지 않도록 저장소를 갈아끼운다.
func use_storage(storage: SaFileStorage) -> void:
	_storage = storage

func _store() -> SaFileStorage:
	if _storage == null:
		_storage = SaFileStorage.new(RUN_SAVE_PATH, META_SAVE_PATH)
	return _storage

# ── 런 ─────────────────────────────────────────────────────────────
func has_saved_run() -> bool:
	return not load_run().is_empty()

## 스키마가 다르거나 파싱이 깨진 런은 폐기한다. 메타는 건드리지 않는다.
func load_run() -> Dictionary:
	var raw := _store().read_run()
	if raw.is_empty():
		return {}
	if int(raw.get("schema", 0)) != SAVE_SCHEMA_VERSION:
		clear_run()
		return {}
	return raw

func save_run(data: Dictionary) -> bool:
	if data.is_empty():
		return false
	var payload := data.duplicate(true)
	payload["schema"] = SAVE_SCHEMA_VERSION
	return _store().write_run(payload)

func clear_run() -> void:
	_store().clear_run()

# ── 메타(별빛 기록) ────────────────────────────────────────────────
func meta() -> Dictionary:
	var raw := _store().read_meta()
	if int(raw.get("schema", 0)) != SAVE_SCHEMA_VERSION:
		return {"schema": SAVE_SCHEMA_VERSION, "runs_completed": 0, "endings": [],
		"sound_enabled": true}
	return raw

func runs_completed() -> int:
	return int(meta().get("runs_completed", 0))

## 이번에 열 기회 덱. 회차 수에서 유도하므로 앱을 껐다 켜도 이어진다.
func next_deck() -> int:
	return posmod(runs_completed(), SaResources.DECK_COUNT)

## 사운드 설정. 런이 아니라 메타에 둔다 — 런을 폐기해도 남아야 한다.
func sound_enabled() -> bool:
	return bool(meta().get("sound_enabled", true))

func set_sound_enabled(enabled: bool) -> void:
	var m := meta()
	m["sound_enabled"] = enabled
	m["schema"] = SAVE_SCHEMA_VERSION
	_store().write_meta(m)

## 런 완주. 회차를 올리고 도달한 엔딩을 남긴 뒤 런 저장을 지운다.
func record_completion(ending_code: String) -> void:
	var m := meta()
	m["runs_completed"] = int(m.get("runs_completed", 0)) + 1
	var codes: Array = m.get("endings", [])
	if ending_code != "" and not codes.has(ending_code):
		codes.append(ending_code)
	m["endings"] = codes
	m["schema"] = SAVE_SCHEMA_VERSION
	_store().write_meta(m)
	clear_run()
