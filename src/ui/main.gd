extends Control
## 화면 스택 루트.
##
## 화면은 .tscn 이 아니라 코드로 구성한다. .tscn 은 머지 충돌이 심하고,
## 이식 원본이 이미 명령형이라 화면당 .tscn 은 불필요한 번역 단계다.

const CONTENT := {
	"actions": "res://data/actions.json",
	"events": "res://data/events.json",
	"endings": "res://data/endings.json",
	"npcs": "res://data/npcs.json",
}

var _run := SaRunController.new()
var _content := {}
var _turn_screen: SaTurnScreen
var _overlay: Control

func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = SaUiKit.BG_NIGHT
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	_content = _load_content()
	_show_title()

func _load_content() -> Dictionary:
	var out := {}
	for key in CONTENT.keys():
		var path: String = CONTENT[key]
		if not FileAccess.file_exists(path):
			out[key] = []
			continue
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		var d: Dictionary = parsed as Dictionary if parsed is Dictionary else {}
		out[key] = d.get(key, [])
	return out

# ── 타이틀 ─────────────────────────────────────────────────────────
func _show_title() -> void:
	_clear()
	var col := VBoxContainer.new()
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 24)

	var title := SaUiKit.label("별빛 견습생", SaUiKit.FONT_TITLE, SaUiKit.GOLD)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)

	var sub := SaUiKit.label("열두 달, 서른여섯 번의 선택", SaUiKit.FONT_BODY, SaUiKit.INK_DIM)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sub)

	var start := Button.new()
	start.text = "새로 시작"
	start.custom_minimum_size = Vector2(280, SaUiKit.TOUCH_MIN)
	start.add_theme_font_size_override("font_size", SaUiKit.FONT_HEAD)
	start.pressed.connect(_start_run)
	var wrap := CenterContainer.new()
	wrap.add_child(start)
	col.add_child(wrap)
	add_child(col)

func _start_run() -> void:
	# 코어는 Time 을 모른다. 시드는 여기서 만들어 주입한다.
	_run.start(int(Time.get_unix_time_from_system()) & 0x7FFFFFFF, _content)
	_show_turn()

# ── 턴 ─────────────────────────────────────────────────────────────
func _show_turn() -> void:
	if _run.is_over():
		_show_ending()
		return
	_clear()
	_turn_screen = SaTurnScreen.new()
	_turn_screen.anchor_right = 1.0
	_turn_screen.anchor_bottom = 1.0
	add_child(_turn_screen)
	_turn_screen.setup(_run)
	_turn_screen.action_chosen.connect(_on_action)
	_turn_screen.portrait_tapped.connect(_show_constellation)

func _on_action(action: Dictionary, together: String) -> void:
	var result := _run.resolve(action, together)
	_show_resolution(action, result)

# ── 해석 비트: 화면 전환 없이 장면 위에 겹친다 ──────────────────────
func _show_resolution(action: Dictionary, result: Dictionary) -> void:
	var card := _panel_overlay()
	var col := card.get_child(0) as VBoxContainer

	var outcome := String(result.get("outcome", ""))
	var head: String = {"fail":"잘 풀리지 않았다","ok":"해냈다","crit":"아주 잘됐다","awaken":"무언가 열렸다"}.get(outcome, "")
	var color: Color = SaUiKit.ROSE if outcome == "fail" else (SaUiKit.GOLD if outcome != "ok" else SaUiKit.TEAL)
	col.add_child(SaUiKit.label("%s · %s" % [String(action.get("label","")), head], SaUiKit.FONT_HEAD, color))

	var gains: Dictionary = result.get("gains", {})
	for k in gains.keys():
		var v := int(gains[k])
		if v == 0:
			continue
		col.add_child(SaUiKit.label("%s %s" % [_stat_name(String(k)), SaUiKit.format_delta(v)],
			SaUiKit.FONT_BODY, SaUiKit.delta_color(v)))

	for c in (result.get("entered_conditions", []) as Array):
		col.add_child(SaUiKit.label("· %s" % _condition_name(String(c)), SaUiKit.FONT_BODY, SaUiKit.ROSE))
	if bool(result.get("tuition_charged", false)):
		col.add_child(SaUiKit.label("월말 수업료 %d금화" % SaResources.MONTHLY_TUITION,
			SaUiKit.FONT_SMALL, SaUiKit.INK_DIM))

	col.add_child(_next_button("계속", func():
		if not _run.pending_events.is_empty():
			_show_event()
		else:
			_show_turn()))

# ── 이벤트 ─────────────────────────────────────────────────────────
func _show_event() -> void:
	var ev: Dictionary = _run.pending_events[0]
	var card := _panel_overlay()
	var col := card.get_child(0) as VBoxContainer
	col.add_child(SaUiKit.heading(String(ev.get("title", ""))))
	var body := SaUiKit.label(String(ev.get("body", "")), SaUiKit.FONT_BODY)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size = Vector2(600, 0)
	col.add_child(body)

	for c in (ev.get("choices", []) as Array):
		var choice: Dictionary = c
		var avail := SaEventResolution.choice_availability(_run.beat, choice)
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(600, SaUiKit.TOUCH_MIN)
		btn.add_theme_font_size_override("font_size", SaUiKit.FONT_BODY)
		if bool(avail["ok"]):
			btn.text = String(choice.get("label", ""))
			btn.pressed.connect(func(): _on_event_choice(choice))
		else:
			# 미충족 선택지는 숨기지 않는다. 사유를 보여줘야 임계값을 학습한다.
			btn.text = "%s  (%s)" % [String(choice.get("label", "")), String(avail["reason"])]
			btn.disabled = true
		col.add_child(btn)

