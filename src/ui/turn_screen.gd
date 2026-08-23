class_name SaTurnScreen
extends Control
## 메인 플레이 화면.
##
## org 하드 게이트: "메인 플레이 화면은 장르의 판타지와 행동 결과가 먼저 보여야 한다.
## 숫자 카드와 관리 패널이 화면을 지배하는 simulator/dashboard 구성을 기본값으로 쓰지 않는다."
## 구 구현은 정확히 그 금지된 레이아웃(14개 스탯 카드 그리드)이었다.
##
## 장면 62% · 선택 밴드 30% · 자원 핍은 우측 가장자리.
## 카드당 숫자는 최대 2개(주 스탯 델타 + 기력 비용).

signal action_chosen(action: Dictionary, together: String)
signal portrait_tapped

const ART := "res://assets/art/%s.webp"

var _run: SaRunController
var _scene_layer: Control
var _band: HBoxContainer
var _pips: VBoxContainer
var _nameplate: Label
var _figure: TextureRect
var _bg: TextureRect
var _together_pick: String = ""

func setup(run: SaRunController) -> void:
	_run = run
	_stretch(self, 0.0, 0.0, 1.0, 1.0)
	_build()
	refresh()

func _build() -> void:
	# ── 장면 (상단 62%) ────────────────────────────────────────────
	_scene_layer = _stretch(Control.new(), 0.0, 0.0, 1.0, SaUiKit.SCENE_RATIO)
	_scene_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_scene_layer)

	_bg = TextureRect.new()
	_stretch(_bg, 0.0, 0.0, 1.0, 1.0)
	_bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scene_layer.add_child(_bg)

	_figure = TextureRect.new()
	# 견습생은 장면 우측 하단에 크게 선다. 화면의 주인공이다.
	_stretch(_figure, 0.42, 0.24, 0.98, 0.98)
	_figure.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_figure.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
	_figure.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_scene_layer.add_child(_figure)

	# 시기는 프로그레스 바가 아니라 손글씨 명패로 표기한다
	var plate := PanelContainer.new()
	plate.add_theme_stylebox_override("panel", SaUiKit.panel(SaUiKit.BG_PANEL, 10))
	plate.offset_left = 24
	plate.offset_top = 24
	_nameplate = SaUiKit.label("", SaUiKit.FONT_HEAD, SaUiKit.GOLD)
	plate.add_child(_nameplate)
	_scene_layer.add_child(plate)

	# ── 자원 핍 (우측 가장자리) ────────────────────────────────────
	_pips = VBoxContainer.new()
	_pips.add_theme_constant_override("separation", 8)
	_pips.anchor_left = 1.0
	_pips.anchor_right = 1.0
	_pips.offset_left = -132
	_pips.offset_top = 24
	_pips.offset_right = -16
	_pips.custom_minimum_size = Vector2(116, 0)
	_scene_layer.add_child(_pips)

	# ── 선택 밴드 (하단 30%) ──────────────────────────────────────
	var band_wrap := PanelContainer.new()
	_stretch(band_wrap, 0.0, SaUiKit.SCENE_RATIO, 1.0, 1.0)
	band_wrap.add_theme_stylebox_override("panel", SaUiKit.panel(SaUiKit.BG_NIGHT, 0))
	add_child(band_wrap)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	band_wrap.add_child(scroll)

	_band = HBoxContainer.new()
	_band.add_theme_constant_override("separation", SaUiKit.GAP)
	_band.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	_band.alignment = BoxContainer.ALIGNMENT_BEGIN
	scroll.add_child(_band)

func refresh() -> void:
	_nameplate.text = "%d월 %s" % [_run.month(), _run.phase_label()]
	_bg.texture = _tex(_run.scene_art())
	_figure.texture = _tex(_run.apprentice_art())
	_rebuild_pips()
	_rebuild_band()

func _rebuild_pips() -> void:
	for c in _pips.get_children():
		c.queue_free()
	var s := _run.state
	_pips.add_child(_pip("token_gold", int(s.get("gold", 0))))
	_pips.add_child(_pip("token_energy", int(s.get("energy", 0))))
	_pips.add_child(_pip("token_mind", 100 - int(s.get("stress", 0))))
	# 초상은 마음의 1차 표시이자 스탯 시트 진입점이다
	var portrait := TextureButton.new()
	portrait.texture_normal = _tex(_run.apprentice_art())
	portrait.ignore_texture_size = true
	portrait.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	portrait.custom_minimum_size = Vector2(108, 108)
	portrait.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	portrait.pressed.connect(func(): portrait_tapped.emit())
	_pips.add_child(portrait)

