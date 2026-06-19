# Save Contract

This document records the local-only save contract for `starlit-apprentice`.

## Storage Keys

| Key | Purpose |
| --- | --- |
| `starlit-apprentice:run:v1` | Current run state |
| `starlit-apprentice:collection:v1` | Unlocked ending collection |

The MVP keeps progress on-device. There is no server save, account login, backup sync, analytics profile, ad SDK, or purchase SDK in the shipped app package.
The title screen exposes a two-step local data reset control that removes both keys from the device.

## Run State

`RunState.version` is currently `1`. The loader accepts older object-shaped saves with numeric integer versions from `0` through `1`, then normalizes them into the current v1 shape. The save schema version guard rejects missing, non-numeric, fractional, negative, or future run save versions instead of interpreting unsupported schemas as v1.

New run creation enforces the new-run seed guard: `createNewRun()` and `createTargetedRun()` accept only positive safe-integer numeric seeds, while loader migration remains responsible for recovering stale or corrupt saved RNG seeds. Slot resolution must also avoid persisting `rngSeed=0` after deterministic RNG advancement, because subsequent public API calls treat non-positive seeds as malformed run state.

The save loader must:

- clamp month, slot index, stats, gold, energy, and stress into supported ranges
- drop invalid or partial schedules, including old three-slot saves
- drop not-started saved schedules that no longer satisfy core affordability
- normalize known flags into non-negative integers, drop unknown saved flags, and cap condition/event counters to the 336-day run maximum
- reset saved progress flags for action and category counts to the completed-history count within the 48-slot run maximum, so unsupported saved flags cannot satisfy ending requirements or inflate target guidance
- keep only history entries backed by known action IDs and valid 1-12 month / 1-4 slot coordinates, then canonicalize their action label from the registry and daily outcome labels from outcome kind before normalizing category, deltas, daily outcomes, and saved event payloads
- reset saved month progress when a no-schedule run is not backed by contiguous completed history, so unsupported month jumps resume from the first supported month
- reset saved schedule month progress when a saved `currentSchedule` points to a month/slot that is not backed by contiguous completed history, so unsupported scheduled month jumps cannot resume into future activities or endings
- scope run-local unlocked endings to the current run result: in-progress or premature-ending saves clear `unlockedEndings`, and completed final-month saves keep only the canonical judged ending; the separate collection key remains the source of multi-ending collection progress
- preserve known `targetEndingCode` values for goal-directed reruns
- clear unknown `targetEndingCode` values
- clear unknown or premature `endingCode` values
- canonicalize a completed final-month `endingCode` from the current judged ending result
- recover invalid RNG seeds to `1`
- reject non-object, missing-version, unsupported-version, and malformed JSON run saves through the app fallback banner. The product-core loader JSON parse guard must convert malformed JSON run payloads to the same run-save domain error instead of leaking raw parser errors.

The save writer must reject malformed direct run state before it reaches local storage. `serializeRun()` enforces the non-object direct run-state guard, serializeRun save-write version guard, save-write finite-state guard, run-state bounds guard, save-write registry guard, serializeRun save-write flag guard, and serializeRun save-write history guard for direct calls with non-object or array run inputs, missing or non-v1 `version` values, non-finite `month`, `gold`, `energy`, `stress`, stat, or `rngSeed` values, out-of-range `slotIndex`, negative `gold`, 0-100 range violations for `energy`, `stress`, or stats, non-positive/non-integer `rngSeed` values, non-object flags, unknown flag keys, non-integer/negative/oversized flag counts, action/category progress flags beyond completed history, partial or unknown-action `currentSchedule` values, unknown `targetEndingCode`, unknown `endingCode`, unknown `unlockedEndings`, non-array `history`, future/duplicate/non-contiguous history slots, history action labels or categories that no longer match the registry, malformed daily outcomes, or malformed saved event payloads. The app storage adapter catches that failure and surfaces the same local save warning path as blocked `localStorage.setItem`.

The monthly schedule selection contract must also reject malformed `slotIndex` values, enforce the non-object direct run-state guard, enforce the direct run-state version guard for unsupported direct `RunState.version` values, enforce the direct run-state shape guard for malformed schedule arrays, malformed flags/history, or unknown ending codes, enforce the schedule selection run-state bounds guard for direct API calls with non-finite or out-of-range run state, and reject overwriting an already selected, partially selected, in-progress, orphan-slot, or completed monthly schedule. A new schedule can only be selected from a run that has no current monthly schedule and `slotIndex=0`.

The progression API contract must reject malformed `slotIndex` values, enforce the non-object direct run-state guard, enforce the direct run-state version guard for unsupported direct `RunState.version` values, enforce the direct run-state shape guard for malformed schedule arrays, malformed flags/history, or unknown ending codes, enforce the progression finite-state guard for direct API calls with non-finite `month`, `gold`, `energy`, `stress`, stat, or `rngSeed` values, enforce the run-state bounds guard for direct API calls with out-of-range `slotIndex`, negative `gold`, 0-100 range violations for `energy`, `stress`, or stats, or non-positive/non-integer `rngSeed` values, and must not let `advanceMonth()` move to the next month or ending unless `slotIndex=4`, the current schedule has 4 known actions, and the current month's completed history prefix matches that schedule.

The read-model API contract must enforce the non-object direct run-state guard, direct run-state version guard, and direct run-state shape guard before deriving endings, progress, target recommendations, coaching, or apprentice profile values from direct `RunState` inputs. Loader migration remains the only path that accepts older save versions and normalizes them to v1.

