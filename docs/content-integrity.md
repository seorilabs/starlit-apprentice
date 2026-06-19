# Content Integrity

This document records the production data gate for `starlit-apprentice` game content.

## Gate

Run:

```bash
pnpm check:content
```

The gate rebuilds `@starlit-apprentice/product-core`, imports the built data, then checks the app-side action icon assets.

## Coverage

- 14 stat labels match `STAT_KEYS`
- 19 schedule actions are present
- static registry immutability guard keeps `STAT_LABELS`, `ACTION_CATEGORY_LABELS`, `ACTIONS`, `ENDINGS`, action stat effects, ending requirements, and nested requirement arrays frozen at runtime
- registry lookup guard keeps `getActionById()` and `getEndingByCode()` backed by known frozen registry entries and rejects unknown action or ending identifiers
- action IDs and flags are unique
- action flags match `category:id`
- every action has label, short label, place, description, stat effects, integer resource deltas, and a matching SVG icon
- no orphan action SVG exists without an `ACTIONS` entry
- category economy conventions hold for lesson/work/rest/outing actions
- ending count matches `specs/starlit-apprentice.json`
- ending codes and titles are unique
- every non-fallback ending has explicit requirements
- ending requirements reference known stats, resources, and action/category flags
- ending requirement directions are constrained by type: stat, average, flag, and flag-sum requirements use `at-least` semantics, while resource requirements may also use `at-most`
- stat/resource targets stay within reachable caps
- game content copy avoids explicitly excluded scope such as direct original-game naming, dungeon/combat framing, and marriage-ending framing

This gate is intentionally data-focused. It does not replace balance reachability (`pnpm check:balance`), early pacing (`pnpm check:pacing`), runtime smoke (`pnpm check:runtime`), or target-device manual QA evidence.
