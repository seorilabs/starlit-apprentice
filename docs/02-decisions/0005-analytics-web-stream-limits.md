# ADR-0005 GA4 Measurement Protocol Web 스트림의 구조적 한계를 수용한다

- 상태: `accepted`
- 날짜: 2026-08-23

## 맥락
org 프로비저닝은 GA4 **Web 스트림 하나**와 Measurement Protocol을 만든다. 네이티브 SDK가 아니므로 다음이 따라온다.

- 전 트래픽이 `platform=web` / `deviceCategory=desktop`으로 뭉개져 마켓별 성과를 사후 분해할 수 없다.
- MP가 `first_open`/`first_visit`/`session_start` 예약 이벤트를 거부해 **`newUsers`와 `engagedSessions`가 영구 0**이다. 잔존율·코호트가 구조적으로 측정 불가다.

## 결정
1. 모든 이벤트에 커스텀 `platform` 파라미터를 싣는다.
2. GA4에 `platform`·`release_version`·`first_launch_day`를 **이벤트 범위 커스텀 측정기준으로 첫 이벤트 전에 등록**한다.
3. 자체 `first_launch` 이벤트로 잔존율을 재구성한다.
4. 어댑터는 `src/platform/analytics_dispatcher.gd` 한 파일로 격리해 나중에 네이티브 SDK로 옮길 때 그 파일만 바뀌게 한다.

## 근거
커스텀 측정기준 등록은 **소급 적용되지 않는다.** lizard-tycoon이 출시 후에 발견해 초기 500여 건의 마켓 분해를 영구히 잃었다.

## 결과
2026-08-23 등록 완료 — `properties/551096427`. 실행 기록은 `04-work/2026-08-23-p1-offrepo-provisioning.md`.