func _pip(icon: String, value: int) -> Control:
	var box := PanelContainer.new()
	box.add_theme_stylebox_override("panel", SaUiKit.panel(SaUiKit.BG_PANEL, 10))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var img := TextureRect.new()
	img.texture = _tex(icon)
	img.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	img.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	img.custom_minimum_size = Vector2(30, 30)
	row.add_child(img)
	row.add_child(SaUiKit.label(str(value), SaUiKit.FONT_SMALL))
	box.add_child(row)
	return box

func _rebuild_band() -> void:
	for c in _band.get_children():
		c.queue_free()
	for a in _run.offered_actions():
		_band.add_child(_card(a as Dictionary))

## 카드당 숫자는 최대 2개다. 주 스탯 델타와 기력 비용.
func _card(action: Dictionary) -> Control:
	var btn := Button.new()
	btn.custom_minimum_size = Vector2(176, 196)
	btn.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	btn.add_theme_stylebox_override("normal", SaUiKit.panel(SaUiKit.BG_PANEL.lightened(0.05)))
	btn.add_theme_stylebox_override("hover", SaUiKit.panel(SaUiKit.BG_PANEL.lightened(0.08)))
	btn.add_theme_stylebox_override("pressed", SaUiKit.panel(SaUiKit.BG_PANEL.darkened(0.12)))
	btn.focus_mode = Control.FOCUS_ALL

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	col.anchor_right = 1.0
	col.offset_left = 10
	col.offset_top = 10
	col.offset_right = -10
	col.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var icon := TextureRect.new()
	icon.texture = _tex(String(action.get("icon", "")))
	icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	icon.custom_minimum_size = Vector2(72, 72)
	col.add_child(icon)

	var title := SaUiKit.label(String(action.get("label", "")), SaUiKit.FONT_BODY, SaUiKit.GOLD)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)

	var place := SaUiKit.label(String(action.get("place", "")), SaUiKit.FONT_MIN, SaUiKit.INK_DIM)
	place.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(place)

	var nums := HBoxContainer.new()
	nums.alignment = BoxContainer.ALIGNMENT_CENTER
	nums.add_theme_constant_override("separation", 12)
	var stat: Variant = action.get("stat")
	if stat != null:
		var gain := SaGrowthCurve.gain(
			float((_run.state["stats"] as Dictionary).get(String(stat), 0)),
			_run.turn(), String(action.get("tier", "basic")),
			SaAptitude.multiplier(_run.aptitude, String(stat)), 1.0, 1.0)
		nums.add_child(SaUiKit.label("%s +%d" % [_stat_name(String(stat)), int(gain)],
			SaUiKit.FONT_SMALL, SaUiKit.TEAL))
	var energy := int((action.get("cost", {}) as Dictionary).get("energy", 0))
	if energy != 0:
		nums.add_child(SaUiKit.label("기력 %s" % SaUiKit.format_delta(energy),
			SaUiKit.FONT_SMALL, SaUiKit.delta_color(energy)))
	col.add_child(nums)

	var together: String = _run.together_candidate(action)
	if together != "":
		var chip := Button.new()
		chip.text = "함께 · %s" % _npc_name(together)
		chip.add_theme_font_size_override("font_size", SaUiKit.FONT_MIN)
		chip.toggle_mode = true
		chip.custom_minimum_size = Vector2(0, 40)
		chip.toggled.connect(func(on: bool): _together_pick = together if on else "")
		col.add_child(chip)

	btn.add_child(col)
	btn.pressed.connect(func(): action_chosen.emit(action, _together_pick))
	return btn

## 앵커를 명시하고 offset 을 0 으로 둔다. 프리셋과 앵커 오버라이드를 섞으면
## 프리셋이 남긴 offset 이 남아 레이아웃이 조용히 무너진다(실제로 겪었다).
func _stretch(node: Control, l: float, t: float, r: float, b: float) -> Control:
	node.anchor_left = l
	node.anchor_top = t
	node.anchor_right = r
	node.anchor_bottom = b
	node.offset_left = 0
	node.offset_top = 0
	node.offset_right = 0
	node.offset_bottom = 0
	return node

func _tex(name: String) -> Texture2D:
	if name == "":
		return null
	var path := ART % name
	return load(path) if ResourceLoader.exists(path) else null

func _stat_name(key: String) -> String:
	return {"intellect":"지성","sensibility":"감성","etiquette":"예법","craft":"손재주",
		"stamina":"체력","starsense":"별감응","courage":"담력","eloquence":"언변",
		"commerce":"상재"}.get(key, key)

func _npc_name(id: String) -> String:
	return _run.npc_name(id)
