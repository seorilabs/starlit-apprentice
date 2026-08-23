class_name SaRewardedAdPort
extends RefCounted
## 보상형 광고 포트. 전면 광고 메서드를 의도적으로 두지 않는다 — 제품 계약을 타입으로 강제한다.
##
## 네이티브 콜백은 광고를 봤다는 힌트일 뿐 보상 근거가 아니다.
## Platform claim 이 server_verified 일 때만 보상을 지급한다.

func is_supported() -> bool:
	return false

func request(_placement: String) -> void:
	pass
