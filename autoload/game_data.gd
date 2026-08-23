extends Node
## data/*.json 콘텐츠 로드. 코어는 Dictionary 만 받는다(코어에서 JSON 금지).

const CONTENT_DIR := "res://data"

var actions: Dictionary = {}
var events: Dictionary = {}
var endings: Dictionary = {}
var npcs: Dictionary = {}

func _ready() -> void:
	actions = _load("actions.json")
	events = _load("events.json")
	endings = _load("endings.json")
	npcs = _load("npcs.json")

func _load(file_name: String) -> Dictionary:
	var path := "%s/%s" % [CONTENT_DIR, file_name]
	if not FileAccess.file_exists(path):
		# P4 에서 콘텐츠가 이식되기 전까지는 비어 있는 것이 정상이다.
		return {}
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if parsed is Dictionary:
		return parsed as Dictionary
	push_warning("콘텐츠 파싱 실패: %s" % path)
	return {}
