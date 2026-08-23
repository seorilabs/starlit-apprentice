class_name SaUiKit
extends RefCounted
## 디자인 토큰. docs/game-design/03-ui-ux-spec.md 와 일치시킨다.

const BG_NIGHT := Color("#161B2D")
const BG_PANEL := Color("#1E2540")
const INK := Color("#F4F1E8")
const INK_DIM := Color("#A9B2C7")
const GOLD := Color("#F2C75C")
const TEAL := Color("#3E8E8A")
const ROSE := Color("#D97A7A")
const OUTLINE := Color("#0E1120")

## 기준 해상도 720x1280 에서의 px
const FONT_TITLE := 40
const FONT_HEAD := 28
const FONT_BODY := 24
const FONT_SMALL := 19
const FONT_MIN := 17

## 터치 타깃 최소 88px (720 기준 = 44dp 상당)
const TOUCH_MIN := 88
const GAP := 16

## 화면 비율 — 장면 62% / 선택 밴드 30%
const SCENE_RATIO := 0.62
const BAND_RATIO := 0.30

static func panel(bg: Color = BG_PANEL, radius: int = 14) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.corner_radius_top_left = radius
	sb.corner_radius_top_right = radius
	sb.corner_radius_bottom_left = radius
	sb.corner_radius_bottom_right = radius
	sb.border_color = OUTLINE
	sb.set_border_width_all(3)
	sb.content_margin_left = 14
	sb.content_margin_right = 14
	sb.content_margin_top = 10
	sb.content_margin_bottom = 10
	return sb

static func label(text: String, size: int = FONT_BODY, color: Color = INK) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l

static func heading(text: String) -> Label:
	return label(text, FONT_HEAD, GOLD)

## 자원 델타를 색으로 구분한다. 성장은 teal, 비용은 rose.
static func delta_color(value: int) -> Color:
	if value > 0:
		return TEAL
	if value < 0:
		return ROSE
	return INK_DIM

static func format_delta(value: int) -> String:
	return "+%d" % value if value > 0 else str(value)
