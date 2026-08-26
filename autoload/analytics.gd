extends Node
## 계측 어댑터. Events 시그널 버스를 구독해 분석 포트로 흘린다.
##
## 코어는 시그널도 네트워크도 모른다. emit 은 src/game 과 src/ui 에서만 하고,
## 포트로 넘기는 조립은 여기서 한다.
##
## 계측을 뒤늦게 붙이면 이미 나간 빌드의 구간은 영구히 측정 불가다. 그래서
## 미론칭 단계에서 배선만 먼저 세우고 전송은 설정 게이트 뒤에 둔다.

const CONFIG_PATH := "res://analytics.config.json"
const GA4_ENDPOINT := "https://www.google-analytics.com/mp/collect"

var sink: SaAnalyticsSink
var _http: HTTPRequest
var _wired := false
var _bus_node: Node
var _platform_node: Node
var _data_node: Node

func _ready() -> void:
	ensure()

## 배선을 보장한다. 헤드리스 러너(--script)에서는 오토로드의 _ready 가 돌지
## 않고 get_tree() 도 비어 있어, 어댑터가 조용히 죽은 채로 테스트가 통과해 버린다.
## 그래서 러너가 이웃 오토로드를 직접 넘길 수 있게 인자로 열어 둔다.
func ensure(bus: Node = null, platform_node: Node = null, data_node: Node = null) -> SaAnalyticsSink:
	if _wired:
		return sink
	_wired = true
	sink = SaAnalyticsSink.new(_load_config(), _send, OS.is_debug_build())
	if is_inside_tree():
		_http = HTTPRequest.new()
		add_child(_http)
	_bus_node = bus if bus != null else _lookup("Events")
	_platform_node = platform_node if platform_node != null else _lookup("Platform")
	_data_node = data_node if data_node != null else _lookup("GameData")
	if _bus_node != null:
		_bus_node.turn_resolved.connect(_on_turn_resolved)
		_bus_node.event_shown.connect(_on_event_shown)
		_bus_node.event_choice_made.connect(_on_event_choice_made)
		_bus_node.condition_entered.connect(_on_condition_entered)
		_bus_node.milestone_result.connect(_on_milestone_result)
		_bus_node.run_completed.connect(_on_run_completed)
	return sink

## autoload 이름은 --script 러너에서 전역으로 해석되지 않는다. 노드로 찾는다.
func _lookup(node_name: String) -> Node:
	var tree := get_tree()
	if tree == null or tree.root == null:
		return null
	return tree.root.get_node_or_null(NodePath(node_name))

func _platform() -> String:
	return String(_platform_node.client_platform()) if _platform_node != null else "editor"

## 설정 파일은 커밋하지 않는다. 없으면 전송이 꺼진 채로 정상 동작한다.
func _load_config() -> Dictionary:
	if not FileAccess.file_exists(CONFIG_PATH):
		return {}
	var reader := JSON.new()
	if reader.parse(FileAccess.get_file_as_string(CONFIG_PATH)) != OK:
		push_warning("analytics.config.json 파싱 실패. 계측 전송을 끈다.")
		return {}
	return reader.data as Dictionary if reader.data is Dictionary else {}

func _send(event_name: String, params: Dictionary) -> void:
	if _http == null:
		return
	var url := "%s?measurement_id=%s&api_secret=%s" % [GA4_ENDPOINT,
		String(sink._config.get("measurement_id", "")),
		String(sink._config.get("api_secret", ""))]
	var body := JSON.stringify({
		"client_id": String(sink._config.get("client_id", "starlit-apprentice")),
		"events": [{"name": event_name, "params": params}],
	})
	_http.request(url, ["Content-Type: application/json"], HTTPClient.METHOD_POST, body)

# ── 구독 ───────────────────────────────────────────────────────────
## 모든 이벤트에 platform 을 싣는다. docs/02-decisions/0005
func _base() -> Dictionary:
	return {SaAnalyticsPort.PARAM_PLATFORM: _platform()}

func _on_turn_resolved(result: Dictionary) -> void:
	var params := _base()
	for key in [SaAnalyticsPort.PARAM_TURN, SaAnalyticsPort.PARAM_MONTH,
		SaAnalyticsPort.PARAM_ACTION_ID, SaAnalyticsPort.PARAM_OUTCOME,
		SaAnalyticsPort.PARAM_STRESS, SaAnalyticsPort.PARAM_ENERGY]:
		params[key] = result.get(key, null)
	sink.track(SaAnalyticsPort.EVENT_TURN_RESOLVED, params)

func _on_event_shown(event_id: String) -> void:
	var params := _base()
	params[SaAnalyticsPort.PARAM_EVENT_ID] = event_id
	sink.track(SaAnalyticsPort.EVENT_EVENT_SHOWN, params)

func _on_event_choice_made(event_id: String, choice_id: String) -> void:
	var params := _base()
	params[SaAnalyticsPort.PARAM_EVENT_ID] = event_id
	params[SaAnalyticsPort.PARAM_CHOICE_ID] = choice_id
	sink.track(SaAnalyticsPort.EVENT_EVENT_CHOICE, params)

func _on_condition_entered(condition: String) -> void:
	var params := _base()
	params[SaAnalyticsPort.PARAM_CONDITION] = condition
	sink.track(SaAnalyticsPort.EVENT_CONDITION_ENTERED, params)

func _on_milestone_result(season: int, grade: String) -> void:
	var params := _base()
	params[SaAnalyticsPort.PARAM_SEASON] = season
	params[SaAnalyticsPort.PARAM_GRADE] = grade
	sink.track(SaAnalyticsPort.EVENT_MILESTONE_RESULT, params)

func _on_run_completed(ending_code: String) -> void:
	var params := _base()
	params[SaAnalyticsPort.PARAM_ENDING_CODE] = ending_code
	params[SaAnalyticsPort.PARAM_ENDING_BAND] = _band_of(ending_code)
	sink.track(SaAnalyticsPort.EVENT_RUN_COMPLETED, params)

## 밴드는 엔딩 데이터에서 유도한다. 새 표를 만들지 않는다.
func _band_of(ending_code: String) -> int:
	if _data_node == null:
		return 0
	for e in (_data_node.endings.get("endings", []) as Array):
		if String((e as Dictionary).get("code", "")) == ending_code:
			return int((e as Dictionary).get("band", 0))
	return 0
