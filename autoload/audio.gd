extends Node
## BGM/SFX 버스 관리.
##
## AppsInToss 요구사항: 사운드 On/Off 사용자 설정 필수,
## 백그라운드 전환 시 즉시 종료, 복귀 시 재생.

var sound_enabled: bool = true

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_WM_WINDOW_FOCUS_OUT:
			_set_muted(true)
		NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_WM_WINDOW_FOCUS_IN:
			_set_muted(not sound_enabled)

func _set_muted(muted: bool) -> void:
	var bus := AudioServer.get_bus_index("Master")
	if bus >= 0:
		AudioServer.set_bus_mute(bus, muted)
