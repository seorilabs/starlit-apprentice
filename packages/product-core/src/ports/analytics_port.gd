class_name SaAnalyticsPort
extends RefCounted
## 분석 포트. 코어는 네트워크를 모른다.
## 모든 이벤트에 platform 파라미터를 실어야 한다. docs/02-decisions/0005

func track(_event_name: String, _params: Dictionary) -> void:
	pass

## 이벤트 이름과 파라미터 키. 호출부에 문자열 리터럴을 남기면 오타가 조용히
## 다른 이벤트를 만들고, 그 구간의 데이터는 영구히 복구되지 않는다.
const EVENT_TURN_RESOLVED := "turn_resolved"
const EVENT_EVENT_SHOWN := "event_shown"
const EVENT_EVENT_CHOICE := "event_choice_made"
const EVENT_CONDITION_ENTERED := "condition_entered"
const EVENT_MILESTONE_RESULT := "milestone_result"
const EVENT_RUN_COMPLETED := "run_completed"

## docs/02-decisions/0005 — 모든 이벤트에 실린다.
const PARAM_PLATFORM := "platform"
const PARAM_TURN := "turn"
const PARAM_MONTH := "month"
const PARAM_ACTION_ID := "action_id"
const PARAM_OUTCOME := "outcome"
const PARAM_STRESS := "stress"
const PARAM_ENERGY := "energy"
const PARAM_EVENT_ID := "event_id"
const PARAM_CHOICE_ID := "choice_id"
const PARAM_CONDITION := "condition"
const PARAM_SEASON := "season"
const PARAM_GRADE := "grade"
const PARAM_ENDING_CODE := "ending_code"
const PARAM_ENDING_BAND := "ending_band"
