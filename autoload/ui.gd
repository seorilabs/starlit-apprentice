extends Node
## Theme 구성과 한국어 폰트 부착.
##
## 폰트는 project.godot 이 아니라 여기서 import 이후에 붙인다.
## 부팅 시점 로드는 첫 import 보다 앞서서 clean 체크아웃마다 ERROR 를 남긴다.
## docs/02-decisions/0003-runtime-default-font.md

const FONT_PATH := "res://assets/fonts/Pretendard-Regular.ttf"

var theme: Theme

func _ready() -> void:
	theme = _build_theme()
	var root := get_tree().root
	if root != null:
		root.theme = theme

func _build_theme() -> Theme:
	var built := Theme.new()
	built.default_font_size = 24
	var font := _load_font()
	if font != null:
		built.default_font = font
	return built

func _load_font() -> Font:
	# 실패해도 push_error 를 쓰지 않는다. 로그 게이트가 ERROR: 를 실패로 잡는다.
	if not ResourceLoader.exists(FONT_PATH):
		push_warning("기본 폰트를 찾지 못했다: %s" % FONT_PATH)
		return null
	var loaded := ResourceLoader.load(FONT_PATH)
	if loaded == null or not (loaded is FontFile):
		push_warning("기본 폰트를 로드하지 못했다: %s" % FONT_PATH)
		return null
	return loaded as FontFile

## 볼드는 별도 폰트 파일 없이 FontVariation 으로 합성한다. pck 예산 때문이다.
## docs/02-decisions/0007-font-budget.md
func bold_of(base: Font, embolden: float = 0.6) -> FontVariation:
	var variation := FontVariation.new()
	variation.base_font = base
	variation.variation_embolden = embolden
	return variation
