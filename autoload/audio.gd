extends Node
## BGM/SFX 재생과 버스 관리.
##
## AppsInToss 요구사항(SRC-001): 사운드 On/Off 사용자 설정 필수,
## 백그라운드 전환 시 즉시 종료, 복귀 시 재생.
## docs/game-design/04-art-audio-bible.md

const BUS_MASTER := "Master"
const BUS_BGM := "BGM"
const BUS_SFX := "SFX"
const AUDIO_DIR := "res://assets/audio/%s.ogg"
## 짧은 효과음은 겹친다. 하나만 두면 뒤 소리가 앞 소리를 자른다.
const SFX_VOICES := 6

var sound_enabled: bool = true

var _bgm: AudioStreamPlayer
var _sfx: Array[AudioStreamPlayer] = []
var _current_bgm := ""
var _ready_done := false
var _profile_node: Node
## 다음에 쓸 SFX 보이스. 헤드리스에서는 playing 이 늘 false 라
## "비어 있는 것 찾기" 만으로는 한 보이스에 전부 몰린다.
var _next_voice := 0

func _ready() -> void:
	ensure()

## 배선을 보장한다. 헤드리스 러너에서는 오토로드의 _ready 가 돌지 않고
## get_tree() 도 비어, 재생 계층이 없는 채로 테스트가 통과해 버린다.
## 그래서 러너가 Profile 을 직접 넘길 수 있게 열어 둔다.
func ensure(profile_node: Node = null) -> void:
	if _ready_done:
		return
	_ready_done = true
	_profile_node = profile_node if profile_node != null else _lookup_profile()
	_ensure_bus(BUS_BGM)
	_ensure_bus(BUS_SFX)
	_bgm = AudioStreamPlayer.new()
	_bgm.bus = BUS_BGM
	add_child(_bgm)
	for i in SFX_VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = BUS_SFX
		add_child(p)
		_sfx.append(p)
	set_sound_enabled(_load_preference())

## Master 하나만 뮤트하면 BGM 과 SFX 를 따로 끌 수 없다.
func _ensure_bus(name: String) -> void:
	if AudioServer.get_bus_index(name) >= 0:
		return
	var idx := AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, name)
	AudioServer.set_bus_send(idx, BUS_MASTER)

# ── 재생 ───────────────────────────────────────────────────────────
## 같은 곡을 다시 요청하면 재시작하지 않는다. 화면을 옮길 때마다 곡이
## 처음으로 튀면 배경음이 아니라 알림음이 된다.
func play_bgm(id: String) -> void:
	ensure()
	if id == "":
		return
	if _current_bgm == id and _bgm.playing:
		return
	var stream := _load_stream(id)
	if stream == null:
		return
	if stream is AudioStreamOggVorbis:
		(stream as AudioStreamOggVorbis).loop = true
	_current_bgm = id
	_bgm.stream = stream
	if _can_play(_bgm):
		_bgm.play()

func stop_bgm() -> void:
	ensure()
	_current_bgm = ""
	_bgm.stop()

func current_bgm() -> String:
	return _current_bgm

func play_sfx(id: String) -> void:
	ensure()
	var stream := _load_stream(id)
	if stream == null:
		return
	# 라운드로빈으로 돌린다. 전부 물려 있어도 가장 오래된 것을 재활용할 뿐
	# 소리를 삼키지는 않는다.
	var voice := _sfx[_next_voice]
	for i in _sfx.size():
		var candidate := _sfx[(_next_voice + i) % _sfx.size()]
		if not candidate.playing:
			voice = candidate
			_next_voice = (_next_voice + i + 1) % _sfx.size()
			break
	if voice == _sfx[_next_voice] and voice.playing:
		_next_voice = (_next_voice + 1) % _sfx.size()
	voice.stream = stream
	if _can_play(voice):
		voice.play()

## 헤드리스에서는 재생하지 않는다. 트리 밖이면 play() 가 에러를 남기고,
## dummy 오디오 드라이버는 playback 을 붙들어 종료 시 "resources still in use"
## 로 로그 게이트를 깨뜨린다. 배선 검증에는 스트림 배정이면 충분하다.
func _can_play(player: AudioStreamPlayer) -> bool:
	return player.is_inside_tree() and DisplayServer.get_name() != "headless"

func _load_stream(id: String) -> AudioStream:
	var path := AUDIO_DIR % id
	if not ResourceLoader.exists(path):
		return null
	return load(path) as AudioStream

# ── 설정 ───────────────────────────────────────────────────────────
func set_sound_enabled(enabled: bool) -> void:
	sound_enabled = enabled
	_apply_mute(not enabled)
	_save_preference(enabled)

func toggle_sound() -> bool:
	set_sound_enabled(not sound_enabled)
	return sound_enabled

func _apply_mute(muted: bool) -> void:
	for name in [BUS_BGM, BUS_SFX]:
		var bus := AudioServer.get_bus_index(name)
		if bus >= 0:
			AudioServer.set_bus_mute(bus, muted)

## 설정은 별빛 기록(메타)에 남는다. 런은 폐기돼도 이 값은 남아야 한다.
func _lookup_profile() -> Node:
	var tree := get_tree()
	if tree == null or tree.root == null:
		return null
	return tree.root.get_node_or_null(^"Profile")

func _load_preference() -> bool:
	return bool(_profile_node.sound_enabled()) if _profile_node != null else true

func _save_preference(enabled: bool) -> void:
	if _profile_node != null:
		_profile_node.set_sound_enabled(enabled)

## 스트림 참조를 놓는다. 헤드리스 프로브가 씬을 세운 채 끝나면 오디오
## 리소스가 살아남아 "resources still in use" 로 로그 게이트를 깨뜨린다.
func release() -> void:
	if _bgm != null:
		_bgm.stop()
		_bgm.stream = null
	for p in _sfx:
		p.stop()
		p.stream = null
	_current_bgm = ""

# ── 앱 전환 ────────────────────────────────────────────────────────
func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_PAUSED, NOTIFICATION_WM_WINDOW_FOCUS_OUT:
			_apply_mute(true)
		NOTIFICATION_APPLICATION_RESUMED, NOTIFICATION_WM_WINDOW_FOCUS_IN:
			# 꺼 둔 채로 복귀했는데 소리가 나면 설정이 무시된 것이다.
			_apply_mute(not sound_enabled)
