extends SceneTree
## 오디오 배선 검증.
##
## 소리는 헤드리스에서 들을 수 없다. 들리는지가 아니라 배선이 살아 있는지를
## 검증한다 — 버스 분리, 같은 곡 재요청, 겹침 재생, 설정 지속, 앱 전환 복원.

const META_PATH := "user://test_audio_meta.json"
const RUN_PATH := "user://test_audio_run.json"

func _initialize() -> void:
	var failures: Array[String] = []
	var audio := root.get_node_or_null(^"Audio")
	var profile := root.get_node_or_null(^"Profile")
	if audio == null or profile == null:
		printerr("FAIL: Audio 또는 Profile 오토로드가 없다")
		quit(1)
		return
	_cleanup()
	profile.use_storage(SaFileStorage.new(RUN_PATH, META_PATH))
	audio.ensure(profile)

	failures.append_array(_test_buses(audio))
	failures.append_array(_test_bgm(audio))
	failures.append_array(_test_sfx_overlap(audio))
	failures.append_array(_test_preference_persists(audio, profile))
	failures.append_array(_test_background_restores(audio))
	failures.append_array(_test_assets())

	_cleanup()
	if failures.is_empty():
		print("AUDIO PASS")
		quit(0)
		return
	for f in failures:
		printerr("FAIL: %s" % f)
	quit(1)

## BGM 과 SFX 가 따로 음소거돼야 한다. Master 하나만 뮤트하면 둘을 나눌 수 없다.
func _test_buses(audio: Node) -> Array[String]:
	var out: Array[String] = []
	for name in [audio.BUS_BGM, audio.BUS_SFX]:
		if AudioServer.get_bus_index(name) < 0:
			out.append("오디오 버스 '%s' 가 없다" % name)
	if out.is_empty():
		var bgm := AudioServer.get_bus_index(audio.BUS_BGM)
		var sfx := AudioServer.get_bus_index(audio.BUS_SFX)
		AudioServer.set_bus_mute(bgm, true)
		AudioServer.set_bus_mute(sfx, false)
		if not AudioServer.is_bus_mute(bgm) or AudioServer.is_bus_mute(sfx):
			out.append("BGM 과 SFX 가 독립적으로 음소거되지 않는다")
		AudioServer.set_bus_mute(bgm, false)
	return out

## 같은 곡을 다시 요청하면 재시작하지 않는다.
func _test_bgm(audio: Node) -> Array[String]:
	var out: Array[String] = []
	audio.set_sound_enabled(true)
	audio.play_bgm("bgm_main")
	if String(audio.current_bgm()) != "bgm_main":
		out.append("BGM 이 재생되지 않았다")
		return out
	var player: AudioStreamPlayer = audio._bgm
	if player.stream == null:
		out.append("BGM 스트림이 비었다")
		return out
	if player.stream is AudioStreamOggVorbis and not (player.stream as AudioStreamOggVorbis).loop:
		out.append("BGM 이 루프로 설정되지 않았다. 이음매에서 곡이 끊긴다")
	var before := player.stream
	audio.play_bgm("bgm_main")
	if player.stream != before:
		out.append("같은 BGM 재요청이 곡을 갈아 끼웠다")
	audio.play_bgm("bgm_event")
	if String(audio.current_bgm()) != "bgm_event":
		out.append("다른 BGM 으로 전환되지 않았다")
	audio.stop_bgm()
	if String(audio.current_bgm()) != "":
		out.append("stop_bgm() 이 상태를 비우지 않았다")
	return out

## 짧은 효과음이 겹쳐도 앞 소리가 잘리지 않아야 한다.
func _test_sfx_overlap(audio: Node) -> Array[String]:
	var out: Array[String] = []
	audio.play_sfx("sfx_tap")
	audio.play_sfx("sfx_confirm")
	audio.play_sfx("sfx_page")
	var busy := 0
	for p in (audio._sfx as Array):
		if (p as AudioStreamPlayer).stream != null:
			busy += 1
	if busy < 3:
		out.append("효과음 3개가 동시에 물리지 않는다: %d개" % busy)
	return out

## 설정은 메타에 남아 앱을 다시 켜도 유지된다.
func _test_preference_persists(audio: Node, profile: Node) -> Array[String]:
	var out: Array[String] = []
	audio.set_sound_enabled(false)
	if not profile.meta().has("sound_enabled"):
		out.append("사운드 설정이 메타에 저장되지 않았다")
	elif bool(profile.sound_enabled()):
		out.append("끈 설정이 메타에 반영되지 않았다")
	if not AudioServer.is_bus_mute(AudioServer.get_bus_index(audio.BUS_BGM)):
		out.append("소리를 껐는데 BGM 버스가 음소거되지 않았다")
	# 완주로 메타를 갱신해도 사운드 설정이 날아가지 않아야 한다.
	profile.record_completion("quiet-life")
	if bool(profile.sound_enabled()):
		out.append("완주 기록이 사운드 설정을 덮어썼다")
	audio.set_sound_enabled(true)
	return out

## 백그라운드로 갔다가 꺼 둔 채로 돌아오면 여전히 무음이어야 한다.
func _test_background_restores(audio: Node) -> Array[String]:
	var out: Array[String] = []
	var bgm := AudioServer.get_bus_index(audio.BUS_BGM)
	audio.set_sound_enabled(false)
	audio._notification(Node.NOTIFICATION_APPLICATION_PAUSED)
	if not AudioServer.is_bus_mute(bgm):
		out.append("백그라운드 전환에서 음소거되지 않았다")
	audio._notification(Node.NOTIFICATION_APPLICATION_RESUMED)
	if not AudioServer.is_bus_mute(bgm):
		out.append("꺼 둔 채로 복귀했는데 소리가 돌아왔다")

	audio.set_sound_enabled(true)
	audio._notification(Node.NOTIFICATION_APPLICATION_PAUSED)
	if not AudioServer.is_bus_mute(bgm):
		out.append("켠 상태에서도 백그라운드 전환은 음소거여야 한다")
	audio._notification(Node.NOTIFICATION_APPLICATION_RESUMED)
	if AudioServer.is_bus_mute(bgm):
		out.append("켜 둔 채로 복귀했는데 소리가 돌아오지 않았다")
	return out

## 에셋 계약: BGM 3종 + SFX 3종, 전부 .ogg, mp3 없음.
func _test_assets() -> Array[String]:
	var out: Array[String] = []
	for id in ["bgm_main", "bgm_event", "bgm_milestone",
		"sfx_tap", "sfx_confirm", "sfx_page"]:
		if not ResourceLoader.exists("res://assets/audio/%s.ogg" % id):
			out.append("오디오 에셋이 없다: %s.ogg" % id)
	var dir := DirAccess.open("res://assets/audio")
	if dir != null:
		for f in dir.get_files():
			if f.ends_with(".mp3"):
				out.append("mp3 가 있다: %s. 루프 시작에 공백이 생긴다" % f)
	return out

func _cleanup() -> void:
	for p in [META_PATH, META_PATH + ".bak", META_PATH + ".tmp",
		RUN_PATH, RUN_PATH + ".bak", RUN_PATH + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)