## Collection State

The current collection payload is `{ version: 1, endings: EndingCode[] }`. `saveCollection()` delegates to product-core `serializeCollection()` and writes that versioned object shape, while the loader delegates to product-core `loadCollection()` and still accepts the legacy array shape as a v0 migration path for local QA and pre-release saves.

The collection save schema version guard rejects non-array collection saves with missing, non-numeric, fractional, negative, future, malformed `version`, or malformed JSON values through the app fallback banner. The product-core loader JSON parse guard must convert malformed JSON collection payloads to the same collection-save domain error instead of leaking raw parser errors. The collection loader accepts only ending codes that exist in `ENDINGS` and deduplicates them. Unknown stale codes must not increase the visible collection count.

The collection save writer must reject malformed direct collection state before it reaches local storage. `serializeCollection()` enforces the serializeCollection save-write registry guard for direct calls with non-array collection values or unknown ending codes. Loader sanitization remains separate so stale local saves can recover without hiding writer-side app bugs.

The app storage loader reads run and collection keys independently. Partial storage recovery must keep a valid collection when the run key is corrupt, and keep a valid run when the collection key is corrupt.

Shared ending URLs are read-only ending cards. Opening `?ending=<code>` must not replace the current saved run in memory, must not add that ending to the unlocked collection, must not write `COLLECTION_STORAGE_KEY`, must keep collection progress at the saved local count, and must suppress synthetic stats from the display-only shared run. Unknown shared ending codes must be cleaned from the URL without showing a fallback error, without rendering an ending card, and without changing local run or collection progress. Leaving the shared card must expose the existing local `continue` flow, starting over from a shared card must use the normal progress replacement confirmation when a replaceable run exists, and shared ending popstate cleanup must prevent a stale shared ending code from overriding a later local completed ending.

If the embedded container blocks `localStorage` access entirely, the app must still boot to the title screen, show a storage unavailable fallback warning, allow an in-memory new run, and return to a safe title state after reload.

If `localStorage` reads are available but writes fail because quota or embedded storage policy blocks `setItem`, the app must not crash. It should allow an in-memory run, show a storage write failure fallback warning, and return to a safe title state after reload because the run could not persist.

If `localStorage.removeItem` is blocked while reads and writes still work, local data reset must use fallback writes so the old run and collection cannot reappear after reload. The collection fallback must use the current versioned empty collection reset fallback instead of the legacy array migration shape.

## Local Data Reset

The local data reset path is part of the save contract. `apps/starlit-apprentice/src/storage.ts` exports `clearAllStorage()`. It removes both `RUN_STORAGE_KEY` and `COLLECTION_STORAGE_KEY`; if remove fails but writes are available, it writes an empty run value and a current-schema versioned empty collection reset fallback. The app then returns to the title screen with continue disabled and an empty collection. The reset action requires an in-app confirmation panel before deletion.

## Verification

Run:

```bash
pnpm check:save-contract
```

This builds `@starlit-apprentice/product-core` and runs deterministic save migration checks against the built package.

Additional coverage:

- `pnpm test` checks round-trip save/load and old three-slot schedule migration at unit-test level.
- `pnpm check:save-contract` checks `targetEndingCode` round-trip, new-run seed guard, zero-persist RNG seed guard, unknown-target sanitization, premature endingCode cleanup, completed run endingCode canonicalization, run unlocked ending scope cleanup, non-object direct run-state guard, product-core loader JSON parse guard, serializeRun save-write version guard, serializeRun save-write finite-state guard, serializeRun save-write registry guard, serializeRun save-write flag guard, serializeRun save-write history guard, serializeCollection save-write registry guard, direct run-state version guard, direct run-state shape guard, schedule selection slot-index guard, schedule selection run-state bounds guard, monthly schedule overwrite guard, partial/orphan-slot schedule overwrite guard, progression slot-index/history continuity guard, progression finite-state guard, run-state bounds guard, registry-backed history label canonicalization, plausible flag count caps, unknown saved flag cleanup, known flag key guard, saved progress flag history cleanup, not-started saved schedule affordability cleanup, in-progress saved schedule continuity cleanup, completed saved schedule continuity cleanup, saved month progress cleanup, saved schedule month progress cleanup, saved history progress cleanup, malformed history entry cleanup, invalid history month/slot cleanup, history event cleanup, generated monthly event round-trip, save schema version guard, collection save schema version guard, malformed JSON collection save rejection, and non-object/missing-version/unsupported-version/malformed JSON run save rejection.
- `pnpm check:runtime` verifies corrupted run storage fallback, premature endingCode recovery, unsupported saved month progress recovery, unsupported saved schedule month progress recovery, saved progress flag history cleanup, storage unavailable fallback, storage write failure fallback, storage remove failure reset fallback, versioned empty collection reset fallback, partial storage recovery, stale collection sanitization, versioned collection save sanitization, unsupported collection schema fallback, shared ending popstate cleanup, shared ending collection isolation, invalid shared ending URL cleanup, shared ending local run preservation, and shared ending synthetic stat suppression in a production preview.
- `pnpm check:runtime` verifies the confirmed local data reset clears both storage keys or writes reset fallback values in a production preview.
- `pnpm test:e2e` verifies partial storage recovery, stale collection sanitization, shared ending popstate cleanup, shared ending collection isolation, invalid shared ending URL cleanup, shared ending local run preservation, shared ending synthetic stat suppression, saved month progress cleanup, saved schedule month progress cleanup, saved progress flag history cleanup, and local data reset through the app UI.
