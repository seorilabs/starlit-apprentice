# Balance And Reachability

This document records the production balance gate for the 12-month / 4-week / 30-ending MVP.

## Gate

Run:

```bash
pnpm check:balance
pnpm check:pacing
```

The gate rebuilds `@starlit-apprentice/product-core`, then runs `scripts/check-ending-reachability.mjs`.
`pnpm check:pacing` rebuilds the same package and runs `scripts/check-pacing.mjs`.

The script simulates one deterministic 12-month route per ending using the same public game-loop functions used by the app:

- `createNewRun`
- `selectSchedule`
- `resolveNextSlot`
- `advanceMonth`
- `getSchedulePlanStatus` and `getScheduleResourceForecast` are the source of truth for app-side schedule affordability previews, disabled unaffordable action choices, and the `selectSchedule` core affordability invariant.
- `getScheduleResourceForecast` enforces the schedule resource forecast guard for direct callers: malformed run state, non-array action lists, unknown actions, and plans longer than 4 weekly slots are rejected instead of returning invalid projections.
- `getSchedulePlanStatus` also enforces the schedule plan status action-list guard: non-array action lists, unknown actions, and plans longer than 4 weekly slots return blockers instead of being treated as selectable previews.
- `getSchedulePlanStatus` also enforces the schedule plan resource finite guard: non-finite `gold`, `energy`, or `stress` projections return blockers instead of allowing a malformed plan to be selected.
- `getSchedulePlanStatus` also enforces the schedule plan finite forecast fallback: non-object direct run inputs, missing resource fields, or non-finite resource values still return a finite fallback forecast with blockers instead of leaking `NaN`/`Infinity` into schedule UI or package consumers.
- `getSchedulePlanStatus` also enforces the schedule plan resource bounds guard: current `gold`, `energy`, or `stress` values outside supported ranges return blockers instead of being treated as valid schedule previews.
- `getSchedulePlanStatus` also enforces the schedule plan run-state bounds guard, direct run-state version guard, and direct run-state shape guard: unsupported direct `RunState.version` values, malformed `month`, `slotIndex`, stat, or `rngSeed` values, malformed schedule arrays, malformed flags/history, or unknown ending codes return blockers instead of being treated as valid schedule previews.
- `createNewRun` and `createTargetedRun` enforce the new-run seed guard: malformed, non-positive, non-integer, non-finite, or unsafe numeric seeds are rejected before a direct `RunState` is created, while deterministic slot resolution prevents `rngSeed=0` from being persisted after RNG advancement.

It fails if:

- an ending has no route plan
- a route uses an unknown action
- a route has anything other than 12 months and 4 actions per month
- a route month would be blocked by `getSchedulePlanStatus` because projected `gold` or `energy` would go negative
- the completed route reaches a different ending
- the completed route ends below the final energy guardrail of 20
- the completed route ends above the final stress guardrail of 80

The first-three-month pacing script simulates representative guided-balanced, academic, creative, and work-heavy starts. It fails if:

- a route has anything other than 3 months and 4 actions per month
- a route uses fewer than 3 action categories
- month 1 stat growth, top-ending progress, energy, stress, or gold falls outside the early pacing guardrails
- the three-month route has no event, low total stat growth, depleted resources, or unclear top-ending direction

The representative pacing routes live in `scripts/qa-route-plans.mjs`. `scripts/check-pacing.mjs` uses that file for automated balance proof, and `scripts/manual-qa-packet.mjs` uses the same `guided-balanced` route to generate deterministic target-device QA route cues.

## Current Coverage

- 29 specialized endings have deterministic route coverage.
- `quiet-life` has fallback route coverage.
- Total covered endings: 30.
- Every route must now stay selectable under the same schedule affordability rules used by the app, then finish with `energy >= 20` and `stress <= 80`.
- Early pacing coverage checks 4 representative first-three-month starts with `energy >= 60`, `stress <= 45`, at least one event by month 3, and at least 70% progress toward the intended top ending.
- New-run seed guard coverage keeps deterministic balance routes reproducible by rejecting malformed seeds at run creation and preventing slot resolution from saving a non-positive RNG seed.
- Schedule affordability is enforced in `product-core` so the app can show projected `gold`/`energy`/`stress` before the month starts and `selectSchedule` also rejects plans that would overdraw `gold` or `energy`.
- `selectSchedule` also enforces the schedule selection action-list type guard, schedule selection slot-index guard, schedule selection run-state bounds guard, direct run-state version guard, direct run-state shape guard, and monthly schedule overwrite guard: non-array action lists, unsupported direct `RunState.version` values, malformed schedule/flag/history/ending shape, malformed `slotIndex` values, and direct run state outside supported ranges are rejected, and once a monthly schedule is selected, in progress, or complete, callers cannot replace it with another plan.
- `resolveNextSlot` and `advanceMonth` enforce the progression slot-index/history continuity guard, progression finite-state guard, direct run-state version guard, direct run-state shape guard, and run-state bounds guard: unsupported direct `RunState.version` values, malformed schedule/flag/history/ending shape, malformed `slotIndex` values, non-finite direct progression state values, and direct progression values outside supported ranges are rejected, and month advancement requires a completed 4-week schedule whose current-month history prefix matches the selected actions.
- Target recommendation affordability is enforced through `getEndingActionRecommendations`, so target-action badges and schedule guidance only surface recommendations that remain selectable under the current planned schedule prefix.
- target recommendation planned-action guard coverage is enforced in `product-core`: malformed planned prefixes, unknown planned actions, and prefixes longer than 4 weekly slots are rejected instead of being silently ignored by recommendation scoring.
- Monthly coaching is also exposed from `product-core` through `getMonthlyCoachingInsights`, so the result screen and next-month room screen use the same resource-risk and target-ending recommendation rules.
- Product-core read models enforce the read-model finite-state guard, direct run-state version guard, direct run-state shape guard, run-state bounds guard, and read-model display limit guard: `judgeEnding`, `getEndingProgress`, `getEndingActionRecommendations`, `getMonthlyCoachingInsights`, and `getApprenticeProfile` reject direct malformed runs with unsupported `RunState.version`, malformed flags/history/ending shape, non-finite numeric state, or values outside supported ranges instead of returning NaN progress, invalid coaching, or invalid profile values. Recommendation and coaching list limits must be 0-or-greater integers; oversized limits are capped to the maximum meaningful list length.

## Balance Fixes From Reachability Review

- Ending judgment now treats later configured endings as more specific by default when no explicit `priority` is set.
- `court-scribe`, `royal-diplomat`, and `spellwright` keep explicit priority because they are early-list specialized roles that can otherwise be shadowed by later adjacent roles.
- `tea-service` now contributes `business` so tea-house and social commerce routes are reachable without forcing market repetition.
- `garden-care` now contributes stronger `leadership`, making guild, city, and civic organizer routes reachable inside 48 actions.
- `plaza` now contributes `leadership`, making civic and festival organizer routes reachable through outing-heavy play.
- `travel-writer` route now uses the minimum required outing count plus lesson/rest balance instead of 32 outing weeks, preventing a valid ending route from finishing depleted.
- Route plans now include funding and recovery months where needed, so the deterministic proof matches the UI's `gold`/`energy` affordability blockers instead of relying on core resource clamping.

## Notes

This is not a full economy solver. It is a regression gate proving each advertised ending can be reached through the real game loop with a concrete route, that every planned month is actually selectable in the app, that the route does not end in an obviously depleted state, and that representative first-three-month starts do not regress into stalled or unclear early pacing.
