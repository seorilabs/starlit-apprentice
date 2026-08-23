extends Node
## 어댑터 조립 지점. 코어의 포트에 실제 구현을 연결한다.
##
## 광고는 Android/iOS 한정이다. AppsInToss 웹 빌드는 네이티브 광고 경로가 없다.
## docs/game-design/05-economy-content-liveops.md

func client_platform() -> String:
	match OS.get_name():
		"Android":
			return "android"
		"iOS":
			return "ios"
		"Web":
			return "web"
		_:
			return "editor"

func ads_available() -> bool:
	return client_platform() in ["android", "ios"]
