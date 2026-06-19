# Runtime QA

This document records the production-preview smoke gate for `starlit-apprentice`.

## Gate

Run:

```bash
pnpm check:runtime
```

The gate builds `@starlit-apprentice/product-core` and `@starlit-apprentice/app`, starts `vite preview` on an available local port, and drives Chromium through mobile and desktop viewports.

## Coverage

- Opens the built production preview, not the dev server.
- Uses a dynamic preview port by default so parallel release and QA checks do not reuse a stale server.
- Checks title, room, schedule, activity, result, collection, and shared-ending entry points.
- Checks first-entry CTA state, first-run guidance, schedule readiness copy, schedule affordability, selected-slot correction, schedule action stale click guard, duplicate command event guard, duplicate result command guard, room command stale event guard, active target reselection guard, activity resume elapsed-time guard, activity reload resume guard, activity visibilitychange resume guard, activity monotonic clock guard, dynamic viewport resize guard, canvas visibilitychange render-loop pause, canvas pagehide/pageshow render-loop pause, canvas freeze/resume render-loop pause, in-progress monthly plan resume, start-over confirmation, collection guidance, target-ending guidance, target action recommendations, browser back navigation, stale browser history state guard, unknown DOM dataset guard, month-complete reload recovery, shared-ending canonical URL cleanup, shared ending popstate cleanup, shared ending collection isolation, invalid shared ending URL cleanup, shared ending local run preservation, shared ending synthetic stat suppression, event effect copy, monthly coaching copy/readability, saved-ending recovery, ending evidence copy, local analytics CustomEvent payloads, event/ending text readability, native share invocation, native share in-flight guard, native share stale completion guard, native share stale in-flight retarget guard, native share rejection fallback, native share internal URL guard, native share placeholder URL guard, share clipboard fallback, corrupted-storage fallback, storage unavailable fallback, storage write failure fallback, storage remove failure reset fallback, versioned empty collection reset fallback, partial storage recovery, stale collection sanitization, collection save schema version guard, versioned collection save sanitization, unsupported collection schema fallback, run unlocked ending scope cleanup, saved month progress cleanup, saved schedule month progress cleanup, saved progress flag history cleanup, confirmed local data reset, sticky action viewport guard, ad placeholder absence, and horizontal overflow.
- Samples the background canvas pixels so blank or zero-size rendering fails the gate.
- Fails on browser console warnings/errors, uncaught page errors, and failed network requests.
- Captures screenshots under `qa/runtime-smoke/` for the checked title, room, collection, schedule, result, event, shared-ending, and saved-ending states.
- Before each screenshot, resets or preserves the intended scroll position and verifies a viewport anchor such as the schedule slots, result deltas, event panel, or ending card is actually visible in the captured viewport.

## Viewports

| Label | Size | Mode |
| --- | --- | --- |
| `mobile-390` | 390 x 844 | mobile/touch |
| `mobile-360` | 360 x 740 | mobile/touch |
| `desktop-1280` | 1280 x 900 | desktop |

## Remaining Manual QA

This gate does not replace human QA. The remaining manual list is tracked in `qa/manual-qa-evidence.json` and validated by:

```bash
pnpm check:manual-qa
pnpm check:manual-qa:strict
```

The strict form must stay red until target-device pacing, target-device readability, native share, native WebView back/reload, and AppsInToss QR/Toss-app preview evidence are completed.
