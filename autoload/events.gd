extends Node
## 전역 시그널 버스. 의존이 없어야 하므로 가장 먼저 로드된다.

signal turn_resolved(result: Dictionary)
signal event_shown(event_id: String)
signal event_choice_made(event_id: String, choice_id: String)
signal condition_entered(condition: String)
signal milestone_result(season: int, grade: String)
signal run_completed(ending_code: String)
