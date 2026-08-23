class_name SaStatKeys
extends RefCounted
## 스탯 9종. 현행 14종에서 통합했다.
## magic·courage 는 소스 액션이 각각 1개뿐이라 육성 대상이 아니라 병목이었다.
## docs/game-design/02-gdd.md 진행

const INTELLECT := "intellect"     ## 지성 (구 intellect + focus)
const SENSIBILITY := "sensibility" ## 감성 (구 sensibility + creativity)
const ETIQUETTE := "etiquette"     ## 예법 (구 etiquette + empathy)
const CRAFT := "craft"             ## 손재주
const STAMINA := "stamina"         ## 체력
const STARSENSE := "starsense"     ## 별감응 (구 magic)
const COURAGE := "courage"         ## 담력
const ELOQUENCE := "eloquence"     ## 언변 (구 charm + leadership)
const COMMERCE := "commerce"       ## 상재 (구 business)

const ALL: Array[String] = [
	INTELLECT, SENSIBILITY, ETIQUETTE, CRAFT, STAMINA,
	STARSENSE, COURAGE, ELOQUENCE, COMMERCE,
]

## 평판은 스탯 배열이 아니다. 이벤트·마일스톤·NPC·공개 업무로만 오르는 사회 지표다.
const REPUTATION := "reputation"

static func is_stat(key: String) -> bool:
	return ALL.has(key)
