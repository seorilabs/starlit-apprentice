class_name SaAnalyticsPort
extends RefCounted
## 분석 포트. 코어는 네트워크를 모른다.
## 모든 이벤트에 platform 파라미터를 실어야 한다. docs/02-decisions/0005

func track(_event_name: String, _params: Dictionary) -> void:
	pass
