class_name SaAnalyticsSink
extends SaAnalyticsPort
## 분석 포트의 실제 구현.
##
## 전송은 설정 게이트 뒤에 있다. 측정 ID·secret 이 없으면 아무것도 보내지 않고
## 디버그 빌드에서만 로그를 남긴다. 키는 저장소에 커밋하지 않는다
## (.gitignore 의 analytics.config.json).
##
## 네트워크 코드는 여기 두지 않는다. 전송은 Callable 로 주입받아 이 클래스가
## 테스트 가능한 순수 조립부로 남게 한다 — 어댑터(autoload/analytics.gd)가
## HTTP 를 담당한다.

var _config: Dictionary = {}
var _transport: Callable = Callable()
var _debug := false
## 마지막으로 보낸 이벤트. 테스트와 디버깅용이다.
var sent: Array = []

func _init(config: Dictionary = {}, transport: Callable = Callable(), debug: bool = false) -> void:
	_config = config
	_transport = transport
	_debug = debug

## 설정이 갖춰졌는가. 하나라도 비면 전송하지 않는다.
func enabled() -> bool:
	return String(_config.get("measurement_id", "")) != "" \
		and String(_config.get("api_secret", "")) != ""

func track(event_name: String, params: Dictionary) -> void:
	if event_name == "":
		return
	var payload := params.duplicate(true)
	sent.append({"event": event_name, "params": payload})
	if _debug:
		print("[analytics] %s %s" % [event_name, str(payload)])
	# 설정이 없으면 여기서 끝난다. 예외를 던지지 않는다 — 계측 때문에
	# 게임이 멈추는 것이 계측이 없는 것보다 나쁘다.
	if not enabled() or not _transport.is_valid():
		return
	_transport.call(event_name, payload)