func _on_event_choice(choice: Dictionary) -> void:
	var outcome := _run.apply_event_choice(choice)
	var card := _panel_overlay()
	var col := card.get_child(0) as VBoxContainer
	var text := SaUiKit.label(String(outcome.get("result_text", "")), SaUiKit.FONT_BODY)
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.custom_minimum_size = Vector2(600, 0)
	col.add_child(text)
	col.add_child(_next_button("계속", func():
		if not _run.pending_events.is_empty():
			_show_event()
		else:
			_show_turn()))

# ── 별자리 (스탯 시트) ──────────────────────────────────────────────
func _show_constellation() -> void:
	var card := _panel_overlay()
	var col := card.get_child(0) as VBoxContainer
	col.add_child(SaUiKit.heading("별자리"))
	var stats: Dictionary = _run.state.get("stats", {})
	for key in SaStatKeys.ALL:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		row.add_child(SaUiKit.label("%s  %s" % [_stat_name(key), _run.aptitude.get(key, "B")],
			SaUiKit.FONT_SMALL, SaUiKit.INK_DIM))
		var bar := ProgressBar.new()
		bar.max_value = 100
		bar.value = int(stats.get(key, 0))
		bar.custom_minimum_size = Vector2(360, 22)
		bar.show_percentage = false
		row.add_child(bar)
		row.add_child(SaUiKit.label(str(int(stats.get(key, 0))), SaUiKit.FONT_SMALL))
		col.add_child(row)
	col.add_child(SaUiKit.label("평판 %d" % int(_run.state.get("reputation", 0)),
		SaUiKit.FONT_BODY, SaUiKit.GOLD))
	col.add_child(_next_button("닫기", _show_turn))

# ── 엔딩 ───────────────────────────────────────────────────────────
func _show_ending() -> void:
	_clear()
	var ending := _run.judge()
	var col := VBoxContainer.new()
	col.set_anchors_preset(Control.PRESET_FULL_RECT)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	col.add_theme_constant_override("separation", 20)
	col.add_child(_centered(SaUiKit.label(String(ending.get("title", "조용한 일상")),
		SaUiKit.FONT_TITLE, SaUiKit.GOLD)))
	var summary := SaUiKit.label(String(ending.get("summary", "")), SaUiKit.FONT_BODY)
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.custom_minimum_size = Vector2(560, 0)
	summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_centered(summary))
	col.add_child(_centered(SaUiKit.label("band %d" % int(ending.get("band", 0)),
		SaUiKit.FONT_SMALL, SaUiKit.INK_DIM)))
	var again := Button.new()
	again.text = "다시 시작"
	again.custom_minimum_size = Vector2(280, SaUiKit.TOUCH_MIN)
	again.pressed.connect(_show_title)
	col.add_child(_centered(again))
	add_child(col)

# ── 헬퍼 ───────────────────────────────────────────────────────────
func _panel_overlay() -> PanelContainer:
	if _overlay != null and is_instance_valid(_overlay):
		_overlay.queue_free()
	var scrim := ColorRect.new()
	scrim.color = Color(0, 0, 0, 0.55)
	scrim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(scrim)
	_overlay = scrim

	# 카드 높이는 내용이 정한다. 앵커로 높이를 고정하면 짧은 결과문 하나에도
	# 화면 절반이 빈 채로 남는다.
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.add_theme_constant_override("margin_left", 24)
	scrim.add_child(center)

	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", SaUiKit.panel())
	card.custom_minimum_size = Vector2(624, 0)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 14)
	card.add_child(col)
	center.add_child(card)
	return card

func _next_button(text: String, action: Callable) -> Control:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(240, SaUiKit.TOUCH_MIN)
	b.add_theme_font_size_override("font_size", SaUiKit.FONT_BODY)
	b.pressed.connect(func():
		if _overlay != null and is_instance_valid(_overlay):
			_overlay.queue_free()
			_overlay = null
		action.call())
	return _centered(b)

func _centered(node: Control) -> Control:
	var c := CenterContainer.new()
	c.add_child(node)
	return c

func _clear() -> void:
	for c in get_children():
		if c is ColorRect and c.get_index() == 0:
			continue
		c.queue_free()
	_overlay = null

func _stat_name(key: String) -> String:
	return {"intellect":"지성","sensibility":"감성","etiquette":"예법","craft":"손재주",
		"stamina":"체력","starsense":"별감응","courage":"담력","eloquence":"언변",
		"commerce":"상재"}.get(key, key)

func _condition_name(key: String) -> String:
	return {"slump_light":"부진","slump":"슬럼프","injury":"부상","burnout":"번아웃",
		"disgrace":"평판 추락","failed":"낙제"}.get(key, key)
