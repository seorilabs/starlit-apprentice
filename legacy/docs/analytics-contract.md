# Analytics Contract

This document records the MVP analytics boundary for `starlit-apprentice`.

## Boundary

- The MVP has no analytics SDK, tracking SDK, server endpoint, `sendBeacon`, or network transport.
- Runtime tracking emits a local CustomEvent named `starlit:analytics`.
- The event payload is intended for local preview, automated smoke checks, and future adapter handoff only.
- No user data collected or shared by this contract; parameters are game-state counters, ending codes, route slots, and UI choices.

## Gate

Run:

```bash
pnpm check:analytics-contract
```

The gate verifies `specs/starlit-apprentice.json`, `apps/starlit-apprentice/src/app.ts`, package dependencies, and this document stay aligned.

## Events

| Event | Params | Conversion | Trigger |
| --- | --- | --- | --- |
| `starlit_start_click` | `mode` | no | 새 게임 또는 이어하기 진입 |
| `starlit_schedule_confirmed` | `month`, `slots` | yes | 월간 4주 일정 확정 |
| `starlit_event_seen` | `event_id`, `month` | no | 월말 또는 상태 이벤트 노출 |
| `starlit_ending_reached` | `ending_code`, `year` | yes | 1년 종료 후 엔딩 도달 |
| `starlit_share_click` | `ending_code` | no | 엔딩 공유 버튼 클릭 |
| `starlit_collection_view` | `unlocked_count` | no | 엔딩 도감 진입 |
| `starlit_target_ending_selected` | `ending_code` | no | 도감에서 목표 엔딩을 선택해 새 run 시작 |

## Runtime Evidence

`pnpm check:runtime` captures the local `starlit:analytics` CustomEvent stream in Chromium and verifies representative events across the title, collection, schedule, event, ending, and share flows.
